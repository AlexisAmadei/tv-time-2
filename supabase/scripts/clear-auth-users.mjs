#!/usr/bin/env node
// Delete every row in auth.users on the running local db container
// (via `docker compose exec db psql`). Cascades to auth.identities,
// auth.sessions, etc., and to any app tables with an `on delete cascade`
// FK to auth.users(id). Local dev only — never point this at a hosted project.

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');
const compose = ['compose', '-f', join(supabaseDir, 'docker-compose.yml'), '--project-directory', supabaseDir];

const run = (sql) =>
  execFileSync('docker', [...compose, 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-c', sql], {
    stdio: 'inherit',
  });

const before = execFileSync(
  'docker',
  [...compose, 'exec', '-T', 'db', 'psql', '-U', 'postgres', '-t', '-c', 'select count(*) from auth.users;'],
  { encoding: 'utf8' },
).trim();

console.log(`Deleting ${before} auth user(s)...`);
run('delete from auth.users;');
run('select count(*) from auth.users;');
