# Self-hosted Supabase stack (local dev)

The local backend for Popcorn Time: a pinned, self-hosted Supabase stack trimmed to
the six services v1 needs.

| Service     | Image                          | Role                          |
| ----------- | ------------------------------ | ----------------------------- |
| `db`        | `supabase/postgres:17.6.1.136` | Postgres 17                   |
| `auth`      | `supabase/gotrue:v2.189.0`     | GoTrue (email/password + magic link) |
| `rest`      | `postgrest/postgrest:v14.12`   | PostgREST auto REST API       |
| `storage`   | `supabase/storage-api:v1.60.4` | File storage                  |
| `functions` | `supabase/edge-runtime:v1.74.0`| Deno Edge Functions runtime   |
| `kong`      | `kong/kong:3.9.1`              | API gateway (single entrypoint at :8000) |
| `mail`      | `inbucket/inbucket:3.0.3`      | Local mail catcher (dev only) — web UI at :9000 |

**AD-13:** every image is pinned to an exact dated tag — never `latest`. When
bumping, re-verify against the upstream compose
(`github.com/supabase/supabase/blob/master/docker/docker-compose.yml`) and record
the new pin in `docker-compose.yml`.

Studio, Realtime, imgproxy, postgres-meta, Supavisor and Vector/Analytics from
the official compose are intentionally omitted — v1's local-first architecture
doesn't use them, and they make a clean bring-up fragile. Postgres is exposed
directly on `:5432` (upstream exposes it via Supavisor, which we drop). `mail`
(Inbucket) is a **local-dev-only** convenience for reading auth emails — it never
runs in production (real SMTP is a launch concern).

## Prerequisites

- Docker Engine 20.10+ and Docker Compose v2+
- Node 20+ (only to run the key-generation script — no deps)

## First run

From this `supabase/` directory:

```bash
# 1. Generate a fresh, internally consistent secret set into supabase/.env
node scripts/generate-keys.mjs

# 2. Bring up the stack (pulls pinned images on first run)
docker compose up -d

# 3. Confirm all six services are healthy
docker compose ps
```

Then point the app at the stack by copying `ANON_KEY` from `supabase/.env` into
`app/.env` (`EXPO_PUBLIC_SUPABASE_ANON_KEY`). See `../app` and the repo-root
`README.md`.

## Secrets — why they must be generated together

`supabase/.env` is **gitignored**; only `supabase/.env.example` (a template with
placeholders) is tracked.

The three secrets are cryptographically linked:

- `JWT_SECRET` — the symmetric HS256 signing secret.
- `ANON_KEY` and `SERVICE_ROLE_KEY` — HS256 JWTs **signed with that
  `JWT_SECRET`**, carrying `{ role, iss, iat, exp }`.

`scripts/generate-keys.mjs` mints all three together. If you instead invent
random strings, or copy keys from another project, Kong/GoTrue/PostgREST reject
every request with 401 — even though `docker compose ps` shows every container
`Up`. That is the single most common self-host failure; generating the trio
together avoids it.

Regenerate with `node scripts/generate-keys.mjs --force` (this invalidates the
current stack's data-at-rest keys — expect to reset the `volumes/db/data`
directory).

## Verifying connectivity

```bash
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
# Should print 200 (the same endpoint the health-check scripts probe):
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" http://localhost:8000/auth/v1/health
```

Or from the repo root, run the full smoke check: `pnpm run verify`.

## Database migrations

Schema lives in `migrations/*.sql`, applied in **filename sort order**. The
naming scheme is a zero-padded ordinal prefix: `0001_profiles.sql`,
`0002_....sql`, … (pick the next number; keep it sortable).

```bash
# From the repo root, against the running stack:
pnpm run supabase:migrate
```

The base Postgres image only runs `volumes/db/*.sql` init scripts on a **fresh**
data volume, so those cannot carry app schema on an existing DB. `supabase:migrate`
(`scripts/apply-migrations.mjs`) instead pipes each file through
`docker compose exec db psql` with `ON_ERROR_STOP=1`.

