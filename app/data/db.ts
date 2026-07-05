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

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** The one local database connection, opened and schema-initialized once. */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
  }
  return dbPromise;
}
