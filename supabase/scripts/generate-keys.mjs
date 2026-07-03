#!/usr/bin/env node
// Generate a fresh, internally consistent secret set for the self-hosted
// Supabase stack and write it into supabase/.env.
//
// The critical guarantee: ANON_KEY and SERVICE_ROLE_KEY are HS256 JWTs signed
// with the SAME freshly generated JWT_SECRET. Kong/GoTrue/PostgREST reject
// every request unless these three agree, so they must always be minted
// together — never copied from another project.
//
// Usage:
//   node scripts/generate-keys.mjs          # writes supabase/.env (refuses to clobber)
//   node scripts/generate-keys.mjs --force  # overwrite an existing supabase/.env
//
// No dependencies — uses Node's built-in crypto only.

import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..');
const examplePath = join(supabaseDir, '.env.example');
const envPath = join(supabaseDir, '.env');

const force = process.argv.includes('--force');

if (existsSync(envPath) && !force) {
  console.error(
    `Refusing to overwrite existing ${envPath}\n` +
      `Re-run with --force to regenerate all secrets (this invalidates the current stack's data-at-rest keys).`
  );
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

// Sign a { role, iss, iat, exp } payload as an HS256 JWT with `secret`.
function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = b64url(createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

const jwtSecret = randomBytes(48).toString('base64url'); // ~64 chars, well over 32
const postgresPassword = randomBytes(24).toString('base64url');
const dashboardPassword = randomBytes(18).toString('base64url');
const s3KeyId = randomBytes(16).toString('hex');
const s3KeySecret = randomBytes(32).toString('hex');

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10; // 10 years — local dev keys

const anonKey = signJwt({ role: 'anon', iss: 'supabase', iat, exp }, jwtSecret);
const serviceRoleKey = signJwt({ role: 'service_role', iss: 'supabase', iat, exp }, jwtSecret);

const replacements = {
  POSTGRES_PASSWORD: postgresPassword,
  JWT_SECRET: jwtSecret,
  ANON_KEY: anonKey,
  SERVICE_ROLE_KEY: serviceRoleKey,
  DASHBOARD_PASSWORD: dashboardPassword,
  S3_PROTOCOL_ACCESS_KEY_ID: s3KeyId,
  S3_PROTOCOL_ACCESS_KEY_SECRET: s3KeySecret,
};

// Start from the tracked template so the full var list stays in one place,
// then substitute only the secret values.
const template = readFileSync(examplePath, 'utf8');
const out = template
  .split('\n')
  .map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && Object.prototype.hasOwnProperty.call(replacements, m[1])) {
      return `${m[1]}=${replacements[m[1]]}`;
    }
    return line;
  })
  .join('\n');

// Fail loudly if the template lost a secret's line: an omitted key would write a
// .env missing that secret while reporting success — reproducing the silent-401
// trap this script exists to prevent.
const missing = Object.keys(replacements).filter(
  (key) => !new RegExp(`^${key}=.+`, 'm').test(out),
);
if (missing.length > 0) {
  console.error(
    `${examplePath} has no line for: ${missing.join(', ')}.\n` +
      `Every generated secret needs a "KEY=" line in the template — add them and re-run.`,
  );
  process.exit(1);
}

writeFileSync(envPath, out, { mode: 0o600 });
// mode: only applies when the file is created, so on --force (existing file) the
// old permissions would persist — chmod explicitly to guarantee 0600 either way.
chmodSync(envPath, 0o600);

console.log(`Wrote ${envPath} with a fresh secret set.`);
console.log('  JWT_SECRET, POSTGRES_PASSWORD, DASHBOARD_PASSWORD, S3 keys: random');
console.log('  ANON_KEY, SERVICE_ROLE_KEY: HS256 JWTs signed with JWT_SECRET');
console.log('\nNext: `docker compose up -d` from the supabase/ directory.');
