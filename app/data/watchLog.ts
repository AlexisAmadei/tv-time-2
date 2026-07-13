// Log a watch, local-first (Story 1.5, AD-4).
//
// The whole point of AC1/AC2: the local write is the commit. logWatch's
// promise resolves the instant the row lands in `pending_watches` — never
// after a network round-trip. A sync attempt is kicked opportunistically
// afterward, but its outcome (success, failure, or never-attempted because
// offline) has no bearing on whether logWatch resolved.

import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from './db';
import { isValidMood } from './moods';
import { supabase } from './supabaseClient';
import { triggerSync } from './watchSync';

// Best-effort "already watched" lookup is bounded like every other network
// call in this codebase (catalog.ts races 10s) — a hung server never blocks it.
const LOGGED_KEYS_TIMEOUT_MS = 10_000;
// Same bound as every other network call in this codebase.
const REACTION_PATCH_TIMEOUT_MS = 10_000;

/** UI cap on how many moods one watch may carry (FR18's "0–2"). Client-side
 *  only: `0008`'s CHECK constrains the mood *values*, deliberately not the
 *  count (see that migration's header, and Story 3.5's Dev Notes). */
export const MAX_MOODS = 2;

/** UI cap on note length (FR21's "~500-char cap"). Client-side only — no DB
 *  CHECK (Story 3.6's Dev Notes: AC2 frames this as UI bounding, not a
 *  persistence-layer rule). Mirrors `MAX_MOODS`'s "cap lives here, enforced
 *  in the UI's own maxLength too" shape. */
export const MAX_NOTE_LENGTH = 500;

export interface LogWatchInput {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  tmdbEpisodeId?: number | null;
  /** 0–10 half-star scale (`watches.rating`'s existing CHECK). Story 3.4/3.5. */
  rating?: number | null;
  /** 0–2 locked FR18 emoji. Story 3.5 (was a singular `mood` in 3.4). */
  moods?: string[] | null;
}

export interface WatchReaction {
  /** 0–10 half-star scale, or null to clear the rating. */
  rating: number | null;
  /** 0–2 locked FR18 emoji; an empty array clears the moods. */
  moods: string[];
  /** ~500-char plain text, or null to clear the note (Story 3.6). */
  note: string | null;
}

// Shared boundary check for both write paths (insert and reaction edit): a bad
// value must never enter the local outbox, rather than being discovered only
// when the server's CHECK constraint (0008) rejects the eventual sync upsert.
// `note` has no server-side CHECK (see MAX_NOTE_LENGTH's comment) — this is
// defense-in-depth behind RatingPrompt's own maxLength, not the only guard.
export function assertValidReaction(
  where: string,
  rating: number | null | undefined,
  moods: string[] | null | undefined,
  note?: string | null,
): void {
  if (rating != null && (!Number.isInteger(rating) || rating < 0 || rating > 10)) {
    throw new Error(`${where}: rating must be an integer 0–10, got ${rating}`);
  }
  if (note != null && note.length > MAX_NOTE_LENGTH) {
    throw new Error(`${where}: note must be at most ${MAX_NOTE_LENGTH} chars, got ${note.length}`);
  }
  if (moods == null) return;
  if (moods.length > MAX_MOODS) {
    throw new Error(`${where}: at most ${MAX_MOODS} moods, got ${moods.length}`);
  }
  for (const mood of moods) {
    if (!isValidMood(mood)) throw new Error(`${where}: invalid mood value "${mood}"`);
  }
}

/** `null` for "no moods" — the local column's empty representation, so an empty
 *  array and an absent selection are stored identically. */
function encodeMoods(moods: string[] | null | undefined): string | null {
  return moods && moods.length > 0 ? JSON.stringify(moods) : null;
}

/** `${mediaType}:${tmdbId}` — the key shape used to track "already watched". */
export function watchKey(tmdbId: number, mediaType: string): string {
  return `${mediaType}:${tmdbId}`;
}

