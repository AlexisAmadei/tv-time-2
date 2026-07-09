---
baseline_commit: 7228570573d06bc473de48bf142c75d4153349d9
---

# Story 3.2: One-tap ✓ Watched advances the pointer

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a single ✓ Watched to log the current episode and advance to the next,
So that keeping up with a show is one tap from Up Next.

## Acceptance Criteria

1. **Given** a tracked show in Up Next with its next episode pre-selected, **when** I tap ✓ Watched, **then** the episode commits instantly via the outbox with a soft confirmation, and the pointer advances through the `recompute_next_episode_pointer` RPC (FR11, ARCH-9/AD-10). [Source: epics.md#Story-3.2]
2. **Given** the network is disabled, **when** I tap ✓ Watched, **then** the commit still succeeds and later syncs — rating and catalog latency never block it (FR14 completed, tested with network off). [Source: epics.md#Story-3.2]
3. **Given** a committed episode watch, **when** persisted, **then** it carries a `watched_at timestamptz` at log time and a nullable `tmdb_episode_id` (FR15 completed). [Source: epics.md#Story-3.2]
4. **Given** the client, **when** it advances progress, **then** it never issues a raw `PATCH` against `tracked_shows.next_episode_pointer` — only the RPC (ARCH-9/AD-10). [Source: epics.md#Story-3.2]
5. **Given** the Watched control, **when** rendered, **then** it is a rounded-sm primary-fill uppercase badge/continue pill, and announces its state change to screen readers (UX-DR10, UX-DR23). [Source: epics.md#Story-3.2; DESIGN.md#Components — `watched-badge`]

## Scope wall — read before writing any code

This story adds the **✓ Watched control on the Up Next shelf** and the **organic pointer-advance path**. It does **not** add:

- **A film-specific "Watched" action.** Story 3.3 ("Log a film in one action") owns that. This story's Watched pill only ever renders for **tv** items with a non-null `nextEpisodePointer` — never for tracked films (which always have a null pointer, per 3.1). Do not build a movie Watched control here.
- **The post-watch rating/mood prompt.** Story 3.5. A watch commit here shows the same plain soft confirmation the Search log flow already uses ("Logged — nice one.") — no star row, no mood chips, no prompt sheet.
- **Bulk season logging.** Story 3.4. Out of scope entirely.
- **The "Caught up" dialog / notify-bell prompt** (`EXPERIENCE.md`'s "Caught up" state, the Component Patterns table's notify bell). Epic 6 territory. When a tracked tv show's `nextEpisodePointer` is `null` (fully caught up, or the pointer hasn't been computed yet), its Up Next card simply renders with **no** Watched pill — exactly like it renders today. Do not build a caught-up dialog, a notify-bell affordance, or any new copy for this case.
- **A Watched/Continue control on `TitleDetailScreen.tsx`.** The Component Patterns table lists "Title detail, Up Next" together for this component, but every one of this story's own ACs and NFR1's testability note ("Start = tap on the Up Next card") frame the action from Up Next only. Do not add a duplicate control to title detail — that is a later story's call, not this one's.
- **Untracking / removing a tracked show.** Unchanged from 3.1's scope wall — still no AC anywhere asks for it.
- **A new migration or a new/changed RPC signature.** `recompute_next_episode_pointer(p_user_id uuid, p_tmdb_id integer, p_media_type text)` already exists (`supabase/migrations/0007_recompute_next_episode_pointer.sql`, patched during 3.1's code review to take `p_media_type`) and needs zero changes — reuse it exactly as-is.
- **Any change to `app/data/trackedShows.ts`.** It already returns everything this story needs (`TrackedShow.nextEpisodePointer`) — read-only for this story.
- **Any change to the Watchlist shelf, `app/data/watchlist.ts`, or the ❤️ affordance.** Additive only, alongside them.

## Tasks / Subtasks

- [x] **Task 1: Carry a real per-episode id through the local outbox (AC: #3)**
  - [x] In `app/data/watchLog.ts`: add an optional `tmdbEpisodeId?: number | null` field to `LogWatchInput`. In `logWatch`'s `db.runAsync` insert, replace the hardcoded `null` (currently the 5th bound value, the `tmdb_episode_id` column) with `input.tmdbEpisodeId ?? null`.
  - [x] No schema change needed — `pending_watches.tmdb_episode_id` already exists (`app/data/db.ts`) and `watchSync.ts` already forwards `row.tmdb_episode_id` into the `watches` upsert unchanged. This task only wires a real value into the column that has always existed but was always written `null` until now.
  - [x] Do not touch `getLoggedKeys`, `watchKey`, or `watchSync.ts` in this task (that's Task 2).

- [x] **Task 2: Pointer advance as a side effect of a successful sync (AC: #1, #2, #4)**
  - [x] In `app/data/watchSync.ts`, inside `triggerSync`'s per-row loop, immediately after a row's `watches` upsert succeeds and its `pending_watches.synced_at` is stamped: if `row.media_type === 'tv' && row.tmdb_episode_id != null`, call `supabase.rpc('recompute_next_episode_pointer', { p_user_id: userId, p_tmdb_id: row.tmdb_id, p_media_type: 'tv' })`, bounded by a new `AbortController` timeout constant (mirror `UPSERT_TIMEOUT_MS`'s exact pattern — e.g. `RECOMPUTE_TIMEOUT_MS = 10_000`).
  - [x] Wrap this call in its own try/catch, separate from the upsert's — a failed/timed-out recompute must **not** mark the row's sync as failed or set `progressed = false`; the watch itself already synced. `console.warn` on failure, matching the existing per-row warn convention (`watchSync: upsert failed...`).
  - [x] **Why here, not a direct call from `HomeScreen` right after `logWatch()`:** the RPC's Step 5 (`ARCHITECTURE-SPINE.md#AD-10`) derives the next pointer from the user's full **synced** `watches` set. Calling the RPC before this row has actually landed in `watches` (i.e., from the UI, immediately after the *local* outbox write) would race the still-in-flight sync and could compute a stale, non-advanced pointer. Putting the call here — right after this exact row's own successful upsert — guarantees the row it depends on is already visible to the RPC's query.
  - [x] **Why this also satisfies AC2's "and later syncs":** `triggerSync` already has three retry triggers wired at other call sites (opportunistic-after-log, app-foreground, network-reconnect — see file header comment). Piggybacking the recompute call here means an offline watch commit gets its pointer advanced automatically whenever the outbox eventually drains, with zero new retry infrastructure (this codebase deliberately has no general offline-sync framework, NFR8).
  - [x] Skip this call entirely for `media_type === 'movie'` rows (pointer is meaningless for films — the RPC already no-ops it, but there's no reason to spend a network round-trip on it) and for any `tv` row with a `null` `tmdb_episode_id` (a non-episode watch — nothing to advance from).
  - [x] Optional but recommended: dedupe within one drain pass (e.g. a local `Set<string>` of `` `${tmdb_id}:${media_type}` `` already recomputed this pass) if several rows for the same show sync together — not required for correctness (the RPC is idempotent under retry, AD-10) but avoids redundant calls.

- [x] **Task 3: The ✓ Watched pill on `TitleCard.tsx` (AC: #5)**
  - [x] Add two new optional props: `onMarkWatched?: (item: CatalogResult) => void` and `watchedPending?: boolean` — mirrors the existing `onLog`/`logged` and `onToggleWatchlist`/`watchlisted` optional-pair convention in this file (do not touch those two existing props or their branches).
  - [x] Render a third nested `Pressable` (its own hit target, alongside the existing icon buttons) **only** when `onMarkWatched` is provided: a `rounded-sm`, `primary`-fill, **uppercase-label** pill — this is the `DESIGN.md` `watched-badge` component ("rounded-sm, primary fill, uppercase label"), a visually distinct control from the existing checkmark-icon `onLog` button (that one is Search's Story-1.5 log affordance — do not reuse or repurpose it for this story; they coexist as two different controls on two different surfaces).
  - [x] No literal copy is mandated for the pill's own label by any AC or `EXPERIENCE.md` row (DESIGN.md only specifies the visual treatment) — use "WATCHED" (uppercase).
  - [x] `watchedPending` (true immediately after a tap, until the shelf's data settles) disables the pill and swaps its `accessibilityLabel` (e.g. `` `Mark ${item.title} watched` `` → `` `${item.title} marked watched` ``) — this label swap is what satisfies AC5's "announces its state change to screen readers" for the control itself; the separate confirmation banner (Task 5) covers the toast-level announcement.
  - [x] Style: mirror the existing `retryButton`/`retryText` pair already in this codebase (`colors.primary` background, `colors.inkPrimary` text) — `borderRadius: radius.sm`, `textTransform: 'uppercase'`, based on `type.label`.
  - [x] Do not touch `onLog`, `onToggleWatchlist`, or their existing styles/branches.

- [x] **Task 4: Wire the Watched pill into the Up Next shelf only (AC: #1, #2, #4)**
  - [x] In `app/features/home/HomeScreen.tsx`, extend the Up Next shelf's per-item data with the pointer: define a local type (e.g. `UpNextItem extends CatalogResult { nextEpisodePointer: number | null }`) and thread `TrackedShow.nextEpisodePointer` (from `getTrackedShows()`, already returned) through `loadTracked`'s existing `rows`/`settled` zip (the enrichment loop already pairs each `fetchTitleDetail` result back to its source row by index — carry the pointer through the same zip; do not re-fetch it separately). The Watchlist shelf's `loadWatchlist`/`CatalogResult` items are untouched.
  - [x] Pass `onMarkWatched`/`watchedPending` to `TitleCard` **only** for the Up Next `Shelf` instance, and only per-item when `item.mediaType === 'tv' && item.nextEpisodePointer != null` — this is the AC1/scope-wall gate: films and any tv show whose pointer is `null` (caught up, or not yet computed) render with no pill, identical to how the card renders today. The Watchlist `Shelf` instance gets no new props at all.
  - [x] `handleMarkWatched(item)`:
    1. `await logWatch({ tmdbId: item.tmdbId, mediaType: 'tv', tmdbEpisodeId: item.nextEpisodePointer })`.
    2. On success: show the soft confirmation (Task 5) immediately — the local outbox write **is** the commit (AC1/AC2), regardless of connectivity, exactly the same reasoning `AddScreen.handleLog` already documents. Mark that item's key `watchedPending`, then best-effort `await triggerSync().catch(() => {})` (this both attempts Task 2's recompute right away for the common online case, and is a safe no-op/failure when offline, per AC2), then call `loadTracked()` again to reflect any pointer change. If offline or the recompute hasn't landed yet, this just redraws the same pointer — harmless; it self-heals on the next successful sync plus a later focus/foreground trigger, matching this codebase's existing best-effort-degrade convention (e.g. `getTrackedKeys`, `getLoggedKeys`).
    3. On failure (the local commit itself throwing — no session, DB error): show the failure confirmation; do not set `watchedPending`.
  - [x] `watchedPending` is local per-key UI state (e.g. a `Set<string>` of `watchKey(tmdbId, mediaType)`, reusing the existing key-shape helper) — clear a key once `loadTracked()`'s next run completes. Do not persist it beyond the current Home mount.

- [x] **Task 5: Soft confirmation on Home (AC: #1)**
  - [x] Home has no existing confirmation UI (unlike `AddScreen`'s `Animated` toast or `TitleDetailScreen`'s inline banner) — add one. Recommend mirroring `TitleDetailScreen.tsx`'s simpler inline-text pattern (`confirmation` state + `showConfirmation` helper + bounded `setTimeout` + `mountedRef` guard + `accessibilityLiveRegion="polite"`) rather than `AddScreen`'s `Animated` toast — less code, same accessibility guarantee, and Home is a scrolling shelf list rather than a single-focus search screen. Either existing pattern is acceptable; do not invent a third, different confirmation mechanism.
  - [x] Copy: reuse the exact existing strings — `'Logged — nice one.'` (matches `AddScreen`'s `COPY_LOGGED`, and is `EXPERIENCE.md`'s "Watched confirmed" state pattern verbatim) for success; `"Couldn't save that — try again."` (matches `AddScreen`'s `COPY_LOG_FAILED` / `TitleDetailScreen`'s `COPY_SAVE_FAILED`) for failure. Define as local constants in `HomeScreen.tsx` — this codebase's established convention is a per-file constant, not a shared one (see 3.1's code review: cross-file copy duplication was explicitly left alone, only same-file duplication was patched).

- [x] **Task 6: Verification pass (AC: all)**
  - [x] `npx tsc --noEmit` clean and `npx expo export --platform android` bundles (run from `app/`, the standing gates).
  - [x] `node scripts/smoke-check.mjs` if the local stack is up; flag as outstanding otherwise (same precedent as every prior story).
  - [x] Verify directly (manual on-device if available, else DB-layer against the local Supabase stack per 3.1's precedent):
    - Tapping Watched on a tracked tv show's Up Next card logs the episode instantly, **both** with the network on and with it disabled (AC1/AC2 — the named regression test from FR14/NFR1's testability note).
    - After a successful sync, the pointer advances via the RPC, and a subsequent Home reload/focus shows the next episode's `nextEpisodePointer` (i.e., the pill would target a different episode id next tap).
    - The committed `watches` row carries a real `tmdb_episode_id` and a `watched_at` at log time (AC3).
    - No client code path issues a `.update()`/`.upsert()` against `tracked_shows` directly — grep confirms only `trackedShows.ts`'s existing `trackShow()` RPC call and this story's new `watchSync.ts` RPC call touch the pointer, both via `supabase.rpc(...)`, never a raw `PATCH` (AC4).
    - The Watched pill renders as a rounded-sm, primary-fill, uppercase badge, and its `accessibilityLabel` changes once tapped (AC5).
    - A tracked film and a fully-caught-up tracked show render their Up Next cards with **no** Watched pill (scope-wall check).

## Dev Notes

### Why the pointer-advance call lives in `watchSync.ts`, not `HomeScreen.tsx`

`AD-10`'s RPC is derive-from-full-watch-set: it reads `public.watches` (server-side, already-synced rows) to compute "the first unwatched episode." If the recompute call were fired directly from the UI right after `logWatch()`'s *local* outbox write (as `trackedShows.ts`'s `trackShow()` does for its own, unrelated write), it would race the still-pending sync — the just-logged episode might not be in `watches` yet, so the RPC would compute the *same* pointer as before, not the advanced one. Putting the call inside `watchSync.ts`, right after that specific row's own successful upsert, removes the race entirely: by construction, the row the RPC needs to see is already there. This also means the existing sync retry triggers (opportunistic-after-log, foreground, reconnect — see `watchSync.ts`'s file header) automatically become the "later syncs" mechanism AC2 requires for the offline case, with no new retry code.

[Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-10]
[Source: app/data/watchSync.ts — the three existing retry triggers]
[Source: app/data/trackedShows.ts#trackShow — the earlier, different-context RPC-call-after-write pattern, not applicable here]

### The pointer RPC already exists and already takes `p_media_type` — do not touch it

`supabase/migrations/0007_recompute_next_episode_pointer.sql` is fully built and was already patched in 3.1's code review to accept `p_media_type` (movie/tv `tmdb_id`s aren't unique across media types). Its algorithm already does everything this story needs: films get their pointer nulled, tv shows get the first not-yet-watched episode id derived from `catalog_cache` order minus the full `watches` set, with graceful degradation when the cache row is missing. This story is purely a **consumer** of that RPC — no migration, no signature change, no algorithm change.

[Source: supabase/migrations/0007_recompute_next_episode_pointer.sql]

### Existing code this story extends (read before touching)

- **`app/data/watchLog.ts`** — **UPDATE** (narrow, additive). `LogWatchInput` gains one optional field; the insert's hardcoded `null` for `tmdb_episode_id` becomes real when provided. `getLoggedKeys` and `watchKey` are untouched.
- **`app/data/watchSync.ts`** — **UPDATE** (additive, inside the existing per-row loop). Adds one best-effort RPC call after a successful tv-episode upsert. Does not change the drain loop's control flow, the `progressed`/pass-until-no-progress logic, or the `syncing` guard.
- **`app/components/TitleCard.tsx`** — **UPDATE** (additive). Two new optional props + one new conditionally-rendered `Pressable`, alongside (not replacing) the existing `onLog`/`onToggleWatchlist` buttons.
- **`app/features/home/HomeScreen.tsx`** — **UPDATE** (structural, Up Next shelf only). Threads the pointer through `loadTracked`, gates the new props per-item, adds a confirmation mechanism. `loadWatchlist`/the Watchlist `Shelf` call site are untouched.
- **`app/data/trackedShows.ts`, `app/features/title-detail/TitleDetailScreen.tsx`** — **read-only**. Not touched by this story (see scope wall — no title-detail Watched control, no `trackedShows.ts` change).
- **`supabase/migrations/0007_recompute_next_episode_pointer.sql`** — **read-only**. Reused exactly as-is.

### Testing standards summary

No test framework exists in this repo (restated every story 1.3 → 3.1 — do **not** add one as a side effect). The done-bar, unchanged: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, `node scripts/smoke-check.mjs` passes if the local stack is available, and a recorded manual/DB-layer verification pass in Completion Notes (3.1 set the precedent for verifying an RPC-dependent flow directly against the local Supabase stack when no emulator is available — follow the same approach here for the sync → recompute → pointer-advance chain).

### Previous Story Intelligence

- **3.1** built the Up Next shelf (`hasLoadedRef`/`requestSeq`/`useFocusEffect` pattern), `tracked_shows`, and the `recompute_next_episode_pointer` RPC (with the `p_media_type` patch from its own code review) — this story only *consumes* that RPC and that shelf, it does not rebuild either.
- **3.1's scope wall** explicitly deferred "any 'current episode' badge/state on the title card" and "the ✓ Watched control, episode pre-selection, or any pointer advance on a logged watch" to this story — that deferral is exactly what Tasks 3–4 now pick up.
- **3.1's code review** found and fixed a narrow token-refresh race in `trackShow()`'s RPC call (session `auth.uid()` momentarily diverging from `p_user_id`, deferred as "self-healing once 3.2's own recompute call runs" — that forward reference is satisfied by this story's Task 2, since a subsequent successful sync will recompute correctly once the session settles).
- **Standing conventions carried forward:** no test framework as a drive-by; every network call races a bounded `AbortController` timeout, never the platform default; best-effort reads/writes degrade quietly and re-attempt on the next natural trigger rather than building new retry infrastructure; primary-content reads throw, best-effort lookups degrade to empty/no-op.

### Git Intelligence Summary

Recent commits:
```
7228570 feat: add tracking functionality for shows and films
e297994 docs: record code review findings for story 2.4
71eb556 fix: 2.4 // code-review patches — false-empty, focus-refetch races, spinner flicker
d5d8d50 feat: implement Watchlist shelf on Home screen (Story 2.4)
83e7789 feat: implement per-title write queue for watchlist toggles
```
Pattern holds: every feature commit is followed by a dedicated `fix:` commit once code review surfaces issues. This story touches a security-definer RPC's *calling* surface (via `watchSync.ts`) and a race-sensitive drain loop — budget for a review pass scrutinizing the dedupe-within-a-pass logic (Task 2) and the `watchedPending` reset timing (Task 4) even if the rest is clean.

### Project Structure Notes

- Updated: `app/data/watchLog.ts` (additive), `app/data/watchSync.ts` (additive), `app/components/TitleCard.tsx` (additive), `app/features/home/HomeScreen.tsx` (structural, Up Next shelf only).
- No new files, no new migrations, no new npm dependencies.
- No `packages/shared-types` change needed — the pointer/episode-id types stay internal TS types, same treatment as 3.1's `TrackedShow`/`EpisodeDetail` additions.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2: One-tap ✓ Watched advances the pointer] — story statement + all five ACs (FR11, FR14, FR15, ARCH-9/AD-10, UX-DR10, UX-DR23)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3 preamble] — the pointer-RPC contract note ("derive/recompute-from-the-full-watch-set... so the same function correctly serves both organic advance and recompute-after-delete")
- [Source: _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/prd.md#FR11, FR14, FR15, NFR1] — FR11's exact pointer-advance language; NFR1's "Start = tap on the Up Next card" testability note (why no title-detail control this story)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-10] — the binding RPC contract (signature, derive-not-increment, single-writer)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-4] — the outbox contract `logWatch`/`watchSync` already implement
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Component Patterns, #State Patterns] — "Watched / Continue control" row; "Watched confirmed" soft-confirmation copy
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md#Components] — `watched-badge: 'rounded-sm, primary fill, uppercase label.'`
- [Source: supabase/migrations/0007_recompute_next_episode_pointer.sql] — the existing, unmodified RPC this story consumes
- [Source: app/data/watchLog.ts] — the outbox commit this story extends with a real `tmdbEpisodeId`
- [Source: app/data/watchSync.ts] — the drain loop this story's recompute call hooks into, and the three existing retry triggers that satisfy AC2's offline case
- [Source: app/data/trackedShows.ts] — `TrackedShow.nextEpisodePointer`, already returned, threaded into the Up Next shelf by this story
- [Source: app/components/TitleCard.tsx] — the shared card this story extends with the Watched pill, alongside the existing `onLog`/`onToggleWatchlist` controls
- [Source: app/features/home/HomeScreen.tsx] — the Up Next shelf (3.1) this story wires the pill into
- [Source: app/features/add/AddScreen.tsx] — `handleLog`'s "confirm only after the local commit resolves" reasoning, and the `COPY_LOGGED`/`COPY_LOG_FAILED` copy this story reuses
- [Source: app/features/title-detail/TitleDetailScreen.tsx] — the simpler inline-confirmation pattern recommended for `HomeScreen.tsx`'s new confirmation UI
- [Source: _bmad-output/implementation-artifacts/3-1-track-a-show-or-film-into-up-next.md] — the scope-wall deferrals this story picks up, and the `p_media_type` RPC patch from its code review

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the bmad-dev-story workflow.

### Debug Log References

- Local Supabase stack (`supabase/` docker compose) had drifted: `recompute_next_episode_pointer` was still the pre-3.1-code-review 2-arg overload (no `p_media_type`). Re-ran `node scripts/apply-migrations.mjs` (idempotent, safe to re-run per its own header) to bring it in sync with the migration files before DB-layer verification — this left a harmless stray 2-arg overload alongside the correct 3-arg one in the local dev DB only; the migration file on disk (`0007_recompute_next_episode_pointer.sql`) is untouched and correct.

### Completion Notes List

- Task 1: `LogWatchInput.tmdbEpisodeId?: number | null` added; `logWatch`'s insert now writes a real episode id instead of a hardcoded `null`. `getLoggedKeys`/`watchKey` untouched.
- Task 2: `watchSync.ts`'s per-row drain loop now calls `recompute_next_episode_pointer` (bounded by a new `RECOMPUTE_TIMEOUT_MS = 10_000`, mirroring `UPSERT_TIMEOUT_MS`) immediately after a tv-episode row's own successful upsert, wrapped in its own try/catch so a failed/timed-out recompute never marks the watch's sync as failed. Deduped within one drain pass via a per-pass `Set<string>` keyed `${tmdb_id}:${media_type}`. Skipped for `movie` rows and `tv` rows with a null `tmdb_episode_id`.
- Task 3: `TitleCard.tsx` gained `onMarkWatched`/`watchedPending` optional props and a third nested `Pressable` — the `watched-badge` pill (rounded-sm, primary fill, uppercase "Watched" label via `textTransform`), rendered only when `onMarkWatched` is provided. `accessibilityLabel` swaps from "Mark X watched" to "X marked watched" when `watchedPending`. Existing `onLog`/`onToggleWatchlist` untouched.
- Task 4: `HomeScreen.tsx`'s `loadTracked` now threads `TrackedShow.nextEpisodePointer` through the existing `rows`/`settled` zip into a new `UpNextItem` type — no extra fetch. `handleMarkWatched` calls `logWatch` (tv, real episode id) → shows confirmation → marks the item pending → best-effort `triggerSync()` → `loadTracked()` refresh, matching `AddScreen.handleLog`'s "local write is the commit" shape. The Watched pill is gated per-item (`mediaType === 'tv' && nextEpisodePointer != null`) and passed only to the Up Next `Shelf` instance — the Watchlist shelf gets no new props.
- Task 5: Home gained its own transient inline confirmation (`confirmation` state + `showConfirmation` + bounded `setTimeout` + `mountedRef` guard + `accessibilityLiveRegion="polite"`), mirroring `TitleDetailScreen`'s pattern. Reused `AddScreen`/`TitleDetailScreen`'s exact copy: `'Logged — nice one.'` / `"Couldn't save that — try again."`.
- Task 6: `npx tsc --noEmit` clean. `npx expo export --platform android` bundled successfully (1041 modules). `node scripts/smoke-check.mjs` passed against the local stack (all RLS/anon-deny checks green). DB-layer verification run directly against the local Supabase stack (docker compose, migrations re-applied to pick up the `p_media_type` patch) simulating exactly what `watchSync.ts`'s Task 2 now does:
  - Seeded a synthetic tv show (`catalog_cache`, 3 episodes across 2 seasons) and a `tracked_shows` row with pointer pre-set to episode 1.
  - Inserted a synced `watches` row for episode 1 (real `watched_at` + `tmdb_episode_id`, confirming AC3), then called `recompute_next_episode_pointer` with `auth.uid()` faked via `request.jwt.claim.sub` — pointer advanced 5001 → 5002.
  - Repeated for episode 2 → pointer advanced to 5003 (the final episode).
  - Watched episode 3 → pointer went `null` (fully caught up), matching the "no Watched pill when caught up" scope-wall behavior.
  - Called the RPC for a tracked `movie` row → returned/stayed `null`, confirming AC4's film no-op.
  - All assertions run inside a transaction, rolled back — no synthetic data left in the local stack.
  - `grep -rn "tracked_shows"` across `app/` confirms only `trackedShows.ts`'s `.from('tracked_shows')` `upsert`/`select` calls and this story's `watchSync.ts` RPC call touch the table/pointer — no `.update()` anywhere (AC4).
  - No emulator/device available in this environment — on-device manual pass (pill rendering, accessibility label swap, Watched pill visually absent for films/caught-up shows) is outstanding, same precedent as every prior story.

### File List

- `app/data/watchLog.ts` (modified)
- `app/data/watchSync.ts` (modified)
- `app/components/TitleCard.tsx` (modified)
- `app/features/home/HomeScreen.tsx` (modified)
- `_bmad-output/implementation-artifacts/3-2-one-tap-watched-advances-the-pointer.md` (modified — task checkboxes, Dev Agent Record, Status, Change Log)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status tracking)

## Change Log

- 2026-07-08: Story implemented — real `tmdb_episode_id` through the outbox (Task 1), organic pointer-advance as a `watchSync.ts` post-upsert side effect (Task 2), the ✓ Watched pill on `TitleCard` (Task 3), wired into the Up Next shelf only (Task 4), Home's soft confirmation (Task 5). `tsc`/`expo export`/`smoke-check` clean; RPC chain verified directly against the local Supabase stack (pointer advance, caught-up null, film no-op, AC3 fields, AC4 no-raw-PATCH grep). On-device manual pass outstanding (no emulator). Status → review.
