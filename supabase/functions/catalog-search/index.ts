// catalog-search — the first feature Edge Function (Story 1.4).
//
// The proxy boundary invariant (AD-6): the F-Droid client never holds the TMDB
// key and never calls TMDB directly. It calls THIS function, which:
//   1. verifies the caller's GoTrue JWT (AC4) — rejecting unsigned requests with
//      the shared {message, code, details} envelope,
//   2. holds the TMDB key server-side and is the SOLE caller of TMDB (AC1),
//   3. reads/writes the disposable `catalog_cache` with a TTL (AC2), keyed by
//      (tmdb_id, media_type) per ARCH-10 (AC3).
//
// This is the pattern 2.2 (catalog-title), 6.4 (poll-new-episodes) and 7.1/7.2
// (GDPR) imitate. Scope wall: SEARCH ONLY — no title-detail/seasons/episodes.
//
// Runtime notes:
//   * SUPABASE_URL inside the container is http://kong:8000 (Docker-internal) —
//     never localhost.
//   * The shared-types package is NOT mounted into the functions container, so
//     the {message, code, details} envelope is inlined here (it is three fields).
//   * JWT verify is IN-FUNCTION, not the global router flag (VERIFY_JWT stays
//     false): the router's 401 body is {msg}, not the envelope AC4 requires, and
//     a global flip would also gate the pg_cron-invoked poller in 6.4.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// The one error shape every boundary returns (ARCH-10). Inlined — see header.
interface ErrorEnvelope {
  message: string;
  code: string;
  details: unknown;
}

// A normalized catalog title. Mirror of the client's CatalogResult (app/data/
// catalog.ts) — snake_case is a DB concern; this crosses the wire as camelCase.
interface CatalogResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
}

// Cache freshness window. A cached row younger than this is trusted; an older or
// missing row is (re)written from TMDB. Search always has fresh TMDB data in
// hand, so the TTL here only decides whether a re-WRITE is worth it; the read
// side is what catalog-title (2.2) and the poller (6.4) lean on.
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

// Upper bound on the outbound TMDB call. A hung upstream must not pin the
// function until the platform kills the worker — abort and surface the warm
// catalog_unavailable envelope so the client can retry.
const TMDB_TIMEOUT_MS = 8000;