// Shared by logWatch and logWatchBatch — the actual `pending_watches` insert.
// Returns the client-generated id it wrote, which is also the id the row will
// carry in the server's `watches` table once it syncs (the outbox upserts on
// it). Story 3.5's rating prompt needs that id to address the row it must
// update; before 3.5 it was generated and dropped here.
//
// The dead singular `mood` column is never written — `moods` (JSON array) is
// the only mood storage as of 3.5.
async function insertPendingWatch(
  db: SQLiteDatabase,
  userId: string,
  input: LogWatchInput,
  now: string,
): Promise<string> {
  assertValidReaction('logWatch', input.rating, input.moods);
  const id = randomUUID();
  await db.runAsync(
    `insert into pending_watches
      (id, user_id, tmdb_id, media_type, tmdb_episode_id, watched_at, rating, moods, note, synced_at, created_at, reaction_rev, synced_rev)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null)`,
    id,
    userId,
    input.tmdbId,
    input.mediaType,
    input.tmdbEpisodeId ?? null,
    now,
    input.rating ?? null,
    encodeMoods(input.moods),
    // `note` is Story 3.6 — hardcoded null on every write path until then.
    null,
    null,
    now,
  );
  return id;
}

/**
 * Commit a watch synchronously to the local outbox, then kick a fire-and-forget
 * sync attempt. Resolves as soon as the local write lands — regardless of
 * network state (AC1, AC2, AC6) — with the new watch's id, which the caller
 * hands to {@link setWatchReaction} if the user rates it (Story 3.5).
 */
export async function logWatch(input: LogWatchInput): Promise<string> {
  const db = await getDb();
  // Stamp the owner onto the outbox row so a pending watch is never drained or
  // attributed to a different account that signs in on the same device before
  // this one syncs. The app shell is behind the auth gate, so a session is
  // present whenever this is reachable; guard defensively regardless.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('logWatch: no active session');

  // Synchronous (awaited) local write BEFORE any network call — this ordering
  // is the whole point of AC1. Never fire the sync attempt first.
  const id = await insertPendingWatch(db, session.user.id, input, new Date().toISOString());

  // Fire-and-forget: never await, never let a slow/failed sync delay or fail
  // the confirmation the caller shows the moment this promise resolves.
  void triggerSync().catch(() => {});
  return id;
}

/**
 * Commit several watches as one atomic local-outbox transaction (Story 3.4's
 * bulk-log case — e.g. every episode of a season). One session lookup and one
 * `withTransactionAsync` for the whole batch instead of N of each: either all
 * rows land or none do, so a failure partway through (the same
 * "no active session" case `logWatch` throws on) leaves nothing to
 * half-retry — a retry after a failed batch simply resubmits the same input
 * with no risk of double-logging whatever "succeeded" before the rollback.
 * One `triggerSync()` fires after the whole batch commits, not once per row.
 *
 * Returns the client-generated ids in `inputs` order (Story 3.5). The bulk
 * sheet ignores them — it collects its own season-level reaction inside the
 * sheet and fires no post-watch prompt — but a caller that can't identify the
 * rows it just wrote is the exact gap 3.5 closes for the single-watch path, so
 * the batch path returns them for symmetry rather than dropping them.
 */
export async function logWatchBatch(inputs: LogWatchInput[]): Promise<string[]> {
  if (inputs.length === 0) return [];
  const db = await getDb();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('logWatchBatch: no active session');

  const now = new Date().toISOString();
  const ids: string[] = [];
  await db.withTransactionAsync(async () => {
    for (const input of inputs) {
      ids.push(await insertPendingWatch(db, session.user.id, input, now));
    }
  });

  void triggerSync().catch(() => {});
  return ids;
}

/**
 * Attach (or change, or clear) a rating and/or moods on an already-committed
 * watch — the AC2/AC3/AC5 core of Story 3.5's post-watch prompt.
 *
 * AD-4 in one function: the LOCAL write comes first, always, and only then does
 * this decide what (if anything) to send to the server.
 *
 *  - If the watch has not yet synced (`synced_at is null`) it sends NOTHING —
 *    the reaction rides along when the outbox drain inserts the row, so the
 *    commit and the reaction arrive as a single `watches` row. This is AC3's
 *    fast-path hazard made unrepresentable: there is no separate PATCH that
 *    could hit a not-yet-existing server row.
 *  - If the watch already synced, it issues a real PATCH keyed by the now-known
 *    server id (which equals the local id — the outbox upserts on it).
 *
 * A `reaction_rev`/`synced_rev` pair, not a dirty flag, guards the subtler
 * lost-update race (rating a row while its own upsert is in flight) — see
 * watchSync.ts and db.ts. Never surfaces a hard error: the watch is already
 * committed, the reaction is optional, and any failed PATCH self-heals on the
 * next drain (which re-selects the row because synced_rev still lags).
 */
