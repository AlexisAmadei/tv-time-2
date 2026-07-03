#!/usr/bin/env node
// Story 1.1 smoke check — the scripted "done" gate for the foundation.
//
// Chains the two checks the story defines:
//   1. All six Supabase services report healthy (docker compose ps).
//   2. The Kong gateway is reachable with the generated anon key (no silent 401).
//
// This is NOT a test framework — a real one lands via a future
// `testarch-framework` run. It is a fast, honest substrate check.
//
// Usage: node scripts/smoke-check.mjs   (or: pnpm run verify)

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseDir = join(repoRoot, 'supabase');
const EXPECTED = ['auth', 'db', 'functions', 'kong', 'rest', 'storage'];

let failures = 0;
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failures++;
};
const ok = (msg) => console.log(`✓ ${msg}`);

// 1. Container health ---------------------------------------------------------
let psJson = '';
try {
  psJson = execFileSync(
    'docker',
    ['compose', '--project-directory', supabaseDir, 'ps', '--format', 'json'],
    { encoding: 'utf8' },
  );
} catch (err) {
  fail(`Could not run "docker compose ps": ${err.message}`);
}

if (psJson.trim()) {
  // `docker compose ps --format json` emits one JSON object per line (NDJSON)
  // on Compose v2, but some versions emit a single JSON array — accept both.
  const services = parsePsJson(psJson.trim());
  for (const name of EXPECTED) {
    const svc = services.find((s) => s.Service === name);
    if (!svc) {
      fail(`Service "${name}" is not running (run: cd supabase && docker compose up -d).`);
    } else if (svc.Health && svc.Health !== 'healthy') {
      fail(`Service "${name}" is ${svc.State} / health=${svc.Health}.`);
    } else if (svc.State !== 'running') {
      fail(`Service "${name}" is ${svc.State}.`);
    } else {
      ok(`Service "${name}" is ${svc.State}${svc.Health ? ` (${svc.Health})` : ''}.`);
    }
  }
} else if (failures === 0) {
  fail('No Supabase services are running (run: cd supabase && docker compose up -d).');
}

// Parse `docker compose ps --format json`, tolerating both NDJSON (one object
// per line) and a single JSON array.
function parsePsJson(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not a single JSON value — fall through to line-by-line (NDJSON).
  }
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

// 2. Gateway reachability with the anon key -----------------------------------
function readEnvValue(file, key) {
  const raw = readFileSync(file, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith(`${key}=`));
  if (!line) return undefined;
  const value = line.slice(key.length + 1).replace(/\r$/, '').trim();
  const quoted = value.match(/^"(.*)"$/) || value.match(/^'(.*)'$/);
  return quoted ? quoted[1] : value;
}

try {
  const url = readEnvValue(join(supabaseDir, '.env'), 'API_EXTERNAL_URL') || 'http://localhost:8000';
  const anonKey = readEnvValue(join(supabaseDir, '.env'), 'ANON_KEY');
  if (!anonKey) {
    fail('ANON_KEY missing from supabase/.env (run: node supabase/scripts/generate-keys.mjs).');
  } else {
    const target = `${url}/auth/v1/health`;
    const res = await fetch(target, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      ok(`Gateway reachable with anon key at ${target} (HTTP ${res.status}).`);
    } else {
      fail(`Gateway returned HTTP ${res.status} for ${target} (anon key rejected?).`);
    }
  }
} catch (err) {
  fail(`Gateway probe failed: ${err.message}`);
}

// Result ----------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nSmoke check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log('\nSmoke check passed: all six services healthy and the gateway accepts the anon key.');
