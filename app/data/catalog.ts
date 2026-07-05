// Catalog data module (Story 1.4) — the client's ONLY door to the catalog.
//
// The proxy boundary invariant (AD-6): the app never calls TMDB and never holds
// the TMDB key. It calls the `catalog-search` Edge Function through the one
// supabase client; supabase-js auto-attaches the session bearer + apikey, so we
// never hand-build headers or a second client.
//
// Scope wall (1.4): SEARCH only. Title-detail (2.2) and logging (1.5) are later.

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
