// catalog-title — the title-detail Edge Function (Story 2.2).
//
// Built directly on catalog-search's pattern (that file's header names THIS
// function as the one that imitates it). The proxy boundary invariant (AD-6):
// the F-Droid client never holds the TMDB key and never calls TMDB directly. It
// calls THIS function, which:
//   1. verifies the caller's GoTrue JWT (AC3) — rejecting unsigned requests with
//      the shared {message, code, details} envelope,
//   2. holds the TMDB key server-side and is the SOLE caller of TMDB for detail
//      data (AC1/AC3),
//   3. reads/writes the disposable `catalog_cache` with a TTL (AC3), keyed by
//      (tmdb_id, media_type) per ARCH-10,
//   4. soft-fails to cached basics when TMDB is unreachable (AC4).
//
// Scope wall (2.2): DETAIL ONLY — poster/synopsis/year, plus seasons+episodes
// for shows. No tracking, watchlist, rating, or notify — those are later epics.
//
// Runtime notes (identical constraints to catalog-search):
//   * SUPABASE_URL inside the container is http://kong:8000 (Docker-internal).
//   * The shared-types package is NOT mounted into the functions container, so
//     the {message, code, details} envelope is inlined here.
//   * JWT verify is IN-FUNCTION, not the global router flag (VERIFY_JWT stays
//     false): the router's 401 body is {msg}, not the envelope AC3 requires.
//   * catalog_cache holds two payload shapes: catalog-search (1.4) writes the
//     THIN CatalogResult (no synopsis/seasons); THIS function writes the RICH
//     detail payload. A thin row is NOT a detail-cache hit — see cache logic.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// The one error shape every boundary returns (ARCH-10). Inlined — see header.
interface ErrorEnvelope {
  message: string;
  code: string;
  details: unknown;
}

// A single episode within a season (tv only). `tmdbEpisodeId` is TMDB's own
// numeric episode id (distinct from `episodeNumber`) — the stable per-episode
// identity Story 3.1's pointer RPC and `watches.tmdb_episode_id` (0003) key
// off of. Added in Story 3.1; episodeNumber/name/airDate are unchanged.
interface EpisodeDetail {
  episodeNumber: number;
  name: string;
  airDate: string | null;
  tmdbEpisodeId: number;
}

// A season with its episode list (tv only).
interface SeasonDetail {
  seasonNumber: number;
  name: string;
  episodes: EpisodeDetail[];
}

// The rich title-detail payload — camelCase mirror of the client's TitleDetail
// (app/data/catalog.ts). `seasons` is present for tv, omitted for movie. The
// presence of `synopsis` is what distinguishes a rich detail row from the thin
// CatalogResult catalog-search writes — the cache logic below leans on that.
interface TitleDetail {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
  synopsis: string | null;
  seasons?: SeasonDetail[];
}

// Cache freshness window — same 7 days as catalog-search. A rich row younger
// than this is trusted; an older, missing, or THIN row is (re)fetched.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