/** Build the TMDB /search/multi URL + auth headers for the configured key style. */
function tmdbSearchRequest(query: string): { url: string; headers: HeadersInit } {
  const params = new URLSearchParams({
    query,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  });
  if (TMDB_ACCESS_TOKEN) {
    return {
      url: `${TMDB_BASE}/search/multi?${params.toString()}`,
      headers: { Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`, Accept: 'application/json' },
    };
  }
  // v3 api_key goes in the query string.
  params.set('api_key', TMDB_API_KEY);
  return {
    url: `${TMDB_BASE}/search/multi?${params.toString()}`,
    headers: { Accept: 'application/json' },
  };
}

interface TmdbMultiResult {
  id: number;
  media_type: string; // 'movie' | 'tv' | 'person'
  title?: string; // movie
  name?: string; // tv
  release_date?: string; // movie
  first_air_date?: string; // tv
  poster_path?: string | null;
}

/**
 * Keep only movie/tv and normalize to CatalogResult. Drops person + junk rows,
 * rows with no numeric `id` (would produce a NULL `tmdb_id` on the cache upsert
 * and an `undefined` client list key), and duplicate `(tmdb_id, media_type)`
 * pairs (a duplicate in one upsert batch trips Postgres' "ON CONFLICT cannot
 * affect row a second time" and drops the whole cache write).
 */
function normalize(results: TmdbMultiResult[]): CatalogResult[] {
  const out: CatalogResult[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.media_type !== 'movie' && r.media_type !== 'tv') continue;
    if (typeof r.id !== 'number') continue; // no id => not cacheable / not keyable
    const mediaType = r.media_type;
    const key = `${r.id}:${mediaType}`;
    if (seen.has(key)) continue; // de-dupe the conflict key
    const title = mediaType === 'movie' ? r.title : r.name;
    if (!title) continue; // a title with no name is not renderable
    seen.add(key);
    const rawDate = mediaType === 'movie' ? r.release_date : r.first_air_date;
    const year = rawDate && rawDate.length >= 4 ? rawDate.slice(0, 4) : null;
    out.push({
      tmdbId: r.id,
      mediaType,
      title,
      year,
      posterPath: r.poster_path ?? null,
    });
  }
  return out;
}

Deno.serve(async (req: Request): Promise<Response> => {
  // CORS preflight — answered before any auth check.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // --- AC4: verify the GoTrue JWT in-function ------------------------------
  // A client scoped to the caller's bearer; auth.getUser() validates the token
  // against GoTrue. No user => unsigned/expired/invalid => 401 envelope.
  const authHeader = req.headers.get('Authorization') ?? '';
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authedClient.auth.getUser();
  if (userErr || !userData?.user) {
    return errorResponse(401, {
      message: 'Sign in to search the catalog.',
      code: 'unauthorized',
      details: null,
    });
  }

  // --- Parse the query -----------------------------------------------------
  let query = '';
  try {
    const body = await req.json();
    query = typeof body?.query === 'string' ? body.query.trim() : '';
  } catch {
    query = '';
  }
  if (!query) {
    return errorResponse(400, {
      message: 'Type something to search for.',
      code: 'bad_request',
      details: null,
    });
  }

  // --- AC1: proxy the search to TMDB (server-side key, sole caller) ---------
  let tmdbResults: TmdbMultiResult[];
  try {
    const { url, headers } = tmdbSearchRequest(query);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) });
    if (!res.ok) {
      // Log the upstream detail server-side; never echo it (or the request, which
      // carries the v3 key in its query string) back to the client.
      const detail = await res.text().catch(() => '');
      console.error(`TMDB search failed: HTTP ${res.status} ${detail.slice(0, 500)}`);
      return errorResponse(502, {
        message: "Couldn't reach the catalog — check your connection and try again.",
        code: 'catalog_unavailable',
        details: null,
      });
    }
    const json = await res.json();
    tmdbResults = Array.isArray(json?.results) ? json.results : [];
  } catch (e) {
    console.error('TMDB search error:', e);
    return errorResponse(502, {
      message: "Couldn't reach the catalog — check your connection and try again.",
      code: 'catalog_unavailable',
      details: null,
    });
  }

  const results = normalize(tmdbResults);

  // --- AC2: read/write catalog_cache with a TTL (service-role client) -------
  // Service role bypasses RLS — the deny-by-default table is reachable only
  // this way. Read existing rows for the returned ids, then upsert only the
  // missing/stale ones (a genuine read+conditional-write against the TTL).
  // Best-effort: a cache hiccup must not fail a search that already succeeded.
  if (results.length > 0 && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const ids = [...new Set(results.map((r) => r.tmdbId))];
      const { data: cached } = await service
        .from('catalog_cache')
        .select('tmdb_id, media_type, fetched_at')
        .in('tmdb_id', ids);

      const freshKeys = new Set(
        (cached ?? [])
          .filter((row) => Date.now() - new Date(row.fetched_at).getTime() < CACHE_TTL_MS)
          .map((row) => `${row.tmdb_id}:${row.media_type}`),
      );

      const toWrite = results
        .filter((r) => !freshKeys.has(`${r.tmdbId}:${r.mediaType}`))
        .map((r) => ({
          tmdb_id: r.tmdbId,
          media_type: r.mediaType,
          payload: r,
          fetched_at: new Date().toISOString(),
        }));

      if (toWrite.length > 0) {
        await service
          .from('catalog_cache')
          .upsert(toWrite, { onConflict: 'tmdb_id,media_type' });
      }
    } catch (e) {
      console.error('catalog_cache write skipped:', e);
    }
  }

  return new Response(JSON.stringify({ results }), { status: 200, headers: JSON_HEADERS });
});
