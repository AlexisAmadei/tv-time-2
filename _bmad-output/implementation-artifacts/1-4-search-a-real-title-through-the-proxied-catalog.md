---
baseline_commit: 92778029c8e107a64bfa54b9991ee9f21a7da378
---

# Story 1.4: Search a real title through the proxied catalog

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to search for a real film or show and see results,
so that I can find the title I'm about to log — while the app never holds the catalog key.

## Acceptance Criteria

1. **Given** the `catalog-search` Edge Function, **when** the client searches a query, **then** results (poster, title, year, `media_type`) return via the function only — the client never calls TMDB directly and holds no TMDB key. [Source: epics.md#Story-1.4; FR6, AD-6, AD-2]
2. **Given** the function fetches from TMDB, **when** it returns, **then** it reads/writes `catalog_cache` (`tmdb_id`, `media_type`, `payload jsonb`, `fetched_at`) with a TTL and is the sole caller of the external catalog. [Source: epics.md#Story-1.4; AD-6]
3. **Given** any result referencing a title, **when** it is represented, **then** it is keyed by `tmdb_id` + `media_type` (`'movie' | 'tv'`) per ARCH-10 — no local titles table, no synonym columns. [Source: epics.md#Story-1.4; ARCH-10, AD-3]
4. **Given** the caller, **when** it invokes `catalog-search`, **then** the function verifies the GoTrue JWT and rejects unsigned requests, emitting `{message, code, details}` on error. [Source: epics.md#Story-1.4; AD-2, ARCH-10]
5. **Given** scope, **when** this story is built, **then** it delivers search only — no title-detail, seasons, or episodes (those are Epic 2). [Source: epics.md#Story-1.4; Epic 2]

Additional behavior that must hold for the feature to work end-to-end in the existing system (not new scope, but required for AC1/AC5 to be real):

6. **Given** the catalog is unreachable or the query is empty, **when** the user searches, **then** the search UI shows the warm retry/empty copy and **preserves the typed query** — logging is never involved here, but a blank/broken screen is not acceptable. [Source: EXPERIENCE.md#State Patterns; FR8, FR9]

## Tasks / Subtasks

- [x] Task 1: Migration `0002_catalog_cache.sql` — the disposable TTL cache table, deny-by-default (AC: #2, #3)
  - [x] Create `supabase/migrations/0002_catalog_cache.sql` (second migration; follow the exact style of `0001_profiles.sql` — idempotent / re-runnable, `snake_case`, explicit RLS the moment the table is created).
  - [x] Define `public.catalog_cache`: `tmdb_id integer not null`, `media_type text not null check (media_type in ('movie','tv'))`, `payload jsonb not null`, `fetched_at timestamptz not null default now()`, **composite** `primary key (tmdb_id, media_type)` (TMDB ids are namespaced per type — a movie and a show can share an integer id, so the type is part of the key). No `uuid` PK here: this is a disposable cache keyed by the catalog identity, not an owned entity (AD-6 says it is freely evictable, never a system-of-record). No FK to any local `titles` table — there is none (AD-3).
  - [x] **Deny-by-default like every other table (AD-1):** `enable row level security`; `revoke all on public.catalog_cache from anon, authenticated` (the base image auto-grants ALL — strip it, exactly as `0001` did); grant **nothing** to `anon`/`authenticated`. The client never touches this table directly — only the Edge Function does, using the **service-role** key (which bypasses RLS). Add no policies for `authenticated`/`anon`. Document this in the migration header.
  - [x] Apply + verify with `pnpm run supabase:migrate` (re-run once to confirm idempotency). Verify grants with `role_table_grants` and RLS with `pg_policies` (expect zero anon/authenticated grants, RLS enabled).
- [x] Task 2: The `catalog-search` Edge Function — the first feature function (AC: #1, #2, #3, #4)
  - [x] Create `supabase/functions/catalog-search/index.ts`. The dir name **must** be exactly `catalog-search` — the `main` router (`supabase/functions/main/index.ts`) routes `/functions/v1/catalog-search` → (Kong strips `/functions/v1/`) → `path_parts[1] === 'catalog-search'` → `servicePath = /home/deno/functions/catalog-search`.
  - [x] **JWT verification in-function (AC4), NOT via the global router flag.** Leave `FUNCTIONS_VERIFY_JWT=false` (the `main` router's global verify emits `{msg}`, not the `{message,code,details}` envelope AC4 requires, and a global flip would also gate the pg_cron-invoked `poll-new-episodes` in 6.4). Instead, inside the function: create a supabase client with the caller's `Authorization` header and call `auth.getUser()`; if there is no user (missing/invalid/expired JWT), return HTTP 401 with `{message, code:'unauthorized', details:null}`. Handle `OPTIONS` (CORS preflight) before the auth check. [Source: ARCHITECTURE-SPINE.md#State & cross-cutting — "Edge Functions verify it via the Supabase auth helper, never trust an unsigned user id"]
  - [x] **Hold the TMDB key server-side and be the sole caller (AC1, AD-6).** Read `TMDB_API_KEY` (or `TMDB_ACCESS_TOKEN` for v4 bearer) from `Deno.env`. Query TMDB search (`/3/search/multi?query=…` — returns mixed movie/tv/person; **filter to `media_type` `'movie'`/`'tv'` only**, drop `person`). Normalize each result to `{ tmdbId, mediaType, title, year, posterPath }` — `title` from `title`(movie)/`name`(tv); `year` from `release_date`/`first_air_date` (first 4 chars, nullable); `posterPath` nullable.
  - [x] **Read/write `catalog_cache` with a TTL (AC2).** Use a **service-role** supabase client (`SUPABASE_SERVICE_ROLE_KEY` is already injected into the functions container) for cache access. On a search: upsert each returned title into `catalog_cache` (`payload` = the normalized title object, `fetched_at = now()`) keyed on `(tmdb_id, media_type)`. This populates the cache that `catalog-title` (2.2) and the poller (6.4) later rely on. Define a TTL constant (e.g. 7 days) and prefer a cached row over a re-fetch where a per-title read is possible; a fresh row skips re-writing. **Do NOT invent a `query` column** on `catalog_cache` (ARCH-10 forbids synonym columns) — query-result-set caching is Story 2.1's concern, not 1.4's. Keystroke-hammering (the stated anti-goal) is handled by the client debounce in Task 3, not by a query cache here.
  - [x] **Error envelope (AC4, ARCH-10):** every non-2xx returns `{message, code, details}` as JSON. The `shared-types` package is **not** mounted into the functions container (only `./functions` is), so you cannot `import` `ErrorEnvelope` at runtime — inline the literal shape (it is three fields). A TMDB failure → `{message, code:'catalog_unavailable', details:…}` with an appropriate 5xx/502; a missing query → 400 `{message, code:'bad_request', details:null}`.
  - [x] Deno remote imports: import `createClient` from `jsr:@supabase/supabase-js@2` (or `https://esm.sh/@supabase/supabase-js@2`) — verify the exact specifier resolves in the pinned `supabase/edge-runtime:v1.74.0` at implementation time. **Heads-up (see Dev Notes → Edge-runtime health trap):** the runtime fetches remote imports on cold boot; a fresh/offline bring-up can leave the container unable to load. Warm the deno cache before relying on the function.
- [x] Task 3: Wire the TMDB key into the functions container (AC: #1)
  - [x] Add `TMDB_API_KEY` (and/or `TMDB_ACCESS_TOKEN`) to the `functions` service `environment` in `supabase/docker-compose.yml` (alongside the existing `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, …). Reference it as `${TMDB_API_KEY}`.
  - [x] Add `TMDB_API_KEY=` (empty, with a comment "obtain from https://www.themoviedb.org/settings/api — server-side only, NEVER an EXPO_PUBLIC_ var") to the tracked `supabase/.env.example`. Put the real key only in the **gitignored** `supabase/.env`. The key must never appear in `app/.env*` or any `EXPO_PUBLIC_*` var — that is the whole point of the proxy (AD-6). See the "Open question" note about actually obtaining a key.
- [x] Task 4: Client search UI in the Add tab + a catalog data module (AC: #1, #3, #5, #6)
  - [x] Create `app/data/catalog.ts` (new data module, sibling to `auth.ts`): a `searchCatalog(query: string): Promise<CatalogResult[]>` that calls `supabase.functions.invoke('catalog-search', { body: { query } })` (supabase-js auto-attaches the `apikey` + the session `Authorization` bearer — do not hand-build headers or a second client). Define and export `CatalogResult` (`{ tmdbId: number; mediaType: 'movie' | 'tv'; title: string; year: string | null; posterPath: string | null }`) and a `posterUrl(posterPath)` helper. Surface function errors (map the `{message,code,details}` envelope) so the UI can show the retry state.
  - [x] Rebuild `app/features/add/AddScreen.tsx` (currently a `PlaceholderScreen`): a themed search field (`surface-sunken`, `radius.sm`) + a results list. **Debounce input ~300ms** (this is what prevents per-keystroke TMDB calls — FR6 "results appear as you type" without hammering). Preserve the typed query across an error (AC6/FR8).
  - [x] Render results as the **Title card** pattern (poster left, title + meta right, `surface-raised`, `radius.md`; [Source: DESIGN.md#Components title-card]). Posters: render from the TMDB image CDN via `<Image>`; while loading or when `posterPath` is null, show the **cool→dark gradient placeholder** — never a broken image (FR9). Use the theme tokens only (no literal hex).
  - [x] **Scope wall (AC5):** results are display-only in 1.4. Tapping a result does **not** navigate to title-detail (Epic 2) or log a watch (1.5) — wire no fake destination. A row can be inert or a no-op for now; keep it honest (do not stub a detail screen).
  - [x] Empty/error copy (warm voice, [Source: EXPERIENCE.md#State Patterns], verbatim): search-empty → **"Hmm, nothing by that name. Try another spelling or title?"**; catalog error → **"Couldn't reach the catalog — check your connection and try again."** with a retry affordance that keeps the typed query. One emoji max; none of the banned patterns.
  - [x] a11y (NFR7): search field labeled; each result exposes an accessible label (title + year + type); tap targets ≥ 44pt/48dp; color never the sole signal.
- [x] Task 5: Verify end-to-end + extend the smoke check + docs (AC: all)
  - [x] `app`: `npx tsc --noEmit` clean and `npx expo export --platform android` bundles (the established "done" bar — no test framework yet).
  - [x] Bring the stack up and confirm the `functions` container is **healthy** and `catalog-search` actually serves (see the health trap in Dev Notes — this is the first story that truly exercises the runtime). Manually: signed-in search returns real TMDB results with posters; an **unauthenticated** call to `/functions/v1/catalog-search` (no/invalid bearer) returns **401** with the `{message,code,details}` envelope (AC4); a second identical search reads from `catalog_cache` (inspect the table — rows present with `fetched_at`).
  - [x] Extend `scripts/smoke-check.mjs` with a durable, read-only guardrail where meaningful: e.g. an unauthenticated `POST /functions/v1/catalog-search` → 401 (proves the proxy rejects unsigned callers) and/or the `catalog_cache` table exists with RLS on and no anon/authenticated grants. Do not stand up a test framework (that is a future `testarch-framework` run). `pnpm run verify` stays green.
  - [x] Update `supabase/functions/README.md` (mark `catalog-search` as landed, Story 1.4) and `supabase/README.md` if the TMDB env needs a dev-setup note.

### Review Findings

Code review 2026-07-04 (adversarial: Blind Hunter + Edge Case Hunter + Acceptance Auditor). All 6 ACs verified satisfied; findings below are robustness/hardening, none block the ACs.

- [x] [Review][Patch] Error `details` echoes upstream internals (and the TMDB v3 key on the fallback path) to the authenticated client — return `details: null` and log the real detail server-side [supabase/functions/catalog-search/index.ts:172, 181]
- [x] [Review][Patch] Outbound TMDB `fetch` has no timeout — a hung upstream blocks the function until the platform kills it; add `AbortSignal.timeout(...)` like the rest of the repo [supabase/functions/catalog-search/index.ts:166]
- [x] [Review][Patch] Client `functions.invoke` has no timeout — a stalled response leaves the UI in `loading` forever with no error/retry; add a timeout that rejects into the error phase [app/data/catalog.ts:59]
- [x] [Review][Patch] Cache upsert batch is not deduped by `(tmdb_id, media_type)` — a duplicate TMDB row throws "ON CONFLICT … cannot affect row a second time", skipping the whole batch, and also warns the FlatList; dedupe in `normalize` [supabase/functions/catalog-search/index.ts:209; app/features/add/AddScreen.tsx:129]
- [x] [Review][Patch] Smoke check §6 treats `rows === 0` as "denied" — on an empty table this false-passes a grant regression; assert on status only [scripts/smoke-check.mjs:214]
- [x] [Review][Defer] `catalog_cache` has no eviction — unbounded growth; needs a separate TTL sweep (pg_cron), out of 1.4 scope [supabase/migrations/0002_catalog_cache.sql] — deferred, pre-existing
- [x] [Review][Defer] Both TMDB keys empty is masked as a connectivity 502 rather than a distinct misconfiguration signal [supabase/functions/catalog-search/index.ts:670] — deferred, pre-existing
- [x] [Review][Defer] `auth.getUser()` transport failure (GoTrue unreachable) is reported as 401 rather than a 5xx [supabase/functions/catalog-search/index.ts:137] — deferred, pre-existing

Re-review 2026-07-05 (adversarial re-run: Blind Hunter + Edge Case Hunter + Acceptance Auditor) confirms all eight findings above and adds two. **All 7 patches applied 2026-07-05** (server-side `details` nulled + logged; `AbortSignal.timeout(8s)` on the TMDB fetch; 10s client `invoke` race-timeout; `normalize` now de-dupes `(tmdb_id, media_type)` and drops non-numeric ids; smoke-check §6 asserts on HTTP status alone; poster placeholder swapped to a real `expo-linear-gradient` cool→dark gradient + `film-outline` glyph). Verified: `tsc --noEmit` clean, `expo export` bundles, `smoke-check` green (`catalog_cache` denied HTTP 401), and the `catalog-search` worker reboots healthy and serves the envelope. The 4 dismissed findings were noise/false-positives (see review notes); the 3 defers remain deferred.

- [x] [Review][Patch] Poster placeholder is a flat translucent `cool` wash, not DESIGN.md's cool→dark **gradient** with a small glyph — Alex approved `expo install expo-linear-gradient`; swap `Poster` to render the real cool→dark gradient + glyph. [app/features/add/AddScreen.tsx:319] (resolved from Decision 2026-07-05)
- [x] [Review][Patch] `normalize` does not guard `r.id` — a TMDB row missing a numeric `id` yields `tmdb_id: undefined` (NOT-NULL upsert abort drops the whole cache batch) and a `movie:undefined` FlatList key collision; add `if (typeof r.id !== 'number') continue;` [supabase/functions/catalog-search/index.ts:112]

## Dev Notes

**This is the fourth code-producing story and the first that spans the full stack in one slice: a new migration + the first feature Edge Function + a real client data call.** 1.1 (substrate), 1.2 (auth + first migration/RLS/trigger), and 1.3 (design tokens + nav shell) are done/in-review — read `1-2-…md` (migration + RLS + deny-by-default grant pattern) and `1-3-…md` (theme tokens + `Screen` primitive) and the current files before writing. Story 1.4 proves **the proxy boundary invariant (AD-6)**: the client can find a real title while the TMDB key lives only server-side. Everything about how a function verifies auth, holds a secret, and reads/writes the cache becomes the pattern 2.2 (`catalog-title`), 6.4 (`poll-new-episodes`), and 7.1/7.2 (GDPR) imitate — get it right.

### Existing code this story builds on (read before modifying)

- `supabase/functions/main/index.ts` — the vendored **router** for the self-hosted edge runtime. It splits the path and boots `/home/deno/functions/<service_name>` as a worker. It **already implements JWT verification** gated on `VERIFY_JWT` (env `FUNCTIONS_VERIFY_JWT`, currently `false`) — but its 401 body is `{msg:…}`, not the `{message,code,details}` envelope AC4 mandates. **Do not flip the global flag and do not edit `main`.** Verify inside `catalog-search` and emit the envelope. [Source: supabase/functions/main/index.ts]
- `supabase/functions/README.md` — already lists `catalog-search — Story 1.4` and states every function must return the shared `{message, code, details}` envelope. Update it to "landed" when done. [Source: supabase/functions/README.md]
- `supabase/docker-compose.yml` (`functions` service ~L186) — `supabase/edge-runtime:v1.74.0`, mounts `./functions:/home/deno/functions`, `command: ["start","--main-service","/home/deno/functions/main"]`. Already injects `JWT_SECRET`, `SUPABASE_URL: http://kong:8000`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `VERIFY_JWT`. You add `TMDB_API_KEY` here. Note `SUPABASE_URL` inside the container is `http://kong:8000` (Docker-internal) — use it (never `localhost`) for the in-function supabase clients. [Source: supabase/docker-compose.yml]
- `supabase/volumes/api/kong.yml` (~L226 `functions-v1`) — `/functions/v1/*` → `http://functions:9000/*`, `strip_path: true`, **only the `cors` plugin** (no `key-auth`/`acl`). So Kong does NOT enforce the apikey for functions — the function itself owns auth (AC4). supabase-js still sends `apikey` + `Authorization`. No Kong change needed. [Source: supabase/volumes/api/kong.yml]
- `supabase/migrations/0001_profiles.sql` + `supabase/scripts/apply-migrations.mjs` — the migration pattern to copy: idempotent SQL, `revoke all … from anon, authenticated` then least-privilege grants, RLS enabled at create time. There is **no migration-tracking table** — migrations must be re-runnable; `pnpm run supabase:migrate` applies the whole folder in sort order with `ON_ERROR_STOP=1`. Your file is `0002_catalog_cache.sql`. [Source: 1-2 File List; supabase/migrations/0001_profiles.sql]
- `app/data/supabaseClient.ts` — the **ONE** client. `supabase.functions.invoke(...)` goes through it and auto-attaches the session bearer. Do not create a second client. [Source: app/data/supabaseClient.ts]
- `app/data/auth.ts` — `useSession()`; the search screen only runs for a signed-in user (the whole shell is behind the auth gate), so a valid bearer is always present in-app. [Source: 1-2 File List]
- `app/features/add/AddScreen.tsx` — currently `<PlaceholderScreen title="Log a watch" …/>`; **this is the (+) target you rebuild into search.** [Source: app/features/add/AddScreen.tsx]
- `app/theme/*` + `app/components/Screen.tsx` — theme tokens (`useTheme()` → `colors.surfaceRaised`, `colors.surfaceSunken`, `colors.cool`, `type.*`, `spacing`, `radius`) and the `Screen` container. Reference roles, never literal hex (UX-DR1). The poster gradient placeholder uses `cool → surfaceSunken/base`. [Source: 1-3 File List; app/theme/tokens.ts]
- `packages/shared-types/src/index.ts` — `ErrorEnvelope` + `isErrorEnvelope`. The **client** can import this to narrow function errors; the **Edge Function cannot** (the package isn't mounted into the functions container) — inline the envelope literal there. [Source: packages/shared-types/src/index.ts]

### ⚠️ Edge-runtime health trap — this is the first story that truly runs a function (read this)

`deferred-work.md` flagged a real, still-open risk from the 1.1 review that **becomes an active blocker here**: the `functions` container can fail to report healthy / fail to boot because (a) its healthcheck uses `bash` + `/dev/tcp` the Deno image may lack, and (b) `main/index.ts` imports `jose` from a live `deno.land/x` URL with **no lock/vendor**, so a cold or offline first bring-up can't load the worker. Until 1.4, nothing invoked a function so this was dormant. Now it gates AC1. Before verifying: bring the stack up **with network** so the deno cache warms (the runtime caches remote imports into the `deno-cache` volume); your `catalog-search` adds another remote import (`@supabase/supabase-js`) subject to the same cold-boot fetch. If the container is unhealthy, check its logs (`docker compose logs functions`) — a failed remote import is the likely cause. Do not paper over it with a stub; if it blocks, note it precisely (as 1.1 did) but the realistic path is: warm the cache online, confirm the worker serves. [Source: _bmad-output/implementation-artifacts/deferred-work.md]

### Architecture constraints this story must satisfy

- **AD-6 — Catalog access is always proxied and cached, never direct from the client.** The client calls only `catalog-search`; the function holds the TMDB key, is the **sole** caller of TMDB, and reads/writes `catalog_cache` (`tmdb_id`, `media_type`, `payload jsonb`, `fetched_at`) with a TTL. `catalog_cache` is **disposable and freely evictable** — never a system-of-record, and a **different table** from `known_episode_state` (6.4's durable poller baseline). Do not build `known_episode_state` here. [Source: ARCHITECTURE-SPINE.md#AD-6]
- **AD-2 — Edge Functions are the only home for custom logic; client & pg_cron are the only callers.** The catalog proxy is exactly this: logic that needs a secret the F-Droid client must never hold. Only `catalog-search` may call TMDB. [Source: ARCHITECTURE-SPINE.md#AD-2]
- **AD-3 — a watch is not modeled on a titles/catalog entity.** There is **no local `titles` table**. Every reference to a catalog title is by `tmdb_id` value (+ `media_type`), never a FK into a local catalog table. `catalog_cache` is a cache, not that table. [Source: ARCHITECTURE-SPINE.md#AD-3]
- **ARCH-10 consistency (binding catalog identifiers):** the column is **`tmdb_id`** with a `media_type` (`'movie' | 'tv'`) discriminator — never `tmdb_show_id`, `mapped_title_or_episode_id`, or any synonym. Edge Function names are verb-first: **`catalog-search`** (not `search-catalog`). DB `snake_case`, TS `camelCase`. Errors = `{message, code, details}`. Auth = GoTrue JWT bearer, verified via the auth helper, never trust an unsigned user id. [Source: ARCHITECTURE-SPINE.md#Consistency Conventions]
- **AD-1 deny-by-default (applies to `catalog_cache` too):** RLS on, no anon/authenticated grants — the client reaches catalog data only through the function, which uses the service-role key. This mirrors 1.2's grant surgery (the base image auto-grants ALL; strip it). [Source: ARCHITECTURE-SPINE.md#AD-1; 1-2 Completion Notes "least-privilege grants"]

### Key design decisions / traps

- **JWT verify in-function, not the global router flag** (AC4 envelope + future-proofing 6.4's cron caller). Pattern: `createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })` then `const { data: { user } } = await sb.auth.getUser()`; no user → 401 envelope. Then a **separate** service-role client for `catalog_cache`. Handle `OPTIONS` first.
- **`catalog_cache` schema is fixed by the AC — do not extend it.** Composite PK `(tmdb_id, media_type)`, no `uuid`, no `query` column. Search caches **per-title** rows (populating what 2.2/6.4 read). Preventing keystroke-hammering is the **client debounce**, not a query cache (that's 2.1). If you feel the urge to add a `query` or `search_terms` column, stop — ARCH-10 forbids synonym columns and 2.1 owns query-set caching.
- **Poster images — decided for 1.4: load from the TMDB image CDN (`https://image.tmdb.org/t/p/w185{poster_path}`), keyless, with the gradient placeholder fallback (FR9).** The load-bearing invariant AD-6 protects is *the API key never shipping in the client* — the image CDN needs no key, so this doesn't leak anything. Note the nuance: a strict reading of AD-1 ("client never talks to any third party directly") would also proxy images; **no story scopes image-proxying**, and every TMDB client loads posters from the CDN. Recommendation: CDN + gradient placeholder now; if strict AD-1 image-proxying is ever required it's a deliberate, separate decision. (Flagged to Alex below.)
- **TMDB endpoint:** `/search/multi` returns movie/tv/**person** mixed — filter to movie/tv. Alternatively call `/search/movie` + `/search/tv` and merge. `year` = first 4 chars of `release_date`/`first_air_date` (nullable — unreleased titles have empty dates). `media_type` on `/search/multi` results is present; when using the split endpoints, set it yourself.
- **`SUPABASE_URL` in-container is `http://kong:8000`** (Docker-internal). Use it for the in-function clients; never `localhost`/`127.0.0.1` (the container can't reach itself that way — same class of bug called out for pg_net in AD-5).
- **TS `types: []` trap** (SDK 56 / TS 6.0.3): the app tsconfig defaults `types` to empty. After adding `app/data/catalog.ts` nothing new is needed, but if you touch types, add ambient `@types` explicitly. The **Edge Function** tsconfig is Deno's — list needed `@types` explicitly there too (spine L143). [Source: ARCHITECTURE-SPINE.md#TypeScript]

### Previous-story intelligence (from 1.1 → 1.3)

- **Deny-by-default grants are per-table until a project-wide fix lands** (1.2 note): the base image `ALTER DEFAULT PRIVILEGES` auto-grants `authenticated`+`anon` ALL on new public tables, so `catalog_cache` needs the same `revoke all … / grant …` surgery `0001` did — here you grant **nothing** (function uses service role). [Source: 1-2 Completion Notes]
- **Migration mechanism:** idempotent SQL, `pnpm run supabase:migrate`, no tracking table, re-runnable. Zero-padded ordinal → `0002_`. [Source: 1-2 Completion Notes]
- **Testing posture unchanged:** no framework yet. "Done" = `tsc --noEmit` clean + `expo export` bundles + extend `scripts/smoke-check.mjs` with a meaningful read-only guardrail + manual verify against the live stack. Don't stand up a test framework as a drive-by. [Source: 1-3 Dev Notes; 1-2 Testing standards]
- **Single client / single session source:** `supabase.functions.invoke` through `app/data/supabaseClient.ts`; `useSession` from `app/data/auth.ts`. No second client. [Source: 1-2, 1-3 Dev Notes]
- **Theme discipline (1.3):** consume `useTheme()` roles; the `Screen` primitive owns the base surface + margins; the cool→dark poster gradient is a defined component. No literal hex. [Source: 1-3 File List]
- **Git context:** recent commits are 1.3 (`9277802 feat: 1.3`), roadmap docs, and kong/env cleanup — no Edge Function feature code or catalog code exists yet. This story writes the first of both. [Source: git log]

### What this story deliberately does NOT include

- **No title-detail, seasons, or episodes** (AC5) — that's Epic 2 (`catalog-title`, Story 2.2). Search results are display-only; tapping wires nothing.
- **No log / watch / outbox** — Story 1.5. Search finds a title; logging it is next.
- **No `watches`, no `known_episode_state`, no `tracked_shows`, no visibility wall** — later stories/epics.
- **No query-result-set cache, no synonym columns on `catalog_cache`** — Story 2.1 owns the full search experience + its caching.
- **No image-proxy Edge Function** — posters load from the keyless TMDB CDN (see decision above).
- **No global `FUNCTIONS_VERIFY_JWT=true` flip** — per-function verification only.
- **No TMDB rate-limit/backpressure engineering** — out of scope for v1 solo scale (spine "Deferred / out of scope").

### Project Structure Notes

- **New:** `supabase/migrations/0002_catalog_cache.sql`; `supabase/functions/catalog-search/index.ts` (first feature function dir); `app/data/catalog.ts` (new data module).
- **Modified:** `app/features/add/AddScreen.tsx` (placeholder → search UI); `supabase/docker-compose.yml` (`TMDB_API_KEY` into `functions`); `supabase/.env.example` (tracked, `TMDB_API_KEY=` placeholder) + `supabase/.env` (gitignored, real key); `scripts/smoke-check.mjs` (functions-auth / cache guardrail); `supabase/functions/README.md` (mark landed); `supabase/README.md` (TMDB dev-setup note, if useful).
- Aligns with the ARCH-2 seed: `migrations/`, `functions/`, `app/data/` all already exist; this is purely additive plus the placeholder-screen replacement. `catalog-search/` is the first occupant of the (already-scaffolded) feature-functions slot.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4: Search a real title through the proxied catalog] — story, ACs, scope wall (search only)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-6] — proxy + `catalog_cache` schema/TTL, disposable, separate from `known_episode_state`
- [Source: …/ARCHITECTURE-SPINE.md#AD-2] — Edge Functions are the only home for custom logic; only caller of TMDB
- [Source: …/ARCHITECTURE-SPINE.md#AD-3] — no local titles table; reference by `tmdb_id`
- [Source: …/ARCHITECTURE-SPINE.md#AD-1] — RLS deny-by-default (applies to `catalog_cache`)
- [Source: …/ARCHITECTURE-SPINE.md#Consistency Conventions] — `tmdb_id`/`media_type` binding, verb-first function names, error envelope, JWT-via-auth-helper
- [Source: _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/prd.md#FR6-FR9, NFR9] — search-as-you-type, retry state preserving query, gradient poster placeholder, proxied-catalog latency
- [Source: _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/addendum.md#H2] — catalog API-key/proxy rationale; OQ#11 (TMDB licensing/fallback) unresolved
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#State Patterns] — Search empty / Search error / Poster missing copy (verbatim)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md#Components] — title-card + poster (gradient placeholder) specs
- [Source: _bmad-output/implementation-artifacts/1-2-create-an-account-and-sign-in-google-free.md] — migration mechanism, deny-by-default grant surgery, envelope, single client
- [Source: _bmad-output/implementation-artifacts/1-3-themed-app-shell-with-bottom-navigation-dark-mode.md] — theme tokens, `Screen` primitive, warm-voice/a11y floor, testing posture
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — edge-runtime health/remote-import trap (now active in 1.4)
- [Source: supabase/functions/main/index.ts · supabase/volumes/api/kong.yml · supabase/docker-compose.yml] — router, `/functions/v1/*` route, functions-service env
- [Web: https://developer.themoviedb.org/reference/search-multi · https://developer.themoviedb.org/docs/image-basics] — TMDB search + image base URL (verify at implementation time)
- [Web: https://supabase.com/docs/guides/functions/auth — `auth.getUser()` in an Edge Function] (verify against the self-hosted edge-runtime at implementation time)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `pnpm run supabase:migrate` (applied twice — idempotent, `catalog_cache already exists, skipping` on the second run).
- DB verification: RLS enabled, **zero** anon/authenticated grants, zero policies, composite PK `(tmdb_id, media_type)`, media_type check constraint.
- Edge function manual verify against the live stack (`http://localhost:8000`):
  - Unauthenticated `POST /functions/v1/catalog-search` → **401** `{"message":"Sign in to search the catalog.","code":"unauthorized","details":null}`.
  - Signed-in search `"the matrix"` → **200**, 20 real TMDB results with posters (The Matrix 1999, …).
  - `catalog_cache` populated with 20 rows carrying `fetched_at`.
  - A second identical search left `max(fetched_at)` **unchanged** → the TTL read path skipped re-writing fresh rows (genuine read + conditional write, AC2).
  - Empty query → **400** `{"message":"Type something to search for.","code":"bad_request","details":null}`.
- `npx tsc --noEmit` clean; `npx expo export --platform android` bundles (3.2MB hbc).
- `pnpm run verify` green, including the two new guardrails.

### Completion Notes List

- **All 6 ACs satisfied and verified end-to-end.** The proxy boundary (AD-6) is real: the client calls `catalog-search` via `supabase.functions.invoke` and never holds the TMDB key; the function verifies the JWT in-function (envelope, not the router's `{msg}`), holds the key, is the sole TMDB caller, and reads/writes `catalog_cache` with a 7-day TTL keyed by `(tmdb_id, media_type)`.
- **Edge-runtime health trap cleared.** Recreating the `functions` container warmed the deno cache for the new `jsr:@supabase/supabase-js@2` remote import; the container reports healthy and the worker boots and serves. No stub was needed.
- **Deny-by-default confirmed** for `catalog_cache` (RLS on, no anon/authenticated grants) — the function uses the service-role client for cache access.
- **⚠️ Corrected a misplaced-secret defect from the prior commit (`ceee5a7`).** `TMDB_ACCESS_TOKEN`/`TMDB_API_KEY` had been added to `app/.env.example` (and the real values were in `app/.env`) — directly against Task 3 / AD-6, which require the key server-side only. They were **not** `EXPO_PUBLIC_`-prefixed, so Expo never bundled them (nothing leaked), but the location was wrong and the key was useless to the function there (the function reads env from the *functions container*, sourced from `supabase/.env`). Fix: relocated the real values to `supabase/.env`, added a placeholder to the tracked `supabase/.env.example`, wired `${TMDB_ACCESS_TOKEN}`/`${TMDB_API_KEY}` into the `functions` service in `docker-compose.yml`, and replaced the `app/.env*` TMDB lines with a "do not put the key here" note.
- **Poster placeholder — no gradient dependency added.** DESIGN calls for a cool→dark gradient placeholder, but no gradient library is installed and adding `expo-linear-gradient` (a native module) is beyond this story's declared dependencies (a deliberate decision, not a drive-by — see `app/AGENTS.md`). Implemented an equivalent core-RN fallback: a translucent `cool` wash over `surfaceSunken`, shown while loading, when `posterPath` is null, and on image load error — satisfying FR9 (never a broken image). **Flag for Alex:** if you want the true linear gradient, approve `expo install expo-linear-gradient` and it's a small swap in `Poster`.
- **Scope wall (AC5) honored:** result rows are inert (no navigation, no logging) — title-detail is Epic 2, logging is 1.5.
- **Testing posture unchanged:** no framework stood up. The two new `smoke-check.mjs` guardrails (unauthenticated `catalog-search` → 401 envelope; anonymous `catalog_cache` read denied) are durable, read-only, and keep `pnpm run verify` green.
- **Open question still open (not this story's to close):** OQ#11 (TMDB licensing / fallback) from the PRD addendum remains unresolved — out of scope for 1.4.

### File List

**New:**
- `supabase/migrations/0002_catalog_cache.sql`
- `supabase/functions/catalog-search/index.ts`
- `app/data/catalog.ts`

**Modified:**
- `app/features/add/AddScreen.tsx` (placeholder → debounced search UI)
- `supabase/docker-compose.yml` (`TMDB_ACCESS_TOKEN`/`TMDB_API_KEY` into the `functions` service)
- `supabase/.env.example` (tracked TMDB placeholder + guidance)
- `supabase/.env` (gitignored — real TMDB values relocated here)
- `app/.env.example` (removed misplaced TMDB lines; added "key is server-side only" note)
- `app/.env` (gitignored — removed the misplaced TMDB values, left a pointer)
- `scripts/smoke-check.mjs` (two new guardrails: proxy-rejects-unsigned, `catalog_cache` deny-by-default)
- `supabase/functions/README.md` (`catalog-search` marked landed; auth/secrets notes)
- `supabase/README.md` (TMDB key dev-setup section)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (`1-4-…` → in-progress → review)

### Change Log

- 2026-07-04 — Story 1.4 implemented: `catalog_cache` migration (deny-by-default), `catalog-search` Edge Function (in-function JWT verify, TMDB proxy, TTL cache), client `catalog.ts` data module + debounced search UI in the Add tab. Relocated the TMDB key from `app/.env*` to server-side `supabase/.env` (AD-6 fix). Extended `smoke-check.mjs`. Status → review.
