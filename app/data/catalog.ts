// Catalog data module (Story 1.4) — the client's ONLY door to the catalog.
//
// The proxy boundary invariant (AD-6): the app never calls TMDB and never holds
// the TMDB key. It calls the `catalog-search` Edge Function through the one
// supabase client; supabase-js auto-attaches the session bearer + apikey, so we
// never hand-build headers or a second client.
//
// Scope wall (1.4): SEARCH only. Logging (1.5) is elsewhere.
// Title-detail (2.2) extends this file below — it owns the same proxy boundary
// and CatalogError/envelope-parsing, so `fetchTitleDetail` reuses them rather
// than re-forking a second data module.

import { isErrorEnvelope } from '@tv-time-2/shared-types';

import { supabase } from './supabaseClient';

/** A normalized catalog title — the camelCase mirror of the function's output. */
export interface CatalogResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
}

/**
 * One episode of a season (tv only) — mirror of catalog-title's payload.
 * `tmdbEpisodeId` (Story 3.1) is TMDB's own numeric episode id, the stable
 * per-episode identity the pointer RPC and `watches.tmdb_episode_id` key off
 * of — distinct from `episodeNumber`.
 */
export interface EpisodeDetail {
  episodeNumber: number;
  name: string;
  airDate: string | null;
  tmdbEpisodeId: number;
}

/** A season with its episode list (tv only). */
export interface SeasonDetail {
  seasonNumber: number;
  name: string;
  episodes: EpisodeDetail[];
}

/**
 * The rich title-detail payload (Story 2.2) — camelCase mirror of the
 * `catalog-title` function's output. `seasons` is present for shows, absent for
 * films. A cached "basics" fallback (AC4) may arrive as a partial payload
 * (thin CatalogResult shape upgraded to this type) — `synopsis`/`seasons` can be
 * null/absent, so the UI must tolerate a partial shape.
 */
export interface TitleDetail {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year: string | null;
  posterPath: string | null;
  synopsis: string | null;
  seasons?: SeasonDetail[];
}

/**
 * A resolved title-detail request. `cached` marks a row served from the cache;
 * `soft` marks the AC4 soft-fail path (TMDB was unreachable but cached basics
 * were available) — the UI shows a "showing saved info" affordance for it.
 */
export interface TitleDetailResult {
  detail: TitleDetail;
  cached: boolean;
  soft: boolean;
}

// TMDB image CDN. w185 is the poster size the title-card uses. The CDN is
// keyless — loading a poster leaks nothing (AD-6 protects the *API key*, which
// never ships in the client; the image host needs no key). See story Dev Notes.
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185';

/** Full poster URL for a `posterPath`, or null when there is no poster. */
export function posterUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null;
}

/**
 * A catalog failure carrying the function's stable `code` alongside the warm,
 * user-facing `message`. The search UI shows `message` and keeps the typed query.
 */
export class CatalogError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
  }
}

const CATALOG_UNAVAILABLE =
  "Couldn't reach the catalog — check your connection and try again.";

// Upper bound on a single search. `functions.invoke` has no built-in timeout, so
// a stalled response would otherwise leave the UI in `loading` forever with no
// path to the error/retry state. Race it and reject into the catalog error copy.
const INVOKE_TIMEOUT_MS = 10000;

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new CatalogError(CATALOG_UNAVAILABLE, 'catalog_timeout')), ms),
  );
}

/**
 * Search the proxied catalog. Returns normalized results (empty for a blank
 * query). Throws {@link CatalogError} — mapped from the function's
 * `{message, code, details}` envelope — on any failure so the UI can show the
 * retry state without losing the typed query.
 */
export async function searchCatalog(query: string): Promise<CatalogResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await Promise.race([
    supabase.functions.invoke('catalog-search', { body: { query: trimmed } }),
    rejectAfter(INVOKE_TIMEOUT_MS),
  ]);

  if (error) {
    // A non-2xx from the function arrives as a FunctionsHttpError whose
    // `context` is the raw Response — read the envelope out of it to surface the
    // function's own warm copy + code. Network-level failures have no body.
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const body = await context.json();
        if (isErrorEnvelope(body)) throw new CatalogError(body.message, body.code);
      } catch (parseErr) {
        if (parseErr instanceof CatalogError) throw parseErr;
        // fall through to the generic message
      }
    }
    throw new CatalogError(CATALOG_UNAVAILABLE, 'catalog_unavailable');
  }

  const results = data?.results;
  return Array.isArray(results) ? (results as CatalogResult[]) : [];
}

// The verbatim AC4 hard-failure copy (fetch failed, nothing cached). Used for
// network/timeout failures the function never got to answer, so the detail
// screen shows the same warm retry line as a 502 envelope would carry.
const DETAIL_UNAVAILABLE = "We couldn't load this right now.";

// Detail needs a longer bound than search: the function fetches `/tv/{id}` and
// then a bounded fan-out of per-season calls, each up to the server's 8s TMDB
// timeout — so a large show's cold fetch legitimately runs well past the 10s
// search bound. Race high enough not to abort a still-working request, but
// still bounded so a truly stalled response reaches the error/retry state.
const DETAIL_INVOKE_TIMEOUT_MS = 20000;

/**
 * Fetch a title's full detail (Story 2.2) through the proxied `catalog-title`
 * function. Mirrors {@link searchCatalog}'s pattern exactly: the one supabase
 * client, an INVOKE_TIMEOUT_MS race, envelope-parsing via `isErrorEnvelope`.
 *
 * Resolves to a {@link TitleDetailResult} (which flags cache/soft-fail state so
 * the UI can show AC4's "cached basics" affordance). Throws {@link CatalogError}
 * — carrying the function's warm copy + code — only on a hard failure with
 * nothing cached, so the screen can show the retry state (AC4).
 */
export async function fetchTitleDetail(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<TitleDetailResult> {
  // Race an invoke against a timeout, clearing the timer once the race settles
  // so a won race never leaves a dangling pending rejection alive.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new CatalogError(DETAIL_UNAVAILABLE, 'catalog_timeout')),
      DETAIL_INVOKE_TIMEOUT_MS,
    );
  });

  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('catalog-title', { body: { tmdbId, mediaType } }),
      timeout,
    ]);

    if (error) {
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        try {
          const body = await context.json();
          if (isErrorEnvelope(body)) throw new CatalogError(body.message, body.code);
        } catch (parseErr) {
          if (parseErr instanceof CatalogError) throw parseErr;
          // fall through to the generic message
        }
      }
      throw new CatalogError(DETAIL_UNAVAILABLE, 'catalog_unavailable');
    }

    const detail = data?.detail;
    if (!detail || typeof detail !== 'object') {
      throw new CatalogError(DETAIL_UNAVAILABLE, 'catalog_unavailable');
    }
    return {
      detail: detail as TitleDetail,
      cached: Boolean(data?.cached),
      soft: Boolean(data?.soft),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
