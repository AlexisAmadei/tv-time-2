// Save a title to the Watchlist, direct-to-PostgREST (Story 2.3, FR25).
//
// The single most important architectural call: THIS IS NOT THE OUTBOX.
// `watchLog.ts` writes the local `expo-sqlite` `pending_watches` table BEFORE
// any network call and resolves off that local write — that durability is the
// *watch-commit* invariant (AD-4/ARCH-8), and it is watch-commit-ONLY. A
// watchlist add/remove is an ordinary owner-scoped write with no offline /
// survives-a-network-drop requirement (Story 2.3 has no such AC, unlike 1.5's
// AC2). So this module talks straight to the one `supabase` client via
// PostgREST, exactly like `getLoggedKeys`'s server branch — no `getDb()`, no
// `pending_watches`, no `triggerSync`.
//
// Idempotency (AC2) is guaranteed by the DB: the `watchlist_items_owner_title_idx`
// unique index (0005) means an add is an upsert-with-ignore and a remove is a
// match-delete, both safe under a racing double-tap. The optimistic UI in the
// callers flips the heart first and rolls back on failure — the honest tradeoff
// that gives "instant" feel without outbox machinery.

import { supabase } from './supabaseClient';
import { watchKey } from './watchLog';

// Best-effort "already watchlisted" lookup is bounded like every other network
// call in this codebase (catalog.ts races 10s) — a hung server never blocks it.
const WATCHLIST_KEYS_TIMEOUT_MS = 10_000;

export interface WatchlistInput {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/**
 * `${mediaType}:${tmdbId}` — the SAME key shape used to track "already watched"
 * (re-exported from {@link watchKey}) so a caller can compose "logged" and
 * "watchlisted" sets without a second convention.
 */
export const watchlistKey = watchKey;

async function requireUserId(): Promise<string> {
  // The app shell is behind the auth gate, so a session is present whenever this
  // is reachable; guard defensively regardless (same as logWatch).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('watchlist: no active session');
  return session.user.id;
}

/**
 * Add a title to the watchlist. Upsert-with-ignore (not a bare insert) so a
 * double-add is idempotent even under a racing double-tap — the unique index
 * (user_id, tmdb_id, media_type) backs it (AC1, AC2).
 */
export async function addToWatchlist(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watchlist_items')
    .upsert(
      { user_id: userId, tmdb_id: tmdbId, media_type: mediaType },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true },
    );
  if (error) throw error;
}

/**
 * Remove a title from the watchlist. Deleting a non-existent row is a no-op
 * success — idempotent removal (AC2).
 */
export async function removeFromWatchlist(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('watchlist_items')
    .delete()
    .match({ user_id: userId, tmdb_id: tmdbId, media_type: mediaType });
  if (error) throw error;
}

// Per-title write queue. The DB unique index makes each individual add/remove
// idempotent, but it does NOT order an add against a remove — two rapid toggles
// on the same title would otherwise race, and the server's final state would be
// decided by network-resolution order rather than the user's last tap. Chaining
// the ops per key serializes them so they land in submit order (add→remove ends
// removed, remove→add ends added), keeping the server in sync with the optimistic
// UI. Keyed by `${mediaType}:${tmdbId}`; the chain is dropped once it drains.
const writeChains = new Map<string, Promise<unknown>>();

/**
 * Persist a desired watchlist membership for one title, serialized per title so
 * back-to-back toggles never race (see {@link writeChains}). `desired = true`
 * adds, `false` removes. Rejects if the underlying write fails so the caller can
 * roll its optimistic UI back.
 */
export function writeWatchlist(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  desired: boolean,
): Promise<void> {
  const key = watchlistKey(tmdbId, mediaType);
  const run = (writeChains.get(key) ?? Promise.resolve())
    // Don't let a prior failure break the chain for the next queued op.
    .catch(() => {})
    .then(() =>
      desired ? addToWatchlist(tmdbId, mediaType) : removeFromWatchlist(tmdbId, mediaType),
    );
  writeChains.set(key, run);
  // Drop the chain once this is the last op to settle, so the map can't grow
  // unbounded over a long session.
  run.catch(() => {}).finally(() => {
    if (writeChains.get(key) === run) writeChains.delete(key);
  });
  return run;
}

/**
 * Which of the given titles are already on the watchlist — checked against the
 * server `watchlist_items` table (owner-scoped by RLS). Returns
 * `${mediaType}:${tmdbId}` keys (see {@link watchlistKey}). Best-effort: a
 * failed/hung/aborted query degrades to an empty set, never throws (mirrors
 * `getLoggedKeys`'s server branch).
 */
export async function getWatchlistKeys(
  items: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Set<string>> {
  if (items.length === 0) return new Set();

  const requested = new Set(items.map((i) => watchlistKey(i.tmdbId, i.mediaType)));
  const watchlisted = new Set<string>();
  const ids = [...new Set(items.map((i) => i.tmdbId))];

  // No session → nothing can be attributed to a user; degrade to no keys.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return new Set();

  // Best-effort server lookup, bounded by a timeout (codebase convention) and
  // wrapped so a hung/failed/aborted query degrades to an empty set.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WATCHLIST_KEYS_TIMEOUT_MS);
    try {
      const { data } = await supabase
        .from('watchlist_items')
        .select('tmdb_id, media_type')
        .eq('user_id', session.user.id)
        .in('tmdb_id', ids)
        .abortSignal(controller.signal);
      for (const row of data ?? []) watchlisted.add(watchlistKey(row.tmdb_id, row.media_type));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best-effort — degrade to empty
  }

  // `.in('tmdb_id', ids)` alone can cross-match a movie and a show that happen
  // to share a numeric TMDB id (ids are only unique per media_type) — narrow
  // back down to the exact (tmdbId, mediaType) pairs actually requested.
  return new Set([...watchlisted].filter((k) => requested.has(k)));
}