There is **no migration-tracking table yet** — migrations are written
idempotent / re-runnable (`create ... if not exists`, drop-then-create for
policies/triggers, `create or replace` for functions), so re-applying the folder
is safe. A real tracked runner is deferred to a later story.

## TMDB catalog key (Story 1.4)

The catalog is proxied: the `catalog-search` Edge Function is the **sole** caller
of TMDB and holds the key server-side, so the F-Droid client never ships it
(AD-6). Get a key at <https://www.themoviedb.org/settings/api> and put it **only**
in the gitignored `supabase/.env`:

```bash
# Prefer the v4 "API Read Access Token" (a long JWT); the v3 api_key is a fallback.
TMDB_ACCESS_TOKEN=eyJ...          # v4 bearer
TMDB_API_KEY=...                  # v3 key (fallback)
```

`docker-compose.yml` injects these into the `functions` container. After editing
`supabase/.env`, recreate the container so it picks them up:

```bash
docker compose -f docker-compose.yml --project-directory . up -d functions
```

> ⚠️ Never put a TMDB key in `app/.env*` or any `EXPO_PUBLIC_*` var — that would
> defeat the proxy. The client reaches the catalog only through the function.

## Auth & email in local dev

Auth is **Google-free by construction** (AD-12): only email/password and magic
link are enabled — no OAuth provider anywhere. Verify with:

```bash
ANON=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
curl -s -H "apikey: $ANON" http://localhost:8000/auth/v1/settings | grep -o '"email":true'
```

For a frictionless local loop, set `ENABLE_EMAIL_AUTOCONFIRM=true` in your
(gitignored) `supabase/.env` — email/password sign-up then returns a JWT session
immediately, with no confirmation round-trip. The tracked `.env.example` ships it
`false` (the production-safe posture: confirm before sign-in), so copying the
template to a real deployment never accidentally accepts unverified sign-ups. Flip
it locally if you want the instant path. Either way, magic-link/OTP still sends a
real email (below).

**Magic link** uses a one-time **code** (OTP), not a deep link. Requesting a
magic link emails a 6-digit code; the app verifies it via `verifyOtp` — no
URL-scheme/deep-link plumbing (deferred). All auth emails are captured by the
`mail` (Inbucket) service — read them at **http://localhost:9000** (nothing is
sent to a real inbox). `SMTP_USER`/`SMTP_PASS` are intentionally blank: GoTrue
refuses to send credentials over Inbucket's unencrypted SMTP.

## Pinned versions and the upstream 2026-07-06 change

Supabase announced breaking changes for the week of 2026-07-06 (anon-key access
to the OpenAPI spec at `/rest/v1/` removed; `API_EXTERNAL_URL` gaining an
`/auth/v1` path prefix by default). Because every image here is pinned to an
exact tag from **before** that change, this stack is unaffected until the pins
are deliberately bumped. With the pinned images, PostgREST still serves
`/rest/v1/` to the anon key (verified 200), confirming we're on the pre-change side.

## Layout

```text
supabase/
  docker-compose.yml        # the six-service stack (pinned)
  .env.example              # tracked template
  .env                      # generated, gitignored
  scripts/generate-keys.mjs # secret generation
  scripts/apply-migrations.mjs # applies migrations/*.sql to the running db
  migrations/               # SQL migrations (0001_profiles.sql — Story 1.2)
  functions/                # Edge Functions; main/ is the runtime bootstrap
  volumes/
    api/kong.yml            # Kong declarative routes (vendored)
    api/kong-entrypoint.sh  # Kong env-substitution entrypoint (vendored)
    db/*.sql                # Postgres init scripts (roles, jwt, … — vendored)
    db/data/                # Postgres data dir (runtime, gitignored)
    storage/                # storage blobs (runtime, gitignored)
```
