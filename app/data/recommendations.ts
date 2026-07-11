// Recommendations source (Story 3.8, FR42) — a CURATED STATIC LIST, not a recommender.
//
// FR42 is deliberately permissive: Home *may* show a Recommendations shelf built
// from "at most a simple, non-LLM heuristic ... or a curated shelf," and it *may*
// ship empty/absent. The real feature — LLM-powered recommendations that read your
// own history and mood/rating sentiment — is explicitly a v2 bet (see PRD Vision).
// So v1 spends that permission on the lowest-risk form: a small hand-picked list of
// broadly-appealing titles, identified by TMDB id only.
//
// AD-6 boundary: this file holds *ids only* — never TMDB data. The poster/title/year
// for each recommendation is enriched at render time through the existing proxied
// `fetchTitleDetail` (catalog.ts), exactly like Up Next / Watchlist rows on Home.
// The client never calls TMDB and never holds the key.
//
// The exact titles are not load-bearing — they just need to be resolvable and
// broadly recognizable. Any id that fails to enrich is dropped gracefully by
// HomeScreen's `Promise.allSettled` (same as an Up Next card with missing
// metadata), so a stale/wrong id degrades, never crashes.
//
// Open question (see story): move this list server-side / make it editable without
// an app release. For v1 it is a deliberate hardcoded shortcut, not a final shape.

export interface Recommendation {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

const RECOMMENDATIONS: Recommendation[] = [
  // TV
  { tmdbId: 1396, mediaType: 'tv' }, // Breaking Bad
  { tmdbId: 136315, mediaType: 'tv' }, // The Bear
  { tmdbId: 1399, mediaType: 'tv' }, // Game of Thrones
  { tmdbId: 66732, mediaType: 'tv' }, // Stranger Things
  { tmdbId: 100088, mediaType: 'tv' }, // The Last of Us
  { tmdbId: 95396, mediaType: 'tv' }, // Severance
  // Movies
  { tmdbId: 550, mediaType: 'movie' }, // Fight Club
  { tmdbId: 496243, mediaType: 'movie' }, // Parasite
  { tmdbId: 27205, mediaType: 'movie' }, // Inception
  { tmdbId: 545611, mediaType: 'movie' }, // Everything Everywhere All at Once
  { tmdbId: 438631, mediaType: 'movie' }, // Dune
  { tmdbId: 603, mediaType: 'movie' }, // The Matrix
];

/**
 * The curated recommendation list (Story 3.8). A plain function today so a future
 * v2 can swap the static list for a real (server/history/LLM) source without
 * changing the call site. Synchronous and local — it performs no network of its
 * own; enrichment happens in the caller through the proxied catalog.
 */
export function getRecommendations(): Recommendation[] {
  return RECOMMENDATIONS;
}
