---
baseline_commit: e29799471f9a936a8e881cea3b39697fe31d4249
---

# Story 3.1: Track a show or film into Up Next

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to start tracking a show or film so it appears in Home / Up Next,
So that what I'm watching is waiting for me the moment I open the app.

## Acceptance Criteria

1. **Given** a title detail, **when** I choose "I'm watching this", **then** a `tracked_shows` row is created (uuid PK, `user_id` FK, `tmdb_id`, `media_type`, `next_episode_pointer` nullable, `created_at`) with owner-only RLS and nullable `visibility` (FR10, ARCH-5, ARCH-10). [Source: epics.md#Story-3.1]
2. **Given** a tracked show, **when** it is created, **then** its `next_episode_pointer` is initialized to the first unwatched episode via the pointer RPC — never client-computed (ARCH-9/AD-10). **Naming correction (read before coding): the epics text names this RPC `advance_next_episode_pointer`, but the current architecture spine (AD-10) has already renamed it to `recompute_next_episode_pointer` — the epics' own Epic 3 preamble note flags this exact rename as recommended. Build `recompute_next_episode_pointer`, not `advance_next_episode_pointer`.** [Source: epics.md#Story-3.1; ARCHITECTURE-SPINE.md#AD-10]
3. **Given** tracked titles, **when** Home opens, **then** they appear in an Up Next shelf, cold-open showing cached data instantly with skeletons for uncached shelves (FR10, UX-DR15). [Source: epics.md#Story-3.1]
4. **Given** an already-tracked title, **when** I try to track it again, **then** it is not duplicated. [Source: epics.md#Story-3.1]

## Scope wall — read before writing any code

This story adds the **tracking** action and the **Up Next shelf shell**. It does **not** add:

- **The ✓ Watched control, episode pre-selection, or any pointer *advance* on a logged watch** → Story 3.2. This story only *initializes* the pointer at track-time; 3.2 owns organic advancement through the same RPC.
- **Any "current episode" badge/state on the title card** (EXPERIENCE.md's Component Patterns table describes this for tracked shows, but it's meaningless without 3.2's watched-state UI). Up Next cards in this story render exactly like the Watchlist shelf's cards (title/poster/year, tap → detail) — no episode badge yet.
- **Untracking / removing a tracked show.** No AC in this story or anywhere in Epic 3 asks for it; the `tracked_shows` table has no client DELETE grant. Do not build a remove/untrack action.
- **Film-specific "Watched" logging** → Story 3.3. Tracking a film here only creates the `tracked_shows` row with a permanently-null pointer; it does not log a watch.
- **Rating/mood/note, bulk season log, edit/remove of a watch** → later Story 3.x. Out of this story entirely.
- **Skeleton loading components.** AC3 quotes UX-DR15's "skeleton" language, but no skeleton component exists anywhere in this codebase (1.4–2.4 all use `ActivityIndicator`) — do not build one now. Satisfy the *intent* (don't blank an already-painted shelf on a refetch) using the same `hasLoadedRef` pattern `HomeScreen.tsx` already established in 2.4. See Dev Notes.
- **TanStack Query / any persisted local cache.** It's listed in the architecture Stack table but has never been adopted anywhere in this codebase (checked: zero references in `app/`). Introducing it now, just to get literal "instant cold-open," is an infrastructure decision out of this story's scope — reuse the existing in-memory `hasLoadedRef` pattern instead. See Dev Notes.
- **Any change to `catalog-search`, `watchlist.ts`, `watchLog.ts`, `watchSync.ts`, or the ❤️ watchlist affordance.** Additive only, alongside them.

## Tasks / Subtasks

- [x] **Task 1: Migration `0006_tracked_shows.sql` — the `tracked_shows` table (AC: #1, #4)**
  - [x] Follow the exact pattern of `supabase/migrations/0005_watchlist_items.sql`: `create table if not exists public.tracked_shows`, snake_case columns (ARCH-10), idempotent/re-runnable.
  - [x] Columns: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users (id) on delete cascade` (AD-8), `tmdb_id integer not null`, `media_type text not null check (media_type in ('movie', 'tv'))`, `next_episode_pointer integer` (nullable — this is a **TMDB episode id**, not a season/episode-number pair; see Task 3 for why), `created_at timestamptz not null default now()`, `visibility text check (visibility is null or visibility in ('private', 'shared'))` — nullable, never written by this story, mirrors `watchlist_items.visibility` exactly (Epic 5 wires the follower branch later; do not add it here — same reasoning as `0005_watchlist_items.sql`'s header comment).
  - [x] Unique index `tracked_shows_owner_title_idx on public.tracked_shows (user_id, tmdb_id, media_type)` — this is what makes AC4 ("not duplicated") a DB-level guarantee, exactly like `watchlist_items_owner_title_idx`.
  - [x] RLS: `enable row level security`; policies `tracked_shows_select_own` (select using `user_id = auth.uid()`) and `tracked_shows_insert_own` (insert with check `user_id = auth.uid()`). **Deliberately no update or delete policy for `authenticated`** — AD-10 requires the client never issue a raw PATCH against the pointer, and there is no untrack feature in this story (scope wall). Enforcing this at the grant level (not just convention) is the point: `revoke all on public.tracked_shows from anon, authenticated; grant select, insert on public.tracked_shows to authenticated;` — no `update`, no `delete`.
  - [x] Do not touch `watches`, `watchlist_items`, or any existing migration file.

- [x] **Task 2: Extend the catalog-title payload with a per-episode TMDB id (AC: #2 — required plumbing)**
  - [x] **Why this is needed, read before coding:** `watches.tmdb_episode_id` (0003_watches.sql) and this story's `tracked_shows.next_episode_pointer` both need to reference a single, unambiguous per-episode identity. TMDB's episode objects carry their own numeric `id` (distinct from `episode_number`), but `supabase/functions/catalog-title/index.ts`'s `TmdbEpisode`/`EpisodeDetail` types (built in Story 2.2, display-only) never captured it — only `episodeNumber`, `name`, `airDate`. Without it, there is no way to identify "the episode after episode 5" as a stable id the pointer RPC (Task 3) or a future watch-log row can reference. This is additive, backward-compatible plumbing, not a redesign of 2.2's contract.
  - [x] In `supabase/functions/catalog-title/index.ts`: add `id: number` to the `TmdbEpisode` interface (TMDB's raw per-episode id is already present in the API response, just unread today); add `tmdbEpisodeId: number` to `EpisodeDetail`; in `fetchSeason`'s `.map()`, set `tmdbEpisodeId: e.id`. Do not change `episodeNumber`/`name`/`airDate` handling.
  - [x] In `app/data/catalog.ts`: add `tmdbEpisodeId: number` to the client-side `EpisodeDetail` interface (the camelCase mirror). No other change to `catalog.ts` — `TitleDetail`, `fetchTitleDetail`, `searchCatalog` stay exactly as they are.
  - [x] This changes the shape of what gets written into `catalog_cache.payload` for shows going forward. Existing cached rows written before this change lack `tmdbEpisodeId` on their episodes; Task 3's RPC must tolerate that (treat a missing/null `tmdbEpisodeId` in a cached episode as "skip this episode, cannot use it as a pointer target" rather than erroring — a cold cache re-fetch on next `fetchTitleDetail` call self-heals it, same tolerance the codebase already applies to `catalog_cache` staleness elsewhere).

- [x] **Task 3: Migration `0007_recompute_next_episode_pointer.sql` — the pointer RPC (AC: #2)**
  - [x] Function signature: `public.recompute_next_episode_pointer(p_user_id uuid, p_tmdb_id integer) returns integer`, mirroring AD-10's literal name/args. `language plpgsql`.
  - [x] **Security — read carefully, this is the part most likely to be gotten wrong.** The function must read `catalog_cache` to get episode ordering, but `catalog_cache` has **no grant at all** for `authenticated` (0002_catalog_cache.sql — deny-by-default, only `service_role`/the Edge Function can read it). A `security invoker` function (Postgres default) running as the calling `authenticated` role would therefore fail to read `catalog_cache`. This function **must be `security definer`** to bypass that. But `security definer` also bypasses RLS on `tracked_shows` and `watches` for every query inside it — so the function **must not trust `p_user_id` blindly**: at the top, do `if p_user_id is distinct from auth.uid() then return null; end if;` (quietly no-op rather than raising, matching this codebase's "best-effort degrade" convention elsewhere) before touching any table. Also set `set search_path = public, pg_temp` on the function definition (standard `security definer` hardening against search-path hijacking — every other function in this codebase so far is `security invoker`/`immutable`, so there's no existing precedent to copy; this is the first `security definer` function in the project).
  - [x] **Algorithm:**
    1. `select media_type into v_media_type from public.tracked_shows where user_id = p_user_id and tmdb_id = p_tmdb_id limit 1;` — if no row found (not tracked), return `null`, no updates.
    2. If `v_media_type = 'movie'`: `update public.tracked_shows set next_episode_pointer = null where user_id = p_user_id and tmdb_id = p_tmdb_id;` (films never have a pointer — AC/epics note: "no next-episode pointer is involved" for films, carried forward from Story 3.3's AC). Return `null`.
    3. If `v_media_type = 'tv'`: read `catalog_cache.payload` for `(tmdb_id = p_tmdb_id, media_type = 'tv')`. Flatten `payload->'seasons'` (each season has `seasonNumber` and an `episodes` array; each episode has `episodeNumber` and, after Task 2, `tmdbEpisodeId`) into one list ordered by `seasonNumber` ascending, then `episodeNumber` ascending within a season. Skip any episode whose `tmdbEpisodeId` is null/absent (pre-Task-2 cached rows, or a malformed entry) rather than erroring.
    4. If no `catalog_cache` row exists for this show, or it has no usable `seasons`/episode-id data yet: **do not error, do not null out an existing pointer** — leave `next_episode_pointer` at whatever it currently is (`null` on first track, since the column defaults to null) and return the current value. This is the graceful-degradation case: the user tapped "I'm watching this" from a soft-fail/cached-basics render, or before the rich detail payload finished caching.
    5. Otherwise, compute this user's watched-episode-id set: `select tmdb_episode_id from public.watches where user_id = p_user_id and tmdb_id = p_tmdb_id and tmdb_episode_id is not null` (this is the "derive from full watch set" AD-10 requires — not a monotonic increment, so a user with pre-existing logged episodes for this show, e.g. logged before ever tracking, correctly skips past them here).
    6. Walk the ordered episode-id list from step 3 and find the first id **not** in the watched set from step 5. `update public.tracked_shows set next_episode_pointer = <that id> where user_id = p_user_id and tmdb_id = p_tmdb_id;` and return it. If every episode is already watched (fully caught up), set/return `null`.
  - [x] Grants: `grant execute on function public.recompute_next_episode_pointer(uuid, integer) to authenticated;` — do **not** grant to `anon`. PostgREST auto-exposes this as `POST /rpc/recompute_next_episode_pointer`.
  - [x] This is the **only** writer of `tracked_shows.next_episode_pointer`, now and in every future story that touches it (3.2, 3.7) — do not add a second code path (client PATCH or a second function) that writes this column.

- [x] **Task 4: `app/data/trackedShows.ts` (new file) — track action + reads (AC: #1, #2, #3, #4)**
  - [x] Mirror `app/data/watchlist.ts`'s structure and conventions closely (session guard via `requireUserId`-style helper, `TIMEOUT_MS` constant + `AbortController` on every network call, `${mediaType}:${tmdbId}` key shape reusing `watchKey`/`watchlistKey`'s exact format — do not invent a fourth key convention).
  - [x] `export interface TrackedShow { tmdbId: number; mediaType: 'movie' | 'tv'; nextEpisodePointer: number | null; createdAt: string }`.
  - [x] `export async function trackShow(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<void>` — upsert into `tracked_shows` with `onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true` (same idempotent-add pattern as `addToWatchlist`), requesting `.select()` on the upsert so the response tells you whether a row was actually inserted (empty result = conflict-ignored = already tracked, AC4's "not duplicated" — in that case, stop, do not call the RPC again). If a new row was inserted, call `supabase.rpc('recompute_next_episode_pointer', { p_user_id: userId, p_tmdb_id: tmdbId })` to initialize the pointer (AC2). Throw on any hard failure (upsert error, or a non-ignorable RPC error) so the caller (Task 5) can roll back its optimistic UI — mirror `addToWatchlist`'s throw-on-error shape.
  - [x] `export async function getTrackedShows(): Promise<TrackedShow[]>` — the Home Up Next shelf's primary content. **Throws on failure, does not degrade to `[]`** — exactly the same reasoning `getWatchlist()` documents (a silent `[]` on a network failure would render an "empty Up Next" lie for a user who really has tracked shows). Query `tracked_shows` select `tmdb_id, media_type, next_episode_pointer, created_at` for the session user, ordered `created_at` ascending (oldest-tracked-first reads as "what you're partway through," unlike the watchlist's newest-first — no AC mandates an order; this is the sane default, note it in Completion Notes if you pick differently).
  - [x] `export async function getTrackedKeys(items: { tmdbId: number; mediaType: 'movie' | 'tv' }[]): Promise<Set<string>>` — best-effort lookup for the detail screen's initial "already tracking" state, structurally identical to `getWatchlistKeys` (degrade to empty set on failure, bounded timeout, narrow the `.in('tmdb_id', ids)` cross-media-type false-match the same way).
  - [x] Do not touch `app/data/watchlist.ts`, `watchLog.ts`, or `watchSync.ts`.

- [x] **Task 5: "I'm watching this" on `TitleDetailScreen.tsx` (AC: #1, #2, #4)**
  - [x] Add tracked-state as a sibling to the existing watchlist-heart state block (same `useState`/`useRef` shape: `tracked`, `trackedRef`, `trackInteractedRef`, reusing the existing `mountedRef`/`confirmation` machinery — do not build a second confirmation mechanism).
  - [x] Best-effort initial lookup via `getTrackedKeys([{ tmdbId, mediaType }])` in a `useEffect` alongside the existing watchlist-keys effect (can be a second effect, or combined — either is fine as long as neither seed lookup can clobber a user's already-in-flight optimistic action, mirroring the watchlist effect's `watchlistInteractedRef` guard).
  - [x] Add a second action row below/alongside the ❤️ button: "I'm watching this" (untracked) → tap calls `trackShow(tmdbId, mediaType)`, optimistically flips to a tracked/checked visual state (e.g. label "Tracking" with a checkmark icon), shows an inline confirmation via the existing `showConfirmation` helper. **No untrack path** — once tracked, the button is a no-op / disabled on further taps (AC4 — both a DB-level and a UI-level guarantee). On failure, roll back to untracked and show a failure confirmation (mirror `handleToggleWatchlist`'s rollback shape exactly, including the "only roll back if not superseded by a newer action" guard).
  - [x] Copy: no literal string is mandated by any AC or `EXPERIENCE.md` state-pattern row for this specific action (unlike the watchlist's `COPY_WATCHLISTED`). Use "I'm watching this" for the CTA (from the story title/AC1's literal phrasing) and a short warm confirmation, one emoji max (NFR10) — e.g. "Added to Up Next." Do not invent guilt/streak language.
  - [x] Reachable in both the `loaded` and `soft`-fallback render paths (same reachability as the watchlist heart today), never in the hard-`error` state (no `detail` there).
  - [x] Do not touch the seasons/episodes rendering, the loading/error triad, or the watchlist heart logic itself.

- [x] **Task 6: Up Next shelf on `HomeScreen.tsx`, above Watchlist (AC: #3)**
  - [x] Reuse the exact pattern Story 2.4 built for the Watchlist shelf: `phase` state, `getTrackedShows()` on load/focus, per-item enrichment via `fetchTitleDetail` run in parallel (`Promise.allSettled`, one failed item drops that card only), `requestSeq` supersession guard, `hasLoadedRef`-gated spinner (only the very first load shows a full spinner; a focus refetch updates in the background without blanking an already-painted shelf) — **copy this pattern, do not diverge from it**, it was hardened by 2.4's code review (false-empty-on-all-enrichment-fail, focus-refetch race, spinner flicker were all real bugs found and fixed there; re-introducing any of them here would be repeating a fixed mistake).
  - [x] Render order: **Up Next section first, Watchlist section second** (matches the IA table: "Home / Up Next... Current shows to continue + Watchlist shelf + Recommendations shelf", `EXPERIENCE.md`). Reuse `TitleCard` read-only (no `onLog`/`onToggleWatchlist`), same as the Watchlist shelf — no episode-state badge (scope wall).
  - [x] Up Next's own empty row: no AC or `EXPERIENCE.md` row specifies literal copy for an empty Up Next shelf specifically (unlike Watchlist's AC2). Use something in the same warm, no-CTA style as the Watchlist empty row, e.g. "Nothing tracked yet — tap 'I'm watching this' on any title." Do not invent a CTA button unless matching the Watchlist row's precedent (copy-only, no button).
  - [x] **Whole-page empty-state reconciliation (this is the moment 2.4's Dev Notes explicitly deferred to this story):** when **both** shelves are empty (`trackedItems.length === 0 && watchlistItems.length === 0`) after both have loaded, render `EXPERIENCE.md`'s "Empty Home (new user)" copy instead of the two separate per-shelf empty rows — *"Your story starts here. What did you watch tonight?"* — with no CTA button mandated by any AC here either (do not invent one; if a future story wants a tap-through to `(+)`, that's its own call). If either shelf has content, or either is still loading/erroring, show the normal per-shelf rows — do not suppress a loaded shelf's real content because the other one is still loading.
  - [x] Two independent `getTrackedShows()`/`getWatchlist()` calls, loaded in parallel (`Promise.allSettled` at the top level, or two independent `load()` functions each with their own phase/requestSeq) — a slow/failed Up Next fetch must not block or blank an already-working Watchlist shelf, and vice versa. Do not couple their loading states into one combined spinner beyond what's needed for the whole-page-empty check above.

- [x] **Task 7: Verification pass (AC: all)**
  - [x] `npx tsc --noEmit` clean and `npx expo export --platform android` bundles (run from `app/`, the standing automated gates).
  - [x] `node scripts/smoke-check.mjs` if the local stack is up — no hand-written new check is needed for `tracked_shows`: check 8 (RLS-enabled-everywhere) and the anon-grants audit are generalized over every `public` table already, so the new table and its restrictive grants (no update/delete for `authenticated`) are covered automatically. Flag as outstanding (same as every prior story) if no local stack is available in this environment.
  - [~] Manual on-device, flag as outstanding if no emulator available (same precedent as 1.4–2.4): from title detail, tap "I'm watching this" on a TV show → Home shows it in Up Next; tap it again (or re-open detail) → not duplicated, button stays in tracked state; track a film → appears in Up Next with no pointer/episode implications; with everything empty, Home shows the "Your story starts here" whole-page copy; watchlist something too → the whole-page copy is replaced by the two per-shelf sections. *(outstanding — no emulator/device in this non-interactive environment; the DB-layer equivalent of this entire checklist — track a tv show, track a movie, duplicate-track no-op, pointer advancement after a watch, full-catch-up → null — was instead verified directly against the local Supabase stack via the RPC/REST endpoints; see Completion Notes.)*

### Review Findings

- [x] [Review][Patch] RPC/trackShow don't disambiguate tracked rows by `media_type` when a movie and a tv show share the same numeric TMDB id — `recompute_next_episode_pointer`'s Step 1 `select ... where user_id = p_user_id and tmdb_id = p_tmdb_id limit 1` (`supabase/migrations/0007_recompute_next_episode_pointer.sql`, the initial `select`) can arbitrarily pick either row's `media_type` if the user has tracked both a movie and a tv show under the same `tmdb_id` (per `app/data/trackedShows.ts`'s own comment: "ids are only unique per media_type"), and every subsequent `update ... where user_id = p_user_id and tmdb_id = p_tmdb_id` (the movie branch and the final tv-branch write) has no `media_type` filter either, so it can write `next_episode_pointer` onto the wrong row — or clobber both. `trackShow()`'s RPC call (`app/data/trackedShows.ts`, the `supabase.rpc('recompute_next_episode_pointer', { p_user_id, p_tmdb_id })` call) never passes `media_type`, so the RPC has no way to disambiguate. **Decision (2026-07-08): patched** — added a `p_media_type` parameter to the RPC (every SELECT/UPDATE now filters by it), `trackShow()` passes `mediaType`, and `ARCHITECTURE-SPINE.md`'s AD-10 signature was updated to match.
- [x] [Review][Patch] `COPY_TRACK_FAILED` duplicates `COPY_WATCHLIST_FAILED` verbatim [app/features/title-detail/TitleDetailScreen.tsx:51] — two separate constants held the identical string `"Couldn't save that — try again."`; merged into one shared `COPY_SAVE_FAILED` constant used by both the watchlist and tracking failure paths.
- [x] [Review][Defer] Duplicate enrichment fetches across shelves [app/features/home/HomeScreen.tsx:loadTracked/loadWatchlist] — a title that is both tracked and watchlisted is fetched twice (once per shelf) with no shared cache between them — deferred, pre-existing (same tradeoff 2.4 already accepted; shared caching/TanStack Query explicitly out of this story's scope wall).
- [x] [Review][Defer] `getTrackedShows()` has no pagination or row cap [app/data/trackedShows.ts:getTrackedShows] — reproduces the same unbounded-fan-out gap 2.4 already deferred for the watchlist shelf, now on a second shelf — deferred, pre-existing.
- [x] [Review][Defer] Narrow token-refresh race can silently leave the pointer uninitialized [app/data/trackedShows.ts:trackShow's RPC call] — if the session token refreshes between reading `session.user.id` and the RPC call, `auth.uid()` can momentarily diverge from `p_user_id`, the RPC's security guard quietly no-ops (returns `null`, no error), and `trackShow()` sees no `rpcError` so nothing surfaces to the caller — self-healing once 3.2's own recompute call runs, consistent with this codebase's best-effort-degrade convention — deferred, pre-existing design tradeoff.

Dismissed as noise / non-issues (13): `watchlistKey`/`watchKey` reuse in the tracked-seed lookup is a re-exported alias, functionally identical, not a bug; the two-shelf loading flash before the whole-page empty state collapses is the exact "not yet decided" behavior the Dev Notes mandate; the tracking button's `accessibilityLabel` differing from its visible text matches the existing watchlist heart button's identical convention; no FK/referential-integrity check on `tmdb_id`/`media_type` matches ARCH-10's value-identity-by-design; the stale `advance_next_episode_pointer` name in `epics.md` is explicitly out of this story's scope per its own Dev Notes; subjective concerns about verification-claim framing aren't code defects; the movie branch's unconditional `next_episode_pointer = null` update is a harmless no-op write; the "zero test coverage" finding repeats this codebase's standing, accepted no-test-framework convention; the shared confirmation/timer state across the heart and tracking buttons is the explicit "no second confirmation mechanism" directive from the Dev Notes; `getTrackedKeys`'s `.in('tmdb_id', ids)` overfetch-then-filter mirrors `getWatchlistKeys`'s mandated pattern exactly; the RPC's `p_user_id` trust-then-verify parameter shape is dictated by binding AD-10, out of scope to redesign here; a missing/null TMDB episode `id` is already tolerated by the RPC's `is not null` filter per Task 2's explicit note; and the Acceptance Auditor's own observation on `trackShow()` lacking a timeout self-classified as non-defect (matches `addToWatchlist`'s existing convention).

## Dev Notes

### The stale RPC name in epics.md — and why the architecture spine wins

Epic 3's own preamble (epics.md, right above Story 3.1) already flags this: *"Recommend renaming AD-10's `advance_next_episode_pointer` → `recompute_next_episode_pointer`... to stop the name implying forward-only."* That rename was **already applied** to `ARCHITECTURE-SPINE.md`'s AD-10 (which now reads `recompute_next_episode_pointer(user_id, tmdb_id)`, "derive-from-full-watch-set, not a monotonic increment") — but the epics' own AC text for 3.1/3.2 (ARCH-9 references) was never updated to match, so it still says `advance_next_episode_pointer`. The architecture spine is the binding source (`binds: [FR1-FR45, NFR1-NFR11]` in its frontmatter); build against **`recompute_next_episode_pointer`**. This also matters for naming consistency: 3.7 (edit/remove a logged watch) explicitly reuses this same function for its recompute-after-delete path — a name that implies "advance" would already be wrong there, which is exactly why the rename happened.

[Source: _bmad-output/planning-artifacts/epics.md — Epic 3 preamble, "Pointer-RPC contract" note]
[Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#AD-10]

### Why the pointer RPC needs `catalog_cache`, and what that implies

`tracked_shows`/`watches` only ever reference a title/episode **by TMDB id value** (ARCH-10 — no local titles table, no FK). So "the first unwatched episode" cannot be computed from local tables alone; the only place chronological episode ordering exists is the TMDB response, and the only place that's persisted server-side is `catalog_cache.payload` (written by `catalog-title`, Story 2.2/AD-6). By the time a user can even see the "I'm watching this" button, `TitleDetailScreen` has already called `fetchTitleDetail` (on screen load), which — on the normal `loaded` path — has already upserted a rich `seasons`-bearing payload into `catalog_cache` for that show. The RPC leans on that being already-present, with graceful degradation (Task 3, step 4) for the cases where it isn't (soft-fail render, or a thin catalog-search-only cache row).

This also means `catalog_cache`'s "disposable, freely evictable" framing (AD-6) is a little more load-bearing here than its own migration comment implies — in practice nothing in v1 ever *deletes* a `catalog_cache` row (TTL only gates re-fetch-vs-trust, not eviction), so a written row persists until a future story adds active cache pruning. Do not add pruning as part of this story; just be aware the RPC's dependency on this table is real, not incidental.

[Source: supabase/migrations/0002_catalog_cache.sql]
[Source: supabase/functions/catalog-title/index.ts]
[Source: app/features/title-detail/TitleDetailScreen.tsx — `load()` calling `fetchTitleDetail` unconditionally]

### `security definer` — the first one in this codebase, and why it's necessary and dangerous

Every function so far (`handle_new_user` in 0001, `effective_visibility` in 0004) is either a trigger function or `immutable`/`security invoker`. This RPC is different: it must read `catalog_cache`, which has **zero grants** for `authenticated` by design (0002's whole point — only the Edge Function's service-role key reads it). A `security invoker` function running as the calling authenticated user would simply fail that read. `security definer` is the only way to bridge it — but it means the function's queries against `tracked_shows` and `watches` **also** bypass RLS, which normally would enforce the owner-only check. The mandatory mitigation (Task 3) is checking `p_user_id = auth.uid()` explicitly at the top of the function body, before any table access — do not skip this check or treat it as optional hardening. Without it, any authenticated user could pass an arbitrary `p_user_id` and both read and mutate a stranger's `tracked_shows` row, a straightforward privacy break of exactly the kind AD-1/FR29 exists to prevent.

[Source: supabase/migrations/0002_catalog_cache.sql — the deny-by-default grant this RPC must work around]
[Source: supabase/migrations/0004_visibility.sql — the only prior custom function, for contrast (security invoker, no auth context)]
[Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#AD-1 — the RLS invariant this function must not silently bypass for the caller]

### The 2.4-deferred whole-page empty-state reconciliation — this is that moment

Story 2.4's Dev Notes explicitly named this story as the one that would own reconciling `EXPERIENCE.md`'s two Home empty-state rows ("Empty Home (new user)" — whole-page — vs. "Empty Watchlist" — shelf-scoped) once Up Next existed to reconcile against. Task 6 implements exactly that: whole-page copy only when *both* shelves are genuinely empty, per-shelf copy otherwise. Do not build anything more elaborate (e.g. a third state for "one shelf still loading, one empty") — treat "still loading" as not-yet-decided and show that shelf's own loading state, only collapsing to the whole-page copy once both have resolved to empty.

[Source: _bmad-output/implementation-artifacts/2-4-watchlist-shelf-on-home.md — "Why this story retires the 1.3 placeholder" Dev Note, explicitly forward-referencing this story]
[Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/EXPERIENCE.md — State Patterns table, "Empty Home (new user)" vs "Empty Watchlist | Home shelf" rows]

### Existing code this story extends (read before touching)

- **`supabase/migrations/`** — **NEW**: `0006_tracked_shows.sql`, `0007_recompute_next_episode_pointer.sql`. Follow `0005_watchlist_items.sql`'s comment-header style (What this table IS / IS NOT) — it's the closest analog (owner-scoped, value-identity, no titles FK).
- **`supabase/functions/catalog-title/index.ts`** — **UPDATE** (narrow, additive). Only `TmdbEpisode`/`EpisodeDetail` gain an `id`/`tmdbEpisodeId` field; no other logic changes (fetch flow, caching, soft-fail handling all untouched).
- **`app/data/catalog.ts`** — **UPDATE** (one-line-equivalent, additive). `EpisodeDetail` gains `tmdbEpisodeId: number`. Nothing else changes.
- **`app/data/trackedShows.ts`** — **NEW**. Mirrors `watchlist.ts`'s conventions exactly (see Task 4).
- **`app/features/title-detail/TitleDetailScreen.tsx`** — **UPDATE**. Adds tracked-state + "I'm watching this" alongside the existing ❤️ block; do not touch the loading/error triad, seasons rendering, or the watchlist heart logic.
- **`app/features/home/HomeScreen.tsx`** — **UPDATE** (structural). Adds the Up Next shelf above Watchlist, plus the whole-page-empty reconciliation. Reuses 2.4's shelf pattern verbatim for Up Next; the existing Watchlist shelf logic is otherwise untouched (same `getWatchlist()`, same per-item enrichment).
- **`app/data/watchlist.ts`, `watchLog.ts`, `watchSync.ts`** — **read-only**. Not touched by this story.

### Testing standards summary

No test framework exists in this repo (restated every story 1.3 → 2.4 — do **not** add one as a side effect). The done-bar, unchanged: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, `node scripts/smoke-check.mjs` passes if the local stack is available (no hand-written new check needed — the generalized RLS/anon-grant audits in check 8 cover any new table automatically), and a recorded manual verification pass in Completion Notes.

[Source: scripts/smoke-check.mjs — checks 8's generalized per-table audit, which needs no edit for this story's new table]

### Project Structure Notes

- New: `supabase/migrations/0006_tracked_shows.sql`, `supabase/migrations/0007_recompute_next_episode_pointer.sql`, `app/data/trackedShows.ts`.
- Updated: `supabase/functions/catalog-title/index.ts` (additive), `app/data/catalog.ts` (additive), `app/features/title-detail/TitleDetailScreen.tsx`, `app/features/home/HomeScreen.tsx`.
- No new npm dependencies — `@react-navigation/*`, `expo-sqlite`, etc. are all already installed and unaffected (this story adds no new local-outbox usage; tracking is a direct PostgREST write, same tradeoff `watchlist.ts` already made and documented — no offline/survives-a-network-drop AC exists for tracking, unlike the watch-commit path).
- No `packages/shared-types` change needed — `TrackedShow`/episode-id additions stay internal TS types on both sides (mirrors how `WatchlistItem` was handled in 2.4).

### Previous Story Intelligence

- **2.4** built the Watchlist shelf and its `hasLoadedRef`/`requestSeq`/`useFocusEffect` pattern — this story's Up Next shelf must copy that pattern exactly (Task 6), not re-derive it, since 2.4's own code review already found and fixed the false-empty/race/flicker bugs a fresh implementation would likely reintroduce.
- **2.4's Dev Notes** explicitly forward-referenced this story twice: once for the whole-page empty-state reconciliation (Task 6), once implicitly by choosing `getWatchlist()`'s "throws, doesn't degrade" contract — this story's `getTrackedShows()` follows the identical reasoning for the identical reason (primary shelf content, not a best-effort hint).
- **2.3's code review** found and patched several optimistic-toggle races on the watchlist heart (in-flight-lookup clobbering, unserialized add/remove, same-frame double-tap). The "I'm watching this" action in this story is simpler (no untrack, so no add/remove race to serialize) but should still apply the same **"don't let a stale seed-lookup clobber a user's in-flight action"** guard (`trackInteractedRef`, mirroring `watchlistInteractedRef`) and the same **"only roll back if not superseded"** check on failure.
- **Standing conventions carried forward:** no test framework as a drive-by; `tsc` + Android export + smoke-check + a recorded manual pass is the done-bar; best-effort reads degrade quietly (`getTrackedKeys`), primary-content reads throw (`getTrackedShows`); every network call races a bounded timeout via `AbortController`, never the platform default.

### Git Intelligence Summary

Recent commits:
```
e297994 docs: record code review findings for story 2.4
71eb556 fix: 2.4 // code-review patches — false-empty, focus-refetch races, spinner flicker
d5d8d50 feat: implement Watchlist shelf on Home screen (Story 2.4)
83e7789 feat: implement per-title write queue for watchlist toggles
6437091 feat: full search with details and "add to whishlist"
```
Pattern: every feature commit in Epic 2 was followed by a dedicated `fix:` patch commit once code review surfaced issues (races, false-empties). Expect the same rhythm here — this story has materially more surface area than 2.4 (a new `security definer` function, a schema plumbing change to a Story-2.2-owned Edge Function) so budget for a review pass finding something in the RPC's edge cases (empty cache, all-episodes-watched, movie vs tv branch) even if the client-side shelf code is clean.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1: Track a show or film into Up Next] — story statement + all four ACs (FR10, ARCH-5, ARCH-9, ARCH-10, UX-DR15)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3 preamble] — the pointer-RPC rename note, the NFR1 exit-gate note (relevant to later 3.2, not this story's own gate)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#AD-10] — the binding, current RPC name/contract ("derive/recompute-from-full-watch-set")
- [Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#AD-1] — RLS-as-authorization invariant this story's `security definer` function must not bypass for the *caller's* identity, only for the `catalog_cache` read
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/EXPERIENCE.md] — IA table (Up Next above Watchlist), "Empty Home (new user)" row, Component Patterns table (episode-state badge explicitly deferred, see Scope wall)
- [Source: supabase/migrations/0005_watchlist_items.sql] — the closest schema analog to mirror for `tracked_shows`
- [Source: supabase/migrations/0002_catalog_cache.sql] — why the RPC needs `security definer` (zero authenticated grants on this table)
- [Source: supabase/migrations/0004_visibility.sql] — the only prior custom SQL function in the codebase, for contrast
- [Source: supabase/functions/catalog-title/index.ts] — the episode payload this story extends with `tmdbEpisodeId`
- [Source: app/data/watchlist.ts] — the structural/timeout/key-convention pattern `trackedShows.ts` mirrors
- [Source: app/features/home/HomeScreen.tsx] — the 2.4 shelf pattern (`hasLoadedRef`, `requestSeq`, `useFocusEffect`) to copy for Up Next
- [Source: app/features/title-detail/TitleDetailScreen.tsx] — the watchlist-heart block this story's tracking block sits alongside
- [Source: _bmad-output/implementation-artifacts/2-4-watchlist-shelf-on-home.md] — the deferred whole-page empty-state reconciliation, and the `getWatchlist()`-throws precedent this story's `getTrackedShows()` follows
- [Source: scripts/smoke-check.mjs] — checks 8's generalized RLS/anon-grant audit, which needs no edit for the new table

## Dev Agent Record

### Agent Model Used

claude-sonnet-5 (Claude Code)

### Debug Log References

None — no debugger invoked. Verification was via `tsc`, `expo export`, `smoke-check.mjs`, and a hand-written scratch script exercising the pointer RPC and `tracked_shows` grants directly against the local Supabase stack (script deleted after use, not part of the repo).

### Completion Notes List

- **Schema (Task 1):** `0006_tracked_shows.sql` follows `0005_watchlist_items.sql`'s pattern exactly — owner-scoped RLS, unique `(user_id, tmdb_id, media_type)` index for AC4, and grants restricted to `select, insert` only for `authenticated` (no `update`/`delete`) so the pointer column and the "no untrack" scope wall are enforced at the grant level, not just convention.
- **Plumbing (Task 2):** `catalog-title`'s `TmdbEpisode`/`EpisodeDetail` and the client `catalog.ts` mirror both gained `tmdbEpisodeId` (TMDB's own numeric episode id). Purely additive — `episodeNumber`/`name`/`airDate` unchanged, no other function in either file touched.
- **Pointer RPC (Task 3):** `0007_recompute_next_episode_pointer.sql` — the first `security definer` function in this codebase. Verified directly against the local stack (see below) rather than trusting a read of the SQL alone, given the elevated-privilege surface.
- **Client data module (Task 4):** `app/data/trackedShows.ts` mirrors `watchlist.ts`'s shape (`requireUserId`, bounded `AbortController` timeout, `watchKey`-format keys). No write-chain/serialization was added (unlike `watchlist.ts`'s `writeWatchlist`) — there is no untrack action to race against an add, so nothing to serialize.
- **UI (Task 5):** "I'm watching this" added to `TitleDetailScreen.tsx` as a sibling action row below ❤️, reusing the existing `confirmation`/`showConfirmation`/`mountedRef` machinery rather than a second mechanism. Chose no-emoji confirmation copy ("Added to Up Next.") to match `COPY_WATCHLISTED`'s existing no-emoji convention rather than the story's example text literally.
- **Home shelf (Task 6):** `HomeScreen.tsx` restructured around a shared `Shelf` sub-component (heading + loading/error/empty/loaded states) driven by two fully independent phase/hasLoadedRef/requestSeq trios (`tracked*`, `watchlist*`), so Up Next and Watchlist never couple their races — matches 2.4's hardened pattern per-shelf. Whole-page empty reconciliation (`wholePageEmpty`) only fires once both phases are `'loaded'` and both item lists are empty; a still-loading/erroring shelf always shows its own state first.
- **DB-layer manual verification (in lieu of on-device, no emulator available):** with the local stack up, applied 0006/0007, restarted the edge-functions container, and ran a scratch script directly against PostgREST/RPC as an authenticated test user, confirming: (1) tracking a movie leaves `next_episode_pointer` null; (2) tracking a tv show with no `catalog_cache` row degrades gracefully (RPC returns null, no error); (3) tracking a tv show with a cached payload correctly computes the first unwatched episode id, skipping an episode whose `tmdbEpisodeId` was null; (4) logging that episode via `watches` and re-invoking the RPC correctly advances to the next id (derived from the full watch set, not incremented); (5) after logging every real episode the RPC returns null (fully caught up); (6) a duplicate track upsert returns an empty array (ignored) and the row count for that title stays at 1 (AC4); (7) invoking the RPC with a spoofed `p_user_id` returns null with no error and no mutation (the `security definer` guard holds); (8) a direct client `PATCH` against `tracked_shows` is rejected with HTTP 403 (no update grant — the RPC is provably the sole writer). All matched the Task 3 algorithm spec exactly. Test rows and the scratch script were removed afterward; nothing added to the repo.
- **Outstanding, flagged for reviewer:** manual on-device verification of the UI flows (tap "I'm watching this", confirm Up Next shelf populates/doesn't duplicate, whole-page empty-state transition) could not run — no emulator/device in this non-interactive environment, consistent with every prior story (1.4–2.4). The DB-layer equivalent of the same scenarios was verified directly (see above), and `tsc`/`expo export`/`smoke-check.mjs` all pass.

### File List

- `supabase/migrations/0006_tracked_shows.sql` (new)
- `supabase/migrations/0007_recompute_next_episode_pointer.sql` (new)
- `supabase/functions/catalog-title/index.ts` (updated — additive `tmdbEpisodeId`)
- `app/data/catalog.ts` (updated — additive `tmdbEpisodeId`)
- `app/data/trackedShows.ts` (new)
- `app/features/title-detail/TitleDetailScreen.tsx` (updated — "I'm watching this" action)
- `app/features/home/HomeScreen.tsx` (updated — Up Next shelf, whole-page empty reconciliation)

## Change Log

- 2026-07-07 — Story 3.1 implemented: `tracked_shows` table (0006, owner-only RLS, insert/select-only grants) + `recompute_next_episode_pointer` security-definer RPC (0007, the codebase's first) + `tmdbEpisodeId` plumbing through `catalog-title`/`catalog.ts` + `trackedShows.ts` client module + "I'm watching this" on `TitleDetailScreen` + Up Next shelf above Watchlist on `HomeScreen` with whole-page empty-state reconciliation (deferred from 2.4). `tsc --noEmit`, `expo export --platform android`, and `smoke-check.mjs` all pass. The pointer RPC's algorithm (movie/tv branch, graceful degradation, chronological ordering, derive-from-full-watch-set, AC4 idempotency, security-definer guard, grant restrictions) was verified directly against the local Supabase stack. Manual on-device UI verification outstanding — no emulator/device in this environment; flagged for reviewer. Status → review.
- 2026-07-08 — Code review completed: 3-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor); all 4 ACs conformant, no scope-wall violations. 1 decision-needed patched (RPC's `p_media_type` disambiguation — a movie and tv show sharing a numeric TMDB id could otherwise select/mutate the wrong `tracked_shows` row; also updated `ARCHITECTURE-SPINE.md`'s AD-10 signature), 1 patch applied (deduped `COPY_TRACK_FAILED`/`COPY_WATCHLIST_FAILED` into one `COPY_SAVE_FAILED` constant), 3 deferred (duplicate cross-shelf enrichment fetches, unbounded `getTrackedShows()` fan-out, narrow token-refresh race in the pointer RPC call), 13 dismissed. `tsc --noEmit` clean after patches. Status → done.
