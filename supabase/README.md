# Self-hosted Supabase stack (local dev)

The local backend for TV Time 2: a pinned, self-hosted Supabase stack trimmed to
the six services v1 needs.

| Service     | Image                          | Role                          |
| ----------- | ------------------------------ | ----------------------------- |
| `db`        | `supabase/postgres:17.6.1.136` | Postgres 17                   |
| `auth`      | `supabase/gotrue:v2.189.0`     | GoTrue (email/password + magic link) |
| `rest`      | `postgrest/postgrest:v14.12`   | PostgREST auto REST API       |
| `storage`   | `supabase/storage-api:v1.60.4` | File storage                  |
| `functions` | `supabase/edge-runtime:v1.74.0`| Deno Edge Functions runtime   |
| `kong`      | `kong/kong:3.9.1`              | API gateway (single entrypoint at :8000) |

**AD-13:** every image is pinned to an exact dated tag — never `latest`. When
bumping, re-verify against the upstream compose
(`github.com/supabase/supabase/blob/master/docker/docker-compose.yml`) and record
the new pin in `docker-compose.yml`.

Studio, Realtime, imgproxy, postgres-meta, Supavisor and Vector/Analytics from
the official compose are intentionally omitted — v1's local-first architecture
doesn't use them, and they make a clean bring-up fragile. Postgres is exposed
directly on `:5432` (upstream exposes it via Supavisor, which we drop).

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
  migrations/               # SQL migrations (first one: Story 1.2)
  functions/                # Edge Functions; main/ is the runtime bootstrap
  volumes/
    api/kong.yml            # Kong declarative routes (vendored)
    api/kong-entrypoint.sh  # Kong env-substitution entrypoint (vendored)
    db/*.sql                # Postgres init scripts (roles, jwt, … — vendored)
    db/data/                # Postgres data dir (runtime, gitignored)
    storage/                # storage blobs (runtime, gitignored)
```
