// Track a show or film into Up Next, direct-to-PostgREST (Story 3.1, FR10).
//
// Same architectural call as `watchlist.ts`: THIS IS NOT THE OUTBOX. Tracking
// has no offline / survives-a-network-drop AC (unlike the watch-commit path
// in `watchLog.ts`), so this module talks straight to the one `supabase`
// client via PostgREST — no `getDb()`, no `pending_watches`, no `triggerSync`.
//
// Idempotency (AC4) is guaranteed by the DB: the `tracked_shows_owner_title_idx`
// unique index (0006) means a track is an upsert-with-ignore. There is
// deliberately no untrack — `tracked_shows` has no client delete grant
// (0006's scope wall), so unlike `watchlist.ts` there is no remove function
// and no per-title write-chain serialization (nothing to race against).
//
// `next_episode_pointer` is never written from here directly — it is
// initialized by the `recompute_next_episode_pointer` RPC (0007), the sole
// writer of that column now and in every future story that touches it.

import { supabase } from './supabaseClient';
import { watchKey } from './watchLog';

// Best-effort "already tracked" lookup and the primary shelf read are bounded
// like every other network call in this codebase (catalog.ts races 10s) — a
// hung server never blocks them.
const TRACKED_SHOWS_TIMEOUT_MS = 10_000;

/**
 * One tracked title (Story 3.1) — camelCase mirror of a `tracked_shows` read.
 * `nextEpisodePointer` is a TMDB episode id (never a season/episode-number
 * pair), permanently null for films, and null for a tv show that is either
 * brand-new (pointer not yet computed) or fully caught up.
 */
export interface TrackedShow {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  nextEpisodePointer: number | null;
  createdAt: string;
}

async function requireUserId(): Promise<string> {
  // The app shell is behind the auth gate, so a session is present whenever
  // this is reachable; guard defensively regardless (same as logWatch /
  // addToWatchlist).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('trackedShows: no active session');
  return session.user.id;
}

/**
 * Start tracking a title (AC1). Upsert-with-ignore (not a bare insert) so a
 * double-tap is idempotent even under a race — the unique index (user_id,
 * tmdb_id, media_type) backs it (AC4). `.select()` on the upsert tells us
 * whether a row was actually inserted: an empty result means the conflict was
 * ignored (already tracked), in which case we stop here — do not call the
 * pointer RPC again for an already-tracked title. Only a genuinely new row
 * triggers the pointer initialization (AC2). Throws on any hard failure (the
 * upsert, or a non-ignorable RPC error) so the caller can roll back its
 * optimistic UI — mirrors `addToWatchlist`'s throw-on-error shape.
 *
 * The RPC call passes `mediaType` (`p_media_type`) alongside `tmdbId` — a
 * `tmdb_id` alone doesn't identify one `tracked_shows` row, since ids are
 * only unique per media type (a movie and a tv show can share one).
 */
export async function trackShow(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('tracked_shows')
    .upsert(
      { user_id: userId, tmdb_id: tmdbId, media_type: mediaType },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true },
    )
    .select();
  if (error) throw error;

  // Empty result = the insert was ignored (a conflicting row already
  // existed) = already tracked. Nothing new to initialize.
  if (!data || data.length === 0) return;

  const { error: rpcError } = await supabase.rpc('recompute_next_episode_pointer', {
    p_user_id: userId,
    p_tmdb_id: tmdbId,
    p_media_type: mediaType,
  });
  if (rpcError) throw rpcError;
}

/**
 * The full set of tracked titles, oldest-tracked-first (Story 3.1) — the Up
 * Next shelf's primary data source. Reads as "what you're partway through,"
 * unlike the watchlist's newest-first ordering; no AC mandates an order, this
 * is the chosen default. Mirrors `getWatchlist()`'s "throws, doesn't degrade"
 * contract for the identical reason: a silent degrade-to-`[]` on failure
 * would render an "empty Up Next" lie for a user who really has tracked
 * shows — primary shelf content, not a best-effort hint.
 */
export async function getTrackedShows(): Promise<TrackedShow[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRACKED_SHOWS_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('tracked_shows')
      .select('tmdb_id, media_type, next_episode_pointer, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .abortSignal(controller.signal);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      tmdbId: row.tmdb_id,
      mediaType: row.media_type,
      nextEpisodePointer: row.next_episode_pointer,
      createdAt: row.created_at,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Which of the given titles are already tracked — checked against the server
 * `tracked_shows` table (owner-scoped by RLS). Returns `${mediaType}:${tmdbId}`
 * keys (reuses {@link watchKey}'s key shape, same convention `watchlistKey`
 * re-exports). Best-effort: a failed/hung/aborted query degrades to an empty
 * set, never throws (mirrors `getWatchlistKeys`).
 */
export async function getTrackedKeys(
  items: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Set<string>> {
  if (items.length === 0) return new Set();

  const requested = new Set(items.map((i) => watchKey(i.tmdbId, i.mediaType)));
  const tracked = new Set<string>();
  const ids = [...new Set(items.map((i) => i.tmdbId))];

  // No session → nothing can be attributed to a user; degrade to no keys.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return new Set();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRACKED_SHOWS_TIMEOUT_MS);
    try {
      const { data } = await supabase
        .from('tracked_shows')
        .select('tmdb_id, media_type')
        .eq('user_id', session.user.id)
        .in('tmdb_id', ids)
        .abortSignal(controller.signal);
      for (const row of data ?? []) tracked.add(watchKey(row.tmdb_id, row.media_type));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best-effort — degrade to empty
  }

  // `.in('tmdb_id', ids)` alone can cross-match a movie and a show that
  // happen to share a numeric TMDB id (ids are only unique per media_type) —
  // narrow back down to the exact (tmdbId, mediaType) pairs actually requested.
  return new Set([...tracked].filter((k) => requested.has(k)));
}
