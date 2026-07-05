// Sync worker — drains the local outbox into `watches` via PostgREST (Story
// 1.5, AD-4). NOT a general offline-sync framework (NFR8 caps v1 offline at
// "basic, not optimized"): no exponential backoff, no retry-scheduling engine.
// The three triggers wired at the call sites (opportunistic-after-log,
// app-foreground, network-reconnect) are the complete v1 retry story.

import { getDb } from './db';
import { supabase } from './supabaseClient';

interface PendingWatchRow {
  id: string;
  tmdb_id: number;
  media_type: string;
  tmdb_episode_id: number | null;
  watched_at: string;
  rating: number | null;
  mood: string | null;
  note: string | null;
  synced_at: string | null;
  created_at: string;
}

// Guards overlapping triggers so concurrent calls (e.g. a reconnect firing
// while the foreground trigger is already draining) coalesce into one pass
// rather than racing two drains against the same rows.
let syncing = false;

/**
 * Drain all unsynced `pending_watches` rows into `watches`. Idempotent-safe to
 * call concurrently — overlapping calls while a drain is in flight are no-ops.
 * A failure on one row is logged and skipped; it never aborts the rest of the
 * batch (AC7).
 */
export async function triggerSync(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const db = await getDb();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return; // No signed-in user to attribute the sync to yet.

    const rows = await db.getAllAsync<PendingWatchRow>(
      'select * from pending_watches where synced_at is null',
    );

    for (const row of rows) {
      try {
        // upsert keyed on the client-generated id — a retry after an
        // already-successful-but-unconfirmed insert is a no-op, never a
        // duplicate row or a unique-constraint error that would abort the
        // whole batch (AC7).
        const { error } = await supabase.from('watches').upsert(
          {
            id: row.id,
            user_id: session.user.id,
            tmdb_id: row.tmdb_id,
            media_type: row.media_type,
            tmdb_episode_id: row.tmdb_episode_id,
            watched_at: row.watched_at,
            rating: row.rating,
            mood: row.mood,
            note: row.note,
          },
          { onConflict: 'id' },
        );
        if (error) {
          console.warn(`watchSync: upsert failed for ${row.id}, will retry later`, error);
          continue;
        }
        await db.runAsync('update pending_watches set synced_at = ? where id = ?', [
          new Date().toISOString(),
          row.id,
        ]);
      } catch (err) {
        console.warn(`watchSync: row ${row.id} failed, will retry later`, err);
      }
    }
  } finally {
    syncing = false;
  }
}
