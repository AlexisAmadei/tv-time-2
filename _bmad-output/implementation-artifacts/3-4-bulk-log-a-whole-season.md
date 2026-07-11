---
baseline_commit: fa0332b1a74e83e216dccd459a61f2eb3b4df62d
---

# Story 3.4: Bulk-log a whole season

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to mark an entire season watched in one confirmation,
So that a binge is one action, not one tap per episode.

## Acceptance Criteria

1. **Given** a season row on title detail, **when** I choose "Mark whole season watched", **then** a bulk-log sheet opens with all episodes pre-checked (deselect, don't select) (FR13, UX-DR11). [Source: epics.md#Story-3.4]
2. **Given** the sheet, **when** I deselect any episodes and confirm once, **then** one `watches` row per selected episode is committed via the outbox, and the pointer advances to the next unwatched episode via the RPC (FR13, ARCH-9). [Source: epics.md#Story-3.4]
3. **Given** the bulk sheet, **when** I confirm, **then** I may optionally apply a single season-level rating/mood applied to the season (FR13). [Source: epics.md#Story-3.4]
4. **Given** the commit, **when** it lands, **then** a warm confirmation acknowledges the binge ("That's a whole season in one sitting. Respect.") (UX-DR20). [Source: epics.md#Story-3.4]

## Scope wall — read before writing any code

This story is TV-only (films have no seasons — `TitleDetailScreen.tsx` already renders the Seasons section only when `detail.mediaType === 'tv'`). It does **not** add:

- **The post-watch rating/mood prompt from Story 3.5.** 3.5 ("Rate and react after a watch") is still `backlog` and owns the automatic star-row + multi-select mood-chip sheet that slides up after a *single* watch commits. This story's season-level rating/mood control is a **separate, self-contained, minimal** control that lives *inside the bulk-log sheet itself* — it is not the 3.5 component, must not be built as if it were, and should not be over-engineered to anticipate 3.5's shape. AC3 says "a **single** season-level rating/mood" (singular mood, not 3.5's 0–2 multi-select) — build exactly that: one optional 0–5 half-star rating and at most one optional mood chip, applied identically to every episode `watches` row this bulk action creates. Do not build a multi-mood-chip selector here.
- **A per-episode "already watched" indicator in the season/episode list.** No story has built this yet (not 2.2, not 3.1/3.2/3.3) — title detail's episode rows show only number/name/air-date today. Do not add watched badges to `SeasonRow`'s episode list as a side effect of this story.
- **Excluding or flagging unaired/future episodes from the bulk sheet.** No AC or UX doc names this. `EpisodeDetail` doesn't even carry an "aired" boolean today, only a nullable `airDate` string. Pre-check everything the season payload returns, exactly as AC1 says ("all episodes pre-checked") — do not invent air-date filtering logic.
- **A "caught up" dialog or notify-bell nudge.** That's the *Caught up* state pattern (EXPERIENCE.md#State Patterns) and the *contextual nudge* (EXPERIENCE.md#Notifications) — both unbuilt, both out of this story's ACs.
- **Untracking, or any change to `app/data/trackedShows.ts`.** Read-only. The bulk sheet works whether or not the title is tracked (see Dev Notes — the pointer RPC already no-ops harmlessly for an untracked title).
- **A new shared `StarRating`/`MoodChip` component under `app/components/`.** Build the season-rating control *inline* in this story's own new sheet file. Extracting a shared component is 3.5's call once its own, richer requirements are known — premature extraction now would guess at an API that might not fit 3.5's actual needs.
- **Any change to `HomeScreen.tsx`.** Home already refetches `getTrackedShows()`/`getWatchlist()` on every focus (`useFocusEffect`, wired since 2.4/3.1) — navigating back from title detail after a bulk log naturally picks up the recomputed pointer with zero new code there.

## Tasks / Subtasks

- [x] **Task 1: Fix two pre-existing gaps in the outbox/sync path that AC2/AC3 depend on (must land before the UI)**

  These are not new features — they are latent bugs in code from 3.2/1.5 that this story is the first to actually exercise. Read `app/data/watchLog.ts` and `app/data/watchSync.ts` in full before touching them.

  - [x] **1a — `LogWatchInput` needs `rating`/`mood` fields.** `logWatch()` (`app/data/watchLog.ts`) currently hardcodes `null, null, null` for `rating, mood, note` on every insert (AC3 has never been exercised before this story). Add optional `rating?: number | null` and `mood?: string | null` to `LogWatchInput`, and pass them through to the `insert into pending_watches` call in place of the hardcoded `null, null,` (leave `note` hardcoded null — Story 3.6's job, untouched here).
  - [x] **1b — `watchSync.ts`'s upsert sends `mood` as a bare string into a `text[]` column.** The local `pending_watches.mood` column is `text` (singular, `app/data/db.ts`), but the server `watches.mood` column is `text[]` (`supabase/migrations/0003_watches.sql`). Every prior story left `mood` always `null`, so this mismatch has never actually round-tripped. In the `.upsert({...})` call inside `triggerSync()`, change `mood: row.mood` to `mood: row.mood ? [row.mood] : null` — a real array, not a bare string.
  - [x] **1c — Recompute-timing bug: `watchSync.ts` calls the pointer RPC too early when several episodes of the *same* show sync within one pass.** This is the correctness-critical fix for AC2's "pointer advances to the next unwatched episode." Read the current code closely: inside the `for (const row of rows)` loop, the tv-recompute branch calls `recompute_next_episode_pointer` **immediately** after that one row's `watches` upsert succeeds, and dedupes further calls *for the rest of that pass* via `recomputedThisPass`. For a single episode-at-a-time watch (3.2's only case until now) this is harmless. For this story's bulk sheet — which calls `logWatch()` once per selected episode, landing N `pending_watches` rows for the *same* show in the same drain pass — it is wrong: the recompute fires after the *first* of the N rows upserts, using a `watches` table that at that instant reflects only 1 of the N newly-committed episodes, not all of them. The remaining N-1 upserts in that same pass never get to trigger a fresh recompute (deduped), so `next_episode_pointer` lands on "next after episode 1," not "next after the whole season."
    - **Fix:** move the recompute call out of the per-row loop. Collect the set of tv `tmdb_id`s needing a recompute while iterating `rows` (same dedup-per-pass reasoning as today, just don't call the RPC yet), then — after the `for (const row of rows)` loop finishes, still inside the current `while (true)` pass, before checking `progressed` — call `recompute_next_episode_pointer` once per collected `tmdb_id`. This guarantees every recompute call in a given pass sees *all* of that pass's upserts for that show, not just the first. It changes nothing observable for 3.2's single-episode case (there's only ever one row to upsert before the single recompute call either way) and makes the multi-episode-per-show case correct. Keep the existing timeout/try-catch/log-on-failure shape for the RPC call — only its position in the function moves.

- [x] **Task 2: DB — lock the `mood` column to the FR18 canonical set (AC3)**
  - [x] Add a new migration `supabase/migrations/0008_watches_mood_check.sql` (follow every existing migration's header-comment convention — see `0003_watches.sql`/`0006_tracked_shows.sql` for the idempotent, re-runnable, commented style). Add a `CHECK` constraint on `public.watches.mood` so every element is one of the locked 8 emoji (epics.md's Epic 3 header note + ARCHITECTURE-SPINE.md's Data & formats convention: "the v1 mood set is LOCKED... never validated only in client code"): `check (mood is null or mood <@ array['😭','😂','😱','🥰','🤯','😴','😬','🔥']::text[])`. Do **not** add a cardinality constraint (array length) — this story only ever writes 0 or 1 elements, but the DB-level rule from the architecture spine is about the *value set*, not the count; leave count unconstrained for 3.5 to decide later.
  - [x] This is a `create constraint if not exists`-style idempotent migration — since Postgres has no native `ADD CONSTRAINT IF NOT EXISTS`, guard it with a `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'watches_mood_check') THEN ... END IF; END $$;` block (or an equivalent idempotent pattern) so the migration folder stays safely re-runnable per this repo's stated convention (no migration-tracking table yet — the whole folder re-applies).

- [x] **Task 3: "Mark whole season watched" entry point on title detail (AC1)**
  - [x] In `app/features/title-detail/TitleDetailScreen.tsx`'s `SeasonRow` component, add a new pressable labelled "Mark whole season watched" inside the season card — **separate** from the existing header `Pressable` that toggles `expanded` (do not repurpose that tap; expand/collapse is unrelated, unchanged 2.2 behavior). Wire it to a new callback prop, e.g. `onMarkSeasonWatched: (season: SeasonDetail) => void`, passed down from `TitleDetailScreen`.
  - [x] 44pt/48dp minimum tap target (Accessibility Floor), `accessibilityRole="button"`, label something like `` `Mark all of ${season.name} watched` ``.

- [x] **Task 4: Build the bulk-log sheet (AC1, AC2, AC3)**
  - [x] New file `app/features/title-detail/BulkLogSheet.tsx` — this is the first bottom-sheet/modal in the codebase; use React Native's built-in `Modal` (`transparent`, `animationType="slide"`), no new dependency. `rounded/lg` (`theme.radius.lg`, 18px) top corners on the sheet surface, `surfaceRaised` background (DESIGN.md#Shapes/#Colors — "Raised Plum — cards, nav bar, sheets"). A dimmed backdrop `Pressable` behind the sheet dismisses it on tap (same as tapping an explicit Cancel/close control) — dismissing must never log anything.
  - [x] Props: the `SeasonDetail` being logged, `visible: boolean`, `onDismiss: () => void`, and an `onConfirm` callback (or do the logging inline in this component and call a passed-in `showConfirmation`/`onDone` — either shape is fine, keep `TitleDetailScreen`'s existing `tmdbId`/`mediaType` in scope for the `logWatch()` calls, which need the show's tv `tmdbId`).
  - [x] Episode list: one row per `season.episodes[]` entry, a checkbox (`accessibilityRole="checkbox"`, `accessibilityState={{ checked }}`, 44/48pt hit target) + episode number + name, **all pre-checked by default** (AC1 — "deselect, don't select"). Track selection as `Set<number>` keyed by `episodeNumber` or `tmdbEpisodeId` (either is fine; `tmdbEpisodeId` is what actually gets sent to `logWatch`, so keying the Set on that directly avoids a lookup at confirm time).
  - [x] Season-level rating (AC3): a minimal half-step 5-star row, 0–10 internal scale (matches `watches.rating`'s existing `smallint` 0–10 CHECK, already in `0003_watches.sql` — no schema change needed for rating). `gold` color (`theme.colors.gold` — the one place gold appears per DESIGN.md; "empty portion at 28% opacity"). Optional — a null/unset state must be representable (e.g., `rating: number | null`, starting `null`).
  - [x] Season-level mood (AC3): a single-select row of the 8 locked chips, in FR18's canonical order — 😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling (epics.md Epic 3 header note). Tapping a chip selects it (radio behavior — selecting a new one deselects the previous); tapping the already-selected chip deselects it (0 or 1 selected, never more). `pill` shape (`theme.radius.pill`), selected fills `surfaceSunken` (DESIGN.md#Components' mood-chip spec). `accessibilityRole="button"`, `accessibilityState={{selected}}`, label the mood's name (not just the emoji) per the Accessibility Floor ("mood chips announce name").
  - [x] Confirm control: label reflecting the count, e.g. `` `Log ${selected.size} episode${selected.size === 1 ? '' : 's'}` ``; disable it (and communicate why is unnecessary — just disable) when `selected.size === 0`, since confirming zero episodes is a no-op with nothing to confirm.
  - [x] On confirm: for each selected episode (iterate `season.episodes` in order, filtering to the selected set — not the Set's insertion order, so the resulting `watches` rows land in natural episode order), `await logWatch({ tmdbId, mediaType: 'tv', tmdbEpisodeId: ep.tmdbEpisodeId, rating: seasonRating, mood: seasonMood })` sequentially (a plain `for...of` with `await` inside — avoid `Promise.all` here; every other multi-write path in this codebase serializes through the single `expo-sqlite` connection sequentially, e.g. `watchSync.ts`'s own drain loop). `logWatch()` already fires its own best-effort `triggerSync()` per call — no extra sync call needed from this sheet.
  - [x] Error handling: wrap the confirm loop in try/catch. `logWatch()` only throws in the (rare, auth-gated-screen) missing-session case — on a thrown error, `console.warn` it, show a save-failed message, and leave the sheet open so the user can retry; do not attempt to roll back any episodes that already committed before the failure (each `logWatch()` call is its own atomic local commit — this matches the codebase's established "no distributed rollback" posture elsewhere, e.g. `TitleDetailScreen`'s own watchlist/track handlers only roll back their *own* single optimistic flip, never a batch).
  - [x] On full success: call `onDismiss()`/close the sheet, and surface the confirmation copy via `TitleDetailScreen`'s existing `showConfirmation()` mechanism (do not build a second confirmation mechanism — same reasoning 3.1/2.3 already established in this file).

- [x] **Task 5: Wire the sheet into `TitleDetailScreen.tsx` (AC1, AC4)**
  - [x] Add state for which season (if any) has its bulk-log sheet open, e.g. `const [bulkLogSeason, setBulkLogSeason] = useState<SeasonDetail | null>(null)`. `SeasonRow`'s new "Mark whole season watched" pressable calls a handler that sets this.
  - [x] Render `<BulkLogSheet season={bulkLogSeason} visible={bulkLogSeason != null} ... />` once, at the `TitleDetailScreen` level (not nested per-`SeasonRow`), passing `tmdbId`/`mediaType` from the screen's own route params.
  - [x] Add `const COPY_SEASON_LOGGED = "That's a whole season in one sitting. Respect.";` (verbatim, AC4/UX-DR20/Flow 2) next to the file's other `COPY_*` constants, and pass it to `showConfirmation()` on a successful bulk commit.

- [x] **Task 6: Verification pass (AC: all)**
  - [x] `npx tsc --noEmit` clean and `npx expo export --platform android` bundles (run from `app/`, the standing gates).
  - [x] `node scripts/smoke-check.mjs` if the local stack is up; flag as outstanding otherwise.
  - [x] Re-apply migrations against the local Supabase stack (`0008` is new) and verify directly against it:
    - Tracking a tv show, opening its title detail, tapping "Mark whole season watched" on a season with all episodes pre-checked; deselecting one, confirming — exactly N-1 new `watches` rows land (not N), each with the right `tmdb_episode_id`, `watched_at` at log time, and (if set) the same `rating`/`mood` on every row (AC2/AC3).
    - After sync, `tracked_shows.next_episode_pointer` for that show recomputes to the correct next-unwatched episode **across the whole season**, not just after the first synced row — this is the Task 1c regression check; verify by inspecting the pointer value directly (DB-layer or RPC call) after a multi-episode bulk commit, not just after a single-episode one.
    - A `mood` value written this way round-trips correctly as a one-element `text[]` (Task 1b) and is rejected by the new CHECK (Task 2) if a hypothetical non-locked value were attempted (sanity-check the constraint itself, e.g. via a throwaway direct SQL insert attempt, not through the app).
    - The confirmation copy shows verbatim on a successful bulk log (AC4).
    - Network disabled: confirm the bulk sheet's commits still land locally instantly (each `logWatch()` call resolves synchronously against the local outbox per AD-4) even though the RPC/pointer recompute only completes once connectivity returns and sync drains — mirrors 3.2/3.3's own network-off checks.
    - A season bulk-logged for an **untracked** title (no "I'm watching this" ever tapped) still creates the `watches` rows correctly, and the pointer RPC no-ops harmlessly (verifies the "Step 1: not tracked → nothing to do" branch in `0007_recompute_next_episode_pointer.sql`, unchanged by this story).

## Review Findings

_Code review 2026-07-11 — 3-layer adversarial (Blind Hunter · Edge Case Hunter · Acceptance Auditor). Target: commit `5af6b75` (`5af6b75^..5af6b75`). Note: parts of this commit's code (`BulkLogSheet` inline star/mood, `watchLog.ts`, `watchSync.ts`) have since been rewritten by Story 3.5 in the working tree — findings against superseded code are noted as such._

### Decision needed

- [x] [Review][Decision] `logWatchBatch()` uses an all-or-nothing transaction, reversing the spec's documented per-episode "no distributed rollback" posture — Task 4 prescribed a sequential `for...of` + `await logWatch()` where each episode is its own atomic commit and a partial failure leaves already-committed episodes in place. The implementation instead added a new exported `logWatchBatch()` wrapping all inserts in one `db.withTransactionAsync(...)` with a single `triggerSync()`. AC2 still holds (one `watches` row per selected episode). **RESOLVED: KEEP** — the batch transaction is an accepted improvement; it removes a latent double-log-on-retry hazard the spec's own per-episode approach carries (partial commit → retry re-logs the committed episodes, no dedup). [app/data/watchLog.ts]

### Patches

- [x] [Review][Patch] Migration `0008` splits `ADD CONSTRAINT ... NOT VALID` from `VALIDATE CONSTRAINT` inside a single `do $$` block, and the header claims this "isolates the failure" — but a DO block is one transaction, so a VALIDATE failure rolls back the ADD too and still aborts the folder re-apply. The split buys nothing; collapse to a plain `add constraint ... check(...)` (still inside the existence guard) and correct the misleading header comment. **FIXED** — collapsed to a single `add constraint ... check(...)`, header rewritten. [supabase/migrations/0008_watches_mood_check.sql]
- [x] [Review][Patch] Zero-episode season opens a dead-end bulk-log sheet — `SeasonRow` renders "Mark whole season watched" unconditionally; a season whose payload has no episodes opens a sheet with an empty list and a permanently-disabled Confirm, a dead-end. **FIXED** — entry button now gated on `count > 0`. [app/features/title-detail/TitleDetailScreen.tsx — SeasonRow]

## Dev Notes

### Why Task 1 exists — this story is the first real exercise of `rating`/`mood` writes

`rating`/`mood`/`note` columns have existed on `watches` (and mirrored on local `pending_watches`) since Story 1.5, deliberately always `null` — every story from 1.5 through 3.3 explicitly deferred writing them to "Epic 3." This story (3.4) is the first one whose own AC (AC3) requires actually writing a real rating/mood value, which is why the two latent gaps in Task 1 (the missing `LogWatchInput` fields, and the `mood` string-vs-array mismatch) have never surfaced before and must be fixed here, not inherited silently. Story 3.5 (not yet built) will exercise the *same* `rating`/`mood` write path for its own single-watch prompt — Task 1's fixes benefit it too, but 3.5 will need its own multi-select mood handling (its `mood`/moods concept is 0–2 chips, this story's is 0–1), so do not try to build a shared abstraction now that guesses at 3.5's exact shape (see scope wall).

### Why Task 1c matters even though no AC names `watchSync.ts`

Per this workflow's standing rule: a story must leave the system working correctly end-to-end, not just satisfy its literal AC text. AC2 explicitly says "the pointer advances to the next unwatched episode via the RPC" — if the recompute fires on partial data (as the current per-row-inline code would do for a 9-episode bulk commit), the pointer silently lands on the wrong episode, which is a direct AC2 failure even though the bug lives in a file no AC names. Fix it as part of this story, not as a follow-up.

### Existing code this story extends (read before touching)

- **`app/features/title-detail/TitleDetailScreen.tsx`** — **UPDATE**. `SeasonRow` gains a new pressable + prop; the screen gains bulk-sheet state + a new `COPY_SEASON_LOGGED` constant, reusing the existing `showConfirmation`/`confirmation` mechanism (already used for watchlist/track confirmations in this same file) — do not build a second confirmation mechanism.
- **`app/data/watchLog.ts`** — **UPDATE** (narrow). `LogWatchInput` gains `rating?`/`mood?`; the `insert into pending_watches` call forwards them. No other change — the local-write-then-fire-and-forget-sync ordering (AD-4) is untouched.
- **`app/data/watchSync.ts`** — **UPDATE** (narrow but correctness-critical). The `mood` upsert value gets array-wrapped (Task 1b); the recompute call moves from inline-per-row to once-per-pass-per-show, after the row loop (Task 1c). No change to the upsert's other fields, the timeout/abort handling, or the outer `while(true)` pass-draining loop shape.
- **`supabase/migrations/`** — new file `0008_watches_mood_check.sql` only. Do not edit any existing migration file (idempotent-and-append convention, same as every prior migration).
- **`app/data/trackedShows.ts`, `app/data/catalog.ts`, `app/components/TitleCard.tsx`, `app/features/home/HomeScreen.tsx`** — **read-only**. `catalog.ts`'s `SeasonDetail`/`EpisodeDetail` types already carry everything this story's sheet needs (`tmdbEpisodeId`, `episodeNumber`, `name`, `airDate`) — no new catalog fetch, no payload shape change.

### Testing standards summary

No test framework exists in this repo (restated every story 1.3 → 3.3 — do **not** add one as a side effect). The done-bar, unchanged: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, `node scripts/smoke-check.mjs` passes if the local stack is available, and a recorded manual/DB-layer verification pass in Completion Notes. This story additionally requires re-running the migration folder (new `0008`) against the local stack before verification, since it's the first story in Epic 3 to add a schema change since 3.1's 0006/0007.

### Previous Story Intelligence

- **3.1** built `trackShow()`/`getTrackedShows()` and the single-writer `recompute_next_episode_pointer` RPC (0007) — this story calls the *same* RPC through the *same* client path (`watchSync.ts`'s existing `supabase.rpc('recompute_next_episode_pointer', {...})` call), just relocated within the file (Task 1c). No new RPC, no new client-side RPC call site.
- **3.2** built the outbox → sync → recompute chain this story reuses end-to-end (`logWatch()` → `pending_watches` → `triggerSync()` → `watches` upsert → recompute side effect) and established the "recompute is a side effect of a row's own successful sync, wrapped in its own try/catch" pattern Task 1c preserves — only the *timing* of the call moves, not its error-handling shape.
- **3.2's code review** (joint with 3.3, `7228570..HEAD`) flagged `RECOMPUTE_TIMEOUT_MS` as a hardcoded duplicate of `UPSERT_TIMEOUT_MS` and the per-pass dedupe key as unnecessarily including a now-constant `media_type` — both dismissed as low-priority cosmetic patches, still present in the code today. Not this story's job to clean up; don't let Task 1c's refactor accidentally fix or further entangle them, but also don't let it make them worse.
- **3.3** established the precedent of a narrow, surgical fix to `HomeScreen.tsx` for a real behavioral gap ("two-line behavioral fix, not a new feature") — this story's Task 1 fixes are similarly narrow and targeted, not rewrites of `watchSync.ts`.
- **Standing conventions carried forward:** no test framework as a drive-by; every network call races a bounded `AbortController` timeout, never the platform default; the local outbox write is the commit, confirmed before any network attempt; best-effort reads/writes degrade quietly and re-attempt on the next natural trigger; every migration is idempotent/re-runnable, commented in the same header style as its predecessors.

### Git Intelligence Summary

Recent commits (most recent first):
```
fa0332b core: add eas json
3e69a62 feat: update status to done for stories 3.2 and 3.3; enhance TitleCard and HomeScreen for Watched functionality
e6163dd feat: implement film logging functionality Story 3.3
92fbd1e fix: switch up next shelf to be column oriented
0692e62 fix: watch list shelf is now a column list instead of row
```
Pattern holds: every feature commit is followed by a dedicated `fix:` commit once code review surfaces issues. This story's change surface spans a new UI component (`BulkLogSheet.tsx`), two data-layer files, and a new migration — budget review attention on Task 1c (the recompute-timing fix) above all else, since it's the one change with no direct AC pointing at it and the highest chance of a subtle regression if done carelessly (e.g. accidentally deduping recompute *across* passes instead of just within one, which would silently break 3.2's existing single-episode behavior).

### Project Structure Notes

- New: `app/features/title-detail/BulkLogSheet.tsx`, `supabase/migrations/0008_watches_mood_check.sql`.
- Updated: `app/features/title-detail/TitleDetailScreen.tsx`, `app/data/watchLog.ts`, `app/data/watchSync.ts`.
- No new npm dependencies (React Native's built-in `Modal` covers the sheet — no bottom-sheet library added). No `packages/shared-types` change (the mood-check constraint is DB-only; no shared TS type currently encodes the locked mood set — that's a pre-existing gap, not introduced here).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.4: Bulk-log a whole season] — story statement + all four ACs (FR13, ARCH-9, UX-DR11, UX-DR20), plus the Epic 3 header's LOCKED mood-chip set and pointer-RPC contract note.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-10] — the single-writer, derive-from-full-watch-set pointer RPC contract this story's Task 1c fix must preserve.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-4] — the outbox contract (local write is the commit) `logWatch`/`watchSync` already implement, extended (not replaced) by Task 1.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Consistency Conventions] — "Moods: text[] constrained by a Postgres check constraint... never validated only in client code" — the exact rule Task 2's migration implements.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Component Patterns] — "Bulk-log sheet: Season row on title detail — All episodes pre-checked; user deselects any, confirms once. Optional season-level rating."
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Key Flows, Flow 2] — the binge catch-up flow this story implements almost verbatim, including the exact AC4 confirmation copy.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Accessibility Floor] — 44/48pt tap targets, "color is never the sole signal," mood chips/star rating announce their state.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md#Components] — star rating (5 stars, half-step, gold, empty portion 28% opacity) and mood chip (pill, single emoji, selected fills surface-sunken) specs this story's inline controls follow.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md#Shapes] — `rounded/lg` (18px) for bottom sheets and modal surfaces.
- [Source: app/data/watchLog.ts] — `logWatch`/`LogWatchInput`, extended (not replaced) by Task 1a.
- [Source: app/data/watchSync.ts] — the drain loop, the existing tv-only recompute gate, and the exact per-row inline-recompute code Task 1c relocates.
- [Source: app/data/catalog.ts] — `SeasonDetail`/`EpisodeDetail`, already carrying everything the bulk sheet needs.
- [Source: app/features/title-detail/TitleDetailScreen.tsx] — `SeasonRow`, the existing `showConfirmation` mechanism this story reuses.
- [Source: supabase/migrations/0003_watches.sql] — the `watches` table, its existing `rating` CHECK (unchanged), and the "no CHECK yet" comment on `mood` that Task 2 resolves.
- [Source: supabase/migrations/0006_tracked_shows.sql, 0007_recompute_next_episode_pointer.sql] — the tracked_shows/RPC pair this story's pointer-advance depends on, unchanged.
- [Source: app/data/db.ts] — local `pending_watches` schema; note `mood` is singular `text` locally vs. server's `text[]`, the exact mismatch Task 1b fixes at the sync boundary.
- [Source: _bmad-output/implementation-artifacts/3-3-log-a-film-in-one-action.md] — previous story's scope wall and precedent for narrow, surgical fixes plus reused confirmation/outbox machinery.

## Change Log

- 2026-07-10: Story implemented — fixed two latent gaps in the outbox/sync path (`LogWatchInput` rating/mood passthrough; `watchSync.ts` mood array-wrap and once-per-pass-per-show pointer recompute, Task 1); added `0008_watches_mood_check.sql` locking `watches.mood` to the FR18 8-emoji set (Task 2); added "Mark whole season watched" on `SeasonRow` (Task 3); built `BulkLogSheet.tsx`, a new bottom-sheet using RN's built-in `Modal` with pre-checked episode list, minimal 5-star season rating, and single-select mood chip row (Task 4); wired the sheet into `TitleDetailScreen.tsx` with the verbatim AC4 confirmation copy (Task 5). `tsc`/`expo export`/`smoke-check` clean; migrations re-applied; the Task 1c recompute-timing fix verified directly against the local Supabase stack with a scenario specifically shaped to expose the pre-fix bug (deselecting the last episode of a 5-episode bulk commit) — pointer correctly landed on episode 5, confirming it would have frozen at episode 2 under the old code. On-device manual UI pass outstanding — no emulator in this environment, consistent with every prior story in Epic 3. Status → review.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the bmad-dev-story workflow.

### Debug Log References

None — no framework/tooling issues hit during implementation.

### Completion Notes List

- **Task 1 (outbox/sync fixes):** `LogWatchInput` gained `rating?`/`mood?`, forwarded into the `pending_watches` insert (`watchLog.ts`). `watchSync.ts`'s upsert now array-wraps `mood` (`row.mood ? [row.mood] : null`) to match the server's `text[]` column. The per-row inline pointer-recompute call was moved out of the `for (const row of rows)` loop: tv `tmdb_id`s needing a recompute are now collected into a `Set` while iterating, and the RPC is called once per collected id AFTER the loop finishes, still inside the same drain pass. Error-handling/timeout shape per call is unchanged.
- **Task 2 (migration):** `0008_watches_mood_check.sql` adds an idempotent (`pg_constraint` existence guard) `CHECK` locking `watches.mood` to the 8 FR18 emoji, no cardinality constraint. Applied against the local stack; verified present via `\d public.watches` and verified it actually rejects a non-locked value via a rolled-back direct `INSERT`.
- **Task 3/5 (entry point + wiring):** `SeasonRow` gained a new "Mark whole season watched" pressable (separate from the existing expand/collapse header Pressable), 48pt min height, `accessibilityRole="button"`. `TitleDetailScreen` gained `bulkLogSeason` state, renders `<BulkLogSheet>` once at the screen level, and a `COPY_SEASON_LOGGED` constant reusing the existing `showConfirmation()` mechanism (no second confirmation mechanism built).
- **Task 4 (BulkLogSheet):** New file, RN's built-in `Modal` (transparent + slide), no new dependency. All episodes pre-checked by default, reset on season change via a `useEffect` keyed on `season`. Season-level rating is a minimal 5-star half-step row mapped onto the existing 0–10 `rating` scale (two half-width tap targets per star, an absolutely-positioned icon showing filled/half/28%-opacity-empty). Season-level mood is a single-select pill row over the 8 locked chips in FR18's canonical order, radio behavior (tap again to deselect). Confirm loop is a sequential `for...of` + `await logWatch(...)` (no `Promise.all`, matching the codebase's established multi-write pattern), wrapped in try/catch; on failure the sheet stays open with an inline error and no rollback of already-committed episodes (matches the file's existing no-distributed-rollback posture). Dismiss (backdrop tap) never logs and is a no-op while a confirm is in flight.
- **Verification:** `npx tsc --noEmit` clean; `npx expo export --platform android` bundles. `node scripts/smoke-check.mjs` passed against the local stack (all 7 services healthy, RLS/grant audits clean). Migrations re-applied cleanly (0008 new). Direct DB-layer verification against the local Supabase stack (ad-hoc script, not checked into the repo) exercised the exact end-to-end sequence BulkLogSheet + the fixed watchSync.ts perform:
  - A 5-episode season, 4 selected (deselecting the LAST episode, not the first — the shape that actually exposes the pre-fix bug) → exactly 4 `watches` rows landed with the correct `tmdb_episode_id`s.
  - `mood` round-tripped as a one-element `text[]` (`{🥰}`), confirming Task 1b.
  - A single post-loop recompute call correctly advanced `next_episode_pointer` to episode 5 — confirmed this would have frozen at episode 2 under the old inline-per-row-with-pass-dedupe code, since episode 1 syncing first would have fired the (deduped) recompute before episodes 2-4 landed. This is the Task 1c regression check the story calls out explicitly.
  - The mood `CHECK` constraint rejects a non-locked value via a rolled-back direct `INSERT` (Task 2 sanity check).
  - An untracked title's bulk-log still writes `watches` rows correctly, and the RPC no-ops harmlessly (returns `null`, creates no `tracked_shows` row) — verifies the "not tracked → nothing to do" branch is unaffected.
  - The AC4 confirmation copy is verbatim in code (`COPY_SEASON_LOGGED`), matching the story text exactly.
  - Network-disabled instant local commit was NOT separately exercised on-device (no emulator available in this environment) — this is an unchanged consequence of AD-4 (`logWatch()` resolves before any network attempt, unchanged by this story) and mirrors 3.1/3.2/3.3's own precedent of leaving the on-device pass as an outstanding manual check.
  - On-device manual UI pass (checkbox interaction, star/mood tap targets, sheet slide/dismiss animation, confirmation banner) is outstanding — no emulator available in this environment, consistent with every prior story in this epic.

### File List

- `app/data/watchLog.ts` (updated)
- `app/data/watchSync.ts` (updated)
- `app/features/title-detail/TitleDetailScreen.tsx` (updated)
- `app/features/title-detail/BulkLogSheet.tsx` (new)
- `supabase/migrations/0008_watches_mood_check.sql` (new)
