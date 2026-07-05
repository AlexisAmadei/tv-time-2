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
  note text,
  synced_at text,
  created_at text not null
);
`;

// Idempotent schema evolution for installs created before a column existed.
// `create table if not exists` won't add columns to a table that already
// exists, so bring older local databases forward here. Safe to re-run: each
// column is added only when absent. `user_id` scopes the outbox per account so
// a pending watch is never drained/attributed to a different signed-in user.
async function migrateSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>('pragma table_info(pending_watches)');
  if (!cols.some((c) => c.name === 'user_id')) {
    // Nullable on ALTER (a not-null add would need a default for existing rows);
    // legacy rows with a null user_id simply won't match the owner-filtered
    // drain, which is the safe outcome — never a misattribution.
    await db.execAsync('alter table pending_watches add column user_id text');
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
