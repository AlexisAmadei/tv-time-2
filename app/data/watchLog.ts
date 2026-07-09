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

export interface LogWatchInput {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  tmdbEpisodeId?: number | null;
  /** 0–10 half-star scale (`watches.rating`'s existing CHECK). Story 3.4/3.5. */
  rating?: number | null;
  /** One locked FR18 emoji. Story 3.4/3.5. */
  mood?: string | null;
}

/** `${mediaType}:${tmdbId}` — the key shape used to track "already watched". */
export function watchKey(tmdbId: number, mediaType: string): string {
  return `${mediaType}:${tmdbId}`;
}

// Shared by logWatch and logWatchBatch — the actual `pending_watches` insert,
// with the mood boundary-check (FR18's locked set, moods.ts) applied right
// before the row is written so a bad value never enters the local outbox in
// the first place (vs. discovering it only when the server's CHECK
// constraint, 0008, rejects the eventual sync upsert).
async function insertPendingWatch(
  db: SQLiteDatabase,
  userId: string,
  input: LogWatchInput,
  now: string,
): Promise<void> {
  if (!isValidMood(input.mood)) {
    throw new Error(`logWatch: invalid mood value "${input.mood}"`);
  }
  await db.runAsync(
    `insert into pending_watches
      (id, user_id, tmdb_id, media_type, tmdb_episode_id, watched_at, rating, mood, note, synced_at, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    userId,
    input.tmdbId,
    input.mediaType,
    input.tmdbEpisodeId ?? null,
    now,
    input.rating ?? null,
    input.mood ?? null,
    null,
    null,
    now,
  );
}

/**
 * Commit a watch synchronously to the local outbox, then kick a fire-and-forget
 * sync attempt. Resolves as soon as the local write lands — regardless of
 * network state (AC1, AC2, AC6).
 */
export async function logWatch(input: LogWatchInput): Promise<void> {
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
  await insertPendingWatch(db, session.user.id, input, new Date().toISOString());

  // Fire-and-forget: never await, never let a slow/failed sync delay or fail
  // the confirmation the caller shows the moment this promise resolves.
  void triggerSync().catch(() => {});
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
 */
export async function logWatchBatch(inputs: LogWatchInput[]): Promise<void> {
  if (inputs.length === 0) return;
  const db = await getDb();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('logWatchBatch: no active session');

  const now = new Date().toISOString();
  await db.withTransactionAsync(async () => {
    for (const input of inputs) {
      await insertPendingWatch(db, session.user.id, input, now);
    }
  });

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
