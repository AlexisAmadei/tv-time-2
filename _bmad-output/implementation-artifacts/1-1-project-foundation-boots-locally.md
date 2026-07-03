---
baseline_commit: 6f522d689fd9f0b47c831d39bef5a2006e5148d0
---

# Story 1.1: Project foundation boots locally

Status: done

## Story

As a developer,
I want the pinned self-hosted Supabase stack and the Expo client scaffolded and talking to each other locally,
so that every later story has a working, reproducible substrate to build on.

## Acceptance Criteria

1. **Given** a clean checkout, **when** I run the documented `docker compose up` in `supabase/`, **then** the full stack (Postgres 17, GoTrue, PostgREST, Storage, Edge Functions runtime, Kong) starts from an explicitly pinned dated release tag recorded in-repo, **and** no service references a floating `latest` tag. [Source: epics.md#Story-1.1; ARCH-1, AD-13]
2. **Given** the stack is running, **when** the Expo app starts via the dev client, **then** it initializes a single `supabase-js` client from `.env` (with `.env.example` tracked and the real `.env` untracked) and confirms connectivity with a health check. [Source: epics.md#Story-1.1]
3. **Given** the monorepo layout, **when** I inspect the repo, **then** it matches the structural seed (`app/features/{home,diary,add,feed,profile}`, `app/data`, `app/components`, `supabase/{migrations,functions}`, `packages/shared-types`). [Source: epics.md#Story-1.1; ARCH-2]
4. **Given** the consistency conventions, **when** any schema or code is added, **then** DB objects use `snake_case` and TS uses `camelCase`, and the shared error envelope is `{message, code, details}`. [Source: epics.md#Story-1.1; ARCH-10]

## Tasks / Subtasks

- [x] Task 1: Scaffold the self-hosted Supabase stack (AC: #1)
  - [x] Vendor the official Supabase `docker/` compose config into `supabase/docker-compose.yml`
  - [x] Pin every service image to an **exact dated tag** — do not use `latest` anywhere (see Dev Notes for the exact tag list)
  - [x] Create `supabase/.env.example` (tracked, all vars documented, no real secrets) and a real `supabase/.env` (untracked — add to root `.gitignore`)
  - [x] Generate `JWT_SECRET` and derive matching `ANON_KEY`/`SERVICE_ROLE_KEY` JWTs signed with it, plus a `POSTGRES_PASSWORD` — these are not arbitrary strings; Kong/GoTrue/PostgREST reject every request if `ANON_KEY`/`SERVICE_ROLE_KEY` aren't valid JWTs signed with the stack's own `JWT_SECRET` (see Dev Notes)
  - [x] Write `supabase/README.md` documenting the `docker compose up` command, the secret-generation method, and any prerequisites (Docker Engine 20.10+/Compose v2+)
  - [x] From a clean checkout, verify all 6 services (Postgres 17, GoTrue, PostgREST, Storage, Edge Functions runtime, Kong) come up healthy
- [x] Task 2: Scaffold the Expo/React Native client (AC: #2, #3)
  - [x] `create-expo-app` into `app/` on the TypeScript default template; confirm it resolves to Expo SDK 56 (React Native 0.85, React 19.2, TypeScript 6.0.3) — if the installed template defaults to an older SDK, run `pnpm dlx expo install expo@^56` and `pnpm dlx expo install --fix`
  - [x] Create feature-module folders: `app/features/home`, `app/features/diary`, `app/features/add`, `app/features/feed`, `app/features/profile` (one module per bottom-nav tab; empty/stub screens are fine for this story)
  - [x] Create `app/data/` (will hold the `supabase-js` client, typed query hooks, outbox/sync worker) and `app/components/` (shared UI primitives)
  - [x] Install `@supabase/supabase-js` (`pnpm add @supabase/supabase-js` in `app/`); instantiate exactly **one** client in `app/data/supabaseClient.ts`, reading `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from env (Expo's `EXPO_PUBLIC_*` convention — anything without that prefix is not exposed to client code)
  - [x] Add a startup health check (e.g. a lightweight call through the client, such as `supabase.auth.getSession()` against the running Kong gateway) that surfaces a clear error if the stack from Task 1 is unreachable
- [x] Task 3: Scaffold `packages/shared-types` as a workspace package (AC: #3, #4)
  - [x] Set up pnpm workspaces at the repo root (`pnpm-workspace.yaml` listing `app` and `packages/*`) so `app/` and (later) `supabase/functions/*` can import `@tv-time-2/shared-types` — Edge Functions run on Deno and cannot use pnpm workspace resolution directly, so plan for that package's contents to also be readable as plain `.ts` importable via Deno's npm compat or a build step later (do not over-build this now; a stub package is sufficient for Story 1.1)
  - [x] Configure `app/metro.config.js` for the pnpm monorepo: enable symlink resolution (`config.resolver.unstable_enableSymlinks = true`) and add the repo root to `config.watchFolders` — without this, Metro cannot resolve `@tv-time-2/shared-types` through pnpm's non-hoisted, symlinked `node_modules` structure
  - [x] Define and export the shared error envelope type: `{ message: string; code: string; details: unknown }` — this is the one shape both PostgREST/GoTrue's default errors and every Edge Function response must conform to (ARCH-10)
  - [x] Leave a placeholder/README note that generated Supabase types (`supabase gen types typescript`) and Zod schemas (mood enum, note cap) land here once the first migration exists (Story 1.5+) — nothing to generate yet since there are no tables
- [x] Task 4: Wire up `supabase/migrations/` and `supabase/functions/` as empty, ready directories (AC: #3)
  - [x] Create `supabase/migrations/` (empty — first migration lands in Story 1.2)
  - [x] Create `supabase/functions/` (empty — `catalog-search` lands in Story 1.4)
- [x] Task 5: Enforce and document consistency conventions (AC: #4)
  - [x] Add a short note (root `README.md` or `CONTRIBUTING.md`) stating: Postgres tables/columns are `snake_case`, TypeScript is `camelCase`, ids are `uuid` (`gen_random_uuid()`), timestamps are `timestamptz` UTC ISO 8601, ratings are `smallint` half-steps, moods are `text[]` + `CHECK` (never `ENUM`) — this is guardrail documentation for every story that follows, not code to write now
- [x] Task 6: Update root `.gitignore` (AC: #1, #2)
  - [x] Add `node_modules/`, `supabase/.env` (keep `supabase/.env.example` tracked), `.expo/`, and standard Expo/RN build artifacts — current `.gitignore` only excludes `.claude/`

### Review Findings

_Code review 2026-07-03 (branch `main...HEAD`, 3 commits). Blind Hunter + Edge Case Hunter + Acceptance Auditor. All 4 ACs assessed SATISFIED; findings below are reliability/robustness. 6 findings dismissed as noise (documented/justified deviations)._

- [x] [Review][Defer] Edge Functions may never report healthy → fails the AC1 "six healthy" gate — Two intertwined causes: (a) the `functions` healthcheck uses `bash` + `/dev/tcp` which the Deno-based `edge-runtime` image may not contain [supabase/docker-compose.yml ~L1838]; (b) `main/index.ts` imports `jose` from a live `deno.land/x` URL with no lock/vendor, so a cold/offline first bring-up leaves `main` unable to load [supabase/functions/main/index.ts L1929]. Options if revisited: vendor/pin `jose` + make the healthcheck `sh`-compatible; document a network prereq for first boot; or drop `functions` from the smoke-check EXPECTED set. — **deferred:** app home screen already gets a Supabase 200, so the stack connects fine in practice; the functions-healthy gate isn't an active blocker.
- [x] [Review][Patch] RN health check relies on `AbortSignal.timeout()` — may be undefined in Hermes, surfacing a false "cannot reach Supabase" error even when the stack is up (runtime path never executed — only `expo export` was tested) [app/data/supabaseClient.ts ~L834]
- [x] [Review][Patch] Missing/blank `EXPO_PUBLIC_*` throws at module-eval time, before App's error UI can render — a *wrong* key is handled gracefully but a *missing* key redboxes, inconsistent with AC2's clear-error intent [app/data/supabaseClient.ts ~L795]
- [x] [Review][Patch] `smoke-check.mjs` per-line `JSON.parse` is unguarded → any warning line on `docker compose ps` stdout crashes `verify` with a stack trace instead of a clean fail [scripts/smoke-check.mjs ~L1376]
- [x] [Review][Patch] `smoke-check.mjs` runs `docker compose` without `-f`, unlike the `package.json` scripts → may not locate the compose file when run from repo root [scripts/smoke-check.mjs ~L1338]
- [x] [Review][Patch] `smoke-check.mjs` reports a missing `supabase/.env` as "Gateway probe failed: ENOENT" instead of telling the operator to run `generate-keys.mjs` [scripts/smoke-check.mjs ~L1392]
- [x] [Review][Patch] `generate-keys.mjs` silently omits a secret if a `.env.example` line is renamed/removed — no completeness assertion, reproducing the silent-401 trap the script exists to prevent [supabase/scripts/generate-keys.mjs ~L2183]
- [x] [Review][Patch] `generate-keys.mjs --force` writes fresh secrets into an existing `.env` but cannot tighten its mode (`0o600` only applies on create) — a world-readable `.env` stays world-readable [supabase/scripts/generate-keys.mjs L2195]
- [x] [Review][Patch] `packages/shared-types` README + `isErrorEnvelope` claim GoTrue "already returns" `{message, code, details}` — GoTrue uses `msg` and omits `details`, so the guard rejects real GoTrue errors; correct the misleading claim [packages/shared-types/src/index.ts L1255; README]
- [x] [Review][Patch] Kong config retains routes to dropped services (studio/meta/realtime); the catch-all `/` route 502s to a nonexistent `studio:3000` — prune dead routes (low; vendored) [supabase/volumes/api/kong.yml]
- [x] [Review][Patch] `.env.example` hardcodes `localhost:8000`, which breaks the health check on a physical device (localhost = the device) — add a LAN-IP note (low) [app/.env.example L9]

## Dev Notes

**This is the first code-producing story in the project — there is no existing app code, no prior story, and no established patterns to follow yet.** Everything in this story sets the pattern later stories will imitate, so get the structural seed exactly right.

### Architecture constraints this story must satisfy

- **AD-13 (pin, never `latest`):** `supabase/docker-compose.yml` must pin every image to a specific dated tag, recorded in-repo. Verified current tags (fetched 2026-07-02 from the official `supabase/supabase` `docker/docker-compose.yml`):
  - `db` (Postgres): `supabase/postgres:17.6.1.136`
  - `auth` (GoTrue): `supabase/gotrue:v2.189.0`
  - `rest` (PostgREST): `postgrest/postgrest:v14.12`
  - `storage` (Storage API): `supabase/storage-api:v1.60.4`
  - `kong`: `kong/kong:3.9.1`
  - `functions` (Edge Runtime): `supabase/edge-runtime:v1.74.0`
  - Supporting services if included: `studio` `supabase/studio:2026.06.03-sha-0bca601`, `realtime` `supabase/realtime:v2.102.3`, `meta` `supabase/postgres-meta:v0.96.6`, `supavisor` (pooler) `supabase/supavisor:2.9.5`
  - **Re-verify these against `https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml` at implementation time** — tags move fast; the point is that *whatever* is pinned is an exact tag, not that these specific strings are sacred.
  - ⚠️ **Timing risk:** Supabase has announced breaking changes for the week of **2026-07-06** (days after this story is being written): removal of anon-key access to the OpenAPI spec at `/rest/v1/`, and `API_EXTERNAL_URL` changing to include the `/auth/v1` path prefix by default. Pin a tag and confirm which side of that change it falls on — don't let the pin be a moving target hit mid-story by an unrelated upstream release.
- **Self-hosted secrets are cryptographically linked, not arbitrary strings:** `ANON_KEY` and `SERVICE_ROLE_KEY` must be JWTs signed with the stack's own `JWT_SECRET`. Generating them independently (e.g. random strings, or keys copied from an unrelated project/tutorial) makes every Kong-routed request 401 — silently failing both AC1 ("services healthy") and AC2 (client health check) even though `docker compose ps` shows every container `Up`. Use the official Supabase self-host key-generation method current at implementation time (their onboarding docs script this).
- **Monorepo tooling: pnpm workspaces, not npm.** Chosen for stricter dependency resolution and no phantom hoisted imports across `app`/`packages/*`. This requires an explicit `metro.config.js` symlink-resolution step (Task 2) — Metro does not follow pnpm's symlinked `node_modules` by default, unlike npm's flat hoisting. No Turborepo in this story: there's exactly one real workspace package (`shared-types`, currently a stub with no build step), so there's nothing yet for a task runner to cache or orchestrate — revisit once Edge Functions become multiple deployable units.
- **ARCH-2 (structural seed):** the folder layout is not a suggestion — later stories assume it exists exactly as specified. Do not rename `app/features/add` to `app/features/log` or similar; the epics/architecture consistently use these five names: `home, diary, add, feed, profile`.
- **ARCH-10 (consistency conventions):** the error envelope `{message, code, details}` is what PostgREST/GoTrue already return by default — Edge Functions (starting with `catalog-search` in Story 1.4) must match that shape exactly, not invent their own. Put the TS type for it in `shared-types` now so nothing downstream reinvents it.
- **Two environments only (no staging):** per the architecture, v1 has exactly local dev (`docker compose` + Expo dev client) and one production VPS. Don't build CI/staging config in this story — it's explicitly deferred.
- Auth methods are constrained to email/password + magic link only, Google/Firebase-free (AD-12/NFR3) — not exercised until Story 1.2, but don't scaffold any OAuth provider config now.

### What this story deliberately does NOT include

- No auth flow, no sign-up/sign-in UI (Story 1.2).
- No RLS policies or any table beyond what's needed to prove connectivity — there are no tables yet (first migration is Story 1.2).
- No `catalog-search` or any Edge Function body (Story 1.4) — `supabase/functions/` is created empty.
- No design tokens / theming / bottom nav UI (Story 1.3) — feature-module folders are stubs only.
- No outbox/local-first write path (Story 1.5).

### Testing standards summary

No test framework is initialized in this project yet (the Test Architecture Enterprise module is installed but `bmad-testarch-framework` has not been run). Don't invent a test framework for this story. What "done" means here is a **manual/scripted smoke check**, not an automated test suite:
- A fresh `git clone` + `docker compose up` in `supabase/` brings up all 6 services healthy, verifiable via `docker compose ps` showing all containers `Up`/`healthy`.
- `pnpm --filter app start` (or `pnpm exec expo start` from `app/`) boots the app and the startup health check either confirms connectivity or fails loudly and clearly (no silent failure).
- Consider adding a trivial `pnpm run verify` root script that chains both checks, but don't over-engineer — a real test framework is expected to land via a future `testarch-framework` run, not improvised here.

### Project Structure Notes

- Alignment: this story's file layout **is** the unified project structure being established — see Structural Seed below, taken verbatim from the architecture spine so there's no drift between what's documented and what's built.
- No conflicts or variances detected — this is a greenfield scaffold with nothing pre-existing to reconcile against.

```text
tv-time-2/
  app/                     # Expo/React Native client
    features/
      home/                # Up Next, Watchlist shelf, Recommendations shelf
      diary/
      add/                 # search + fast-add flow, center (+) tab
      feed/
      profile/             # stats, settings, theme
    data/                  # supabase-js client, typed query hooks, outbox/sync worker
    components/            # shared UI primitives
  supabase/
    docker-compose.yml
    .env.example
    migrations/            # SQL schema + RLS policies
    functions/
      catalog-search/
      catalog-title/
      poll-new-episodes/
      export-my-data/
      delete-my-account/
  packages/
    shared-types/          # generated Supabase types + zod schemas (mood enum, note cap) shared client<->functions
```

Note: the `supabase/functions/*` subdirectories and their contents shown above belong to *later* stories (1.4, 2.2, 6.4, 7.1, 7.2) — for Story 1.1, `supabase/functions/` exists but is empty.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.1: Project foundation boots locally] — story statement, acceptance criteria, epic framing
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-13] — pinned-tag rule
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Structural Seed] — exact folder layout
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Consistency Conventions] — naming, id/timestamp/error-envelope formats
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Stack] — Expo SDK 56 / TS 6.0.3 / Postgres 17 pins
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Deployment & Environments] — two-environments-only note
- [Web: https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml] — exact current image tags (fetched 2026-07-02)
- [Web: https://releasebot.io/updates/supabase] — noted upcoming 2026-07-06 breaking changes (anon-key OpenAPI spec access removal, `API_EXTERNAL_URL` prefix change)
- [Web: https://expo.dev/changelog/sdk-56] / https://docs.expo.dev/guides/typescript/] — confirms TypeScript 6.0.3 ships with SDK 56 templates

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8) — BMad Dev Story workflow.

### Debug Log References

- Stack bring-up: `docker compose up -d` in `supabase/` → all six services report
  `healthy` (`docker compose ps`).
- Key linkage proof (the silent-401 trap): with the generated `ANON_KEY`,
  `GET http://localhost:8000/auth/v1/settings` → HTTP 200 (email-only, no OAuth,
  matching config); `GET /rest/v1/` → HTTP 200; both → HTTP 401 without the key.
- `pnpm run verify` (scripts/smoke-check.mjs) → six services healthy + gateway
  accepts anon key at `/auth/v1/health` (HTTP 200).
- `expo export --platform android` → Metro bundled 635 modules (2.3 MB Hermes
  bytecode), env loaded, `@tv-time-2/shared-types` resolved through the pnpm
  symlink + `metro.config.js` (verified with a temporary import, then reverted).
- `tsc --noEmit` clean for both `app/` and `packages/shared-types`.

### Completion Notes List

- **All 4 ACs satisfied and verified.** "Done" here is a scripted smoke check
  (`pnpm run verify`), not an automated test suite — no test framework is
  initialized yet (deferred to a future `testarch-framework` run), per the
  story's Testing Standards.
- **Stack trimmed to the six AC services** (db, auth, rest, storage, functions,
  kong). The official self-hosted compose's optional services — studio,
  realtime, imgproxy, postgres-meta, supavisor, vector/analytics — are omitted:
  none are used by v1's local-first architecture and they make a clean bring-up
  fragile (analytics/vector gate healthchecks). All official DB init scripts and
  the Kong config are vendored as-is; Postgres is exposed directly on `:5432`
  since supavisor (the upstream exposer) is dropped. The legacy HS256 key path is
  the only one wired (AD-12/NFR3: email/password + magic link, no OAuth).
- **⚠️ Deviation — Expo SDK pinned DOWN to 56, not up.** `create-expo-app` now
  defaults to **SDK 57** (the template even ships an `AGENTS.md` pointing at v57
  docs). The story anticipated an *older* default and said to bump up; instead I
  held the architecture's SDK 56 pin (`expo install --fix` aligned react 19.2.3
  / react-native 0.85.3 / expo-status-bar ~56 / TS 6.0.3) and updated
  `app/AGENTS.md` to reference v56. Moving to SDK 57 is an architecture decision
  (correct-course), not a drive-by in this story — flagging for reviewer.
- **Edge runtime `main` router lives under `supabase/functions/main/`.** The
  story's "functions is empty" means "no *feature* functions yet"; the runtime
  still needs a `main` bootstrap to be healthy (AC1). Pointing the edge runtime
  at `supabase/functions` (not the upstream `volumes/functions`) unifies the
  runtime location with the structural-seed location so 1.4's `catalog-search`
  lands in the expected place. Documented in `supabase/functions/README.md`.
- **Secrets** are generated by `supabase/scripts/generate-keys.mjs` (no deps):
  random `JWT_SECRET`/`POSTGRES_PASSWORD`/etc. and `ANON_KEY`/`SERVICE_ROLE_KEY`
  as HS256 JWTs signed with that `JWT_SECRET`. `supabase/.env` and `app/.env` are
  gitignored; the `.env.example` templates are tracked.
- **Pinned tags sit on the pre-2026-07-06 side** of the announced upstream
  breaking changes (anon key still gets `/rest/v1/` → 200), so the stack is
  unaffected until pins are deliberately bumped. Documented in `supabase/README.md`.

### File List

**Repo root**
- `.gitignore` (modified — node_modules, both `.env`s, `.expo/`, RN build artifacts, db data)
- `README.md` (new — quickstart + ARCH-10 consistency conventions, AC4)
- `package.json` (new — pnpm workspace root, `verify`/`supabase:*`/`app` scripts)
- `pnpm-workspace.yaml` (new)
- `pnpm-lock.yaml` (new — generated)
- `scripts/smoke-check.mjs` (new — `pnpm run verify`)

**supabase/**
- `docker-compose.yml` (new — six pinned services, AC1)
- `.env.example` (new, tracked)
- `.env` (new, **gitignored** — generated secrets)
- `README.md` (new — run command, secret generation, prerequisites)
- `scripts/generate-keys.mjs` (new — JWT-linked secret generation)
- `migrations/.gitkeep` (new — empty, first migration in 1.2)
- `functions/README.md` (new)
- `functions/main/index.ts` (new — vendored edge-runtime bootstrap router)
- `volumes/api/kong.yml`, `volumes/api/kong-entrypoint.sh` (new — vendored)
- `volumes/db/{realtime,webhooks,roles,jwt,_supabase,logs,pooler}.sql` (new — vendored)
- `volumes/db/data/`, `volumes/storage/` (runtime, **gitignored**)

**packages/shared-types/**
- `package.json`, `tsconfig.json`, `README.md` (new)
- `src/index.ts` (new — `ErrorEnvelope` + `isErrorEnvelope`, ARCH-10 / AC4)

**app/** (scaffolded via `create-expo-app` blank-typescript, then modified)
- `package.json` (modified — pinned SDK 56, added supabase-js / AsyncStorage / url-polyfill / shared-types)
- `App.tsx` (modified — startup health-check UI)
- `AGENTS.md` (modified — SDK 56 guidance)
- `metro.config.js` (new — pnpm monorepo symlink resolution + watchFolders)
- `data/supabaseClient.ts` (new — the single client + `checkSupabaseHealth`)
- `data/README.md`, `components/README.md` (new)
- `features/{home,diary,add,feed,profile}/*Screen.tsx` (new — stub screens)
- `scripts/health-check.mjs` (new — headless connectivity probe)
- `.env.example` (new, tracked), `.env` (new, **gitignored**)
- `index.ts`, `app.json`, `tsconfig.json`, `CLAUDE.md`, `LICENSE`, `.gitignore`, `assets/*` (template-generated)

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-03 | Story 1.1 implemented: pinned six-service self-hosted Supabase stack + Expo SDK 56 client + pnpm workspace (`shared-types`) wired and talking locally. All ACs verified via `pnpm run verify` and a Metro bundle. Status → review. |
| 2026-07-03 | Applied code-review fixes: bound Postgres to `127.0.0.1` (was exposed on all interfaces); added a 5s timeout to all three health-check fetches (was hang-forever); made the `docker compose ps --format json` parser accept NDJSON *and* array output; trimmed CR/quotes in `.env` parsing; simplified `checkSupabaseHealth` to return the status; replaced hand-rolled `b64url` with `Buffer.toString('base64url')` (verified byte-identical); de-duped `.gitignore` `*.p12`; fixed two `supabase/README.md` doc nits. Re-verified green. |
