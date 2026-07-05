#!/usr/bin/env node
// Apply supabase/migrations/*.sql (in sorted order) to the running local db
// container via `docker compose exec db psql`.
//
// There is no migration-tracking table yet (a real runner is deferred — see
// supabase/README.md). Migrations are written idempotent / re-runnable, so this
// script can safely re-apply the whole folder. `ON_ERROR_STOP=1` makes any SQL
// error fail the run loudly instead of limping past a half-applied migration.

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');
const migrationsDir = join(supabaseDir, 'migrations');
const compose = ['compose', '-f', join(supabaseDir, 'docker-compose.yml'), '--project-directory', supabaseDir];

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('No migrations to apply.');
  process.exit(0);
}

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  process.stdout.write(`Applying ${file} … `);
  try {
    execFileSync(
      'docker',
      // -1 (--single-transaction) wraps the whole file in one transaction, so a
      // mid-file failure rolls back everything already run in it instead of
      // leaving a half-applied migration committed.
      [...compose, 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-1', '-q'],
      { input: sql, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    console.log('ok');
  } catch {
    console.error(`\n✗ Migration ${file} failed — is the stack up? (pnpm run supabase:up)`);
    process.exit(1);
  }
}

console.log(`\n✓ Applied ${files.length} migration(s).`);