export async function setWatchReaction(
  watchId: string,
  reaction: WatchReaction,
): Promise<void> {
  assertValidReaction('setWatchReaction', reaction.rating, reaction.moods, reaction.note);
  const db = await getDb();
  const encodedMoods = encodeMoods(reaction.moods);
  // Empty selection stores as null (mirrors encodeMoods' convention) so a
  // cleared note round-trips to server NULL rather than an empty string.
  const note = reaction.note && reaction.note.length > 0 ? reaction.note : null;

  // 1. Local write first, atomically, reading back what we need to decide the
  //    network step in the SAME transaction so the snapshot can't drift.
  let syncedAt: string | null = null;
  let reactionRev = 0;
  let matched = false;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `update pending_watches
         set rating = ?, moods = ?, note = ?, reaction_rev = coalesce(reaction_rev, 0) + 1
       where id = ?`,
      [reaction.rating, encodedMoods, note, watchId],
    );
    const row = await db.getFirstAsync<{ synced_at: string | null; reaction_rev: number }>(
      'select synced_at, reaction_rev from pending_watches where id = ?',
      [watchId],
    );
    if (row) {
      matched = true;
      syncedAt = row.synced_at;
      reactionRev = row.reaction_rev;
    }
  });

  // 4 (spec order): no local row — purged, or a future Diary edit of a watch
  // this device never logged. The server row is the only copy; fall through to
  // the PATCH branch rather than silently no-op'ing.
  if (!matched) {
    console.warn(`setWatchReaction: no local row for ${watchId}; PATCHing server row directly`);
  }

  // 3. Branch on whether the server row exists yet.
  if (matched && syncedAt == null) {
    // Not on the server yet — send nothing; the drain carries commit + reaction
    // together (AC3). Kick a sync so it happens as soon as connectivity allows.
    void triggerSync().catch(() => {});
    return;
  }

  // Synced (or no local row): PATCH the existing server row, bounded like every
  // other network call. On success, advance synced_rev to the rev we just wrote
  // so the drain won't needlessly re-send it. On failure, swallow and leave
  // synced_rev behind — the next drain re-upserts and heals it.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REACTION_PATCH_TIMEOUT_MS);
    try {
      const { error } = await supabase
        .from('watches')
        .update({
          rating: reaction.rating,
          mood: reaction.moods.length ? reaction.moods : null,
          note,
        })
        .eq('id', watchId)
        .abortSignal(controller.signal);
      if (error) {
        console.warn(`setWatchReaction: PATCH failed for ${watchId}, will heal on next sync`, error);
        // Unlike the not-yet-synced branch, nothing else guarantees a future
        // drain runs to pick up the rev mismatch this PATCH leaves behind —
        // kick one now rather than relying on some unrelated future trigger.
        void triggerSync().catch(() => {});
        return;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn(`setWatchReaction: PATCH errored for ${watchId}, will heal on next sync`, err);
    void triggerSync().catch(() => {});
    return;
  }

  if (matched) {
    await db.runAsync('update pending_watches set synced_rev = ? where id = ?', [reactionRev, watchId]);
  }
  // Guards the same lost-update race a concurrent triggerSync() drain could
  // hit against this same row (drain snapshot taken before this PATCH landed)
  // — a follow-up drain re-checks reaction_rev vs. synced_rev and self-heals
  // if the two writers raced.
  void triggerSync().catch(() => {});
}

/**
 * Which of the given titles already have a logged watch — checked against
 * BOTH the local outbox (unsynced) and the server `watches` table (synced),
 * so a title logged moments ago (still pending) and one logged last week
 * (already synced) both show as "already watched". Returns `${mediaType}:${tmdbId}`
 * keys (see {@link watchKey}); a title can have several watches (rewatch is
 * legitimate, AD-3) — this only checks existence, not count.
 */
