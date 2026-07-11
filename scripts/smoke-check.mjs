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

// 7. watches is deny-by-default for anon, but authenticated CRUD works (Story
// 1.5 / AD-1) ------------------------------------------------------------
// Unlike catalog_cache, `watches` IS reachable by authenticated (owner-scoped
// via RLS) — so this asserts anon denial specifically, the same shape as the
// catalog_cache guardrail above.
if (anonKey) {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/watches?select=id`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    const denied = res.status >= 400;
    if (denied) {
      ok(`Anonymous read of /rest/v1/watches denied (HTTP ${res.status}).`);
    } else {
      fail(`Anonymous read of /rest/v1/watches was NOT denied (HTTP ${res.status}) — RLS/grant regression.`);
    }
  } catch (err) {
    fail(`watches deny-by-default probe failed: ${err.message}`);
  }
}

// 8. Deny-by-default audit — generalized, covers every public-schema table,
// present and future (Story 1.6 / AC3, AC6) -----------------------------------
// Unlike checks 4/6/7 above (each hardcoded to one table), this queries the
// catalog directly so a future migration that adds a table with RLS off, or
// that forgets the anon/authenticated revoke-then-grant boilerplate, fails
// here automatically — no edit to this script required.
function runPsql(sql) {
  return execFileSync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      '--project-directory',
      supabaseDir,
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-t',
      '-A',
      '-c',
      sql,
    ],
    { encoding: 'utf8' },
  );
}

// Sanity check that the audit queries actually ran against a real catalog
// (not a silently empty/malformed psql response) before trusting a zero-row
// result as "no violations" — `watches` is guaranteed to exist by this point
// in the migration chain (0003_watches.sql), so its absence here means the
// audit itself didn't run meaningfully, not that everything passed.
function assertAuditRan(sanityOut, auditName) {
  const tables = sanityOut
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!tables.includes('watches')) {
    throw new Error(
      `${auditName}: sanity check failed — expected "watches" among public tables but got ${JSON.stringify(tables)}; treating this as an audit failure, not a pass.`,
    );
  }
}

try {
  const noRlsOut = runPsql(
    "select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;",
  );
  const allTablesOut = runPsql("select tablename from pg_tables where schemaname = 'public';");
  assertAuditRan(allTablesOut, 'RLS-enabled-everywhere audit');
  const noRlsTables = noRlsOut
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (noRlsTables.length === 0) {
    ok('Every public-schema table has row level security enabled.');
  } else {
    for (const t of noRlsTables) fail(`Table "${t}" does not have row level security enabled.`);
  }
} catch (err) {
  fail(`RLS-enabled-everywhere audit failed: ${err.message}`);
}

try {
  const anonGrantsOut = runPsql(
    "select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public';",
  );
  const allTablesOut = runPsql("select tablename from pg_tables where schemaname = 'public';");
  assertAuditRan(allTablesOut, 'anon-has-nothing audit');
  const anonGrantTables = anonGrantsOut
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (anonGrantTables.length === 0) {
    ok('The anon role has no grants on any public-schema table.');
  } else {
    for (const t of anonGrantTables) fail(`Table "${t}" grants privileges to anon — deny-by-default regression.`);
  }
} catch (err) {
  fail(`anon-has-nothing audit failed: ${err.message}`);
}

// 9. Cross-user RLS wall proof — a populated row is invisible to a second,
// real authenticated user (Story 1.6 / AC2, AC4, AC7) -------------------------
// Checks 4/6/7 prove *denial* for anon (no grant at all, or an empty table).
// This proves *filtering*: user B has a real SELECT grant and is a valid
// authenticated user, so PostgREST returns 200 — RLS is what silently empties
// the result. A non-empty array here is the actual privacy bug this story
// exists to prevent.
if (anonKey) {
  const SMOKE_A = { email: 'smoke-test-a@tv-time-2.invalid', username: 'smoketestusera' };
  const SMOKE_B = { email: 'smoke-test-b@tv-time-2.invalid', username: 'smoketestuserb' };
  const SMOKE_PASSWORD = 'Sm0ke-Test-Password!';
  // Fixed literal UUID (not freshly generated per run) so reruns upsert the
  // same row instead of erroring on a PK conflict or accumulating rows.
  const SMOKE_WATCH_ID = '00000000-0000-0000-0000-00000000c0de';

  async function getOrCreateSession({ email, username }) {
    const signInRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
      signal: AbortSignal.timeout(5000),
    });
    if (signInRes.ok) {
      const session = await signInRes.json();
      if (!session?.access_token || !session?.user?.id) {
        throw new Error(
          `sign-in for ${email} returned HTTP ${signInRes.status} but no usable session (missing access_token/user.id).`,
        );
      }
      return session;
    }

    // Local dev has ENABLE_EMAIL_AUTOCONFIRM=true, so signup returns a usable
    // session directly — no email/OTP round-trip needed.
    const signUpRes = await fetch(`${baseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: SMOKE_PASSWORD,
        data: { username, display_name: username },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!signUpRes.ok) {
      throw new Error(`sign-in and sign-up both failed for ${email} (signup HTTP ${signUpRes.status})`);
    }
    const session = await signUpRes.json();
    if (!session?.access_token || !session?.user?.id) {
      throw new Error(
        `sign-up for ${email} returned HTTP ${signUpRes.status} but no usable session (missing access_token/user.id) — check ENABLE_EMAIL_AUTOCONFIRM.`,
      );
    }
    return session;
  }

  try {
    const sessionA = await getOrCreateSession(SMOKE_A);
    const sessionB = await getOrCreateSession(SMOKE_B);

    // As user A: upsert a fixed-id watch row (Prefer: resolution=merge-duplicates
    // = upsert-by-PK, the exact idempotency mechanism Story 1.5 uses).
    const insertRes = await fetch(`${baseUrl}/rest/v1/watches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionA.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: SMOKE_WATCH_ID,
        // RLS insert policy is `user_id = auth.uid()` — the client must supply
        // it explicitly, same as app/data/watchSync.ts does; there is no
        // default or trigger that fills it in.
        user_id: sessionA.user.id,
        tmdb_id: 0,
        media_type: 'movie',
        watched_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!insertRes.ok) {
      const body = await insertRes.text().catch(() => '<unreadable body>');
      fail(
        `Cross-user RLS check: user A could not upsert the smoke-test watch row (HTTP ${insertRes.status}): ${body}`,
      );
    } else {
      // As user B: query that exact row by id. Do NOT delete it afterwards —
      // leaving it in place (sign-in-or-signup + upsert-by-fixed-id) is what
      // keeps this check idempotent across reruns.
      const readRes = await fetch(`${baseUrl}/rest/v1/watches?select=id&id=eq.${SMOKE_WATCH_ID}`, {
        headers: { Authorization: `Bearer ${sessionB.access_token}`, apikey: anonKey },
        signal: AbortSignal.timeout(5000),
      });
      const rows = readRes.ok ? await readRes.json() : null;
      if (readRes.status === 200 && Array.isArray(rows) && rows.length === 0) {
        ok('Cross-user RLS wall holds: user B cannot read user A\'s populated watch row (HTTP 200, 0 rows).');
      } else {
        fail(
          `Cross-user RLS wall FAILED: user B read user A's watch row (HTTP ${readRes.status}, ${
            Array.isArray(rows) ? rows.length : 'non-array'
          } rows) — private-by-default regression.`,
        );
      }
    }
  } catch (err) {
    fail(`Cross-user RLS check failed: ${err.message}`);
  }
}

// 10. Story 3.5's outbox invariants — the reaction hazards AC2/AC3/AC5 depend
// on, pinned server-side (Story 3.5 / AC3 "named regression test, must be
// automated"). No test framework exists (restated every story since 1.3), so
// these live here alongside 1.6's cross-user RLS check, in the same
// ok()/fail() + fixed-smoke-account style. They pin the SERVER-SIDE invariants;
// they cannot execute setWatchReaction's expo-sqlite branch (no node harness in
// this repo can) — that gap is Open Question 1 in the story. Extended by
// Story 3.6 (10d/10e) to cover the note field on the same REACTION_WATCH_ID
// fixture, since it widens this exact upsert/PATCH contract.
if (anonKey) {
  const SMOKE_C = { email: 'smoke-test-c@tv-time-2.invalid', username: 'smoketestuserc' };
  const SMOKE_PASSWORD = 'Sm0ke-Test-Password!';
  // Fixed literal UUIDs (not per-run) so reruns upsert the same rows in place
  // rather than accumulating or PK-conflicting.
  const REACTION_WATCH_ID = '00000000-0000-0000-0000-00000000cafe';
  const MISSING_WATCH_ID = '00000000-0000-0000-0000-0000deadbeef';

  async function getSession({ email, username }) {
    const signInRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
      signal: AbortSignal.timeout(5000),
    });
    if (signInRes.ok) return signInRes.json();
    const signUpRes = await fetch(`${baseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SMOKE_PASSWORD, data: { username, display_name: username } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!signUpRes.ok) throw new Error(`sign-in and sign-up both failed for ${email}`);
    return signUpRes.json();
  }

  try {
    const session = await getSession(SMOKE_C);
    const authHeaders = {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    };

    // 10a. A bare PATCH against a not-yet-existing watches row is a silent
    // no-op — never an error, never an insert. This is the REASON AC2 branches
    // on synced_at instead of blind-PATCHing: an unguarded reaction write
    // against a still-pending row would be lost with no error surface. Assert
    // the silent no-op explicitly so a future PostgREST that starts erroring
    // (or upserting) here trips this check. `Prefer: return=representation`
    // makes PostgREST return the affected rows.
    const patchRes = await fetch(`${baseUrl}/rest/v1/watches?id=eq.${MISSING_WATCH_ID}`, {
      method: 'PATCH',
      headers: { ...authHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({ rating: 8 }),
      signal: AbortSignal.timeout(5000),
    });
    const patched = patchRes.ok ? await patchRes.json() : null;
    if (patchRes.ok && Array.isArray(patched) && patched.length === 0) {
      ok('Story 3.5 AC3: a bare PATCH at a not-yet-existing watches row is a silent no-op (0 rows) — the hazard AC2 guards.');
    } else {
      fail(
        `Story 3.5 AC3: bare PATCH at a missing watches row was NOT a silent no-op (HTTP ${patchRes.status}, ${
          Array.isArray(patched) ? `${patched.length} rows` : 'non-array/error'
        }) — the assumption behind AC2's synced_at branch broke.`,
      );
    }

    // 10b. One upsert carrying rating + mood together lands exactly one row
    // with both set (AC3's success path — the shape the outbox emits for a
    // pending row), and a re-upsert of the same id updates in place, staying
    // one row (AC5 "that watch's row updates" + 1.5's onConflict idempotency).
    async function upsertReaction(rating, mood, note) {
      const res = await fetch(`${baseUrl}/rest/v1/watches`, {
        method: 'POST',
        headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: REACTION_WATCH_ID,
          user_id: session.user.id,
          tmdb_id: 0,
          media_type: 'movie',
          watched_at: new Date().toISOString(),
          rating,
          mood,
          ...(note !== undefined ? { note } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`upsert failed (HTTP ${res.status}): ${await res.text().catch(() => '')}`);
      return res.json();
    }

    const firstRows = await upsertReaction(9, ['😭', '🔥']);
    const first = Array.isArray(firstRows) ? firstRows[0] : null;
    const moodRoundTrips =
      first && Array.isArray(first.mood) && first.mood.length === 2 &&
      first.mood.includes('😭') && first.mood.includes('🔥');
    if (first && first.rating === 9 && moodRoundTrips) {
      ok('Story 3.5 AC3/AC4: one upsert lands a single watches row with rating + two-element mood[] set (both round-trip).');
    } else {
      fail(
        `Story 3.5 AC3/AC4: upsert did not round-trip rating + mood[] (rating=${first?.rating}, mood=${JSON.stringify(first?.mood)}).`,
      );
    }

    // Re-upsert the same id with a changed rating — must stay ONE row, updated.
    const secondRows = await upsertReaction(4, ['🥰']);
    const second = Array.isArray(secondRows) ? secondRows[0] : null;
    const countRes = await fetch(`${baseUrl}/rest/v1/watches?select=id&id=eq.${REACTION_WATCH_ID}`, {
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: anonKey },
      signal: AbortSignal.timeout(5000),
    });
    const countRows = countRes.ok ? await countRes.json() : null;
    if (second && second.rating === 4 && Array.isArray(countRows) && countRows.length === 1) {
      ok('Story 3.5 AC5: re-upserting the same id updates that row in place (rating changed, still exactly one row).');
    } else {
      fail(
        `Story 3.5 AC5: re-upsert did not update in place (rating=${second?.rating}, row count=${
          Array.isArray(countRows) ? countRows.length : 'n/a'
        }).`,
      );
    }

    // 10c. AC4 "validated in the DB, not only client-side": 0008's CHECK
    // rejects a non-locked mood value, and accepts a TWO-element locked array
    // (the direct proof 3.5's 0–2 selection needs no new migration).
    const badRes = await fetch(`${baseUrl}/rest/v1/watches`, {
      method: 'POST',
      headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: REACTION_WATCH_ID,
        user_id: session.user.id,
        tmdb_id: 0,
        media_type: 'movie',
        watched_at: new Date().toISOString(),
        mood: ['😭', '🚫'], // 🚫 is not in the locked FR18 set
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (badRes.status >= 400) {
      ok(`Story 3.5 AC4: the 0008 mood CHECK rejects a non-locked value server-side (HTTP ${badRes.status}).`);
    } else {
      fail(`Story 3.5 AC4: a non-locked mood value was accepted (HTTP ${badRes.status}) — 0008 CHECK regression.`);
    }

    const twoRes = await fetch(`${baseUrl}/rest/v1/watches`, {
      method: 'POST',
      headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: REACTION_WATCH_ID,
        user_id: session.user.id,
        tmdb_id: 0,
        media_type: 'movie',
        watched_at: new Date().toISOString(),
        mood: ['😱', '😂'],
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (twoRes.ok) {
      ok('Story 3.5 AC4: a two-element locked mood array is accepted — the 0–2 selection needs no new migration.');
    } else {
      fail(`Story 3.5 AC4: a valid two-element locked mood array was rejected (HTTP ${twoRes.status}).`);
    }

    // 10d. Story 3.6 AC1/AC3: a note round-trips through the same upsert path,
    // alongside rating/mood, on the SAME REACTION_WATCH_ID row already
    // exercised above — proving "stored on that watches row" without a second
    // fixture.
    const NOTE_TEXT = 'Cried during the finale.';
    const notedRows = await upsertReaction(7, ['😭'], NOTE_TEXT);
    const noted = Array.isArray(notedRows) ? notedRows[0] : null;
    if (noted && noted.note === NOTE_TEXT) {
      ok('Story 3.6 AC1/AC3: a note round-trips through the upsert, alongside rating/mood, on the same watches row.');
    } else {
      fail(`Story 3.6 AC1/AC3: note did not round-trip (got ${JSON.stringify(noted?.note)}).`);
    }

    // 10e. Story 3.6 AC2: no server-side length CHECK exists — the client
    // ~500-char cap is the only enforcement. A 600-char note must be accepted
    // (HTTP < 400); this is the direct proof that a future migration adding a
    // CHECK here would be an unauthorized, silently-breaking change.
    const longNote = 'x'.repeat(600);
    const longRows = await upsertReaction(7, ['😭'], longNote);
    const longRow = Array.isArray(longRows) ? longRows[0] : null;
    if (longRow && longRow.note === longNote) {
      ok('Story 3.6 AC2: a 600-char note is accepted server-side — the 500-char cap is a client-only UI rule, not a DB CHECK.');
    } else {
      fail('Story 3.6 AC2: a 600-char note was rejected or truncated — a DB-level length CHECK may have been added without a story authorizing it.');
    }
  } catch (err) {
    fail(`Story 3.5/3.6 reaction-invariant checks failed: ${err.message}`);
  }
}

// 11. Story 3.7's edit/remove hazards — cross-user RLS on PATCH/DELETE (not
// just SELECT, which check 9 already proves), and the pointer RPC's backward-
// derive path after a delete (Story 3.7 / AC1, AC2). No prior story's checks
// exercise either: 9 only proves read-filtering, and every prior pointer-RPC
// call (3.1/3.2/3.4) only ever advances forward from nothing or from a watch —
// this is the first DELETE + backward recompute exercised here. -------------
if (anonKey) {
  const SMOKE_A = { email: 'smoke-test-a@tv-time-2.invalid', username: 'smoketestusera' };
  const SMOKE_B = { email: 'smoke-test-b@tv-time-2.invalid', username: 'smoketestuserb' };
  const SMOKE_D = { email: 'smoke-test-d@tv-time-2.invalid', username: 'smoketestuserd' };
  const SMOKE_PASSWORD = 'Sm0ke-Test-Password!';
  // Fixed literal UUIDs (not per-run) so reruns upsert/re-create the same rows
  // rather than accumulating or PK-conflicting.
  const EDIT_WATCH_ID = '00000000-0000-0000-0000-00000000ed17';
  const POINTER_WATCH_EP1 = '00000000-0000-0000-0000-0000000090e1';
  const POINTER_WATCH_EP2 = '00000000-0000-0000-0000-0000000090e2';
  // Synthetic tmdb_id, clearly out of TMDB's real id space, so this fixture
  // never collides with anything a real catalog-search/catalog-title call
  // could have cached for this local stack.
  const POINTER_TMDB_ID = 8880001;
  const POINTER_EP1_ID = 900001;
  const POINTER_EP2_ID = 900002;

  async function getSession({ email, username }) {
    const signInRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SMOKE_PASSWORD }),
      signal: AbortSignal.timeout(5000),
    });
    if (signInRes.ok) return signInRes.json();
    const signUpRes = await fetch(`${baseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: SMOKE_PASSWORD, data: { username, display_name: username } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!signUpRes.ok) throw new Error(`sign-in and sign-up both failed for ${email}`);
    return signUpRes.json();
  }

  // 11a. RLS actually blocks a cross-user PATCH/DELETE, not just SELECT (check
  // 9 already proves read-filtering) — proving Story 3.7 AC1/AC2's "guarded by
  // owner-only RLS" isn't just a client-side assumption for edit/remove.
  try {
    const sessionA = await getSession(SMOKE_A);
    const sessionB = await getSession(SMOKE_B);

    const upsertRes = await fetch(`${baseUrl}/rest/v1/watches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionA.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        id: EDIT_WATCH_ID,
        user_id: sessionA.user.id,
        tmdb_id: 0,
        media_type: 'movie',
        watched_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!upsertRes.ok) {
      fail(`Story 3.7 AC1/AC2: could not seed user A's watch row for the cross-user edit/delete check (HTTP ${upsertRes.status}).`);
    } else {
      const patchRes = await fetch(`${baseUrl}/rest/v1/watches?id=eq.${EDIT_WATCH_ID}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${sessionB.access_token}`,
          apikey: anonKey,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ rating: 3 }),
        signal: AbortSignal.timeout(5000),
      });
      const patched = patchRes.ok ? await patchRes.json() : null;
      if (patchRes.ok && Array.isArray(patched) && patched.length === 0) {
        ok("Story 3.7 AC1: cross-user PATCH is RLS-filtered to 0 rows — user B cannot edit user A's watch.");
      } else {
        fail(
          `Story 3.7 AC1: cross-user PATCH was NOT blocked (HTTP ${patchRes.status}, ${
            Array.isArray(patched) ? `${patched.length} rows` : 'non-array/error'
          }) — owner-only RLS regression on watches_update_own.`,
        );
      }

      const deleteRes = await fetch(`${baseUrl}/rest/v1/watches?id=eq.${EDIT_WATCH_ID}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionB.access_token}`,
          apikey: anonKey,
          Prefer: 'return=representation',
        },
        signal: AbortSignal.timeout(5000),
      });
      const deleted = deleteRes.ok ? await deleteRes.json() : null;
      if (deleteRes.ok && Array.isArray(deleted) && deleted.length === 0) {
        ok("Story 3.7 AC2: cross-user DELETE is RLS-filtered to 0 rows — user B cannot remove user A's watch.");
      } else {
        fail(
          `Story 3.7 AC2: cross-user DELETE was NOT blocked (HTTP ${deleteRes.status}, ${
            Array.isArray(deleted) ? `${deleted.length} rows` : 'non-array/error'
          }) — owner-only RLS regression on watches_delete_own.`,
        );
      }
    }
  } catch (err) {
    fail(`Story 3.7 cross-user edit/delete RLS check failed: ${err.message}`);
  }

  // 11b. The pointer RPC correctly moves a pointer BACKWARD after a delete —
  // no prior story's checks exercise this direction (3.1 is forward/init-only,
  // 3.4 is forward-bulk-only). Direct proof of AC2's "derive-from-full-watch-
  // set... can move the pointer backward correctly."
  try {
    const sessionD = await getSession(SMOKE_D);
    const userId = sessionD.user.id;
    const authHeaders = {
      Authorization: `Bearer ${sessionD.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    };

    // Seed catalog_cache directly (psql) — the RPC's only source of episode
    // ordering, and a table with zero grants for authenticated (0002), so
    // this cannot be written via PostgREST. Upserted so reruns don't conflict
    // on the (tmdb_id, media_type) primary key.
    const payload = JSON.stringify({
      tmdbId: POINTER_TMDB_ID,
      mediaType: 'tv',
      title: 'Smoke Test Show',
      year: '2020',
      posterPath: null,
      synopsis: null,
      seasons: [
        {
          seasonNumber: 1,
          name: 'Season 1',
          episodes: [
            { episodeNumber: 1, name: 'Episode 1', airDate: null, tmdbEpisodeId: POINTER_EP1_ID },
            { episodeNumber: 2, name: 'Episode 2', airDate: null, tmdbEpisodeId: POINTER_EP2_ID },
          ],
        },
      ],
    }).replace(/'/g, "''");
    runPsql(
      `insert into public.catalog_cache (tmdb_id, media_type, payload, fetched_at) ` +
        `values (${POINTER_TMDB_ID}, 'tv', '${payload}'::jsonb, now()) ` +
        `on conflict (tmdb_id, media_type) do update set payload = excluded.payload, fetched_at = excluded.fetched_at;`,
    );

    // Track the synthetic show — `ignore-duplicates` (ON CONFLICT DO NOTHING),
    // not `merge-duplicates` (which needs an UPDATE grant this table
    // deliberately has none of, per 0006's grants note); the exact Prefer
    // header trackShow()'s own `ignoreDuplicates: true` upsert sends.
    const trackRes = await fetch(
      `${baseUrl}/rest/v1/tracked_shows?on_conflict=user_id,tmdb_id,media_type`,
      {
        method: 'POST',
        headers: { ...authHeaders, Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify({ user_id: userId, tmdb_id: POINTER_TMDB_ID, media_type: 'tv' }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!trackRes.ok) throw new Error(`could not track the synthetic show (HTTP ${trackRes.status})`);

    async function upsertPointerWatch(id, tmdbEpisodeId) {
      const res = await fetch(`${baseUrl}/rest/v1/watches`, {
        method: 'POST',
        headers: { ...authHeaders, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          id,
          user_id: userId,
          tmdb_id: POINTER_TMDB_ID,
          media_type: 'tv',
          tmdb_episode_id: tmdbEpisodeId,
          watched_at: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`could not upsert watch ${id} (HTTP ${res.status})`);
    }

    async function callRecompute() {
      const res = await fetch(`${baseUrl}/rest/v1/rpc/recompute_next_episode_pointer`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          p_user_id: userId,
          p_tmdb_id: POINTER_TMDB_ID,
          p_media_type: 'tv',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`recompute_next_episode_pointer failed (HTTP ${res.status})`);
      return res.json();
    }

    // Log episode 1 only, then recompute — pointer should land on episode 2
    // (the first unwatched episode), establishing a forward pointer.
    await upsertPointerWatch(POINTER_WATCH_EP1, POINTER_EP1_ID);
    const forwardPointer = await callRecompute();
    if (forwardPointer !== POINTER_EP2_ID) {
      fail(
        `Story 3.7 AC2 setup: expected the forward pointer to land on episode 2 (${POINTER_EP2_ID}) after logging episode 1, got ${JSON.stringify(forwardPointer)}.`,
      );
    }

    // Log episode 2 too, then recompute — fully caught up, pointer null.
    await upsertPointerWatch(POINTER_WATCH_EP2, POINTER_EP2_ID);
    const caughtUpPointer = await callRecompute();
    if (caughtUpPointer !== null) {
      fail(
        `Story 3.7 AC2 setup: expected a null (fully caught up) pointer after logging both episodes, got ${JSON.stringify(caughtUpPointer)}.`,
      );
    }

    // Remove (un-log) episode 2's watch directly, then recompute — the
    // pointer must move BACKWARD to episode 2 again, derived from the now-
    // smaller watch set, not left at wherever it was before the delete.
    const deleteRes = await fetch(`${baseUrl}/rest/v1/watches?id=eq.${POINTER_WATCH_EP2}`, {
      method: 'DELETE',
      headers: authHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (!deleteRes.ok) throw new Error(`could not delete episode 2's watch (HTTP ${deleteRes.status})`);
    const backwardPointer = await callRecompute();
    if (backwardPointer === POINTER_EP2_ID) {
      ok('Story 3.7 AC2: removing a watch moves the pointer BACKWARD to the now-unwatched episode, derived from the full remaining watch set.');
    } else {
      fail(
        `Story 3.7 AC2: pointer did NOT move backward after removing episode 2's watch (expected ${POINTER_EP2_ID}, got ${JSON.stringify(backwardPointer)}) — the RPC's derive-not-increment contract broke for the delete direction.`,
      );
    }
  } catch (err) {
    fail(`Story 3.7 backward-pointer check failed: ${err.message}`);
  }
}

// Result ----------------------------------------------------------------------
if (failures > 0) {
  console.error(`\nSmoke check FAILED with ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  '\nSmoke check passed: stack healthy, gateway accepts the anon key, auth is email-only, ' +
    'anonymous table reads are denied, the catalog proxy rejects unsigned callers, catalog_cache is ' +
    'deny-by-default, watches is deny-by-default for anon, every public-schema table has RLS enabled ' +
    'with no anon grants, and the cross-user RLS wall holds for a real populated row.',
);
