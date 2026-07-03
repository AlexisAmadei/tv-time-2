# TV Time 2

A private-by-default film & TV tracker, built as an open-source successor to
[TV Time](https://tvtime.com), which shut down on July 15, 2026 and took every
user's watch history with it.

TV Time 2 is a personal watch-memory first and a small social network second:
log what you watch, react with a fast **mood chip** (a curated emoji set, not
a flattened star rating) that captures how you felt *at the moment you
watched it*, and build a private, honest timeline over time. It's multi-user
by design — follow friends, see their reactions, share lists — but there's no
monetization plan, no ads, and no proprietary lock-in. It's open source and
aimed at F-Droid distribution, so no one can take your history away again.

Roadmap board: [kanban.kiwidev.fr/Kiwidev/tv-time-2](https://kanban.kiwidev.fr/Kiwidev/tv-time-2)

## Disclaimer

This is an independent, unofficial fan project. I am **not affiliated with,
endorsed by, or connected to TV Time or its team** in any way — I'm just
someone who used the app daily and didn't want that history to disappear.
The name "TV Time 2" is a placeholder tribute, not a claim of continuity or
ownership. I'm building this in my own time, for free, as a kind of legacy
for the app and the habit it gave me — not as a commercial product or an
official successor.

**Core v1 features:** catalog search · track shows/films with progress ·
one-tap Watched + bulk season log · hybrid rating (½-star + mood chips) with
optional notes · timestamped watch-memory (Diary) · profile stats ·
watchlist · light social (follow, chronological feed, private-by-default
visibility, shared lists) · new-episode push notifications · native iOS +
Android (one codebase, F-Droid variant) · dark + Paper White themes.

## Stack

Expo/React Native client backed by a self-hosted Supabase stack, in a pnpm
monorepo:

```text
app/                  # Expo/React Native client (SDK 56)
  features/{home,diary,add,feed,profile}   # one module per bottom-nav tab
  data/               # supabase-js client, query hooks, outbox/sync worker
  components/         # shared UI primitives
supabase/            # self-hosted stack (docker compose) + migrations + functions
packages/
  shared-types/      # types shared between client and Edge Functions
```

## Prerequisites

- Docker Engine 20.10+ and Docker Compose v2+
- Node 20+ and pnpm 10+ (`corepack enable` or install pnpm directly)

## Quickstart

```bash
# 1. Backend: generate secrets and start the pinned Supabase stack
cd supabase
node scripts/generate-keys.mjs      # writes supabase/.env
docker compose up -d                # starts db, auth, rest, storage, functions, kong
docker compose ps                   # confirm all six are healthy
cd ..

# 2. Client env: point the app at the stack
cp app/.env.example app/.env
#   then set EXPO_PUBLIC_SUPABASE_ANON_KEY in app/.env to the ANON_KEY from supabase/.env

# 3. Install workspace dependencies
pnpm install

# 4. Smoke-check the substrate (six services healthy + gateway accepts anon key)
pnpm run verify

# 5. Run the app
pnpm --filter app start             # or: pnpm app
```

`pnpm run verify` is a scripted smoke check, not a test suite — a real test
framework lands via a future testarch run. See `supabase/README.md` for backend
detail (secret linkage, pinned versions, the upstream 2026-07-06 change).

## Consistency conventions (ARCH-10) — read before adding schema or code

These are guardrails every later story must follow so nothing downstream drifts:

- **Database is `snake_case`**, TypeScript is **`camelCase`**. Map at the boundary.
- **Ids** are `uuid`, defaulted with `gen_random_uuid()`.
- **Timestamps** are `timestamptz`, stored UTC, serialized as ISO 8601.
- **Ratings** are `smallint` half-steps (e.g. 0–10 representing 0–5 stars).
- **Moods** are `text[]` with a `CHECK` constraint — **never** a Postgres `ENUM`
  (so the allowed set can evolve without a type migration).
- **Errors** cross every boundary as the shared envelope
  `{ message, code, details }` — exported as `ErrorEnvelope` from
  `@tv-time-2/shared-types`. PostgREST and GoTrue already return this shape;
  Edge Functions must match it exactly rather than inventing their own.

## Environments

Two only: local dev (this repo's `docker compose` + Expo dev client) and one
production VPS. No staging, no CI/CD scaffolding in v1.

## Auth

Email/password + magic link only. No Google/Firebase/OAuth providers (AD-12 / NFR3).