export async function getLoggedKeys(
  items: { tmdbId: number; mediaType: 'movie' | 'tv' }[],
): Promise<Set<string>> {
  if (items.length === 0) return new Set();

  const requested = new Set(items.map((i) => watchKey(i.tmdbId, i.mediaType)));
  const logged = new Set<string>();
  const ids = [...new Set(items.map((i) => i.tmdbId))];

  // No session → nothing can be attributed to a user; degrade to no keys rather
  // than surface another account's local outbox rows (they're user-scoped now).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return new Set();

  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const localRows = await db.getAllAsync<{ tmdb_id: number; media_type: string }>(
    `select distinct tmdb_id, media_type from pending_watches where user_id = ? and tmdb_id in (${placeholders})`,
    [session.user.id, ...ids],
  );
  for (const row of localRows) logged.add(watchKey(row.tmdb_id, row.media_type));

  // Best-effort server lookup, bounded by a timeout (codebase convention) and
  // wrapped so a hung/failed/aborted query degrades to local-only keys rather
  // than throwing away the local matches computed above.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGGED_KEYS_TIMEOUT_MS);
    try {
      const { data } = await supabase
        .from('watches')
        .select('tmdb_id, media_type')
        .eq('user_id', session.user.id)
        .in('tmdb_id', ids)
        .abortSignal(controller.signal);
      for (const row of data ?? []) logged.add(watchKey(row.tmdb_id, row.media_type));
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best-effort — leave the local keys as-is
  }

  // `.in('tmdb_id', ids)` alone can cross-match a movie and a show that happen
  // to share a numeric TMDB id (ids are only unique per media_type) — narrow
  // back down to the exact (tmdbId, mediaType) pairs actually requested.
  return new Set([...logged].filter((k) => requested.has(k)));
}

/**
 * Per-episode watched ids for a batch of tv shows — the granularity
 * {@link getLoggedKeys} deliberately doesn't provide (that one only answers
 * "has ANY watch been logged for this title"). Used by HomeScreen's grid-view
 * progress bar (episodes watched / total real episodes). Mirrors
 * getLoggedKeys's exact shape: local `pending_watches` (unsynced) unioned with
 * the server `watches` table (synced), best-effort on the server leg so a
 * hung/failed query degrades to local-only rather than throwing away what's
 * already known.
 */
export async function getWatchedEpisodeIds(
  tmdbIds: number[],
): Promise<Map<number, Set<number>>> {
  const result = new Map<number, Set<number>>();
  if (tmdbIds.length === 0) return result;
  const ids = [...new Set(tmdbIds)];

  const add = (tmdbId: number, episodeId: number) => {
    const set = result.get(tmdbId) ?? new Set<number>();
    set.add(episodeId);
    result.set(tmdbId, set);
  };

  // No session → degrade to no progress rather than surface another account's
  // local outbox rows (same reasoning as getLoggedKeys).
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return result;

  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const localRows = await db.getAllAsync<{ tmdb_id: number; tmdb_episode_id: number | null }>(
    `select tmdb_id, tmdb_episode_id from pending_watches
     where user_id = ? and media_type = 'tv' and tmdb_episode_id is not null and tmdb_id in (${placeholders})`,
    [session.user.id, ...ids],
  );
  for (const row of localRows) {
    if (row.tmdb_episode_id != null) add(row.tmdb_id, row.tmdb_episode_id);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGGED_KEYS_TIMEOUT_MS);
    try {
      const { data } = await supabase
        .from('watches')
        .select('tmdb_id, tmdb_episode_id')
        .eq('user_id', session.user.id)
        .eq('media_type', 'tv')
        .not('tmdb_episode_id', 'is', null)
        .in('tmdb_id', ids)
        .abortSignal(controller.signal);
      for (const row of data ?? []) {
        if (row.tmdb_episode_id != null) add(row.tmdb_id, row.tmdb_episode_id);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best-effort — leave the local-only ids as-is
  }

  return result;
}
