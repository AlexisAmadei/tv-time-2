// catalog-recommendations — the endless recommendations feed Edge Function.
//
// Built directly on catalog-search's pattern (see that file's header). The
// proxy boundary invariant (AD-6): the F-Droid client never holds the TMDB key
// and never calls TMDB directly. It calls THIS function, which:
//   1. verifies the caller's GoTrue JWT — rejecting unsigned requests with the
//      shared {message, code, details} envelope,
//   2. holds the TMDB key server-side and is the SOLE caller of TMDB,
//   3. proxies TMDB's /discover/{movie|tv}, sorted by popularity, paged by
//      TMDB's own `page` param — a genuinely endless, non-personalized feed.
//
// Scope wall: DISCOVER ONLY, one media type per call. No catalog_cache read
// or write here — unlike catalog-search/catalog-title, discover pages are
// high-volume, low-reuse traffic (the point is variety across pages, not
// caching a given page), so this function skips the cache entirely.
//
// Runtime notes (identical constraints to catalog-search/catalog-title):
//   * SUPABASE_URL inside the container is http://kong:8000 (Docker-internal).
//   * The shared-types package is NOT mounted into the functions container, so
//     the {message, code, details} envelope is inlined here.
//   * JWT verify is IN-FUNCTION, not the global router flag (VERIFY_JWT stays
//     false) — the router's 401 body is {msg}, not the envelope callers need.

import { createClient } from 'jsr:@supabase/supabase-js@2';

// The one error shape every boundary returns (ARCH-10). Inlined — see header.
interface ErrorEnvelope {
  message: string;
  code: string;
  details: unknown;
}

// A normalized catalog title. Mirror of the client's CatalogResult (app/data/
// catalog.ts) — same shape catalog-search returns.
interface CatalogResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
}

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
// Prefer the v4 read access token (Bearer); fall back to the v3 api_key.
const TMDB_ACCESS_TOKEN = Deno.env.get('TMDB_ACCESS_TOKEN') ?? '';
const TMDB_API_KEY = Deno.env.get('TMDB_API_KEY') ?? '';

const TMDB_BASE = 'https://api.themoviedb.org/3';

// Upper bound on the outbound TMDB call — same bound as the other functions.
const TMDB_TIMEOUT_MS = 8000;

/** Build the TMDB /discover/{movie|tv} URL + auth headers for the configured
 *  key style, sorted by popularity and pointed at the requested page. */
function tmdbDiscoverRequest(
  mediaType: 'movie' | 'tv',
  page: number,
): { url: string; headers: HeadersInit } {
  const params = new URLSearchParams({
    include_adult: 'false',
    language: 'en-US',
    sort_by: 'popularity.desc',
    page: String(page),
  });
  if (TMDB_ACCESS_TOKEN) {
    return {
      url: `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`,
      headers: { Authorization: `Bearer ${TMDB_ACCESS_TOKEN}`, Accept: 'application/json' },
    };
  }
  // v3 api_key goes in the query string.
  params.set('api_key', TMDB_API_KEY);
  return {
    url: `${TMDB_BASE}/discover/${mediaType}?${params.toString()}`,
    headers: { Accept: 'application/json' },
  };
}

interface TmdbDiscoverResult {
  id: number;
  title?: string; // movie
  name?: string; // tv
  release_date?: string; // movie
  first_air_date?: string; // tv
  poster_path?: string | null;
}

/** Normalize to CatalogResult, tagging every row with the requested
 *  `mediaType` (the discover endpoint is already type-scoped, unlike
 *  /search/multi). Drops rows with no numeric id or no title, and de-dupes by
 *  (tmdbId, mediaType) within the page. */
function normalize(results: TmdbDiscoverResult[], mediaType: 'movie' | 'tv'): CatalogResult[] {
  const out: CatalogResult[] = [];
  const seen = new Set<number>();
  for (const r of results) {
    if (typeof r.id !== 'number') continue;
    if (seen.has(r.id)) continue;
    const title = mediaType === 'movie' ? r.title : r.name;
    if (!title) continue;
    seen.add(r.id);
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

  // --- verify the GoTrue JWT in-function -------------------------------
  const authHeader = req.headers.get('Authorization') ?? '';
  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authedClient.auth.getUser();
  if (userErr || !userData?.user) {
    return errorResponse(401, {
      message: 'Sign in to view recommendations.',
      code: 'unauthorized',
      details: null,
    });
  }

  // --- parse mediaType + page -----------------------------------------
  let mediaType: 'movie' | 'tv' | '' = '';
  let page = 1;
  try {
    const body = await req.json();
    mediaType = body?.mediaType === 'movie' || body?.mediaType === 'tv' ? body.mediaType : '';
    const rawPage = Number(body?.page);
    if (Number.isInteger(rawPage) && rawPage > 0) page = rawPage;
  } catch {
    // fall through to validation below
  }
  if (!mediaType) {
    return errorResponse(400, {
      message: "That couldn't be loaded.",
      code: 'bad_request',
      details: null,
    });
  }

  // --- proxy the discover call to TMDB (server-side key, sole caller) -----
  let tmdbResults: TmdbDiscoverResult[];
  let totalPages = 1;
  try {
    const { url, headers } = tmdbDiscoverRequest(mediaType, page);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) });
    if (!res.ok) {
      // Log the upstream detail server-side; never echo it (or the request,
      // which carries the v3 key in its query string) back to the client.
      const detail = await res.text().catch(() => '');
      console.error(`TMDB discover failed: HTTP ${res.status} ${detail.slice(0, 500)}`);
      return errorResponse(502, {
        message: "Couldn't reach the catalog — check your connection and try again.",
        code: 'catalog_unavailable',
        details: null,
      });
    }
    const json = await res.json();
    tmdbResults = Array.isArray(json?.results) ? json.results : [];
    totalPages = typeof json?.total_pages === 'number' ? json.total_pages : page;
  } catch (e) {
    console.error('TMDB discover error:', e);
    return errorResponse(502, {
      message: "Couldn't reach the catalog — check your connection and try again.",
      code: 'catalog_unavailable',
      details: null,
    });
  }

  const results = normalize(tmdbResults, mediaType);
  const nextPage = page < totalPages ? page + 1 : null;

  return new Response(JSON.stringify({ results, nextPage }), { status: 200, headers: JSON_HEADERS });
});
