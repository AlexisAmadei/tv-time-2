---
baseline_commit: 5d750bce66fbd7093ac7e33a01b14c0e93d006e2
---

# Story 2.3: Save a title to the Watchlist

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to ❤️ any title to a watchlist for later,
so that I can trust the app to remember what I want to watch.

## Acceptance Criteria

1. **Given** a title from search or detail, **when** I tap ❤️, **then** a `watchlist_items` row is created (uuid PK, `user_id` FK, `tmdb_id`, `media_type`, `created_at`) with an owner-only RLS policy and nullable `visibility` (FR25, ARCH-5, ARCH-10). [Source: epics.md#Story-2.3]
2. **Given** an already-watchlisted title, **when** I tap ❤️ again, **then** it toggles off (removes) — idempotent, never duplicating an entry. [Source: epics.md#Story-2.3]
3. **Given** the add affordance, **when** shown, **then** it is reachable tap-to-act (no long-press) from search results and title detail (FR25, FR44). [Source: epics.md#Story-2.3]
4. **Given** a successful add, **when** it confirms, **then** warm copy acknowledges it ("We'll tell you when it's time.") with one emoji max (UX-DR20). [Source: epics.md#Story-2.3]

## Scope wall — read before writing any code

This story adds **one thing**: the ability to ❤️ a title onto a persisted watchlist and un-❤️ it, from **search results and title detail**. That's the whole surface. It does **not** add:

- The **Home watchlist shelf** → Story 2.4 (this story owns the table + the add/remove path + the ❤️ affordance; 2.4 reads this data into a Home shelf, and Epic 4's Profile surfaces the same data — do **not** build any shelf or Home/Profile change here).
- Tracking / "I'm watching this" / Up Next → Story 3.1 (watchlist ≠ tracking; a watchlist item is a *saved-for-later*, not a tracked show with a pointer).
- Rating / mood / note → Epic 3.
- Notify bell → Story 6.1. (The AC4 copy "We'll tell you when it's time." is *aspirational warm voice*, not a promise that notifications exist yet — do not wire any notification behavior.)
- Shared lists / feed / per-entry visibility UI → Epic 5. The `visibility` column ships (AC1) but is **created nullable and never written** by this story, exactly as `watches.visibility` did in 1.5/1.6.
- Any offline/outbox behavior. **Watchlist is a direct PostgREST write, not a local-first outbox write** — see the "NOT the outbox" note in Dev Notes. The `expo-sqlite` outbox is the watch-commit path only (AD-4/ARCH-8). Do not route watchlist through `pending_watches` or the sync worker.

If the detail screen or a search row feels like it wants a shelf or a tracked state after this — that's correct; later stories fill it in.

## Tasks / Subtasks

- [ ] Task 1: Migration — `watchlist_items` table with owner-only RLS (AC: #1, #2)
  - [ ] Create `supabase/migrations/0005_watchlist_items.sql`, copying the **exact** structural pattern of `0003_watches.sql` (read it first): header comment explaining what the table IS / IS NOT, `create table if not exists`, RLS enabled the moment the table is created, the `revoke all … then grant least-privilege` boilerplate, ON DELETE CASCADE on the `auth.users` FK. Keep it idempotent/re-runnable (`pnpm run supabase:migrate` re-applies the whole folder — there is still no migration-tracking table).
  - [ ] Columns: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade` (AD-8/GDPR), `tmdb_id integer not null`, `media_type text not null check (media_type in ('movie','tv'))`, `created_at timestamptz not null default now()`, and `visibility text check (visibility is null or visibility in ('private','shared'))` — nullable, never written by this story (mirror `watches.visibility`'s final shape from 0003+0004; since this is a fresh table, put the CHECK inline in the create rather than a later guarded `ADD CONSTRAINT`).
  - [ ] **Idempotent uniqueness (AC2, the core of "never duplicating"):** add `create unique index if not exists watchlist_items_owner_title_idx on public.watchlist_items (user_id, tmdb_id, media_type);`. This is what makes an add upsertable and a re-tap-to-remove unambiguous — the DB, not the client, guarantees at-most-one row per (owner, title).
  - [ ] RLS: `enable row level security`, then `drop policy if exists … / create policy …` for **select / insert / delete**, each `using`/`with check` on `user_id = auth.uid()`. **No update policy** — this story has no field to update (visibility isn't written until Epic 5), so keep it least-privilege; a later story ALTERs when it needs update. Do **not** add any follower/`effective_visibility` OR-branch (same reasoning as 0003/0004: `follows` doesn't exist; that's Epic 5's ALTER).
  - [ ] Grants: `revoke all on public.watchlist_items from anon, authenticated;` then `grant select, insert, delete on public.watchlist_items to authenticated;` (service_role untouched). Anon gets nothing — deny-by-default. This is what the generalized smoke-check audit (check 8) will verify automatically.

- [ ] Task 2: Client data module — `app/data/watchlist.ts` (AC: #1, #2)
  - [ ] New file mirroring `app/data/watchLog.ts`'s conventions (session guard, `${mediaType}:${tmdbId}` key via a shared `watchlistKey`, best-effort timeout-bounded server reads). **Reuse `watchKey`'s exact key shape** so a caller can compose "logged" and "watchlisted" sets without a second convention — either import `watchKey` from `watchLog.ts` or define an identical `watchlistKey`; do not invent a different separator.
  - [ ] `addToWatchlist(tmdbId, mediaType)`: `supabase.from('watchlist_items').upsert({ user_id, tmdb_id, media_type }, { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true })`. Upsert-with-ignore (not a bare insert) makes a double-add idempotent even under a racing double-tap — the unique index backs it. Get `user_id` from `supabase.auth.getSession()` and throw if absent (same guard as `logWatch`).
  - [ ] `removeFromWatchlist(tmdbId, mediaType)`: `supabase.from('watchlist_items').delete().match({ user_id, tmdb_id, media_type })`. Deleting a non-existent row is a no-op success (idempotent removal, AC2).
  - [ ] `getWatchlistKeys(items)`: mirror `getLoggedKeys` **exactly** — session guard, `.in('tmdb_id', ids)` bounded by an `AbortController` + timeout, then **narrow back down to the exact `(tmdbId, mediaType)` pairs requested** (the same `.in('tmdb_id', …)` cross-media-type footgun `getLoggedKeys` documents — a movie and a show can share a numeric tmdb_id). Returns a `Set<string>` of watchlisted keys. Best-effort: a failed/hung query degrades to an empty set, never throws.
  - [ ] **No outbox, no `getDb()`, no `triggerSync`.** This module talks straight to PostgREST. (Contrast `watchLog.ts`, which writes `pending_watches` first — that discipline is watch-commit-only, AD-4.)

- [ ] Task 3: Add the ❤️ affordance to the shared `TitleCard` (AC: #2, #3)
  - [ ] In `app/components/TitleCard.tsx`, cash in the `TODO(2.3)` at the marked spot (currently line ~136, "❤️ Add-to-Watchlist button lands to the left of the log button"). Add optional props `onToggleWatchlist?: (item: CatalogResult) => void` and `watchlisted?: boolean` (default false) — optional so read-only surfaces (2.4's shelf) can omit them, matching how `onLog`/`onPress` are optional.
  - [ ] Render the ❤️ as its own `Pressable` hit target (its own 44×44, `hitSlop`, `alignSelf: 'center'`), placed **to the left of** the log button, only when `onToggleWatchlist` is provided. Use `Ionicons` `heart` (filled, `watchlisted`) / `heart-outline` (empty) — the same filled/outline pattern the log checkmark already uses. **Color:** use `theme.colors.primary` (magenta/coral). Do **not** use gold — DESIGN.md/UX-DR1 reserves gold strictly for memory/identity moments (stars, notify/caught-up), and a watchlist heart is neither.
  - [ ] Accessibility (UX-DR23/NFR7): `accessibilityRole="button"`, and a state-carrying label — e.g. `watchlisted ? 'Remove {title} from watchlist' : 'Add {title} to watchlist'`. The heart is inside the outer `accessible` card; note the pre-existing deferred finding (2.2 Review) that the outer card's grouped `accessible` collapses nested buttons for screen readers — you are adding a *second* nested action, so at minimum give it a distinct, unambiguous label. (A fuller fix — restructuring the card's a11y grouping — is out of scope; do not regress it further, and a one-line note in Completion Notes is enough.)
  - [ ] Keep the nested-Pressable capture pattern the log button already uses so tapping ❤️ never also triggers the card's `onPress` (navigate-to-detail).

- [ ] Task 4: Wire ❤️ into search results — `AddScreen` (AC: #2, #3, #4)
  - [ ] Add a `watchlistKeys` state `Set<string>` alongside the existing `loggedKeys`. After a search resolves, kick a **non-blocking** `getWatchlistKeys(found)` exactly like the existing `getLoggedKeys(found)` call (same superseded-request guard via `requestSeq`, same `.catch(() => {})` best-effort) — never gate the results list on it (FR14 discipline).
  - [ ] `handleToggleWatchlist(item)`: **optimistic** flip — update `watchlistKeys` immediately (add or remove the key), then call `addToWatchlist`/`removeFromWatchlist`; on rejection, roll the key back and show the failure copy. This mirrors how `handleLog` optimistically adds to `loggedKeys`. Choose add vs remove from the current key membership.
  - [ ] On a successful **add**, show the existing bottom toast via `showToast` with the AC4 copy `COPY_WATCHLISTED = "We'll tell you when it's time."`. On **remove**, do not show the add copy — either show nothing or a neutral "Removed from watchlist." (keep it quiet; AC4 only specifies the add confirmation). On failure, `COPY_WATCHLIST_FAILED = "Couldn't save that — try again."` (reuse the existing failure-copy tone).
  - [ ] Pass `onToggleWatchlist={handleToggleWatchlist}` and `watchlisted={watchlistKeys.has(watchKey(item.tmdbId, item.mediaType))}` into each `TitleCard`. Do not touch the debounce/search/log logic (2.1/1.5 scope, closed).

- [ ] Task 5: Wire ❤️ into title detail — `TitleDetailScreen` (AC: #2, #3, #4)
  - [ ] Cash in the `TODO(2.3)` in the hero block (currently ~line 151). Add a ❤️ button in the `heroText` area (or beside the meta) — same `Ionicons heart`/`heart-outline` + primary color + state-carrying label.
  - [ ] Local state `watchlisted: boolean`; on the loaded detail, best-effort `getWatchlistKeys([{ tmdbId, mediaType }])` to set the initial heart state (guard with the existing `mountedRef` so a pop mid-fetch doesn't `setState`). If that lookup fails, default to empty heart — acceptable degradation.
  - [ ] Toggle handler: optimistic flip + `addToWatchlist`/`removeFromWatchlist`, roll back on failure. The detail screen has **no toast infrastructure today** — keep the confirmation minimal: a small inline `Text` with `accessibilityLiveRegion="polite"` showing the AC4 copy on add (auto-hiding after a few seconds), OR reuse a tiny transient view. **Do NOT refactor AddScreen's animated toast into a shared component as part of this story** — a shared `Toast` extraction is a tempting but separate refactor (flag it in Completion Notes as a candidate for a later story, the same way `TitleCard` was flagged in 2.1). Keep detail's confirmation lightweight and self-contained.
  - [ ] The heart must be reachable even on the AC4 *soft-fail cached-basics* render (the `detail` object still carries `tmdbId`/`mediaType`), so a user can ❤️ a title whose fresh detail didn't load. It must NOT render in the hard-error state (there's no `detail` there).

- [ ] Task 6: Verification pass (AC: all)
  - [ ] `npx tsc --noEmit` clean, and `npx expo export --platform android` bundles (the standing automated gates — see Testing Standards). Both are runnable in this environment; run them.
  - [ ] `node scripts/smoke-check.mjs` passes — its generalized audit (check 8) automatically asserts the new `watchlist_items` table has RLS enabled and grants nothing to anon. If the migration is missing a policy or leaks an anon grant, this fails here with no script edit. (Requires the local stack up: `cd supabase && docker compose up -d`.)
  - [ ] *(Optional, mirrors the 1.5 `watches` guardrail convention)* add a targeted check to `scripts/smoke-check.mjs`: authenticated user A upserts a `watchlist_items` row, user B reads it by id → 200 / 0 rows (cross-user wall), reusing the check-9 `getOrCreateSession` helper. Only add it if it's genuinely meaningful beyond check 8's generalized audit; do not stand up a test framework.
  - [ ] Manual on-device (flag as outstanding if no emulator available, per every prior story): tap ❤️ on a search result → heart fills + "We'll tell you when it's time." toast; tap again → heart empties, no dup; kill/relaunch app → heart state persists (proves the server write, not just optimistic UI); repeat from title detail; confirm ❤️ tap never navigates into detail (nested-capture holds); confirm the log checkmark still works post-change.

## Dev Notes

### The single most important architectural call: watchlist is NOT the outbox

`app/data/watchLog.ts` writes to the local `expo-sqlite` `pending_watches` table *before* any network call, and its promise resolves off that local write. **Do not copy that here.** That local-first durability is the *watch-commit* invariant (AD-4/ARCH-8): "the only durable local write path… other reads use TanStack Query's disposable persisted cache." A watchlist add/remove is an ordinary owner-scoped write — Story 2.3's ACs contain **no** offline/survives-a-network-drop requirement (contrast 1.5's AC2, which explicitly demanded it). So `watchlist.ts` calls PostgREST directly via the one `supabase` client, exactly like `getLoggedKeys`'s server branch does.

Optimistic UI (flip the heart, then write, roll back on failure) gives the *feel* of instant without the outbox machinery — and is the honest tradeoff: if the write fails, the heart flips back rather than lying that it saved. This matches `handleLog`'s existing optimistic `loggedKeys` update.

> Note: TanStack Query is named in the architecture but is **not wired into this repo yet** (`grep` for it returns nothing). Do not introduce it as a drive-by here — follow the established direct-`supabase.from()` read idiom (`getLoggedKeys`) that the codebase actually uses today. A TanStack adoption is an architecture decision for a later story, not this one.

[Source: app/data/watchLog.ts — the outbox path this story deliberately does NOT reuse]
[Source: app/data/catalog.ts, app/data/db.ts — the "ONE client" / "ONE db" discipline and the direct-supabase read idiom]
[Source: _bmad-output/planning-artifacts/epics.md#Requirements Inventory — ARCH-8 (outbox = watch commit only), FR25]

### The migration — build directly on `0003_watches.sql`

`0003_watches.sql` is the canonical reference for an owner-scoped table with nullable visibility. Read it in full and mirror it. The load-bearing details every prior migration repeats:

- **RLS the instant the table exists** — deny-by-default (AD-1). A table with no policy is not "open by accident later"; it's created locked.
- **The revoke-then-grant gotcha (repeated verbatim in every migration):** the Supabase base image auto-grants ALL privileges on every new public table to `anon` + `authenticated`. You must `revoke all … from anon, authenticated` and then grant back only what's needed. Skip this and the smoke-check's anon-grant audit (check 8) fails.
- **ON DELETE CASCADE on the `auth.users` FK** (AD-8) so Epic 7's `delete-my-account` unwinds structurally, never via a hand-maintained loop.
- **Idempotent / re-runnable** (`create table if not exists`, `create unique index if not exists`, `drop policy if exists` then `create policy`) — there's still no migration runner; `pnpm run supabase:migrate` re-applies the whole `migrations/` folder each time.
- **snake_case DB, camelCase TS** (ARCH-10). Identity is `tmdb_id` + `media_type` — no local titles table, no synonym columns, no FK to a catalog entity (a watchlist item references a title by *value*, same as `watches`).

The one thing `watches` does **not** have that you need: the `unique (user_id, tmdb_id, media_type)` index. `watches` deliberately allows many rows per title (rewatch is legitimate, AD-3). Watchlist is the opposite — at most one entry per title per user (AC2). That unique index is the schema-level guarantee of idempotency; the client's upsert/delete leans on it.

[Source: supabase/migrations/0003_watches.sql — table/RLS/grants pattern to mirror]
[Source: supabase/migrations/0004_visibility.sql — the `visibility in ('private','shared')` CHECK domain + why no RLS OR-branch is wired until Epic 5]
[Source: supabase/migrations/0001_profiles.sql — CHECK-constraint + unique-index idioms]

### Where the ❤️ lands — the TODOs are already placed

Both target files carry an explicit `TODO(2.3)` marking exactly where the button goes — 2.2 left them deliberately:
- `app/components/TitleCard.tsx` ~line 136: *"❤️ Add-to-Watchlist button lands to the left of the log button, reachable from both search results and title detail."*
- `app/features/title-detail/TitleDetailScreen.tsx` ~line 151: *"❤️ Add-to-Watchlist button lands here, reachable from both search results and title detail."*

Because `TitleCard` is the shared component (extracted in 2.2 for exactly this kind of reuse), adding the affordance there wires **search results** in one move; the detail screen gets its own copy of the button (it doesn't render a `TitleCard`, it renders a bespoke hero). Both must reach the same `watchlist.ts` functions.

**Color discipline (UX-DR1, hard rule):** gold (`theme.colors.gold`) is reserved for memory/identity moments — stars, notify bell, caught-up. A watchlist heart is neither; use `theme.colors.primary`. Reviewers will flag a gold heart.

[Source: app/components/TitleCard.tsx — the shared card, its optional-prop pattern (`onLog`/`onPress`/`logged`), the nested-Pressable tap-capture, and the placed TODO]
[Source: app/features/title-detail/TitleDetailScreen.tsx — the hero block, `mountedRef` guard, soft-fail render, and the placed TODO]
[Source: app/features/add/AddScreen.tsx — `loggedKeys` state, the non-blocking `getLoggedKeys` post-search pattern, `handleLog`'s optimism, and `showToast`]

### Existing code this story extends (read before touching)

- **`supabase/migrations/`** — **NEW** file `0005_watchlist_items.sql`. No change to existing migrations.
- **`app/data/watchlist.ts`** — **NEW** module. Direct-PostgREST, mirrors `watchLog.ts`'s guards/key-shape but not its outbox.
- **`app/components/TitleCard.tsx`** — **UPDATE**. Add the two optional props + the ❤️ button at the TODO. Do not change the existing log button, poster, or navigation behavior.
- **`app/features/add/AddScreen.tsx`** — **UPDATE**. Add `watchlistKeys` state + `getWatchlistKeys` post-search + `handleToggleWatchlist` + pass the two new props to `TitleCard` + the watchlist toast copy. Leave search/debounce/log untouched.
- **`app/features/title-detail/TitleDetailScreen.tsx`** — **UPDATE**. Add the hero ❤️ + local `watchlisted` state + initial `getWatchlistKeys` lookup + toggle handler + a minimal inline add-confirmation. Leave the loading/loaded/error triad and seasons logic untouched.
- **`scripts/smoke-check.mjs`** — **read-only by default**; check 8's generalized audit already covers the new table. Optional targeted cross-user probe per Task 6.
- **`app/data/supabaseClient.ts`** — **read-only**. The one client `watchlist.ts` imports.

### Testing standards summary

No test framework exists in this repo (restated every story 1.3 → 2.2 — do **not** be the story that adds one as a side effect). The done-bar:
- `npx tsc --noEmit` clean.
- `npx expo export --platform android` bundles.
- `node scripts/smoke-check.mjs` passes — and now *earns its keep* on this story: check 8 (RLS-enabled-everywhere + anon-has-no-grants, both generalized over every public table) will **fail automatically** if `0005`'s migration forgets RLS or the revoke-then-grant. That is your cheap, honest guardrail that the new table is deny-by-default.
- A recorded manual verification pass (Task 6) in Completion Notes for the on-device taps, which `tsc`/export can't exercise.

[Source: scripts/smoke-check.mjs — checks 6/7 (per-table anon-deny), check 8 (generalized RLS+grant audit), check 9 (cross-user wall + `getOrCreateSession` helper you can reuse)]

### Project Structure Notes

- New: `supabase/migrations/0005_watchlist_items.sql` (next in sequence after `0004_visibility.sql`).
- New: `app/data/watchlist.ts` (sibling to `watchLog.ts`/`catalog.ts` in the established `app/data/` module home).
- Updated: `app/components/TitleCard.tsx`, `app/features/add/AddScreen.tsx`, `app/features/title-detail/TitleDetailScreen.tsx`.
- No new dependencies. Everything (supabase-js `.upsert`/`.delete`/`.in`, `Ionicons heart`, RN `Pressable`) is already present — nothing to `expo install`, so no dependency-flag decision this story (contrast 2.2's native-stack add).
- No `shared-types` change needed; the watchlist row shape is internal to `watchlist.ts` and keyed by the same `(tmdbId, mediaType)` identity already in `CatalogResult`.

### Previous Story Intelligence

- **2.2** extracted `TitleCard`/`Poster` into `app/components/TitleCard.tsx` **specifically so 2.3's ❤️ has one home** — it left the `TODO(2.3)` markers in both the card and the detail screen. It also established the optional-prop convention (`onLog`/`onPress`/`logged` all optional) that the new `onToggleWatchlist`/`watchlisted` props follow.
- **2.2 deferred finding (still open):** the outer card's grouped `accessible` label collapses the nested log `Pressable` for screen readers. You're adding a *second* nested action (❤️). Give it a clear standalone label; do not attempt the broader a11y-grouping fix here (out of scope) but don't worsen it.
- **1.5** built the outbox (`watchLog.ts`/`watchSync.ts`/`db.ts`) and `getLoggedKeys` — the direct-supabase read pattern `getWatchlistKeys` mirrors, including the documented `.in('tmdb_id', …)` cross-media-type narrowing footgun. **Reuse `watchKey`'s exact key shape.**
- **1.5/1.6** shipped `watches.visibility` nullable + the `('private','shared')` CHECK and proved private-by-default; `watchlist_items` mirrors that (column exists, never written here, RLS owner-only, no follower branch until Epic 5).
- **Standing conventions:** no test framework as a drive-by; dependency additions are explicit decisions (none needed here); `tsc` + Android export + smoke-check + recorded manual pass is the done-bar.

### Git Intelligence Summary

Recent commits:
```
5d750bc feat: 1.6 ensure private local first
fdf0195 fix: 1.5 // code-review patches — scope the outbox per user, bound sync, gate the confirmation on commit
90e8ab1 feat: 1.5 // Log a watch, local-first, surviving a network drop
4e5112a docs: record code review findings for stories 1.2 and 1.3
bd11cc3 feat: enhance authentication flow and error handling in auth components
```
Pattern: each feature commit is followed by a dedicated `fix:` commit when code review surfaces patches — expect the same here. 2.2's own review produced 7 patches (client invoke timeout, unmount guard, per-season concurrency cap, etc.); watch for analogous issues in the optimistic-toggle path (race on double-tap, unmount-during-write on the detail screen, rollback correctness).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3: Save a title to the Watchlist] — story statement + all four ACs (FR25, ARCH-5, ARCH-10, FR44, UX-DR20)
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements Inventory] — FR25 (add to Watchlist), FR26 (surfaced on Home/Profile — *later stories*), ARCH-5 (owner_id + nullable visibility + deny-by-default RLS), ARCH-8 (outbox = watch-commit only), ARCH-10 (tmdb_id/media_type identity, snake_case/camelCase), UX-DR20 (warm voice, one emoji max), UX-DR1 (gold reserved — not for a heart)
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4 / Epic 4 Story 4.2] — where this table's data is *read* (Home shelf / Profile) — explicitly out of this story's scope
- [Source: supabase/migrations/0003_watches.sql] — owner-scoped table + RLS + revoke/grant + CASCADE pattern to mirror
- [Source: supabase/migrations/0004_visibility.sql] — `('private','shared')` CHECK domain + why the follower RLS branch waits for Epic 5
- [Source: supabase/migrations/0001_profiles.sql] — unique-index + CHECK idioms
- [Source: app/data/watchLog.ts] — session guard, `watchKey`, `getLoggedKeys` (the read pattern `getWatchlistKeys` mirrors); the outbox path 2.3 does NOT reuse
- [Source: app/data/catalog.ts, app/data/supabaseClient.ts, app/data/db.ts] — the one-client / one-db discipline, direct-supabase read idiom, timeout-bounded network convention
- [Source: app/components/TitleCard.tsx] — shared card, optional-prop + nested-Pressable patterns, the placed `TODO(2.3)`, and the 2.2 grouped-a11y deferred finding
- [Source: app/features/add/AddScreen.tsx] — `loggedKeys`/`getLoggedKeys` post-search wiring, `handleLog` optimism, `showToast` to reuse for the AC4 copy
- [Source: app/features/title-detail/TitleDetailScreen.tsx] — hero block + `TODO(2.3)`, `mountedRef` guard, soft-fail render (heart must work there)
- [Source: scripts/smoke-check.mjs] — generalized RLS/anon-grant audit (check 8) that auto-covers the new table; `getOrCreateSession` (check 9) for an optional cross-user probe
- [Source: app/AGENTS.md] — Expo SDK 56 pin; use `expo install` for any native dep (none needed here)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
