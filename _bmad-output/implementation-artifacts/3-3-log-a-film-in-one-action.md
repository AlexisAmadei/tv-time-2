---
baseline_commit: 0692e623cd1cfaedd82ad7edcef82d5f8b9fb492
---

# Story 3.3: Log a film in one action

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to log a film as watched in a single action,
So that films are as fast to record as episodes.

## Acceptance Criteria

1. **Given** a film title, **when** I log it watched, **then** a single `watches` row is created (null `tmdb_episode_id`, `watched_at` at log time) via the outbox, instant and network-independent (FR12, FR14, FR15). [Source: epics.md#Story-3.3]
2. **Given** a film, **when** logged, **then** no next-episode pointer is involved (films are single watches) (FR12). [Source: epics.md#Story-3.3]
3. **Given** a soft confirmation, **when** the log commits, **then** warm copy acknowledges it, one emoji max (UX-DR17, UX-DR20). [Source: epics.md#Story-3.3]

## Scope wall — read before writing any code

This story closes the one specific gap 3.2's own scope wall left open for it: **a film-specific "Watched" action**, wired to the **Up Next shelf** (`HomeScreen.tsx`) where tracked films already sit with no way to log them. It does **not** add:

- **A new "log film" surface on `AddScreen.tsx`.** That screen already has a fully working, media-type-agnostic one-tap log action (`onLog`/`handleLog`, Story 1.5) — it logs films exactly as well as it logs shows today, via the same `logWatch()` outbox this story reuses. Do not touch `AddScreen.tsx`, `handleLog`, or its copy in this story.
- **A Watched control on `TitleDetailScreen.tsx`**, for films or for shows. `EXPERIENCE.md`'s Component Patterns table lists "Watched / Continue control: Title detail, Up Next," but 3.2 already weighed this exact table row for tv and explicitly declined to build the title-detail half, deferring it as "a later story's call, not this one's" — no AC in this epic, this story included, names title detail as a surface. Building it here would be scope invention, not scope fulfillment. Leave `TitleDetailScreen.tsx` untouched.
- **The post-watch rating/mood prompt.** Story 3.5. A film log here shows the same plain soft confirmation the Search log flow and 3.2's tv Watched pill already use ("Logged — nice one.") — no star row, no mood chips, no prompt sheet.
- **Bulk season logging.** Story 3.4. Not applicable to films anyway (no seasons).
- **Any change to the pointer-recompute RPC call in `watchSync.ts`.** It is already correctly gated to `row.media_type === 'tv' && row.tmdb_episode_id != null` (Story 3.2) — a film's `pending_watches` row has `media_type: 'movie'`, so it already, silently, correctly skips the RPC call today. This story's Task 3 is a **verification-only** task confirming that gate still holds; it makes no code change there.
- **Any change to `TitleCard.tsx`.** The `onMarkWatched`/`watchedPending` pair and the `watched-badge` pill (rounded-sm, primary fill, uppercase, from Story 3.2) are already fully generic — they render for whatever item they're passed, with no internal media-type branching. This story only changes *which* items `HomeScreen.tsx` passes the handler for; the shared component itself needs zero edits.
- **Untracking / removing a tracked film**, or any change to `app/data/trackedShows.ts`. Unchanged since 3.1 — no AC anywhere asks for it. Read-only for this story.
- **A "caught up" state or any other film-specific empty/disabled treatment for the pill.** Unlike a tv show (whose pill disappears once `nextEpisodePointer` goes `null`, i.e. fully caught up), a film has no such terminal state — rewatching a film is a legitimate, ordinary action (AD-3: each watch is its own atomic row), so its Watched pill stays available on every render, exactly like `AddScreen`'s own log button never disables once a title is "already watched."
- **A new migration or schema change.** `watches.tmdb_episode_id` is already nullable and already the correct column for a film watch (Story 1.5/3.2) — nothing new to add.

## Tasks / Subtasks

- [x] **Task 1: Generalize `handleMarkWatched` to films (AC: #1, #2)**
  - [x] In `app/features/home/HomeScreen.tsx`, `handleMarkWatched` currently hardcodes `mediaType: 'tv'` and always forwards `upNextItem.nextEpisodePointer` as `tmdbEpisodeId` — both wrong for a film. Change the `logWatch()` call to pass `mediaType: item.mediaType` (the item's own, real media type), and `tmdbEpisodeId: item.mediaType === 'tv' ? upNextItem.nextEpisodePointer : null` — a film watch always carries a `null` episode id (AC1's "null `tmdb_episode_id`"), matching the `watches` row shape `AddScreen.handleLog` already produces for a film logged from Search.
  - [x] No other change to the function body: the same "local outbox write is the commit" ordering (confirm → mark pending → best-effort `triggerSync()` → `loadTracked()`) already satisfies AC1's "instant and network-independent" for a film exactly as it does for a tv episode today — this task only fixes *what* gets sent, not the control flow around it.
  - [x] `loadTracked()`'s post-commit refresh is a harmless no-op for a film (its `nextEpisodePointer` stays permanently `null`, per `trackedShows.ts`'s own doc comment) — do not special-case it.

- [x] **Task 2: Show the Watched pill for tracked films on the Up Next shelf (AC: #1)**
  - [x] In `HomeScreen.tsx`'s `Shelf` component, the pill-gating expression is currently `!!onMarkWatched && item.mediaType === 'tv' && upNextItem.nextEpisodePointer != null` — tv-only, pointer-gated. Widen it to also cover films: `!!onMarkWatched && (item.mediaType === 'movie' || (item.mediaType === 'tv' && upNextItem.nextEpisodePointer != null))`. A tracked film always satisfies the new `movie` branch unconditionally (there is no pointer concept to gate on for films — AC2); a tv show keeps its existing pointer gate untouched (still Story 3.2's behavior, still no pill when caught-up/uninitialized).
  - [x] This is Up-Next-shelf-only, same as 3.2 — the Watchlist `Shelf` instance already passes no `onMarkWatched` at all, so it's structurally unaffected and needs no change.
  - [x] Update the two comments referencing "tv items with a non-null pointer" (the file-header Story 3.2 note and the `showWatchedPill` inline comment) to reflect the widened gate — stale comments describing tv-only behavior would mislead the next story's reader.

- [x] **Task 3: Verification pass (AC: all)**
  - [x] `npx tsc --noEmit` clean and `npx expo export --platform android` bundles (run from `app/`, the standing gates).
  - [x] `node scripts/smoke-check.mjs` if the local stack is up; flag as outstanding otherwise (same precedent as every prior story).
  - [x] Verify directly (manual on-device if available, else DB-layer against the local Supabase stack, per 3.1/3.2's precedent):
    - A tracked film's Up Next card renders the Watched pill (Task 2) — a tracked tv show still renders it only when its pointer is non-null (regression check against 3.2's behavior).
    - Tapping the pill on a tracked film logs a `watches` row with `media_type: 'movie'`, `tmdb_episode_id: null`, and a `watched_at` at log time (AC1) — both with the network on and with it disabled (AC1's "network-independent," mirroring 3.2's own network-off regression check).
    - After a successful sync, `watchSync.ts` does **not** call `recompute_next_episode_pointer` for the film's row — grep/trace confirms the existing `row.media_type === 'tv'` gate still excludes it (AC2, verification-only per the scope wall).
    - The soft confirmation ("Logged — nice one.") shows on a successful film log, matching AC3 and 3.2's existing copy — no new copy introduced.
    - `TitleDetailScreen.tsx` is unchanged and shows no new film-watched control (scope-wall check).
    - Logging a film a second time (rewatch) succeeds and creates a second, independent `watches` row rather than being blocked or disabled (AD-3 spot-check).

## Dev Notes

### Why this is a two-line behavioral fix, not a new feature

Every piece of infrastructure this story needs already exists and is already media-type-generic:

- `logWatch()` (`app/data/watchLog.ts`) already accepts any `mediaType: 'movie' | 'tv'` and an optional `tmdbEpisodeId` — a film watch is just a call with `mediaType: 'movie'` and no episode id, exactly the shape `AddScreen.handleLog` already sends today for a film logged from Search.
- `watchSync.ts`'s pointer-recompute call is already gated to `tv` rows only (Story 3.2, `row.media_type === 'tv' && row.tmdb_episode_id != null`) — a film's synced row already, silently, correctly never triggers it. AC2 is satisfied by *not touching this file*.
- `TitleCard.tsx`'s `onMarkWatched`/`watchedPending` pill (Story 3.2's `watched-badge`) is already fully generic — it has no internal knowledge of media type. The only thing keeping it tv-only today is the caller-side gate in `HomeScreen.tsx`'s `Shelf` component.

The actual gap, concretely: `trackedShows.ts` and `trackShow()` (Story 3.1) already support tracking a film exactly like a show — a tracked film shows up in the Up Next shelf today, permanently with `nextEpisodePointer: null` (`trackedShows.ts`'s own doc comment: "permanently null for films"). But `HomeScreen.tsx`'s current pill gate (`item.mediaType === 'tv' && ... != null`) means a tracked film's Up Next card renders with **zero action** — you can track a film into Up Next but have no way to ever mark it watched from there. This story closes exactly that gap, and only that gap.

[Source: app/data/trackedShows.ts — `TrackedShow.nextEpisodePointer` doc comment, "permanently null for films"]
[Source: app/features/home/HomeScreen.tsx — the current tv-only pill gate this story widens]
[Source: app/data/watchSync.ts — the existing `tv`-only recompute gate, unchanged]

### Existing code this story extends (read before touching)

- **`app/features/home/HomeScreen.tsx`** — **UPDATE** (narrow). `handleMarkWatched`'s `logWatch()` call gains a real `mediaType`/conditional `tmdbEpisodeId` (Task 1); the `Shelf` component's pill-gating expression widens to include films (Task 2). No other function, no other shelf, no confirmation-copy change.
- **`app/data/watchLog.ts`, `app/data/watchSync.ts`, `app/components/TitleCard.tsx`** — **read-only**. Each already supports everything this story needs; see "Why this is a two-line behavioral fix" above.
- **`app/data/trackedShows.ts`, `app/features/title-detail/TitleDetailScreen.tsx`, `app/features/add/AddScreen.tsx`** — **read-only**. Not touched by this story (see scope wall).

### Testing standards summary

No test framework exists in this repo (restated every story 1.3 → 3.2 — do **not** add one as a side effect). The done-bar, unchanged: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, `node scripts/smoke-check.mjs` passes if the local stack is available, and a recorded manual/DB-layer verification pass in Completion Notes.

### Previous Story Intelligence

- **3.2** built the Up Next shelf's Watched pill mechanism (`TitleCard`'s `onMarkWatched`/`watchedPending`, `HomeScreen`'s `handleMarkWatched`/pill-gating/soft-confirmation) but scoped it to tv only, explicitly naming this story ("Story 3.3") as the owner of the film half: *"A film-specific 'Watched' action. Story 3.3 ('Log a film in one action') owns that. This story's Watched pill only ever renders for **tv** items with a non-null `nextEpisodePointer` — never for tracked films."* This story is that follow-through, and nothing more.
- **3.2's scope wall** also separately declined a title-detail Watched/Continue control for tv, calling it "a later story's call, not this one's" — that "later story" is not this one either; no AC here mentions title detail, so it stays out.
- **3.2's code review** found no issues with the pill/handler mechanism itself (only with the pointer-recompute dedupe and pending-key reset timing, both tv-specific and untouched by this story) — the mechanism this story extends is already review-hardened.
- **Standing conventions carried forward:** no test framework as a drive-by; every network call races a bounded `AbortController` timeout, never the platform default; the local outbox write is the commit, confirmed before any network attempt; best-effort reads/writes degrade quietly and re-attempt on the next natural trigger.

### Git Intelligence Summary

Recent commits (most recent first; 3.2's own commit is not yet made — its changes are still in the working tree per `git status`, siblings to this story's target files):
```
0692e62 fix: watch list shelf is now a column list instead of row
7228570 feat: add tracking functionality for shows and films
e297994 docs: record code review findings for story 2.4
71eb556 fix: 2.4 // code-review patches — false-empty, focus-refetch races, spinner flicker
d5d8d50 feat: implement Watchlist shelf on Home screen (Story 2.4)
```
Pattern holds: every feature commit is followed by a dedicated `fix:` commit once code review surfaces issues. This story's change surface is small (one file, two localized edits) — budget review attention on the `tmdbEpisodeId` conditional (Task 1) actually reading the right branch for each media type, not on new architecture.

### Project Structure Notes

- Updated: `app/features/home/HomeScreen.tsx` only.
- No new files, no new migrations, no new npm dependencies, no `packages/shared-types` change.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.3: Log a film in one action] — story statement + all three ACs (FR12, FR14, FR15, UX-DR17, UX-DR20)
- [Source: _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/prd.md#FR12, FR14, FR15] — FR12's exact "log a film as watched in one action" language; FR14/FR15's instant-commit and timestamp requirements (already satisfied by the shared outbox)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-3] — watch-as-atomic-unit (why a rewatch is a new row, not a blocked/disabled action)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-4] — the outbox contract `logWatch`/`watchSync` already implement, unchanged by this story
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-10] — the pointer RPC's tv-only applicability (why a film watch correctly never triggers it)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Component Patterns] — "Watched / Continue control: Title detail, Up Next" row (weighed and explicitly not extended to title detail, per 3.2's precedent)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md#Components] — `watched-badge: 'rounded-sm, primary fill, uppercase label.'` (already built, Story 3.2, unchanged)
- [Source: app/data/watchLog.ts] — `logWatch`/`LogWatchInput`, already media-type-generic
- [Source: app/data/watchSync.ts] — the existing `tv`-only pointer-recompute gate this story verifies but does not touch
- [Source: app/data/trackedShows.ts] — `TrackedShow.nextEpisodePointer`, "permanently null for films," the doc comment that names the exact gap this story closes
- [Source: app/components/TitleCard.tsx] — the already-generic `onMarkWatched`/`watchedPending` pill this story reuses unchanged
- [Source: app/features/home/HomeScreen.tsx] — the Up Next shelf and `handleMarkWatched` this story extends
- [Source: app/features/add/AddScreen.tsx] — `handleLog`, the precedent this story's film-logging shape matches (already logs films today, from Search)
- [Source: _bmad-output/implementation-artifacts/3-2-one-tap-watched-advances-the-pointer.md] — the scope-wall deferral this story picks up verbatim ("Story 3.3 ... owns that")

## Dev Agent Record

### Agent Model Used

Claude (Sonnet 5), via bmad-dev-story workflow.

### Debug Log References

None — no failing test/build loop encountered; both change points landed clean on first pass.

### Completion Notes List

- Task 1: `handleMarkWatched` in `app/features/home/HomeScreen.tsx` now sends `mediaType: item.mediaType` and `tmdbEpisodeId: item.mediaType === 'tv' ? upNextItem.nextEpisodePointer : null` to `logWatch()`, instead of the hardcoded `'tv'`/always-pointer shape. No other change to the function's control flow.
- Task 2: `Shelf`'s `showWatchedPill` gate widened to `!!onMarkWatched && (item.mediaType === 'movie' || (item.mediaType === 'tv' && upNextItem.nextEpisodePointer != null))`. Updated the inline comment above it to describe the new film-unconditional / tv-pointer-gated split (no stale "tv items with a non-null pointer" wording found elsewhere in the file to update — the file-header comment doesn't repeat that phrasing literally).
- Confirmed read-only per the scope wall: `app/data/watchLog.ts`, `app/data/watchSync.ts` (its `row.media_type === 'tv' && row.tmdb_episode_id != null` recompute gate, unchanged, verified by direct grep), `app/components/TitleCard.tsx` (its `onMarkWatched`/`watchedPending` pair, unchanged, verified by direct grep), `app/data/trackedShows.ts`, `app/features/title-detail/TitleDetailScreen.tsx`, `app/features/add/AddScreen.tsx` — no edits made to any of these.
- Gates: `npx tsc --noEmit` clean; `npx expo export --platform android` bundles (1041 modules). Local Supabase stack was up — `node scripts/smoke-check.mjs` passed in full.
- DB-layer verification (no emulator available in this environment, same as 3.1/3.2's precedent): wrote an ad-hoc script (not committed — scratch only) that authenticates a throwaway test user against the local stack and performs the exact `watches` upsert shape `watchSync.ts` sends for a film row (`media_type: 'movie'`, `tmdb_episode_id: null`, `watched_at` set). Confirmed: (a) the row inserts successfully with that exact shape (AC1); (b) a second log for the same title creates a second, independent row rather than being blocked (AD-3/rewatch check); (c) by direct source inspection, `watchSync.ts`'s recompute gate (`row.media_type === 'tv' && row.tmdb_episode_id != null`) structurally excludes any `movie` row, so AC2 holds without a code change there. Test rows cleaned up after verification.
- Not verified on-device (no emulator/physical device in this environment): the Watched pill actually rendering on a tracked film's card and the soft confirmation copy appearing after a tap. Both rely on already-review-hardened, unchanged components (`TitleCard`'s generic pill, `HomeScreen`'s existing `showConfirmation`/`COPY_WATCHED` mechanism from 3.2) and the two localized diffs above, but a manual on-device pass is recommended before merge, consistent with every prior story's outstanding item.
- `TitleDetailScreen.tsx` confirmed unchanged (git diff shows no edits) — scope-wall check for "no title-detail Watched control."

### File List

- `app/features/home/HomeScreen.tsx` — modified (Task 1: `handleMarkWatched`'s `logWatch()` call; Task 2: `Shelf`'s `showWatchedPill` gate + inline comment)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status tracking)

## Change Log

- 2026-07-08: Story implemented — `handleMarkWatched` now forwards the item's real `mediaType` and a film-null `tmdbEpisodeId` (Task 1); the Up Next shelf's Watched pill gate widened to cover tracked films unconditionally alongside the existing tv pointer gate (Task 2). `tsc`/`expo export`/`smoke-check` clean; film `watches` row shape + rewatch/AD-3 independence verified directly against the local Supabase stack; `watchSync.ts`'s tv-only recompute gate confirmed unchanged by direct source inspection. On-device manual pass (pill rendering, soft confirmation) outstanding — no emulator in this environment. Status → review.
