// Edit or remove an already-logged watch, direct-to-PostgREST (Story 3.7, FR16).
//
// Same architectural call as `watchlist.ts`/`trackedShows.ts`: THIS IS NOT THE
// OUTBOX. AD-4 binds only the original commit (FR14) and the reaction prompt
// that immediately follows it (FR17-21) — both need to survive a network drop
// because they're the sub-15-second core loop. Editing or removing an
// already-logged watch, sometime later from title detail, has no such AC
// (AC1's own text says "via PostgREST", not "via the outbox") — so this module
// talks straight to the one `supabase` client, exactly like `watchlist.ts` and
// `trackedShows.ts` — no `getDb()`, no `pending_watches`, no `triggerSync`.
//
// Unlike those two modules, there is no idempotency-via-unique-index story
// here: edit/remove target one specific row by id, and RLS (`watches_update_own`/
// `watches_delete_own`, 0003) is the sole authorization boundary — never
// re-implemented client-side.

import { assertValidReaction } from './watchLog';
import { supabase } from './supabaseClient';

// Same bound as every other network call in this codebase.
const WATCH_EDIT_TIMEOUT_MS = 10_000;

/** One logged watch (Story 3.7) — camelCase mirror of a `watches` read, for
 *  the "Your watches" section and its edit sheet. */
export interface LoggedWatch {
  id: string;
  tmdbEpisodeId: number | null;
  watchedAt: string;
  rating: number | null;
  moods: string[];
  note: string | null;
}

export interface EditWatchInput {
  watchedAt?: string;
  rating?: number | null;
  moods?: string[];
  note?: string | null;
}

async function requireUserId(): Promise<string> {
  // The app shell is behind the auth gate, so a session is present whenever
  // this is reachable; guard defensively regardless (same as logWatch /
  // addToWatchlist / trackShow).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('watchEdit: no active session');
  return session.user.id;
}

/**
 * Every watch ever logged for one title, newest-first (Story 3.7) — the
 * "Your watches" section's primary content, not a best-effort hint. Unlike
 * `getTrackedKeys`/`getWatchlistKeys` (which degrade silently on failure), a
 * silent empty-on-failure here would lie "no watches logged" to a user who
 * has some — same reasoning `getTrackedShows()`/`getWatchlist()` already
 * established for their own primary-shelf reads. Throws on a hard failure;
 * only a missing session degrades to `[]` (there is genuinely nothing to
 * show).
 */
export async function getWatchesForTitle(
  tmdbId: number,
  mediaType: 'movie' | 'tv',
): Promise<LoggedWatch[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WATCH_EDIT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('watches')
      .select('id, tmdb_episode_id, watched_at, rating, mood, note')
      .eq('user_id', session.user.id)
      .eq('tmdb_id', tmdbId)
      .eq('media_type', mediaType)
      .order('watched_at', { ascending: false })
      .limit(200)
      .abortSignal(controller.signal);
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      tmdbEpisodeId: row.tmdb_episode_id,
      watchedAt: row.watched_at,
      rating: row.rating,
      moods: row.mood ?? [],
      note: row.note,
    }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Edit an already-logged watch's date, rating, moods, or note (AC1). The
 * caller is an explicit Save action, not a best-effort background sync — this
 * throws on failure so the user knows it didn't save (unlike
 * `setWatchReaction`'s silent-heal posture for the non-blocking rating
 * prompt). RLS (`watches_update_own`) is the authorization boundary; no
 * client-side ownership check beyond that.
 */
export async function editWatch(watchId: string, updates: EditWatchInput): Promise<void> {
  // assertValidReaction already validates rating (0-10), moods (<= MAX_MOODS,
  // each a locked-set value via isValidMood), and note length — the same
  // boundary check insertPendingWatch/setWatchReaction use, reused rather than
  // duplicated.
  assertValidReaction('editWatch', updates.rating, updates.moods, updates.note);
  if (updates.watchedAt != null) {
    const watchedAt = new Date(updates.watchedAt);
    const oneDayFromNow = Date.now() + 24 * 60 * 60 * 1000; // clock-skew buffer
    if (Number.isNaN(watchedAt.getTime()) || watchedAt.getFullYear() < 1900 || watchedAt.getTime() > oneDayFromNow) {
      throw new Error(`editWatch: watchedAt out of range, got ${updates.watchedAt}`);
    }
  }

  // Same posture as removeWatch: throw on no session rather than letting a
  // signed-out edit silently no-op behind RLS.
  await requireUserId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WATCH_EDIT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('watches')
      .update({
        watched_at: updates.watchedAt,
        rating: updates.rating,
        mood: updates.moods && updates.moods.length ? updates.moods : null,
        note: updates.note && updates.note.trim().length > 0 ? updates.note : null,
      })
      .eq('id', watchId)
      .select('id')
      .abortSignal(controller.signal);
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`editWatch: watch ${watchId} not found or not owned by current user`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Remove a logged watch (AC2). RLS (`watches_delete_own`) is the
 * authorization boundary. On success, if the watch was a tv episode, recompute
 * the show's pointer from the now-smaller remaining watch set — the same
 * `recompute_next_episode_pointer` call site `watchSync.ts`/`trackedShows.ts`
 * already use, minus the `wasUnsynced` gate (irrelevant here: every removable
 * row is by definition already-synced, since only synced rows ever appear in
 * `getWatchesForTitle`'s server read). Skip the call entirely for a film or a
 * title-level tv watch — the RPC's own Step 2 already no-ops for a film, but
 * this avoids the network call outright rather than relying on that no-op,
 * the same "don't call it when you already know the answer" discipline
 * `watchSync.ts` uses.
 *
 * The delete's own failure (network/RLS) throws — the caller needs to know
 * removal didn't happen. A failed recompute is logged and swallowed instead:
 * the delete (AC2's primary outcome) already succeeded, and a stale pointer
 * self-heals the next time this show's sync/track path runs the RPC again —
 * the same tradeoff `watchSync.ts` already accepts for this exact call.
 */
export async function removeWatch(
  watchId: string,
  tmdbId: number,
  mediaType: 'movie' | 'tv',
  tmdbEpisodeId: number | null,
): Promise<void> {
  const userId = await requireUserId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WATCH_EDIT_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('watches')
      .delete()
      .eq('id', watchId)
      .select('id')
      .abortSignal(controller.signal);
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`removeWatch: watch ${watchId} not found or not owned by current user`);
    }
  } finally {
    clearTimeout(timer);
  }

  if (mediaType !== 'tv' || tmdbEpisodeId == null) return;

  const recomputeController = new AbortController();
  const recomputeTimer = setTimeout(() => recomputeController.abort(), WATCH_EDIT_TIMEOUT_MS);
  try {
    const { error: rpcError } = await supabase
      .rpc('recompute_next_episode_pointer', {
        p_user_id: userId,
        p_tmdb_id: tmdbId,
        p_media_type: mediaType,
      })
      .abortSignal(recomputeController.signal);
    if (rpcError) {
      console.warn(
        `watchEdit: pointer recompute failed for ${tmdbId} after remove, pointer left as-is until the next watch for this show syncs`,
        rpcError,
      );
    }
  } catch (err) {
    console.warn(
      `watchEdit: pointer recompute failed for ${tmdbId} after remove, pointer left as-is until the next watch for this show syncs`,
      err,
    );
  } finally {
    clearTimeout(recomputeTimer);
  }
}
