// Recommendations data source — the endless, non-personalized feed proxied
// through the `catalog-recommendations` Edge Function (TMDB /discover, sorted
// by popularity, paged). Mirrors `searchCatalog`'s exact shape in catalog.ts:
// the one supabase client, an INVOKE_TIMEOUT_MS race, envelope-parsing via
// `isErrorEnvelope`, `CatalogError` on failure.
//
// AD-6 boundary: the client never calls TMDB and never holds the key. Unlike
// the old v1 static list, results now arrive as full CatalogResult rows
// (title/year/poster already resolved) — no more per-item fetchTitleDetail
// enrichment fan-out.

import { isErrorEnvelope } from '@popcorn-time/shared-types';

import { supabase } from './supabaseClient';
import { CatalogError, type CatalogResult } from './catalog';

export interface RecommendationsPage {
  items: CatalogResult[];
  nextPage: number | null;
}

const CATALOG_UNAVAILABLE =
  "Couldn't reach the catalog — check your connection and try again.";

// Same bound as searchCatalog in catalog.ts.
const INVOKE_TIMEOUT_MS = 10000;

function rejectAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new CatalogError(CATALOG_UNAVAILABLE, 'catalog_timeout')), ms),
  );
}

/**
 * Fetch one page of the recommendations feed for a media type. Throws
 * {@link CatalogError} on failure so the caller can degrade silently
 * (recommendations are pure garnish — see RecommendationsScreen).
 */
export async function fetchRecommendations(
  mediaType: 'movie' | 'tv',
  page: number,
): Promise<RecommendationsPage> {
  const { data, error } = await Promise.race([
    supabase.functions.invoke('catalog-recommendations', { body: { mediaType, page } }),
    rejectAfter(INVOKE_TIMEOUT_MS),
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
    throw new CatalogError(CATALOG_UNAVAILABLE, 'catalog_unavailable');
  }

  const items = Array.isArray(data?.results) ? (data.results as CatalogResult[]) : [];
  const nextPage = typeof data?.nextPage === 'number' ? data.nextPage : null;
  return { items, nextPage };
}