function errorResponse(status: number, envelope: ErrorEnvelope): Response {
  return new Response(JSON.stringify(envelope), { status, headers: JSON_HEADERS });
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Prefer the v4 read access token (Bearer); fall back to the v3 api_key.
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN') ?? '';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Upper bound on every outbound TMDB call (the primary detail fetch AND each
// per-season episode fetch). A hung upstream must not pin the worker.
const TMDB_TIMEOUT_MS = 8000;

/** Build a TMDB request URL + auth headers for the configured key style. */
function tmdbRequest(path: string, extraParams: Record<string, string> = {}): {
  url: string;
  headers: HeadersInit;
} {
  const params = new URLSearchParams({ language: 'en-US', ...extraParams });
  if (TMDB_ACCESS_TOKEN) {
    return {
      url: `${TMDB_BASE}${path}?${params.toString()}`,
      headers: { Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`, Accept: 'application/json' },
    };
  }
  // v3 api_key goes in the query string.
  params.set('api_key', TMDB_API_KEY);
  return {
    url: `${TMDB_BASE}${path}?${params.toString()}`,
    headers: { Accept: 'application/json' },
  };
}

/** GET a TMDB path as JSON, bounded by TMDB_TIMEOUT_MS. Throws on non-2xx. */
async function tmdbGet(path: string, extraParams?: Record<string, string>): Promise<unknown> {
  const { url, headers } = tmdbRequest(path, extraParams);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) });
  if (!res.ok) {
    // Log upstream detail server-side; never echo it (the v3 key rides the query
    // string) back to the client.
    const detail = await res.text().catch(() => '');
    console.error(`TMDB ${path} failed: HTTP ${res.status} ${detail.slice(0, 500)}`);
    throw new Error(`TMDB ${path} HTTP ${res.status}`);
  }
  return res.json();
}

// --- TMDB response shapes (only the fields we read) ------------------------

interface TmdbMovie {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
}

interface TmdbSeasonSummary {
  season_number: number;
}

interface TmdbTv {
  id: number;
  name?: string;
  first_air_date?: string;
  poster_path?: string | null;
  overview?: string;
  seasons?: TmdbSeasonSummary[];
}

interface TmdbEpisode {
  id: number;
  episode_number: number;
  name?: string;
  air_date?: string | null;
}

interface TmdbSeason {
  season_number: number;
  name?: string;
  episodes?: TmdbEpisode[];
}

function yearOf(date: string | undefined): string | null {
  return date && date.length >= 4 ? date.slice(0, 4) : null;
}

/** Fetch one season's episode list. Returns null if that single call fails so
 *  one bad season never blocks the ones that succeeded (logged server-side). */
async function fetchSeason(tmdbId: number, seasonNumber: number): Promise<SeasonDetail | null> {
  try {
    const raw = (await tmdbGet(`/tv/${tmdbId}/season/${seasonNumber}`)) as TmdbSeason;
    const episodes: EpisodeDetail[] = (raw.episodes ?? []).map((e) => ({
      episodeNumber: e.episode_number,
      name: e.name ?? `Episode ${e.episode_number}`,
      airDate: e.air_date ?? null,
      tmdbEpisodeId: e.id,
    }));
    return {
      seasonNumber,
      name: raw.name ?? `Season ${seasonNumber}`,
      episodes,
    };
  } catch (e) {
    console.error(`season ${seasonNumber} of tv/${tmdbId} skipped:`, e);
    return null;
  }
}

/** Concurrency cap for the per-season TMDB fan-out — a show with dozens of
 *  seasons must not fire that many simultaneous TMDB calls (429 risk, which
 *  would in turn drop seasons and taint the cache). */
const MAX_SEASON_CONCURRENCY = 6;

/** Map over items with at most `limit` promises in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Fetch + normalize the full detail payload from TMDB.
 *  `complete` is false when any per-season call failed (or was dropped), so the
 *  caller can avoid caching a truncated payload as a fresh, complete detail. */
async function fetchDetailFromTmdb(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<{ detail: TitleDetail; complete: boolean }> {
  if (mediaType === 'movie') {
    const m = (await tmdbGet(`/movie/${tmdbId}`)) as TmdbMovie;
    return {
      detail: {
        tmdbId,
        mediaType,
        title: m.title ?? 'Untitled',
        year: yearOf(m.release_date),
        posterPath: m.poster_path ?? null,
        synopsis: m.overview ? m.overview : null,
      },
      complete: true,
    };
  }

  // tv: the /tv/{id} response lists seasons with summary data only — episode
  // detail needs one /tv/{id}/season/{n} call per season, fetched in parallel
  // (bounded — see MAX_SEASON_CONCURRENCY).
  const tv = (await tmdbGet(`/tv/${tmdbId}`)) as TmdbTv;
  const seasonNumbers = (tv.seasons ?? []).map((s) => s.season_number);
  const fetched = await mapWithConcurrency(seasonNumbers, MAX_SEASON_CONCURRENCY, (n) =>
    fetchSeason(tmdbId, n),
  );
  const seasons = fetched
    .filter((s): s is SeasonDetail => s !== null)
    .sort((a, b) => a.seasonNumber - b.seasonNumber);
  // A dropped season means the payload is incomplete — do not let it be cached
  // as a fresh, complete detail (a transient blip would otherwise be served for
  // the full TTL).
  const complete = seasons.length === seasonNumbers.length;
  return {
    detail: {
      tmdbId,
      mediaType,
      title: tv.name ?? 'Untitled',
      year: yearOf(tv.first_air_date),
      posterPath: tv.poster_path ?? null,
      synopsis: tv.overview ? tv.overview : null,
      seasons,
    },
    complete,
  };
}

/** A cached payload is a usable DETAIL hit only if it carries the rich fields
 *  (catalog-search writes a thin CatalogResult with no `synopsis` key). */
function isRichDetail(payload: unknown): payload is TitleDetail {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'synopsis' in payload
  );
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight — answered before any auth check.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // --- AC3: verify the GoTrue JWT in-function -------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authedClient.auth.getUser();
  if (userErr || !userData?.user) {
    return errorResponse(401, {
      message: 'Sign in to view title details.',
      code: 'unauthorized',
      details: null,
    });
  }

  // --- Parse the identity (mirrors CatalogResult's fields, ARCH-10) ---------
  let tmdbId = NaN;
  let mediaType: 'movie' | 'tv' | '' = '';
  try {
    const body = await req.json();
    tmdbId = typeof body?.tmdbId === 'number' ? body.tmdbId : Number(body?.tmdbId);
    mediaType = body?.mediaType === 'movie' || body?.mediaType === 'tv' ? body.mediaType : '';
  } catch {
    // fall through to validation below
  }
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !mediaType) {
    return errorResponse(400, {
      message: "That title couldn't be opened.",
      code: 'bad_request',
      details: null,
    });
  }

  // Service-role client for catalog_cache (bypasses RLS — the deny-by-default
  // table is reachable only this way). Constructed once, reused for read+write.
  const service =
    SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;

  // --- AC3: cache read — trust only a FRESH, RICH detail row ----------------
  // A thin row (from catalog-search) or a stale row does not satisfy a detail
  // request; we still keep whatever row exists for the AC4 soft-fail fallback.
  let cachedPayload: unknown = null;
  if (service) {
    try {
      const { data: row } = await service
        .from('catalog_cache')
        .select('payload, fetched_at')
        .eq('tmdb_id', tmdbId)
        .eq('media_type', mediaType)
        .maybeSingle();
      if (row) {
        cachedPayload = row.payload;
        const fresh = Date.now() - new Date(row.fetched_at).getTime() < CACHE_TTL_MS;
        if (fresh && isRichDetail(row.payload)) {
          return new Response(JSON.stringify({ detail: row.payload, cached: true }), {
            status: 200,
            headers: JSON_HEADERS,
          });
        }
      }
    } catch (e) {
      console.error('catalog_cache read skipped:', e);
    }
  }

  // --- AC1: proxy the detail fetch to TMDB (server-side key, sole caller) ----
  let detail: TitleDetail;
  let complete: boolean;
  try {
    ({ detail, complete } = await fetchDetailFromTmdb(tmdbId, mediaType));
  } catch (e) {
    console.error('TMDB detail error:', e);
    // AC4: soft-fail to whatever is cached (thin or rich) so the client can
    // render "cached basics"; only hard-error when nothing is cached at all.
    if (cachedPayload && typeof cachedPayload === 'object') {
      return new Response(JSON.stringify({ detail: cachedPayload, cached: true, soft: true }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }
    return errorResponse(502, {
      message: "We couldn't load this right now.",
      code: 'catalog_unavailable',
      details: null,
    });
  }

  // --- AC3: write the RICH detail payload back (best-effort) ----------------
  // Overwrite so subsequent detail reads (and the AC4 fallback) get the full
  // shape — a cache miracle must upgrade any thin row that was here. But skip
  // the write when the payload is incomplete (a season fetch was dropped): a
  // truncated row must not be served as a fresh, complete detail for the TTL.
  if (service && complete) {
    try {
      await service.from('catalog_cache').upsert(
        {
          tmdb_id: detail.tmdbId,
          media_type: detail.mediaType,
          payload: detail,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: 'tmdb_id,media_type' },
      );
    } catch (e) {
      console.error('catalog_cache write skipped:', e);
    }
  }

  return new Response(JSON.stringify({ detail, cached: false }), {
    status: 200,
    headers: JSON_HEADERS,
  });
});
