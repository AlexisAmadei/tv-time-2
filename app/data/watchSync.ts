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
  // JSON-encoded emoji array (Story 3.5) — replaces the dead singular `mood`.
  moods: string | null;
  note: string | null;
  synced_at: string | null;
  created_at: string;
  reaction_rev: number | null;
  synced_rev: number | null;
}

// Guards overlapping triggers so concurrent calls (e.g. a reconnect firing
// while the foreground trigger is already draining) coalesce into one pass
// rather than racing two drains against the same rows.
let syncing = false;

// Every network call in this codebase races a bounded timeout, not the
// platform default — a hung upsert must not pin the `syncing` guard forever and
// deadlock all future sync triggers.
const UPSERT_TIMEOUT_MS = 10_000;
// Same bound as the upsert (Story 3.2) — reuse the constant so the two can't drift apart.
const RECOMPUTE_TIMEOUT_MS = UPSERT_TIMEOUT_MS;

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
    // Show tmdb_ids needing a pointer recompute, collected across every pass
    // of this drain and dedupe'd for the WHOLE triggerSync() call (Task
    // 1c/Story 3.4) — several rows for the same show, whether they land in one
    // pass or are spread across a few (e.g. some upserts failing and retrying
    // in a later pass), only ever need one recompute call. Calling the RPC
    // inline per-row (the pre-3.4 bug) would recompute against a `watches`
    // table that only reflects the first of N upserts so far, landing the
    // pointer on "next after episode 1" instead of "next after the whole
    // batch"; scoping the dedupe to a single pass (3.4's original fix) still
    // under-collapses a bulk commit that spans more than one pass. Firing once
    // per show per drain — after every pass has finished, once the loop below
    // exits — is the level this is actually correct at.
    const recomputeTmdbIds = new Set<number>();
    while (true) {
      // Owner-filtered: only drain rows belonging to the current user, so a
      // pending watch created by a previously signed-in account is never
      // attributed to this one.
      //
      // Two reasons a row is drained (Story 3.5): it has never synced
      // (`synced_at is null`), OR its reaction changed after it synced
      // (`synced_rev <> reaction_rev`) — the latter re-upserts the same row in
      // place (onConflict:'id') to carry a rating/mood edit that happened after
      // the commit reached the server.
      const rows = await db.getAllAsync<PendingWatchRow>(
        `select * from pending_watches
         where user_id = ?
           and (synced_at is null or coalesce(synced_rev, -1) <> coalesce(reaction_rev, 0))`,
        [userId],
      );
      if (rows.length === 0) break;

      let progressed = false;
      for (const row of rows) {
        try {
          // Snapshot the reaction state BEFORE the upsert. If the user rates
          // this row again while the upsert below is in flight, `reaction_rev`
          // advances past `snapshotRev` — so writing `synced_rev = snapshotRev`
          // (not a re-read of the current value) leaves synced_rev < reaction_rev,
          // the selection predicate still matches, and the next pass re-upserts
          // with the newer reaction. This is the lost-update guard (Story 3.5,
          // Dev Notes "Why a revision counter, not a dirty flag"); a re-read
          // here would silently drop exactly the ratings tapped during a sync.
          const snapshotRev = row.reaction_rev ?? 0;
          const wasUnsynced = row.synced_at == null;
          // Local `pending_watches.moods` is a JSON-encoded array (Story 3.5);
          // the server `watches.mood` is `text[]` (0003). Decode at the sync
          // boundary — the one place the singular/plural seam lives. A corrupt
          // value degrades to null rather than throwing this row out of the
          // drain forever.
          let moods: string[] | null = null;
          if (row.moods) {
            try {
              const parsed = JSON.parse(row.moods);
              moods = Array.isArray(parsed) && parsed.length ? parsed : null;
            } catch (err) {
              console.warn(`watchSync: bad moods JSON for ${row.id}, sending null`, err);
            }
          }

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
                  mood: moods,
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

          // Mark synced AND record which reaction rev this upsert carried. A
          // reaction-only re-sync leaves synced_at as-is (coalesce keeps the
          // original timestamp) but advances synced_rev to the snapshotted rev.
          await db.runAsync(
            'update pending_watches set synced_at = coalesce(synced_at, ?), synced_rev = ? where id = ?',
            [new Date().toISOString(), snapshotRev, row.id],
          );
          progressed = true;

          // Organic pointer advance (Story 3.2, AC1/AC2/AC4): a side effect of
          // this row's own successful upsert, never a raw PATCH on
          // tracked_shows. Gated additionally on `wasUnsynced` (Story 3.5) so a
          // reaction-only re-sync of an already-synced episode does NOT fire a
          // pointer RPC — the RPC is idempotent (AD-10), so a stray call is
          // harmless to correctness, but a rating tap must not put a network
          // call behind an interaction the ACs describe as never blocking.
          if (wasUnsynced && row.media_type === 'tv' && row.tmdb_episode_id != null) {
            recomputeTmdbIds.add(row.tmdb_id);
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

    // Once-per-drain-per-show pointer recompute (Task 1c/Story 3.4) — runs
    // after every pass has had its chance to upsert, so each call derives the
    // pointer from a `watches` table that reflects every row this whole
    // triggerSync() call managed to sync, not just whichever pass happened to
    // pick up a given show's rows first. Deriving from the full synced
    // `watches` set (AD-10) requires the rows to already be visible
    // server-side — which they now are, by construction. Each call is wrapped
    // in its own try/catch: a failed/timed-out recompute must not undo the
    // upserts above — the watches themselves already synced.
    for (const tmdbId of recomputeTmdbIds) {
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
              p_tmdb_id: tmdbId,
              p_media_type: 'tv',
            })
            .abortSignal(recomputeController.signal);
          if (rpcError) {
            // Unlike the upsert above, there's no dedicated retry for this
            // call — the pointer just stays as-is until another episode of
            // this show is later logged and synced (which re-triggers this
            // same code path for that new row).
            console.warn(
              `watchSync: pointer recompute failed for ${tmdbId}, pointer left as-is until the next watch for this show syncs`,
              rpcError,
            );
          }
        } finally {
          clearTimeout(recomputeTimer);
        }
      } catch (err) {
        console.warn(
          `watchSync: pointer recompute failed for ${tmdbId}, pointer left as-is until the next watch for this show syncs`,
          err,
        );
      }
    }
  } finally {
    syncing = false;
  }
}
