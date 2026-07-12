---
baseline_commit: 5d750bce66fbd7093ac7e33a01b14c0e93d006e2
---

# Story 2.2: Title detail for films and shows

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to open a title and see its details — seasons and episodes for shows —
so that I know exactly what I'm tracking or logging.

## Acceptance Criteria

1. **Given** a search result, **when** I tap it, **then** a title detail view opens showing poster, synopsis, and year via a new `catalog-title` Edge Function (FR7, ARCH-12). [Source: epics.md#Story-2.2]
2. **Given** a show, **when** detail loads, **then** its seasons and their episodes are listed; **given** a film, only title-level metadata shows (FR7). [Source: epics.md#Story-2.2]
3. **Given** `catalog-title`, **when** it fetches, **then** it proxies TMDB server-side, reads/writes `catalog_cache` with a TTL as the sole caller [of this function's data], and verifies the GoTrue JWT (ARCH-6, ARCH-12). [Source: epics.md#Story-2.2]
4. **Given** a detail fetch error, **when** it fails, **then** cached basics show if available, else "We couldn't load this right now." with retry — never a blank screen (FR8, UX-DR16). [Source: epics.md#Story-2.2]
5. **Given** the title-card pattern, **when** a title renders in any list, **then** it is poster-left with title (Fraunces) / meta / star row / mood chips right, on `surface-raised`, tapping into detail (UX-DR6). [Source: epics.md#Story-2.2]

## Scope wall — read before writing any code

This story is **display-only**. It shows what a title *is* (poster, synopsis, year, seasons/episodes). It does **not** add:
- "I'm watching this" / tracking → Story 3.1
- ❤️ Add to Watchlist → Story 2.3 (its AC explicitly says the affordance must be reachable "from search results and title detail" — leave a visual gap/TODO comment where that button will land, but do not build it here)
- Rate / react / mood chips / notes → Epic 3
- Notify bell → Story 6.1
- Bulk-log sheet on a season row → Story 3.4

Building any of the above now is scope creep the checklist explicitly forbids. If the detail screen feels sparse without them, that's correct — later stories fill it in.

**AC5's "star row / mood chips"** describes the *title-card* component (the same list-row pattern used in search results, watchlist, diary, etc.) — not a new UI element for the detail screen itself. Ratings/moods don't exist as data yet (Epic 3), so the extracted card should render its star-row/mood-chip slots conditionally (omit or leave empty when a title has no watch/rating yet) rather than inventing placeholder data.

## Tasks / Subtasks

- [x] Task 1: Build `catalog-title` Edge Function (AC: #1, #3, #4)
  - [x] Create `supabase/functions/catalog-title/index.ts`, copying the **exact** structural pattern of `supabase/functions/catalog-search/index.ts`: in-function JWT verify (same 401 `{message, code, details}` envelope, same "sign in to..." style copy), TMDB timeout via `AbortSignal.timeout`, CORS headers, service-role client for `catalog_cache`.
  - [x] Accept `{ tmdbId: number, mediaType: 'movie' | 'tv' }` in the POST body (mirrors `CatalogResult`'s identity fields — do not invent a synonym per ARCH-10).
  - [x] Fetch TMDB `/movie/{id}` or `/tv/{id}` using the same `TMDB_ACCESS_TOKEN`/`TMDB_API_KEY` fallback pattern as `catalog-search` (generalized into a `tmdbRequest`/`tmdbGet` helper).
  - [x] For `tv`, additionally fetch each season's episode list via a separate `/tv/{id}/season/{season_number}` call per season, in parallel with `Promise.all`, each bounded by `TMDB_TIMEOUT_MS`. A single failed season call is logged and skipped, never blocking the others.
  - [x] Normalize into a detail payload: `{ tmdbId, mediaType, title, year, posterPath, synopsis, seasons? }` where `seasons` (tv only) is `[{ seasonNumber, name, episodes: [{ episodeNumber, name, airDate }] }]`, camelCase to match `CatalogResult`.
  - [x] Read/write `catalog_cache` keyed by `(tmdb_id, media_type)` — same TTL constant. Thin/rich gotcha handled: `isRichDetail` (checks `synopsis` presence) gates a cache-hit, so a fresh *thin* row is NOT treated as a detail hit; the rich payload is always upserted back.
  - [x] On TMDB failure: if a cached row exists (thin or rich), return it with a `soft` flag for "cached basics" (AC4); only return the hard 502 envelope when nothing is cached.
  - [x] Reuse the same CORS/error-envelope/JSON-header constants pattern inline (shared-types not mounted into the functions container).

- [x] Task 2: Add the client data function (AC: #1, #3, #4)
  - [x] Added `fetchTitleDetail(tmdbId, mediaType)` to `app/data/catalog.ts`, reusing the existing `CatalogError`/envelope-parsing (no duplication).
  - [x] Mirrors `searchCatalog` exactly: `supabase.functions.invoke('catalog-title', ...)`, the same `INVOKE_TIMEOUT_MS` race, the same `isErrorEnvelope` parsing.
  - [x] Defined `TitleDetail` (+ `SeasonDetail`/`EpisodeDetail`/`TitleDetailResult`) interfaces alongside `CatalogResult`.

- [x] Task 3: Add navigation to a title detail screen (AC: #1)
  - [x] Installed `@react-navigation/native-stack` via `expo install` (SDK-56-aligned `^7.17.9`); `react-native-screens` was already present.
  - [x] Wrapped only the `Add` tab in a new `createNativeStackNavigator` (`app/navigation/AddStack.tsx`): `AddSearch` (AddScreen) initial route, `TitleDetail` pushed. Other tabs left stack-free.
  - [x] Created `app/features/title-detail/TitleDetailScreen.tsx`.
  - [x] Wired the (previously inert) `TitleCard` row tap to `navigation.navigate('TitleDetail', { tmdbId, mediaType })`; log-button behavior unchanged.

- [x] Task 4: Build the title detail screen UI (AC: #1, #2, #4)
  - [x] Loading state: `ActivityIndicator` while `catalog-title` resolves.
  - [x] Loaded state: large `Poster` (reused, gradient placeholder), title (Fraunces hero), year/type meta, synopsis.
  - [x] TV-only: collapsible seasons list, each expanding to its episodes (name + air date). Films render no seasons section (AC2).
  - [x] Error triad per AC4: (a) `soft` cached-basics → renders cached payload with a "Showing saved info…" banner; (b) hard failure → verbatim `"We couldn't load this right now."` + "Try again" retry button.

- [x] Task 5: Extract the shared title-card component (AC: #5)
  - [x] Extracted `TitleCard` + `Poster` from `AddScreen.tsx` into `app/components/TitleCard.tsx` (self-contained, `useTheme` internally). `Poster` takes optional `width`/`height`/`glyphSize` so the detail screen reuses it at hero size.
  - [x] `AddScreen`'s log button, logged-state checkmark, and accessibility labels preserved; the row now also carries the tap-to-navigate `onPress` (nested Pressable — inner log button captures its own taps).
  - [x] Star-row / mood-chip and ❤️-watchlist slots left as commented gaps (no fabricated rating UI), per the scope wall.

- [~] Task 6: Verification pass (AC: all)
  - [~] Tap a film result → detail shows poster/synopsis/year, no seasons section. *(code path verified statically; on-device tap requires an emulator + live TMDB — see Completion Notes)*
  - [~] Tap a TV result → detail shows seasons + episodes. *(same: requires on-device run)*
  - [~] Soft-fail (server-side): after a title is cached, force TMDB to fail while Supabase stays reachable → cached basics show behind the "Showing saved info…" banner. *NOTE (code-review 2026-07-05): the cache is server-side only, so killing the **device** network does NOT hit this path — an offline device fails at the network layer and correctly shows the hard-error + retry state (never blank, per AC4). Cached-basics render only when the function reaches its cache but TMDB specifically fails.* *(soft-fail path implemented; requires on-device run)*
  - [~] Kill device network for any title → hard error copy + retry (never a blank screen). *(hard-fail path implemented; requires on-device run)*
  - [~] Confirm `AddScreen`'s log button and toast still work post-extraction. *(refactor preserves behavior; requires on-device run)*
  - [x] `npx tsc --noEmit` clean — **passed**. Also `npx expo export --platform android` bundles cleanly (native-stack resolves).

## Dev Notes

### `catalog-title` Edge Function — build directly on `catalog-search`'s pattern

`supabase/functions/catalog-search/index.ts` is the canonical reference — its own header comment says explicitly: *"This is the pattern 2.2 (catalog-title)... imitate."* Copy its structure wholesale:
- In-function JWT verify via `authedClient.auth.getUser()` — never rely on the global `VERIFY_JWT` router flag (same reasoning: the router's 401 body doesn't match the envelope shape).
- `TMDB_ACCESS_TOKEN` (preferred, Bearer) with `TMDB_API_KEY` (v3, query string) fallback — same env vars, already provisioned in `docker-compose.yml`, no new secrets needed.
- `TMDB_TIMEOUT_MS = 8000` bound via `AbortSignal.timeout` on every outbound TMDB call (including the per-season calls — see Task 1).
- Same inlined `ErrorEnvelope` interface (shared-types isn't mounted into the functions container).
- Deno.serve CORS preflight handling identical to `catalog-search`.
- No new file needed in `docker-compose.yml` or any router — Edge Runtime auto-routes by directory name under `supabase/functions/`, confirmed by the `main` service comment ("feature functions (catalog-search, …) land here"); `catalog-title/` just needs to exist alongside it.

[Source: supabase/functions/catalog-search/index.ts — read in full]
[Source: supabase/docker-compose.yml#functions service — TMDB env vars, volume mount, `--main-service` routing]

### `catalog_cache` — thin vs. rich payload gotcha (critical)

`0002_catalog_cache.sql`'s `payload jsonb` column holds whatever the writer put there — `catalog-search` (1.4) writes the **thin** `CatalogResult` shape (`tmdbId, mediaType, title, year, posterPath` — no synopsis, no seasons). `catalog-title` (this story) is the **only** writer of the rich detail shape. A row's mere existence + TTL freshness is *not* sufficient to answer a detail request — check that the cached payload actually has the detail fields (e.g. `synopsis` present) before serving it as a detail-cache-hit; otherwise always call TMDB and overwrite. This also matters for AC4's "cached basics" fallback: a thin row is still valid "cached basics" to show on a hard failure (poster/title/year), just not seasons/episodes — the UI should tolerate a partial payload gracefully rather than assuming full shape.

The table's own migration comment explicitly names this table as later "read by `catalog-title` (2.2)" — confirming this is the intended reuse, not a new table. **Do not create a second cache table.**

[Source: supabase/migrations/0002_catalog_cache.sql]

### TMDB API shape for seasons/episodes

TMDB's `/tv/{id}` response includes a `seasons` array with only summary fields (season number, episode count, air date) — it does **not** inline full episode lists. Episode-level detail requires one additional call per season: `/tv/{id}/season/{season_number}`. Fetch these in parallel (`Promise.all`) after the initial `/tv/{id}` call resolves and you know how many seasons exist. Bound each with the same `TMDB_TIMEOUT_MS` pattern as the primary call. This is new information not covered by any existing story — `catalog-search` only ever calls `/search/multi`, so there's no existing precedent for a multi-call fetch in this codebase; keep it simple (sequential-looking code via `Promise.all`, no retry/backoff — a single failed season call should not block the ones that succeeded, but also shouldn't silently omit a season without at least logging server-side).

### Navigation — a stack navigator does not exist yet (new dependency decision)

`app/navigation/AppShell.tsx` only wraps a `createBottomTabNavigator` (`@react-navigation/bottom-tabs` v7) inside one `NavigationContainer` — there is **no stack navigator anywhere in the app today**. Reaching a title detail screen from a tapped card requires introducing `@react-navigation/native-stack`, which is **not currently a dependency** (`app/package.json` has only `@react-navigation/bottom-tabs` and `@react-navigation/native`).

This is the same category of decision as 1.4's `expo-linear-gradient` addition (explicitly flagged and approved mid-review, not silently added) — install it via `expo install @react-navigation/native-stack` (never hand-edit the version in `package.json`; `app/AGENTS.md` requires SDK-56-aligned versions via the Expo CLI). Flag this addition explicitly in Completion Notes as a deliberate, story-scoped dependency addition.

Minimal shape: wrap at least the `Add` tab's screen component in its own stack (`Add` → `AddScreen` as the initial route, `TitleDetail` as a pushed route) rather than restructuring the whole `AppShell`. Do not add a stack to tabs that don't need one yet (Home/Diary/Feed/Profile can gain their own stacks in later stories that need detail navigation from those surfaces — e.g. 2.4's watchlist shelf on Home).

[Source: app/navigation/AppShell.tsx, app/navigation/BottomTabBar.tsx — read in full]
[Source: app/package.json — dependency list]
[Source: _bmad-output/implementation-artifacts/2-1-*.md — precedent for flagging new-dependency additions explicitly]

### Existing code this story extends (read before touching)

- **`app/features/add/AddScreen.tsx`** — **UPDATE**. Its `TitleCard` function's own comment says the row "stays inert (reserved for Epic 2's title-detail navigation)" — this story is that reservation being cashed in. Extract `TitleCard` and `Poster` into a shared component (Task 5) and wire the row's `onPress` to `navigation.navigate('TitleDetail', {...})`. Do not touch `handleLog`, the toast, or the debounce/search logic (2.1's scope, already verified/closed).
- **`app/data/catalog.ts`** — **UPDATE**. Add `fetchTitleDetail` + `TitleDetail` type alongside the existing `CatalogResult`/`searchCatalog`/`CatalogError`/`posterUrl`. This file's own header comment already says "Title-detail (2.2)... are later" — this story is that "later."
- **`supabase/functions/catalog-search/index.ts`** — **read-only reference**, not modified. Its header comment names `catalog-title` as the function that imitates its pattern — treat it as the spec.
- **`supabase/migrations/0002_catalog_cache.sql`** — **read-only**, no migration change needed (table already supports arbitrary `jsonb` payloads; the thin/rich distinction is handled in application code, not schema).
- **`app/navigation/AppShell.tsx`** — **UPDATE**. Introduce a stack wrapping the `Add` tab (see Navigation note above).

### Testing standards summary

No test framework exists in this repo as of Story 2.1 (`5d750bc` + 2.1's own verification). The done-bar remains: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, and a recorded manual verification pass (Task 6) in Completion Notes. Optionally append a read-only guardrail to `scripts/smoke-check.mjs` if there's something meaningful to assert (e.g. `catalog_cache`'s deny-by-default grants still hold) — mirrors how 1.5 added a `watches` guardrail there. Do not stand up a test framework as a drive-by within this story — same standing convention as every prior story (1.3–2.1).

### Project Structure Notes

- New: `supabase/functions/catalog-title/index.ts` (new Edge Function directory, sibling to `catalog-search/`).
- New: `app/features/title-detail/TitleDetailScreen.tsx` (new feature folder, following the established `app/features/<name>/` convention).
- New: `app/components/TitleCard.tsx` (extracted shared component — `app/components/` already holds `Screen.tsx` and `PlaceholderScreen.tsx`, so this is the established location for cross-feature UI).
- New dependency: `@react-navigation/native-stack` (install via `expo install`, not hand-edited).
- Updated: `app/features/add/AddScreen.tsx`, `app/data/catalog.ts`, `app/navigation/AppShell.tsx`.
- No new migration file — `catalog_cache` (0002) is reused as-is.

### Previous Story Intelligence

- **1.4** built `catalog-search` + `app/data/catalog.ts` + the original `AddScreen.tsx` — the foundation this story extends. Its Dev Notes explicitly scoped title-detail out ("Title-detail (2.2)... are later").
- **2.1** (verified/closed, no code changes) confirmed the current `AddScreen.tsx`/`catalog.ts` state is exactly as described above (baseline commit `5d750bc`), and explicitly flagged the `TitleCard`/`Poster` extraction as "a candidate for 2.2 rather than doing speculative extraction here" — this story is where that debt is paid.
- **No test framework exists** — restated in every story 1.3 through 2.1; do not be the story that adds one as a side effect.
- **Dependency additions require explicit flagging**, not silent `package.json` edits — established by 1.4's `expo-linear-gradient` approval and reinforced by `app/AGENTS.md`'s "a version bump is an architecture decision, not a drive-by." The `@react-navigation/native-stack` addition here follows the same convention.

### Git Intelligence Summary

Recent commits (`git log --oneline -6` at time of writing):
```
5d750bc feat: 1.6 ensure private local first
fdf0195 fix: 1.5 // code-review patches — scope the outbox per user, bound sync, gate the confirmation on commit
90e8ab1 feat: 1.5 // Log a watch, local-first, surviving a network drop
4e5112a docs: record code review findings for stories 1.2 and 1.3
bd11cc3 feat: enhance authentication flow and error handling in auth components
1220396 fix: add healthcheck for mail service
```
Pattern: each feature commit is followed by a dedicated `fix:` commit when review findings exist — expect the same if this story's code review surfaces patches.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2: Title detail for films and shows] — story statement, ACs, FR7/FR8/ARCH-12/UX-DR16/UX-DR6
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements Inventory] — FR7 (title detail incl. seasons/episodes), FR8 (retry/error), ARCH-12 (catalog-title binding)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md] — AD-6 (proxy boundary: client only calls `catalog-search`/`catalog-title`, never TMDB directly), ARCH-12/binding line ("Binds: `catalog-search`, `catalog-title` Edge Functions, `catalog_cache` table"), ARCH-10 (`tmdb_id`/`media_type` identity convention, no synonym columns), naming conventions (verb-first Edge Function names, camelCase client / snake_case DB)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/DESIGN.md#Components] — title-card pattern ("Horizontal card — poster left, title/meta/stars/mood right. surface-raised.")
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/EXPERIENCE.md] — "Any poster/card tap → Title detail" surface mapping; "Title-detail fetch error... cached basics... else 'We couldn't load this right now.' Retry. Never a blank screen."; review-rubric.md's note that a title-detail loading state and error-state triad were previously underspecified — treat both as required states regardless
- [Source: supabase/functions/catalog-search/index.ts] — the structural pattern this story's Edge Function imitates (explicitly named in that file's own header comment)
- [Source: app/data/catalog.ts] — `CatalogResult`, `CatalogError`, `posterUrl`, envelope-parsing pattern to extend
- [Source: app/features/add/AddScreen.tsx] — `TitleCard`/`Poster` to extract; the inert row-tap this story activates
- [Source: app/navigation/AppShell.tsx, app/navigation/BottomTabBar.tsx] — current tab-only navigation; no stack exists yet
- [Source: supabase/migrations/0002_catalog_cache.sql] — cache table this story reads/writes (no schema change)
- [Source: supabase/docker-compose.yml#functions] — TMDB env vars already provisioned, function auto-routing by directory
- [Source: _bmad-output/implementation-artifacts/2-1-full-search-experience.md] — extraction candidate flag, dependency-addition precedent, testing-posture confirmation
- [Source: app/AGENTS.md] — Expo SDK 56 pin; dependency/tooling changes are a deliberate decision, not a drive-by
- [Source: packages/shared-types/src/index.ts] — `ErrorEnvelope`/`isErrorEnvelope`, the shape both the new Edge Function and the client-side `fetchTitleDetail` must agree on (inlined server-side, imported client-side — same split `catalog-search`/`catalog.ts` already use)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, bmad-dev-story workflow)

### Debug Log References

- `npx tsc --noEmit` — clean (0 errors); `--listFiles` confirms all new/changed app files are in the compilation.
- `npx expo export --platform android` — bundles successfully (Android HBC ~3.3MB), confirming `@react-navigation/native-stack` resolves and Metro is happy with the new stack + extracted component.

### Completion Notes List

- **New dependency (deliberate, story-scoped):** `@react-navigation/native-stack@^7.17.9`, installed via `expo install` (SDK-56-aligned, not hand-edited) — the same explicit-flagging convention as 1.4's `expo-linear-gradient`. The app had no stack navigator before this story; only the `Add` tab gained one. `react-native-screens` (native-stack's peer) was already a dependency.
- **`catalog-title` Edge Function** built on `catalog-search`'s exact pattern: in-function GoTrue JWT verify → 401 envelope ("Sign in to view title details."), server-side TMDB key (Bearer token preferred, v3 api_key fallback), `AbortSignal.timeout(8000)` on every outbound call including per-season fetches, service-role `catalog_cache` client.
- **Thin/rich cache gotcha** handled explicitly: `isRichDetail()` requires the `synopsis` key before a cached row counts as a *detail* hit, so a fresh thin row written by `catalog-search` never short-circuits a detail request; the rich payload is always upserted back so later reads + the AC4 fallback get the full shape.
- **AC4 soft-fail:** on a TMDB error with *any* cached row (thin or rich), the function returns it with `soft: true`; the screen renders those "cached basics" behind a "Showing saved info…" banner. With nothing cached it returns the verbatim `"We couldn't load this right now."` + retry. A thin/film-shaped cached payload with no `seasons` simply omits the seasons section — the UI tolerates the partial shape.
- **Shared `TitleCard`/`Poster`** extracted to `app/components/TitleCard.tsx` (2.1's flagged "candidate for 2.2"). `Poster` is parameterized by size so the detail screen reuses it at hero scale. `onLog`/`onPress` are optional so future read-only surfaces (2.4 watchlist shelf) can drop the log button. Star-row / mood-chip and ❤️-watchlist slots are commented gaps only — no fabricated data (scope wall).
- **Manual on-device verification (Task 6) NOT run here:** the five interactive checks (film tap, tv tap, network-kill cached, network-kill uncached, post-extraction log/toast regression) require a running Android emulator/device with live TMDB, which this non-interactive dev environment can't drive. All corresponding code paths are implemented and statically type-checked; the automated gates (`tsc`, Android export) pass. **Reviewer/user should run those five taps on a device before marking `done`.**
- No migration change (`catalog_cache` 0002 reused as-is) and no `smoke-check.mjs` guardrail added — the table's grants/schema are unchanged, so there was nothing new + meaningful to assert.

### File List

**New**
- `supabase/functions/catalog-title/index.ts` — the title-detail Edge Function.
- `app/features/title-detail/TitleDetailScreen.tsx` — the detail screen (loading/loaded/error triad, seasons+episodes).
- `app/components/TitleCard.tsx` — extracted shared `TitleCard` + `Poster`.
- `app/navigation/AddStack.tsx` — Add-tab native-stack (AddSearch → TitleDetail).

**Modified**
- `app/data/catalog.ts` — added `TitleDetail`/`SeasonDetail`/`EpisodeDetail`/`TitleDetailResult` types + `fetchTitleDetail`.
- `app/features/add/AddScreen.tsx` — use shared `TitleCard`, wire row tap → detail navigation, drop the now-extracted private `TitleCard`/`Poster` + their styles.
- `app/navigation/AppShell.tsx` — `Add` tab now renders `AddStack` instead of `AddScreen` directly.
- `app/package.json`, `pnpm-lock.yaml` — `@react-navigation/native-stack` dependency.

## Change Log

- 2026-07-05 — Story 2.2 implemented. Built `catalog-title` Edge Function (JWT verify, server-side TMDB proxy, per-season episode fetch, thin/rich cache handling, AC4 soft-fail); added `fetchTitleDetail` + detail types to `catalog.ts`; introduced the first stack navigator (`AddStack`, native-stack dep added via `expo install`); built `TitleDetailScreen` (loading/loaded/error states, collapsible seasons); extracted shared `TitleCard`/`Poster` and wired the previously-inert card tap to navigate. `tsc --noEmit` clean, Android bundle exports. On-device manual verification (5 interactive taps) outstanding — flagged for reviewer. Status → review.
- 2026-07-05 — Story 2.2 drafted. Full read of `catalog-search`'s Edge Function (the explicit pattern to imitate), `catalog_cache`'s migration (thin/rich payload gotcha identified), `AddScreen.tsx`/`catalog.ts` (extraction targets), and `AppShell.tsx` (no stack navigator exists — new dependency required). Scope wall drawn against 2.3 (Watchlist), 3.1 (tracking), Epic 3 (rate/react), 6.1 (notify) to prevent creep. Status → ready-for-dev.

## Review Findings

_Code review 2026-07-05 (bmad-code-review, 3 layers: Blind Hunter / Edge Case Hunter / Acceptance Auditor). 3 decision-needed, 4 patch, 1 deferred, 1 dismissed. All 5 ACs substantively satisfied; scope wall respected._

- [x] [Review][Patch] (resolved Decision→1A) Partial season fetch poisoned the 7-day cache. **Fixed:** `fetchDetailFromTmdb` now returns `{ detail, complete }` (complete = every season fetched); the handler skips the `catalog_cache` upsert when `complete` is false, so a dropped season self-heals on the next request instead of being served for the TTL [supabase/functions/catalog-title/index.ts].
- [x] [Review][Patch] (resolved Decision→2A) AC4 "cached basics offline" unreachable on-device; Task 6 note misdescribed it. **Fixed:** corrected the Task 6 verification note — offline correctly shows hard-error + retry (never blank); cached-basics render only when the function reaches its cache but TMDB fails [this story file, Task 6].
- [x] [Review][Patch] (resolved Decision→3A) TMDB "Specials" (season 0) unsorted. **Fixed:** seasons now `.sort((a,b) => a.seasonNumber - b.seasonNumber)` after the null-filter [supabase/functions/catalog-title/index.ts].
- [x] [Review][Patch] Client invoke timeout could fire before the server finished a large TV show. **Fixed:** dedicated `DETAIL_INVOKE_TIMEOUT_MS = 20000` for the detail race (search stays 10s) [app/data/catalog.ts].
- [x] [Review][Patch] Unbounded parallel per-season TMDB fan-out. **Fixed:** added `mapWithConcurrency` bounding the per-season calls to `MAX_SEASON_CONCURRENCY = 6` [supabase/functions/catalog-title/index.ts].
- [x] [Review][Patch] No unmount guard in the detail screen `load`. **Fixed:** added a `mountedRef` that short-circuits the post-await `setState` calls after the screen is popped [app/features/title-detail/TitleDetailScreen.tsx].
- [x] [Review][Patch] `rejectDetailAfter` timer never cleared. **Fixed:** inlined the timer in `fetchTitleDetail` with `clearTimeout` in a `finally`; removed the leaking helper (searchCatalog's pre-existing idiom left as-is — 1.4 scope) [app/data/catalog.ts].
- [x] [Review][Defer] Grouped accessibility collapses the log button for screen readers — outer card is `accessible` with a combined label, so the nested log `Pressable` loses its distinct action; pre-existing since the 1.5 `TitleCard` [app/components/TitleCard.tsx] — deferred, pre-existing
