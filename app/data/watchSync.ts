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

// Every network call in this codebase races a bounded timeout, not the
// platform default — a hung upsert must not pin the `syncing` guard forever and
// deadlock all future sync triggers.
const UPSERT_TIMEOUT_MS = 10_000;
// Mirrors UPSERT_TIMEOUT_MS's pattern for the pointer-recompute RPC (Story 3.2).
const RECOMPUTE_TIMEOUT_MS = 10_000;

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
    const userId = session.user.id;

    // Drain in passes. A watch logged *during* a pass lands after that pass's
    // `select` snapshot, and the opportunistic `triggerSync()` it fires no-ops
    // on the `syncing` guard — so without re-selecting, that row could wait for
    // a foreground/reconnect trigger that may never come. Loop until a full
    // pass syncs nothing new (rows all failing / offline), which also bounds it
    // against spinning on persistently-failing rows.
    while (true) {
      // Owner-filtered: only drain rows belonging to the current user, so a
      // pending watch created by a previously signed-in account is never
      // attributed to this one.
      const rows = await db.getAllAsync<PendingWatchRow>(
        'select * from pending_watches where synced_at is null and user_id = ?',
        [userId],
      );
      if (rows.length === 0) break;

      let progressed = false;
      // Dedupe recompute calls within this pass — several rows for the same
      // show syncing together only need the pointer recomputed once (the RPC
      // is idempotent under retry, AD-10, so this is an optimization, not a
      // correctness requirement).
      const recomputedThisPass = new Set<string>();
      for (const row of rows) {
        try {
          // upsert keyed on the client-generated id — a retry after an
          // already-successful-but-unconfirmed insert is a no-op, never a
          // duplicate row or a unique-constraint error that would abort the
          // whole batch (AC7). Bounded by a timeout so a hung request rejects
          // (→ caught below, guard released) instead of pinning `syncing`.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), UPSERT_TIMEOUT_MS);
          let failed = false;
          try {
            const { error } = await supabase
              .from('watches')
              .upsert(
                {
                  id: row.id,
                  user_id: userId,
                  tmdb_id: row.tmdb_id,
                  media_type: row.media_type,
                  tmdb_episode_id: row.tmdb_episode_id,
                  watched_at: row.watched_at,
                  rating: row.rating,
                  mood: row.mood,
                  note: row.note,
                },
                { onConflict: 'id' },
              )
              .abortSignal(controller.signal);
            if (error) {
              console.warn(`watchSync: upsert failed for ${row.id}, will retry later`, error);
              failed = true;
            }
          } finally {
            clearTimeout(timer);
          }
          if (failed) continue;

          await db.runAsync('update pending_watches set synced_at = ? where id = ?', [
            new Date().toISOString(),
            row.id,
          ]);
          progressed = true;

          // Organic pointer advance (Story 3.2, AC1/AC2/AC4): a side effect of
          // THIS row's own successful upsert, never a raw PATCH on
          // tracked_shows. Deriving from the full synced `watches` set (AD-10)
          // requires this row to already be visible server-side — which it now
          // is, by construction. Wrapped in its own try/catch: a failed/timed-
          // out recompute must not mark this row's sync as failed — the watch
          // itself already synced.
          if (row.media_type === 'tv' && row.tmdb_episode_id != null) {
            const dedupeKey = `${row.tmdb_id}:${row.media_type}`;
            if (!recomputedThisPass.has(dedupeKey)) {
              recomputedThisPass.add(dedupeKey);
              try {
                const recomputeController = new AbortController();
                const recomputeTimer = setTimeout(
                  () => recomputeController.abort(),
                  RECOMPUTE_TIMEOUT_MS,
                );
                try {
                  const { error: rpcError } = await supabase
                    .rpc('recompute_next_episode_pointer', {
                      p_user_id: userId,
                      p_tmdb_id: row.tmdb_id,
                      p_media_type: 'tv',
                    })
                    .abortSignal(recomputeController.signal);
                  if (rpcError) {
                    console.warn(
                      `watchSync: pointer recompute failed for ${row.tmdb_id}, will retry later`,
                      rpcError,
                    );
                  }
                } finally {
                  clearTimeout(recomputeTimer);
                }
              } catch (err) {
                console.warn(
                  `watchSync: pointer recompute failed for ${row.tmdb_id}, will retry later`,
                  err,
                );
              }
            }
          }
        } catch (err) {
          console.warn(`watchSync: row ${row.id} failed, will retry later`, err);
        }
      }

      // A pass that synced nothing means the remaining rows are all failing (or
      // we're offline) — stop rather than spin. Rows added mid-pass are picked
      // up by the next iteration as long as this one made progress.
      if (!progressed) break;
    }
  } finally {
    syncing = false;
  }
}
