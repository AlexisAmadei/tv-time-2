// The ONE local expo-sqlite connection for the whole app (Story 1.5, AD-4).
//
// Every feature that touches local storage imports `getDb` from here — never
// call `openDatabaseAsync` again elsewhere. Mirrors the "ONE client"
// discipline already established for `supabaseClient.ts`.
//
// Uses the current async API (`runAsync`/`getAllAsync`/`execAsync`), not the
// deprecated WebSQL-style `transaction()` callback API that SDK 56's
// expo-sqlite no longer exposes.

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'tvtime.db';

// Idempotent schema init — safe to re-run, never assumes a fresh install
// (mirrors the server-migration discipline, AC8). `pending_watches` is the
// local outbox: one row per logged watch until the sync worker confirms it.
//
// `mood` (singular, one bare emoji) is DEAD as of Story 3.5 — superseded by
// `moods`, a JSON-encoded array of 0–2 emoji. It is kept only because SQLite's
// `drop column` support is version-dependent and this file's migration
// convention is additive-only; nothing reads or writes it anymore.
//
// `reaction_rev` / `synced_rev` (Story 3.5) track whether a row's rating/moods
// have reached the server: `reaction_rev` increments on every reaction edit,
// `synced_rev` records the rev the sync worker last successfully pushed. A row
// with `synced_rev <> reaction_rev` is re-drained even if it already synced.
// A boolean dirty flag cannot express "clean as of rev 2, but rev 3 exists" —
// which is exactly what a rating tapped *while its own upsert is in flight*
// produces (see watchSync.ts).
const SCHEMA = `
create table if not exists pending_watches (
  id text primary key,
  user_id text not null,
  tmdb_id integer not null,
  media_type text not null,
  tmdb_episode_id integer,
  watched_at text not null,
  rating integer,
  mood text,
  moods text,
  note text,
  synced_at text,
  created_at text not null,
  reaction_rev integer not null default 0,
  synced_rev integer
);
`;

// Idempotent schema evolution for installs created before a column existed.
// `create table if not exists` won't add columns to a table that already
// exists, so bring older local databases forward here. Safe to re-run: each
// column is added only when absent. `user_id` scopes the outbox per account so
// a pending watch is never drained/attributed to a different signed-in user.
async function migrateSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>('pragma table_info(pending_watches)');
  const has = (name: string) => cols.some((c) => c.name === name);

  if (!has('user_id')) {
    // Nullable on ALTER (a not-null add would need a default for existing rows);
    // legacy rows with a null user_id simply won't match the owner-filtered
    // drain, which is the safe outcome — never a misattribution.
    await db.execAsync('alter table pending_watches add column user_id text');
  }

  // Story 3.5. `alter table ... add column` cannot add a `not null default` in
  // every SQLite version the SDK ships, so each of these is added nullable and
  // backfilled immediately; reads still `coalesce(reaction_rev, 0)` so a row
  // that somehow escapes the backfill is treated as rev 0 rather than null-
  // poisoning a comparison.
  if (!has('moods')) {
    // Transactional: SQLite's ALTER TABLE is itself transactional, so wrapping
    // the add-column with its backfill means a crash partway through rolls
    // back the column too — `has('moods')` stays false and this whole block
    // retries on next launch, instead of the column permanently existing with
    // an incomplete backfill (which `has('moods')` could never distinguish
    // from "done" and would silently strand any un-migrated legacy `mood`).
    await db.withTransactionAsync(async () => {
      await db.execAsync('alter table pending_watches add column moods text');
      // One-time forward-port of the dead singular column into the new JSON
      // array shape. Built in TS rather than by concatenating a JSON string by
      // hand, so an emoji needing escaping can't produce invalid JSON. (SQLite's
      // json_array() would also work, but its availability depends on how
      // expo-sqlite was compiled.)
      const legacy = await db.getAllAsync<{ id: string; mood: string }>(
        'select id, mood from pending_watches where mood is not null',
      );
      for (const row of legacy) {
        await db.runAsync('update pending_watches set moods = ? where id = ?', [
          JSON.stringify([row.mood]),
          row.id,
        ]);
      }
    });
  }
  if (!has('reaction_rev')) {
    await db.execAsync('alter table pending_watches add column reaction_rev integer');
    await db.execAsync('update pending_watches set reaction_rev = 0 where reaction_rev is null');
  }
  if (!has('synced_rev')) {
    await db.execAsync('alter table pending_watches add column synced_rev integer');
    // Backfill only the already-synced rows to rev 0. Leaving them null would
    // make watchSync's `coalesce(synced_rev, -1) <> coalesce(reaction_rev, 0)`
    // predicate treat every historical row as dirty and re-upsert the whole
    // outbox once on the first launch after upgrade — idempotent, but pointless
    // traffic. Unsynced rows stay null and are picked up by the
    // `synced_at is null` half of the predicate regardless.
    await db.execAsync(
      'update pending_watches set synced_rev = 0 where synced_at is not null and synced_rev is null',
    );
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** The one local database connection, opened and schema-initialized once. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME)
      .then(async (db) => {
        await db.execAsync(SCHEMA);
        await migrateSchema(db);
        return db;
      })
      // Don't memoize a rejected promise — otherwise one transient open/init
      // failure would brick local storage for the whole process. Clear it so a
      // later getDb() can retry.
      .catch((err) => {
        dbPromise = null;
        throw err;
      });
  }
  return dbPromise;
}
