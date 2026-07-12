---
baseline_commit: 83e7789ba30070ee203e5a9c4d41e8d96198aeee
---

# Story 2.4: Watchlist shelf on Home

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want my watchlist to appear as a shelf on Home,
so that the things I saved are one glance away.

## Acceptance Criteria

1. **Given** watchlist items, **when** Home renders, **then** a horizontally-scrolling Watchlist shelf shows their title cards, each tapping into title detail (FR26, UX-DR6). [Source: epics.md#Story-2.4]
2. **Given** an empty watchlist, **when** the shelf renders, **then** the warm empty state shows ("Save something for later — tap ❤️ on any title.") (FR24, UX-DR14). [Source: epics.md#Story-2.4]
3. **Given** a poster with missing art, **when** a shelf card renders, **then** the gradient placeholder shows (UX-DR5). [Source: epics.md#Story-2.4]
4. **Given** Profile surfacing (FR26), **when** Profile is built in Epic 4, **then** the same watchlist data is surfaced there — this story owns the Home shelf and the underlying data. [Source: epics.md#Story-2.4]

## Scope wall — read before writing any code

This story **reads** the `watchlist_items` table (built in 2.3) into a Home shelf. That's the whole surface. It does **not** add:

- Any change to the ❤️ add/remove path, `watchlist.ts`'s existing `addToWatchlist`/`removeFromWatchlist`/`getWatchlistKeys`/`writeWatchlist`, or the `TitleCard` heart affordance — those are 2.3, done, closed. This story only adds a new **read** function alongside them.
- The **Up Next shelf** (tracked shows, next-episode pointer) → Story 3.1. Home will eventually show Up Next above/alongside Watchlist; this story builds Watchlist only. Do not stub, fake, or reserve layout for Up Next.
- The **Recommendations shelf** → Story 3.8 (optional, non-blocking). Not this story.
- **Profile's watchlist surfacing** → Epic 4 Story 4.2. AC4 only requires that this story's data (the `watchlist_items` table + a reusable read function) is *available* to be surfaced later — it does **not** mean touching `ProfileScreen.tsx` in this story.
- Any new Supabase Edge Function, or a change to `catalog-title`/`catalog-search`. The shelf gets title/poster/year by reusing the existing `fetchTitleDetail` (from 2.2) — see Dev Notes on why, and why a leaner "batch lookup" endpoint is explicitly **not** built here.
- Rating/mood/note, mark-as-watched, or any Epic 3 action from the shelf. Tapping a shelf card only opens title detail (AC1), exactly like a search result does today.
- A new empty-state variant for "brand-new user with zero data anywhere." EXPERIENCE.md separately defines an "Empty Home (new user)" full-page state — that composite (multiple shelves' empty/cold-open states reconciled) is **not** this story's job; see Dev Notes for exactly what to build instead and why.

## Tasks / Subtasks

- [x] Task 1: Add a watchlist **read** function — `app/data/watchlist.ts` (AC: #1, #2)
  - [x] Add `export interface WatchlistItem { tmdbId: number; mediaType: 'movie' | 'tv'; createdAt: string }`.
  - [x] Add `export async function getWatchlist(): Promise<WatchlistItem[]>`. Session guard identical to every other function in this file (`supabase.auth.getSession()`; no session → return `[]`, the app shell is behind the auth gate so this is defensive only, same as `requireUserId`/`getWatchlistKeys`). Query: `supabase.from('watchlist_items').select('tmdb_id, media_type, created_at').eq('user_id', userId).order('created_at', { ascending: false })` — newest-saved-first (no AC mandates an order; this is the sane default and matches "one glance away" recency). Bound the query with an `AbortController` + timeout, mirroring `getWatchlistKeys`'s `WATCHLIST_KEYS_TIMEOUT_MS` pattern (reuse that same constant, don't invent a second one).
  - [x] **Divergence from `getWatchlistKeys`, on purpose: `getWatchlist()` THROWS on failure, it does not degrade to `[]`.** `getWatchlistKeys` is a best-effort *hint* (a missed heart-state lookup just shows an unfilled heart, harmless). `getWatchlist()` is the **primary content** of a screen section — silently returning `[]` on a network failure would render the AC2 "empty watchlist" copy for a user who actually has saved titles, which is a lie about their state (violates the "never a blank screen / never fabricate emptiness" doctrine the app follows elsewhere — see `fetchTitleDetail`/`searchCatalog`, which both throw `CatalogError` rather than degrade). Map any Postgrest error / timeout / abort to a plain `Error` (or reuse nothing fancier — no `CatalogError` needed here, this isn't the catalog proxy).
  - [x] Do not touch `addToWatchlist`, `removeFromWatchlist`, `writeWatchlist`, `getWatchlistKeys`, or the `writeChains` map — additive only.

- [x] Task 2: Shared navigation param type + a Home stack (AC: #1)
  - [x] New file `app/navigation/titleDetailParams.ts` exporting `export type TitleDetailParams = { tmdbId: number; mediaType: 'movie' | 'tv' };`. This is the exact shape `AddStackParamList['TitleDetail']` already has — pulling it into one shared file lets a second stack reuse it without duplicating the literal type.
  - [x] Update `app/navigation/AddStack.tsx`: import `TitleDetailParams` and change `TitleDetail: { tmdbId: number; mediaType: 'movie' | 'tv' }` to `TitleDetail: TitleDetailParams`. No other change to this file.
  - [x] New file `app/navigation/HomeStack.tsx`, mirroring `AddStack.tsx` structurally: `export type HomeStackParamList = { HomeMain: undefined; TitleDetail: TitleDetailParams }`, a `createNativeStackNavigator<HomeStackParamList>()`, `screenOptions={{ headerShown: false }}`, `<Stack.Screen name="HomeMain" component={HomeScreen} />` then `<Stack.Screen name="TitleDetail" component={TitleDetailScreen} />`. This is the exact stack `AddStack.tsx`'s own comment predicted: *"Other tabs stay stack-free until a later story needs detail navigation from them (e.g. 2.4's Home watchlist shelf)."*
  - [x] Update `app/features/title-detail/TitleDetailScreen.tsx`'s `Props` type. It is currently `NativeStackScreenProps<AddStackParamList, 'TitleDetail'>`, which couples it to one stack — but after this story it's pushed from **two** stacks (Add's and Home's). Replace the import/type with a minimal, stack-agnostic shape since the screen only reads `route.params` and calls `navigation.goBack()`:
    ```ts
    import type { TitleDetailParams } from '../../navigation/titleDetailParams';
    type Props = {
      route: { params: TitleDetailParams };
      navigation: { goBack: () => void };
    };
    ```
    Do not change anything else in this file (the loading/loaded/error triad, the watchlist heart wiring, the seasons logic all stay exactly as 2.3 left them).
  - [x] Update `app/navigation/AppShell.tsx`: swap the import `HomeScreen` for `HomeStack` and change `<Tab.Screen name="Home" component={HomeScreen} .../>` to `<Tab.Screen name="Home" component={HomeStack} .../>`. `RootTabParamList['Home']` stays `undefined` — the tab itself takes no params, only the stack pushed inside it does.

- [x] Task 3: Rewrite `HomeScreen.tsx` — the Watchlist shelf (AC: #1, #2, #3)
  - [x] Change the `Props` type from `BottomTabScreenProps<RootTabParamList, 'Home'>` to `NativeStackScreenProps<HomeStackParamList, 'HomeMain'>` (import `HomeStackParamList` from `../../navigation/HomeStack`).
  - [x] Replace the 1.3 static centered "Your story starts here" body entirely — see Dev Notes for why this is correct and in-scope, not a regression. Use a non-centered `<Screen>` (no `center` prop), matching `AddScreen`'s layout.
  - [x] Local phase state `'loading' | 'loaded' | 'error'` (same three-state shape `TitleDetailScreen` already uses). On mount, call `getWatchlist()`; on success set phase `'loaded'` and store the rows; on failure set phase `'error'`.
  - [x] **Refetch on tab focus.** Home is a tab, not remounted when the user leaves and returns (e.g. after ❤️-ing something new from Add or removing one from detail) — without a refetch the shelf would show stale data until an app relaunch. **Implemented via `useFocusEffect`** (from `@react-navigation/native`, already a dependency) rather than a manual `navigation.addListener('focus', ...)` inside a `useEffect` — `useFocusEffect` is the library's documented idiom for exactly this ("run on mount AND every focus"); a manual `addListener` registered inside `useEffect` risks missing the very first focus event and would need a redundant separate mount-effect (a double-fetch race on startup). Guarded with a `mountedRef` exactly like `TitleDetailScreen.load` does, so a focus event firing just before unmount can't `setState`.
  - [x] For each loaded `WatchlistItem`, resolve title/poster/year via `fetchTitleDetail(tmdbId, mediaType)` (from `app/data/catalog.ts`, already imported by `TitleDetailScreen`/`AddScreen` — reuse it, do not add a new module). Run all lookups **in parallel** via `Promise.allSettled` (not sequential — a shelf of N items must not pay N round-trips serially). Map a `fulfilled` result's `.detail` into a `CatalogResult`-shaped object (`{ tmdbId, mediaType, title, year, posterPath }`) for `TitleCard`. A `rejected` result means that one title's metadata is unavailable — **drop that card from the shelf** (`console.warn`, do not fabricate a placeholder title/row) rather than blocking or erroring the whole shelf; this mirrors the codebase's existing "acceptable per-item degradation" precedent (`getWatchlistKeys` on a failed lookup, `Poster`'s placeholder on a failed image). See Dev Notes on why this reuses the heavier `fetchTitleDetail` (which also fetches seasons/episodes for a show) instead of a new lighter endpoint.
  - [x] Render, in order:
    - A section heading `"Watchlist"` (`theme.type.title`, `accessibilityRole="header"` — same pattern as `TitleDetailScreen`'s `"Seasons"` heading).
    - **Loading:** a centered `ActivityIndicator` (same as `AddScreen`/`TitleDetailScreen`).
    - **Error:** the existing app-wide retry pattern — message + a "Try again" button calling the same `load()` (copy: reuse the generic `"We couldn't load this right now."` — this is not one of the four literal ACs, it's the inferred not-a-blank-screen requirement; see Dev Notes).
    - **Loaded, empty (`rows.length === 0`):** the verbatim AC2 copy `"Save something for later — tap ❤️ on any title."` (no CTA button — EXPERIENCE.md's "Empty Watchlist" row specifies copy only, unlike Diary/Feed/Profile's empty states which do add a CTA; do not invent one).
    - **Loaded, non-empty:** a horizontal `FlatList` (`horizontal`, `showsHorizontalScrollIndicator={false}`, `keyExtractor` = `` `${item.mediaType}:${item.tmdbId}` ``) rendering one `TitleCard` per resolved item, each wrapped in a fixed-width (`~280`) container with right margin so cards read as a horizontal carousel (the shared `TitleCard` is a wide poster-left row per UX-DR6/DESIGN.md — reused as-is, not a new poster-only tile variant). Pass **only** `item` and `onPress` — no `onLog`, no `onToggleWatchlist` (this is a read-only surface, exactly the case those props were made optional for in 2.3's Dev Notes: *"optional so read-only surfaces (2.4's shelf) can omit them"*).
    - `onPress` navigates: `navigation.navigate('TitleDetail', { tmdbId: item.tmdbId, mediaType: item.mediaType })` — same call shape `AddScreen.handleOpenDetail` already uses, now against the Home stack instead of the Add stack.
  - [x] AC3 (missing-poster placeholder) needs **no new code** — `TitleCard`'s `Poster` subcomponent already renders the cool→dark gradient placeholder whenever `posterPath` is null/failed/still-loading (built in 2.2). Simply reusing `TitleCard` satisfies AC3; do not re-implement placeholder logic.

- [x] Task 4: Verification pass (AC: all)
  - [x] `npx tsc --noEmit` clean, and `npx expo export --platform android` bundles (the standing automated gates — see Testing Standards). Both are runnable in this environment; run them. **Passed** — `pnpm exec tsc --noEmit` clean (run from `app/`), `npx expo export --platform android` bundled 1040 modules.
  - [~] `node scripts/smoke-check.mjs` — no new table/migration this story, so no *new* audit surface, but re-run it if the local stack is up; otherwise note it as outstanding per the established precedent (2.3 flagged the same environment limitation). *(blocked in this environment — no `supabase/.env` secrets present, so `docker compose up` fails on unset required vars, same limitation 2.3 flagged.)*
  - [~] Manual on-device (flag as outstanding if no emulator available, per every prior story): ❤️ a title from search or detail, switch to Home → it appears in the Watchlist shelf; tap the shelf card → opens title detail; un-❤️ it (from detail or by re-adding elsewhere), return to Home → it disappears from the shelf (proves the focus-refetch); with a fully empty watchlist, Home shows the AC2 copy; a title with no poster art shows the gradient placeholder in the shelf. *(outstanding — no emulator/device in this non-interactive environment; flagged for reviewer, per 1.4–2.3 precedent.)*

### Review Findings

_Code review 2026-07-06 (3-layer adversarial: Blind Hunter, Edge Case Hunter, Acceptance Auditor). No scope-wall violations; all 4 ACs conformant. 3 patches, 1 deferred, 4 dismissed as noise._

- [x] [Review][Patch] All-enrichment-fail renders a false "empty watchlist" — when `getWatchlist()` returns rows but every `fetchTitleDetail` rejects (catalog proxy down, DB up), `resolved` is `[]` and `COPY_EMPTY` shows to a user who has saved titles — the exact false-empty `getWatchlist()` throws to avoid. Key the empty state on `rows.length`, not just enriched count. [app/features/home/HomeScreen.tsx:149-168] (blind+edge+auditor) — **Fixed:** `rows.length > 0 && resolved.length === 0` now routes to the error/retry state instead of the empty copy (and won't nuke an already-painted shelf on a background-refresh failure).
- [x] [Review][Patch] Focus-refetch has no request-sequence guard — `useFocusEffect` fires `load()` on every focus with only a `mountedRef` guard (stays true across focus cycles); overlapping loads resolve out of order and a stale result can clobber a newer one. Mirror `AddScreen.requestSeq`. [app/features/home/HomeScreen.tsx:141-186] (blind+edge+auditor) — **Fixed:** added a monotonic `requestSeq` ref; each `load()` captures `seq` and bails after every await if superseded.
- [x] [Review][Patch] Shelf blanks to a spinner on every tab refocus — `load()` unconditionally calls `setPhase('loading')`, so returning to Home unmounts the loaded FlatList and flashes the `ActivityIndicator` (and loses scroll position) even when nothing changed. Keep loaded items visible during a background refetch. [app/features/home/HomeScreen.tsx:142,182-186] (blind+edge) — **Fixed:** `hasLoadedRef` gates the spinner to the first load; focus refetches update in the background.
- [x] [Review][Defer] Unbounded parallel fan-out — `rows.map(fetchTitleDetail)` fires N concurrent `catalog-title` invokes with no concurrency cap, re-run on every focus; risks thundering-herd for large watchlists [app/features/home/HomeScreen.tsx:145-147] — deferred, spec Dev Notes explicitly punts batching/concurrency-cap to a future optimization ("do not build it now").

## Dev Notes

### Why this story retires the 1.3 "Your story starts here" placeholder — and why that's correct, not scope creep

`HomeScreen.tsx` today is a static screen from Story 1.3, written *before* `watches` or `watchlist_items` existed — its own header comment says the real shelves "arrive in Epics 2-3." It has no data-fetching of any kind yet; it unconditionally renders the same centered CTA regardless of what a user has done. This story is the **first** to give Home real data.

EXPERIENCE.md defines two *distinct* empty-state rows:
- **"Empty Home (new user)"** — a whole-page state ("Your story starts here...") for a user with nothing anywhere (no watches, no watchlist, no tracked shows).
- **"Empty Watchlist"** — scoped to "Home shelf," just the shelf's own empty row.

Reconciling those two (i.e., "show the big whole-page CTA only if the user *also* has zero watches/tracked-shows, else show the per-shelf empty rows") needs the **Up Next shelf** (tracked shows, `watches` data) to exist to make that call — and Up Next is Story 3.1, not built yet. Building that reconciliation logic now would mean reaching into `watches`/`tracked_shows` data this story has no AC basis to touch, and would still be wrong once 3.1 lands (it'd need redoing anyway).

The correct, minimal, in-scope move: this story replaces the placeholder with the real Watchlist shelf section (AC1/AC2 exactly as specified — the shelf's own empty copy, no whole-page fallback). Until 3.1 adds Up Next, the Watchlist shelf **is** the Home content — same as the 1.3 comment predicted ("arrive in Epics 2-3"). Do not attempt to preserve or gate the old CTA; do not try to guess the multi-shelf empty-state composition — that reconciliation is explicitly Story 3.1's job once Up Next exists to reconcile against.

[Source: app/features/home/HomeScreen.tsx — the current 1.3 placeholder and its own "arrive in Epics 2-3" comment]
[Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/EXPERIENCE.md — "Empty Home (new user)" vs "Empty Watchlist" as two distinct rows]
[Source: _bmad-output/planning-artifacts/epics.md#Story 3.1 — Up Next shelf, tracked_shows, next_episode_pointer — the future story that will need to reconcile multi-shelf emptiness]

### Why the shelf reuses `fetchTitleDetail` instead of a new "batch lookup" endpoint

`watchlist_items` stores only `(tmdb_id, media_type, created_at)` — no title/poster/year (by design, ARCH-10: identity by value, no local titles table). To render a `TitleCard` the shelf needs that metadata, and the **only** door to the catalog is the proxy boundary (AD-6: the client never calls TMDB directly, never holds the TMDB key). Today that door is exactly two functions: `catalog-search` (query-based) and `catalog-title` (single `tmdbId`/`mediaType` lookup, wrapped client-side as `fetchTitleDetail`). There is no batch/lightweight variant.

Reusing `fetchTitleDetail` per item is the correct in-scope choice: it's already proxy-boundary-compliant, already cached server-side (`catalog_cache` with a TTL, `catalog-title` is its sole caller per ARCH-6/ARCH-12 — so repeat calls for the same title are cheap DB reads, not repeat TMDB fetches), and adding a new Edge Function or a leaner catalog-title variant is an architecture-level decision (new endpoint, new contract) that is out of this story's scope — flag it as a future optimization candidate in Completion Notes if the shelf ever needs to scale past a handful of items, do not build it now.

The accepted tradeoff: `catalog-title` also fetches full seasons/episodes for a TV show (Story 2.2's contract), which the shelf doesn't render — mild over-fetch, not a correctness problem, not worth a special-case client change this story.

[Source: app/data/catalog.ts — `fetchTitleDetail`, the one client-side door to `catalog-title`]
[Source: supabase/migrations/0005_watchlist_items.sql — why the table has no title/poster columns]
[Source: _bmad-output/planning-artifacts/epics.md#Requirements Inventory — ARCH-6 (catalog_cache TTL), ARCH-12 (catalog-title sole caller), ARCH-10 (identity-by-value, no titles table), AD-6 (proxy boundary, referenced via ARCH-6/12)]

### The Home-tab-needs-a-stack call was already made — twice

Both `AddStack.tsx`'s header comment and `TitleCard.tsx`'s docstring **explicitly named this story** as the reason a second stack would eventually be needed:
> *"Other tabs stay stack-free until a later story needs detail navigation from them (e.g. 2.4's Home watchlist shelf)."* — `AddStack.tsx`
> *"...later stories fill it in"* re: shelf/tracked-state — `2-3-save-a-title-to-the-watchlist.md` scope wall

This is not a surprise refactor; it's the planned shape. `TitleDetailScreen` becomes a screen reachable from two independent native-stacks (`AddStack`, `HomeStack`), both pushing the identical `{ tmdbId, mediaType }` params — hence Task 2's shared `TitleDetailParams` type instead of either duplicating the literal shape or forcing one stack's param-list type onto the other's navigator (which would be structurally wrong — `NativeStackScreenProps<AddStackParamList, 'TitleDetail'>` used inside `HomeStack` would type-check `navigation.navigate` against Add's routes, not Home's).

[Source: app/navigation/AddStack.tsx — the stack pattern to mirror exactly, and its own forward-reference to this story]
[Source: app/features/title-detail/TitleDetailScreen.tsx — the screen being made stack-agnostic]

### Existing code this story extends (read before touching)

- **`app/data/watchlist.ts`** — **UPDATE**. Add `WatchlistItem` + `getWatchlist()` only. Do not touch `addToWatchlist`/`removeFromWatchlist`/`writeWatchlist`/`getWatchlistKeys`/`writeChains` (2.3, closed, code-reviewed).
- **`app/navigation/AddStack.tsx`** — **UPDATE** (minimal). Only the `TitleDetail` param type changes to import the shared `TitleDetailParams`; no behavioral change.
- **`app/navigation/HomeStack.tsx`** — **NEW**. Mirrors `AddStack.tsx` structurally.
- **`app/navigation/titleDetailParams.ts`** — **NEW**. One shared type, nothing else.
- **`app/navigation/AppShell.tsx`** — **UPDATE**. Swap `HomeScreen` → `HomeStack` for the Home tab's `component`. No other tab changes.
- **`app/features/home/HomeScreen.tsx`** — **REWRITE**. Full replacement of the 1.3 placeholder body with the Watchlist shelf (loading/loaded-empty/loaded-populated/error states).
- **`app/features/title-detail/TitleDetailScreen.tsx`** — **UPDATE** (narrow). Only the `Props` type import/shape changes (decoupled from `AddStackParamList`). Do not touch the loading/loaded/error triad, the watchlist heart wiring (2.3), or the seasons/episodes rendering.
- **`app/components/TitleCard.tsx`** — **read-only**. Reused exactly as-is (`item`/`onPress` only); no prop or behavior changes needed — AC3's placeholder already lives here from 2.2.
- **`app/data/catalog.ts`** — **read-only**. `fetchTitleDetail` reused exactly as 2.2/2.3 already use it elsewhere.

### Testing standards summary

No test framework exists in this repo (restated every story 1.3 → 2.3 — do **not** add one as a side effect). The done-bar, unchanged from prior stories:
- `npx tsc --noEmit` clean.
- `npx expo export --platform android` bundles.
- `node scripts/smoke-check.mjs` passes if the local stack is available — this story adds no migration, so there is no new audit surface for it to cover; still worth a run to confirm no regression.
- A recorded manual verification pass (Task 4) in Completion Notes for the on-device shelf/tap/focus-refetch behavior, which `tsc`/export can't exercise.

[Source: scripts/smoke-check.mjs — no new table this story, existing checks are unaffected]

### Project Structure Notes

- New: `app/navigation/HomeStack.tsx`, `app/navigation/titleDetailParams.ts`.
- Updated: `app/data/watchlist.ts` (additive), `app/navigation/AddStack.tsx` (type-only), `app/navigation/AppShell.tsx`, `app/features/home/HomeScreen.tsx` (rewrite), `app/features/title-detail/TitleDetailScreen.tsx` (Props type only).
- No new dependencies. `@react-navigation/native-stack` is already installed (2.2 added it for `AddStack`); `FlatList`/`ActivityIndicator`/`Ionicons` are already used elsewhere. Nothing to `expo install`.
- No `shared-types` change needed — `WatchlistItem`/`CatalogResult` stay internal TS types, same as 2.3's watchlist keys.
- No new migration — this story only reads `watchlist_items` (2.3's table, already RLS-locked owner-only).

### Previous Story Intelligence

- **2.3** built `watchlist_items` + `app/data/watchlist.ts`'s write-side (`addToWatchlist`/`removeFromWatchlist`/`writeWatchlist`/`getWatchlistKeys`) and the ❤️ affordance on `TitleCard` + `AddScreen` + `TitleDetailScreen`. It explicitly deferred the Home shelf to this story and left the `onLog`/`onToggleWatchlist`-optional convention on `TitleCard` specifically so this story could render it read-only.
- **2.3 code review** found and patched several optimistic-toggle races (in-flight-lookup clobbering a user's toggle, unserialized add/remove, same-frame double-tap). None of that surface is touched here — this story only *reads* the table after those writes have already landed; it does not re-open that logic.
- **2.2** extracted `TitleCard`/`Poster` into `app/components/TitleCard.tsx` and added the `AddStack` native-stack + `TitleDetailScreen`, explicitly flagging (in both files) that a second stack for Home was coming in this story.
- **2.2 deferred finding (still open, not this story's job):** `TitleCard`'s outer grouped `accessible` label collapses nested-button announcements for screen readers. Not worsened by this story (the shelf's `TitleCard` usage here has *no* nested buttons — no `onLog`/`onToggleWatchlist` — so this instance of the finding doesn't even apply to the shelf's cards).
- **Standing conventions:** no test framework as a drive-by; dependency additions are explicit decisions (none needed here); `tsc` + Android export + smoke-check + a recorded manual pass is the done-bar; best-effort reads degrade quietly, primary content reads (this story's `getWatchlist()`) must not.

### Git Intelligence Summary

Recent commits:
```
83e7789 feat: implement per-title write queue for watchlist toggles
6437091 feat: full search with details and "add to whishlist"
5d750bc feat: 1.6 ensure private local first
fdf0195 fix: 1.5 // code-review patches — scope the outbox per user, bound sync, gate the confirmation on commit
90e8ab1 feat: 1.5 // Log a watch, local-first, surviving a network drop
```
Pattern: each feature commit is followed by a dedicated `fix:`/patch commit once code review surfaces issues (1.5 → fdf0195, 2.3 → 83e7789's per-title write queue). Expect the same rhythm here if review finds races in the focus-refetch (e.g., a stale in-flight `getWatchlist()` resolving after a newer focus event) — guard with a request-sequence token if that surfaces, mirroring `AddScreen.requestSeq`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4: Watchlist shelf on Home] — story statement + all four ACs (FR26, UX-DR6, FR24, UX-DR14, UX-DR5)
- [Source: _bmad-output/planning-artifacts/epics.md#Requirements Inventory] — FR26 (Watchlist surfaced on Home shelf + Profile), FR24 (warm empty states route to a first action — *no CTA specified for this one, per EXPERIENCE.md*), ARCH-6/ARCH-12 (catalog-title/catalog_cache proxy + TTL), ARCH-10 (identity-by-value, snake_case/camelCase)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/EXPERIENCE.md] — "Empty Watchlist | Home shelf" row (the verbatim AC2 copy) vs. the separate "Empty Home (new user)" row (out of scope, reconciled once Up Next exists)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/DESIGN.md#Components] — `title-card` definition ("Horizontal card — poster left...") confirming the shelf reuses the existing wide card, not a new poster-tile variant
- [Source: app/features/home/HomeScreen.tsx] — the 1.3 placeholder being replaced, and its own forward-reference to this story
- [Source: app/navigation/AddStack.tsx] — the native-stack pattern to mirror for `HomeStack.tsx`, and its own forward-reference to this story
- [Source: app/features/title-detail/TitleDetailScreen.tsx] — the screen being made stack-agnostic; loading/loaded/error triad and heart wiring to leave untouched
- [Source: app/data/watchlist.ts] — `getWatchlistKeys`'s timeout/abort pattern to mirror for `getWatchlist()`, and why `getWatchlist()` deliberately does NOT mirror its best-effort degrade-to-empty
- [Source: app/data/catalog.ts] — `fetchTitleDetail`, reused as-is for shelf-card metadata
- [Source: app/components/TitleCard.tsx] — the shared card + `Poster` placeholder (AC3), reused read-only (no new props needed)
- [Source: _bmad-output/implementation-artifacts/2-3-save-a-title-to-the-watchlist.md] — prior story's scope wall explicitly deferring the shelf here, and the `onLog`/`onToggleWatchlist`-optional convention built for this exact reuse
- [Source: supabase/migrations/0005_watchlist_items.sql] — the table this story reads (owner-only RLS, no title/poster columns — why enrichment is needed)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — no blocking failures. `pnpm exec tsc --noEmit` (run from `app/`) clean on first run; `npx expo export --platform android` bundled clean on first run (1040 modules).

### Completion Notes List

- `app/data/watchlist.ts`: added `WatchlistItem` + `getWatchlist()`, additive only — no changes to the existing write-side (`addToWatchlist`/`removeFromWatchlist`/`writeWatchlist`/`getWatchlistKeys`/`writeChains`). `getWatchlist()` deliberately throws on failure (does not degrade to `[]`) since it's the shelf's primary content, not a best-effort hint — documented inline and in Dev Notes.
- `app/navigation/titleDetailParams.ts` (new): single shared `TitleDetailParams` type, consumed by both `AddStack` and the new `HomeStack`.
- `app/navigation/AddStack.tsx`: type-only change (`TitleDetail` param now references the shared type); no behavior change.
- `app/navigation/HomeStack.tsx` (new): mirrors `AddStack.tsx` structurally — `HomeMain` (HomeScreen) initial route, `TitleDetail` pushed on top, header hidden.
- `app/features/title-detail/TitleDetailScreen.tsx`: `Props` type decoupled from `AddStackParamList` to a minimal stack-agnostic shape (`route.params` + `navigation.goBack()` only), since the screen is now reachable from two stacks. No other changes — loading/loaded/error triad, watchlist heart wiring, and seasons/episodes logic untouched.
- `app/navigation/AppShell.tsx`: Home tab now renders `HomeStack` instead of `HomeScreen` directly.
- `app/features/home/HomeScreen.tsx`: full rewrite. Replaced the 1.3 static empty-CTA placeholder with the Watchlist shelf: `loading`/`loaded`/`error` phase state, `getWatchlist()` on load, per-item enrichment via `fetchTitleDetail` run in parallel (`Promise.allSettled`, one failed item drops that card only, doesn't block the shelf), a horizontal `FlatList` of read-only `TitleCard`s (no `onLog`/`onToggleWatchlist`) tapping into `TitleDetail`, the verbatim AC2 empty copy, and a retry row on fetch failure. Refetch-on-focus implemented via `useFocusEffect` (not a manual `addListener('focus', ...)`) — the correct react-navigation idiom for "run on mount and every subsequent focus," avoiding a double-fetch race a manual listener would introduce.
- AC3 (missing-poster placeholder) required no new code — `TitleCard`'s existing `Poster` subcomponent (2.2) already renders the gradient placeholder whenever `posterPath` is null/failed/loading; simply reusing `TitleCard` satisfies it.
- **Outstanding, flagged for reviewer:** `node scripts/smoke-check.mjs` could not run in this environment — `supabase/.env` (git-ignored, contains secrets) is absent, so `docker compose up` fails on required-but-unset vars, the same limitation 2.3 flagged. No new migration this story, so no new audit surface is at risk. Manual on-device verification (shelf appears/disappears on ❤️ toggle, tap-to-detail, empty-state copy, gradient placeholder) is outstanding — no emulator/device available in this non-interactive environment, consistent with every prior story (1.4–2.3).

### File List

- `app/data/watchlist.ts` (updated — added `WatchlistItem` + `getWatchlist()`)
- `app/navigation/titleDetailParams.ts` (new)
- `app/navigation/AddStack.tsx` (updated — type-only)
- `app/navigation/HomeStack.tsx` (new)
- `app/navigation/AppShell.tsx` (updated — Home tab now renders `HomeStack`)
- `app/features/title-detail/TitleDetailScreen.tsx` (updated — `Props` type decoupled from `AddStackParamList`)
- `app/features/home/HomeScreen.tsx` (rewritten — Watchlist shelf)

## Change Log

- 2026-07-06 — Story 2.4 implemented: added `getWatchlist()` (throws on failure, unlike the file's other best-effort reads), a `HomeStack` mirroring `AddStack` so Home can push `TitleDetail`, decoupled `TitleDetailScreen`'s props from `AddStackParamList`, and rewrote `HomeScreen` to render the Watchlist shelf (loading/empty/populated/error states, focus-refetch via `useFocusEffect`). `tsc --noEmit` and `expo export --platform android` pass. `smoke-check` and on-device verification outstanding — no local Supabase stack or emulator in this environment; flagged for reviewer. Status → review.
