#!/usr/bin/env node
// Scripted "done" gate for the foundation + auth (Stories 1.1, 1.2).
//
// Chains the checks the stories define:
//   1. All stack services report healthy (docker compose ps).
//   2. The Kong gateway is reachable with the generated anon key (no silent 401).
//   3. GoTrue exposes ONLY email auth — no OAuth provider enabled (AC3 / AD-12).
//   4. An anonymous request to a PostgREST table is denied (AC6 / deny-by-default).
//
// This is NOT a test framework — a real one lands via a future
// `testarch-framework` run. It is a fast, honest substrate check.
//
// Usage: node scripts/smoke-check.mjs   (or: pnpm run verify)

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const supabaseDir = join(repoRoot, 'supabase');
const composeFile = join(supabaseDir, 'docker-compose.yml');
const EXPECTED = ['auth', 'db', 'functions', 'kong', 'mail', 'rest', 'storage'];

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
    // Pass -f explicitly (like the package.json scripts do) so the compose file
    // is found regardless of the cwd `verify` is run from.
    ['compose', '-f', composeFile, '--project-directory', supabaseDir, 'ps', '--format', 'json'],
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
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      // docker/compose sometimes interleaves warning/progress lines with the
      // NDJSON; skip anything that isn't a JSON object rather than crashing.
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
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

const envFile = join(supabaseDir, '.env');
let baseUrl;
let anonKey;
if (!existsSync(envFile)) {
  // Distinguish "secrets never generated" from a real gateway failure so the
  // operator is pointed at the right fix instead of a misleading ENOENT.
  fail('supabase/.env not found — run: node supabase/scripts/generate-keys.mjs, then retry.');
} else {
  baseUrl = readEnvValue(envFile, 'API_EXTERNAL_URL') || 'http://localhost:8000';
  anonKey = readEnvValue(envFile, 'ANON_KEY');
  if (!anonKey) {
    fail('ANON_KEY missing from supabase/.env (run: node supabase/scripts/generate-keys.mjs).');
  } else {
    try {
      const target = `${baseUrl}/auth/v1/health`;
      const res = await fetch(target, { headers: { apikey: anonKey }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        ok(`Gateway reachable with anon key at ${target} (HTTP ${res.status}).`);
      } else {
        fail(`Gateway returned HTTP ${res.status} for ${target} (anon key rejected?).`);
      }
    } catch (err) {
      fail(`Gateway probe failed: ${err.message}`);
    }
  }
}

// 3. Auth is email-only — no OAuth provider enabled (AC3 / AD-12) --------------
if (anonKey) {
  try {
    const res = await fetch(`${baseUrl}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    const settings = await res.json();
    const external = settings.external || {};
    if (external.email !== true) {
      fail('GoTrue: email auth is not enabled (expected external.email === true).');
    } else if (external.phone === true) {
      fail('GoTrue: phone auth is enabled — must stay email-only (AD-12).');
    } else if (external.anonymous_users === true) {
      fail('GoTrue: anonymous sign-in is enabled — must stay email-only (AD-12).');
    } else {
      const oauthOn = Object.entries(external)
        .filter(([k, v]) => v === true && k !== 'email' && k !== 'phone' && k !== 'anonymous_users');
      if (oauthOn.length > 0) {
        fail(`GoTrue: OAuth provider(s) enabled — must be Google-free (${oauthOn.map(([k]) => k).join(', ')}).`);
      } else {
        ok('GoTrue exposes only email auth — no OAuth provider, phone, or anonymous sign-in enabled.');
      }
    }
  } catch (err) {
    fail(`Auth settings probe failed: ${err.message}`);
  }
}

// 4. Deny-by-default: an anonymous request to a table is refused (AC6) ---------
if (anonKey) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/profiles?select=id`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    let rows = null;
    try {
      const body = await res.json();
      if (Array.isArray(body)) rows = body.length;
    } catch {
      // non-JSON body is fine — a hard denial
    }
    const denied = res.status >= 400 || rows === 0;
    if (denied) {
      ok(`Anonymous read of /rest/v1/profiles denied (HTTP ${res.status}${rows === 0 ? ', 0 rows' : ''}).`);
    } else {
      fail(`Anonymous read of /rest/v1/profiles was NOT denied (HTTP ${res.status}, ${rows} rows) — RLS/grant regression.`);
    }
  } catch (err) {
    fail(`Anonymous deny-by-default probe failed: ${err.message}`);
  }
}

// 5. Catalog proxy rejects unsigned callers (Story 1.4 / AC4) -----------------
// The catalog-search Edge Function owns auth itself (Kong does not enforce the
// apikey for /functions/v1/*). An unauthenticated POST must be refused with 401
// and the shared {message, code, details} envelope — proving the TMDB proxy
// never serves an unsigned request.
if (anonKey) {
  try {
    const res = await fetch(`${baseUrl}/functions/v1/catalog-search`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'smoke' }),
      signal: AbortSignal.timeout(5000),
    });
    let envelopeOk = false;
    try {
      const body = await res.json();
      envelopeOk =
        body && typeof body.message === 'string' && typeof body.code === 'string' && 'details' in body;
    } catch {
      // non-JSON body — envelope check fails below
    }
    if (res.status === 401 && envelopeOk) {
      ok('Unauthenticated catalog-search denied (HTTP 401, {message,code,details} envelope).');
    } else if (res.status === 401) {
      fail(`catalog-search returned 401 but not the {message,code,details} envelope.`);
    } else {
      fail(`Unauthenticated catalog-search was NOT denied (HTTP ${res.status}) — proxy auth regression.`);
    }
  } catch (err) {
    fail(`catalog-search auth probe failed: ${err.message}`);
  }
}

// 6. catalog_cache is deny-by-default (Story 1.4 / AD-1) ----------------------
// The disposable catalog cache is reachable only through the Edge Function's
// service-role key. An anonymous PostgREST read must be denied (RLS on, no
// anon/authenticated grant), same guarantee as profiles.
if (anonKey) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/catalog_cache?select=tmdb_id`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    let rows = null;
    try {
      const body = await res.json();
      if (Array.isArray(body)) rows = body.length;
    } catch {
      // non-JSON body is fine — a hard denial
    }
    // Assert on status ALONE. Deny-by-default (RLS on, no anon grant) makes
    // PostgREST return a 4xx permission error — never a 200. A 200 (even an
    // empty `[]`) means a grant leaked, so an empty table must not false-pass.
    const denied = res.status >= 400;
    if (denied) {
      ok(`Anonymous read of /rest/v1/catalog_cache denied (HTTP ${res.status}).`);
    } else {
      fail(`Anonymous read of /rest/v1/catalog_cache was NOT denied (HTTP ${res.status}, ${rows} rows) — RLS/grant regression.`);
    }
  } catch (err) {
    fail(`catalog_cache deny-by-default probe failed: ${err.message}`);
  }
}

// Result ----------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nSmoke check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  '\nSmoke check passed: stack healthy, gateway accepts the anon key, auth is email-only, ' +
    'anonymous table reads are denied, the catalog proxy rejects unsigned callers, and catalog_cache is deny-by-default.',
);
