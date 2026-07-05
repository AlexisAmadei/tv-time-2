// Log a watch, local-first (Story 1.5, AD-4).
//
// The whole point of AC1/AC2: the local write is the commit. logWatch's
// promise resolves the instant the row lands in `pending_watches` — never
// after a network round-trip. A sync attempt is kicked opportunistically
// afterward, but its outcome (success, failure, or never-attempted because
// offline) has no bearing on whether logWatch resolved.

import { randomUUID } from 'expo-crypto';

import { getDb } from './db';
import { supabase } from './supabaseClient';
import { triggerSync } from './watchSync';

export interface LogWatchInput {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
}

/** `${mediaType}:${tmdbId}` — the key shape used to track "already watched". */
export function watchKey(tmdbId: number, mediaType: string): string {
  return `${mediaType}:${tmdbId}`;
}

/**
 * Commit a watch synchronously to the local outbox, then kick a fire-and-forget
 * sync attempt. Resolves as soon as the local write lands — regardless of
 * network state (AC1, AC2, AC6).
 */
export async function logWatch(input: LogWatchInput): Promise<void> {
  const db = await getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  // Synchronous (awaited) local write BEFORE any network call — this ordering
  // is the whole point of AC1. Never fire the sync attempt first.
  await db.runAsync(
    `insert into pending_watches
      (id, tmdb_id, media_type, tmdb_episode_id, watched_at, rating, mood, note, synced_at, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.tmdbId,
    input.mediaType,
    null,
    now,
    null,
    null,
    null,
    null,
    now,
  );

  // Fire-and-forget: never await, never let a slow/failed sync delay or fail
  // the confirmation the caller shows the moment this promise resolves.
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

  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  const localRows = await db.getAllAsync<{ tmdb_id: number; media_type: string }>(
    `select distinct tmdb_id, media_type from pending_watches where tmdb_id in (${placeholders})`,
    ids,
  );
  for (const row of localRows) logged.add(watchKey(row.tmdb_id, row.media_type));

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    const { data } = await supabase
      .from('watches')
      .select('tmdb_id, media_type')
      .eq('user_id', session.user.id)
      .in('tmdb_id', ids);
    for (const row of data ?? []) logged.add(watchKey(row.tmdb_id, row.media_type));
  }

  // `.in('tmdb_id', ids)` alone can cross-match a movie and a show that happen
  // to share a numeric TMDB id (ids are only unique per media_type) — narrow
  // back down to the exact (tmdbId, mediaType) pairs actually requested.
  return new Set([...logged].filter((k) => requested.has(k)));
}
