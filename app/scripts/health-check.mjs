#!/usr/bin/env node
// Headless connectivity probe — the Node twin of checkSupabaseHealth() in
// data/supabaseClient.ts. Reads app/.env and confirms the Kong gateway is
// reachable with the configured anon key. Lets you verify the substrate from
// CI/terminal without booting a device.
//
// Usage: node scripts/health-check.mjs   (or: pnpm --filter app health-check)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readEnv() {
  let raw;
  try {
    raw = readFileSync(join(appDir, '.env'), 'utf8');
  } catch {
    throw new Error('app/.env not found. Copy app/.env.example to app/.env (see supabase/README.md).');
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = unquote(m[2].replace(/\r$/, '').trim());
  }
  return env;
}

// Strip one layer of matching surrounding quotes, if present.
function unquote(v) {
  const m = v.match(/^"(.*)"$/) || v.match(/^'(.*)'$/);
  return m ? m[1] : v;
}

const env = readEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error('✗ Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in app/.env');
  process.exit(1);
}

const target = `${url}/auth/v1/health`;
try {
  const res = await fetch(target, {
    headers: { apikey: anonKey },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    console.error(`✗ Supabase gateway returned HTTP ${res.status} for ${target}`);
    if (res.status === 401) {
      console.error('  The anon key is not accepted. Regenerate keys and re-copy ANON_KEY into app/.env.');
    }
    process.exit(1);
  }
  console.log(`✓ Reached Supabase at ${url} (HTTP ${res.status})`);
} catch (err) {
  console.error(`✗ Cannot reach Supabase at ${url}. Is the stack running (cd supabase && docker compose up -d)?`);
  console.error(`  Cause: ${err.message}`);
  process.exit(1);
}
