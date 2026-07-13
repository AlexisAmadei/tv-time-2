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

// Diary page size (Story 4.1) — a plain constant, same convention as the
// timeout above. Keyset-paginated (see getDiaryPage) rather than offset-based,
// so this only bounds a single page's row count, not the Diary's total size.
const DIARY_PAGE_SIZE = 30;

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

/**
 * One Diary row (Story 4.1) — a `LoggedWatch` that also carries which title
 * it belongs to. `getWatchesForTitle`'s `LoggedWatch` omits `tmdbId`/
 * `mediaType` because that caller already knows them (single-title context);
 * the Diary spans every title the user has ever logged, so each row must
 * carry its own.
 */
export interface DiaryWatch extends LoggedWatch {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/** Keyset pagination cursor for the Diary (Story 4.1) — see getDiaryPage's
 *  own comment for why this is a keyset cursor, not an offset. */
export interface DiaryCursor {
  watchedAt: string;
  id: string;
}

export interface DiaryPage {
  rows: DiaryWatch[];
  nextCursor: DiaryCursor | null;
}

export interface EditWatchInput {
  watchedAt?: string;
  rating?: number | null;
  moods?: string[];
  note?: string | null;
}

/** Shared row → camelCase decode for both getWatchesForTitle and
 *  getDiaryPage — the only difference between those two reads is the filter/
 *  select-columns, not this mapping, so it lives in one place. */
function decodeLoggedWatchRow(row: {
  id: string;
  tmdb_episode_id: number | null;
  watched_at: string;
  rating: number | null;
  mood: string[] | null;
  note: string | null;
}): LoggedWatch {
  return {
    id: row.id,
    tmdbEpisodeId: row.tmdb_episode_id,
    watchedAt: row.watched_at,
    rating: row.rating,
    moods: row.mood ?? [],
    note: row.note,
  };
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
    return (data ?? []).map(decodeLoggedWatchRow);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Diary's paginated, cross-title read (Story 4.1) — every watch the user
 * has ever logged, across every title, newest-first (AC1). Same throws-on-
 * hard-failure / degrades-to-empty-on-no-session posture as
 * `getWatchesForTitle` above, for the same reason: this is the Diary's
 * primary content, not a best-effort hint.
 *
 * Keyset-paginated, not offset-paginated (`.range()`). `watches` is a live,
 * mutating table — a bulk-log (Story 3.4) or an organic watch can insert a
 * row, and an edit/remove (Story 3.7, reused by the Diary) can delete one,
 * *while* a user is scrolled partway through their history. An offset like
 * `.range(30, 59)` shifts under any such change (a new row above the current
 * scroll position pushes every later offset down by one), producing a
 * skipped or duplicated row at the next page boundary. A keyset cursor on
 * `(watched_at, id)` — matching the query's own two-column `ORDER BY` — is
 * immune to that: the next page is always "everything after this exact row,"
 * never "everything at this numeric position." The `id` tiebreaker matters
 * because a bulk-log (3.4) can insert several episodes sharing the exact same
 * `watched_at` instant, which `watched_at` alone can't order stably.
 */
export async function getDiaryPage(cursor?: DiaryCursor): Promise<DiaryPage> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { rows: [], nextCursor: null };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WATCH_EDIT_TIMEOUT_MS);
  try {
    // Build the filter half of the query first (eq/or), then chain
    // order/limit/abortSignal once at the end — keeps `filtered` a single
    // consistent builder type throughout instead of reassigning across a
    // filter-vs-transform builder boundary.
    let filtered = supabase
      .from('watches')
      .select('id, tmdb_id, media_type, tmdb_episode_id, watched_at, rating, mood, note')
      .eq('user_id', session.user.id);

    if (cursor) {
      // Continue strictly past the last row of the previous page: either an
      // earlier watched_at, or the same watched_at with a smaller id (the
      // bulk-log same-instant tiebreak this cursor exists for).
      filtered = filtered.or(
        `watched_at.lt.${cursor.watchedAt},and(watched_at.eq.${cursor.watchedAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await filtered
      .order('watched_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(DIARY_PAGE_SIZE)
      .abortSignal(controller.signal);
    if (error) throw error;

    const rows: DiaryWatch[] = (data ?? []).map((row) => ({
      ...decodeLoggedWatchRow(row),
      tmdbId: row.tmdb_id,
      mediaType: row.media_type,
    }));

    const last = rows[rows.length - 1];
    const nextCursor: DiaryCursor | null =
      rows.length === DIARY_PAGE_SIZE && last ? { watchedAt: last.watchedAt, id: last.id } : null;

    return { rows, nextCursor };
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
