---
baseline_commit: cde9cb1f9ec2bd63081dd4cb78a88e2d3a5f9392
---

# Story 3.5: Rate and react after a watch

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want an optional rating and mood reaction offered right after a watch,
so that I can capture how it felt then — without ever being forced to.

## Acceptance Criteria

1. **Given** a committed watch, **when** the commit lands, **then** a rating prompt slides up ("How was it?") with a ½-step 5-star row (gold) and the locked mood-chip set, and a one-tap **Skip** always present — it never blocks the watch (FR17, UX-DR7, UX-DR8, UX-DR17). [Source: epics.md#Story-3.5]
2. **Given** the rating prompt, **when** I set a rating and/or select 0–2 mood chips, **then** they are written to the same local outbox row as the watch (single unit if still pending, else a `PATCH` on the synced row) — never a bare `PATCH` assumed to hit an unsynced row (ARCH-8). [Source: epics.md#Story-3.5]
3. **Given** a watch logged with the network off and a rating tapped *before* it syncs (the fast-path hazard), **when** the network is restored and the sync worker runs, **then** the rating and the watch arrive as a **single** `watches` row — never a lost `PATCH` against a not-yet-existing server row (AD-4/ARCH-8) — *named regression test, must be automated*. [Source: epics.md#Story-3.5]
4. **Given** persistence, **when** rating/moods save, **then** `rating` is a `smallint` (0–10 = 0–5★) and `moods` is a `text[]` constrained by the `CHECK` to the locked set — validated in the DB, not only client-side (FR18, ARCH-10). [Source: epics.md#Story-3.5]
5. **Given** an existing rating/mood on a watch, **when** I re-tap to change it, **then** that watch's row updates, and reactions on other (earlier) watches of the same title are preserved, not overwritten — each reaction is bound to its own watch's timestamp (FR19, FR20, ARCH-3). [Source: epics.md#Story-3.5]
6. **Given** Reduce Motion is on, **when** the prompt appears, **then** reward/confirmation animations are skipped and the result shows immediately; stars announce their value and chips announce their name to screen readers (UX-DR25, UX-DR23). [Source: epics.md#Story-3.5]

## Scope wall — read before writing any code

This story owns the **post-watch rating prompt for a single watch commit**, and the outbox plumbing that makes a reaction durable. It does **not** add:

- **A note field.** AC1's prompt is stars + moods + Skip. `note` is Story 3.6 (`backlog`), and `watches.note` / `pending_watches.note` stay hardcoded `null` on every write path in this story — exactly as `rating`/`mood` stayed null from 1.5 through 3.3. Do not add a text input "while you're in there."
- **Editing a reaction from the Diary, or from title detail, later.** AC5's "re-tap to change it" is scoped to **the prompt session for the watch that was just committed** — the prompt is where the re-tap happens, before it's dismissed. Reopening an *old* watch to edit its rating/date, and deleting a watch, are Story 3.7 (`edit-or-remove-a-logged-watch`, `backlog`), which also owns the pointer-recompute-after-delete path. The Diary screen itself does not exist yet (`DiaryScreen.tsx` is a placeholder, Epic 4).
- **A rating prompt after the bulk-log sheet.** `BulkLogSheet.tsx` (Story 3.4) already collects its own **season-level** rating + single mood inside the sheet, applied to every episode row it writes (its AC3). Firing this story's prompt after a bulk confirm would double-write the same reaction onto rows that already carry one, and would ask "How was it?" about 9 episodes at once. `logWatchBatch()` callers get **no** prompt. AC1's "a committed watch" is the single-watch path.
- **A Watched control on title detail.** Stories 3.2 and 3.3 both explicitly declined to add one; this story does not add one either, and therefore adds no prompt to `TitleDetailScreen.tsx`. The single-watch commit sites are exactly two, both already existing (see Dev Notes): `HomeScreen.handleMarkWatched` and `AddScreen.handleLog`.
- **The "caught up" dialog / notify-bell nudge, or the Flow-1 memory-beat line** ("Nice — that's 47 episodes of The Bear this year"). Both appear in EXPERIENCE.md's Flow 1 immediately after the rating prompt, and both are *not* in this story's ACs. The memory beat needs Epic 4's year-stats aggregation; the caught-up dialog is Epic 6.
- **A DB cardinality (array-length) constraint on `watches.mood`.** See Dev Notes — the 0–2 cap is a client-side UI rule, and `0008`'s own header comment deliberately left count unconstrained. Do not add `array_length(mood, 1) <= 2`.
- **A test framework.** Restated every story since 1.3. AC3's "must be automated" is honored by adding durable checks to the existing `scripts/smoke-check.mjs` (the home 1.6 established for committed regression checks) — not by introducing Jest/Vitest. See Task 6 and the Open Questions at the end.

## Tasks / Subtasks

- [x] **Task 1: Make the outbox row addressable and reaction-capable (AC2, AC3, AC5)**

  Read `app/data/watchLog.ts`, `app/data/watchSync.ts`, and `app/data/db.ts` in full before touching them. Everything below is a narrow extension of the AD-4 outbox contract those three files already implement — not a rewrite.

  - [x] **1a — `logWatch()` must return the watch id.** It currently returns `Promise<void>`, and the client-generated `uuid` is created and dropped inside `insertPendingWatch()`. The prompt cannot address the row it must update without it. Generate the id in `logWatch()` (or have `insertPendingWatch` return it) and return it as `Promise<string>`. Do the same for `logWatchBatch()` → `Promise<string[]>` (in `inputs` order) even though this story's scope wall gives the bulk sheet no prompt — a caller that can't identify the rows it just wrote is the gap that made this task necessary in the first place. **`BulkLogSheet.tsx` ignores the returned ids and is otherwise untouched by this task.**
  - [x] **1b — Local schema: moods become a list, and the row learns whether its reaction is in sync.** `pending_watches.mood` is a bare singular `text` column holding one emoji (written by 3.4). This story writes **0–2** moods. Extend the schema in `db.ts`:
    - Add `moods text` — a **JSON-encoded array** of emoji (`'["😭","🔥"]'`), null when no mood. Keep the existing `mood` column in place (do not `drop column`: SQLite's support is version-dependent and the codebase's `migrateSchema` convention is additive-only). Backfill it once, inside `migrateSchema`, for rows that predate the column: `update pending_watches set moods = json_array(mood) where moods is null and mood is not null` (SQLite's JSON1 functions ship compiled-in with `expo-sqlite`; if `json_array` is unavailable at runtime, backfill in TS by reading the rows and writing `JSON.stringify([mood])` rather than hand-concatenating a JSON string). After this task, **`mood` is dead** — no code reads or writes it. Say so in a comment.
    - Add `reaction_rev integer not null default 0` and `synced_rev integer`. `reaction_rev` increments on every reaction edit; `synced_rev` records the `reaction_rev` that was last successfully pushed to the server. These two are what make AC3's fast-path hazard *unrepresentable* rather than merely unlikely — see Dev Notes ("Why a revision counter, not a dirty flag").
    - `migrateSchema` adds each column only when absent (`pragma table_info`), exactly like the existing `user_id` block. Note that `alter table ... add column` cannot add a `not null default` in all SQLite versions the SDK ships — add `reaction_rev` as nullable on the ALTER path and `coalesce(reaction_rev, 0)` at every read, or backfill it to `0` immediately after adding. Pick one and be consistent.
  - [x] **1c — `setWatchReaction()` in `watchLog.ts` (the AC2 core).** New exported function:

    ```ts
    export async function setWatchReaction(
      watchId: string,
      reaction: { rating: number | null; moods: string[] },
    ): Promise<void>
    ```

    Order of operations is the whole point of AD-4 — **the local write comes first, always**, and only then does the function decide what (if anything) to send:

    1. Validate every mood against `isValidMood` (`moods.ts`) and throw on a bad value, mirroring `insertPendingWatch`'s existing boundary check. Also reject `moods.length > 2` and a `rating` outside 0–10 — a bad value must never enter the local outbox.
    2. In one `withTransactionAsync`: `update pending_watches set rating = ?, moods = ?, reaction_rev = coalesce(reaction_rev, 0) + 1 where id = ?` (moods JSON-encoded, or `null` for an empty array). Read back `synced_at` and the new `reaction_rev` in the same transaction.
    3. **Branch on `synced_at`** — this is AC2's "single unit if still pending, else a `PATCH` on the synced row," and the reason a bare `PATCH` is never issued blind:
       - `synced_at is null` → the watch has not reached the server. **Send nothing.** Fire `void triggerSync().catch(() => {})`; when the drain runs, the row inserts *once*, carrying commit + rating + moods together. This is AC3's path.
       - `synced_at is not null` → the server row exists and its id is known. Issue a real `PATCH`: `supabase.from('watches').update({ rating, mood: moods.length ? moods : null }).eq('id', watchId)`, raced against a bounded `AbortController` timeout (codebase convention — reuse a `REACTION_PATCH_TIMEOUT_MS = 10_000` constant, same bound as every other call). On success, `update pending_watches set synced_rev = ? where id = ?` with the rev from step 2. **On failure or timeout: swallow it, log a `console.warn`, and leave `synced_rev` behind `reaction_rev`** — the next drain re-upserts the row and heals it. Never surface a hard error to the prompt for a reaction; the watch itself is already committed.
    4. If no local row matches `watchId` (row purged, or a future Diary edit of a watch this device never logged), the `update` matches 0 rows. Log a warn and fall through to the `PATCH` branch — the server row is the only copy that exists. Do **not** silently no-op.
  - [x] **1d — `watchSync.ts` drains reaction-only changes too.**
    - Selection: `where user_id = ? and (synced_at is null or coalesce(synced_rev, -1) <> coalesce(reaction_rev, 0))`. A row whose reaction changed after it synced is picked up again; the existing `onConflict: 'id'` upsert updates it in place rather than duplicating it.
    - Snapshot `row.reaction_rev` and `row.synced_at` **before** the upsert. The upsert body sends `rating: row.rating` and `mood: row.moods ? JSON.parse(row.moods) : null` — **replacing** the current `mood: row.mood ? [row.mood] : null` line, which read the now-dead singular column. Guard the `JSON.parse` in a try/catch that degrades to `null` rather than throwing the whole row out of the drain forever.
    - On success: `update pending_watches set synced_at = ?, synced_rev = ? where id = ?`, writing the **snapshotted** rev, not a re-read of the current one. If the user rated again while the upsert was in flight, `reaction_rev` has since advanced past the value written here — so the row still matches the selection predicate and the next pass re-upserts it with the newer reaction. This is the lost-update guard; getting it wrong silently drops a rating tapped during a sync.
    - **Do not fire the pointer recompute for a reaction-only re-sync.** Gate `recomputeTmdbIds.add(...)` on the *snapshotted* `row.synced_at === null` in addition to the existing `media_type === 'tv' && tmdb_episode_id != null` condition. The RPC is derive-from-full-watch-set and therefore idempotent (AD-10), so a stray call is harmless to *correctness* — but a rating tap should not fire a pointer RPC, and firing one on every reaction edit would put a network call behind an interaction the ACs describe as never blocking.

- [x] **Task 2: Extract the shared star + mood-chip controls (AC1, AC6)**

  Story 3.4's scope wall explicitly deferred this to 3.5: *"Extracting a shared component is 3.5's call once its own, richer requirements are known."* Its own requirements are now known, so do it — carefully, preserving `BulkLogSheet`'s behavior exactly.

  - [x] New `app/components/StarRating.tsx`. Lift the star row out of `BulkLogSheet.tsx` (lines ~203–239 + the `starTarget`/`starHalfTap`/`starIcon`/`starEmpty` styles) essentially verbatim — it already implements the DESIGN.md spec (5 stars, ½-step via two half-width tap targets per star, `theme.colors.gold`, empty portion at 28% opacity, 44pt-tall targets) and the a11y labels. Props: `value: number | null` (0–10), `onChange: (v: number | null) => void`, `disabled?: boolean`. Keep the existing radio behavior (tapping the current value clears it to `null`).
  - [x] New `app/components/MoodChipRow.tsx`. Lift the chip row out of `BulkLogSheet.tsx` (lines ~242–259 + `moodRow`/`moodChip`/`moodChipSelected`/`moodEmoji` styles). Props: `value: string[]`, `onChange: (v: string[]) => void`, `max: number`, `disabled?: boolean`. Renders `MOODS` (`app/data/moods.ts`) in FR18 canonical order. Selection rules: tapping a selected chip deselects it; tapping an unselected chip when `value.length === max` **replaces the oldest selection** (so a `max={1}` row is exactly today's radio behavior, and a `max={2}` row never dead-ends the user into having to deselect first). `accessibilityRole="button"`, `accessibilityState={{ selected }}`, `accessibilityLabel={name}` — the chip announces its **name**, never the bare emoji (UX-DR23, AC6).
  - [x] Refactor `BulkLogSheet.tsx` to consume both: `<StarRating value={rating} onChange={setRating} disabled={saving} />` and `<MoodChipRow value={mood ? [mood] : []} onChange={(v) => setMood(v[0] ?? null)} max={1} disabled={saving} />`. **Behavior must be identical to today** — 3.4 is in `review`, not `done`; a behavioral change here would invalidate its recorded verification. Its `logWatchBatch` call now passes `moods: mood ? [mood] : null` instead of `mood` (see Task 4's `LogWatchInput` change). Nothing else in that file changes.

- [x] **Task 3: Build the rating prompt (AC1, AC5, AC6)**

  - [x] New `app/components/RatingPrompt.tsx`. A React Native `Modal` (`transparent`, `animationType` chosen per Reduce Motion — see below), bottom-anchored, `surfaceRaised` background, `radius.lg` top corners — the same sheet shape `BulkLogSheet.tsx` established. Do not add a bottom-sheet dependency.
  - [x] Props: `watchId: string | null`, `visible: boolean`, `onDismiss: () => void`. It owns its own `rating`/`moods` state and calls `setWatchReaction` itself — the screens that mount it stay thin. Reset state whenever `watchId` changes. Reuse `BulkLogSheet`'s `lastSeason`-style "keep content mounted through the close animation" trick (`displayWatchId`) — same reason, same shape.
  - [x] Content, verbatim per UX-DR17 / EXPERIENCE.md#State Patterns: header **"How was it?"** (`accessibilityRole="header"`), then `<StarRating />`, then `<MoodChipRow max={2} />`, then a one-tap **Skip**.
  - [x] **Skip and dismiss are the same thing, and both are always available**: they close the prompt and write nothing. Backdrop tap, hardware back (`onRequestClose`), and the Skip button all route to the same handler. The prompt has **no** disabled state and **no** "you must pick something" gate — UX-DR22 bans forced rating gates, and AC1 says it never blocks the watch.
  - [x] **Writes are fire-and-forget and debounce-free.** Every star tap and chip tap calls `setWatchReaction(watchId, { rating, moods })` for the **same** `watchId` (AC5: "that watch's row updates"). `setWatchReaction` is idempotent per call and each call bumps `reaction_rev`, so a rapid star→chip→star sequence converges on the last value. Serialize the calls (a simple in-flight promise chain, or an `isWritingRef` + trailing-call re-fire) so two overlapping `withTransactionAsync` blocks don't interleave on the single SQLite connection. A failed write logs a `console.warn` and does **not** roll the UI back and does **not** show an error — the reaction is optional by definition, and `reaction_rev`/`synced_rev` heal it on the next drain.
  - [x] There is **no explicit "Save"/"Done" button** beyond Skip. Each tap has already persisted locally by the time the finger lifts; dismissing keeps whatever was tapped. (This is what makes the NFR1 p95 ≤ 15s loop land — "stop = rating prompt dismissed or submitted.")
  - [x] **Reduce Motion (AC6).** Copy `AddScreen.tsx`'s existing pattern verbatim (lines ~110–127): `AccessibilityInfo.isReduceMotionEnabled()` + an `addEventListener('reduceMotionChanged', ...)` subscription, mirrored into a ref so deferred closures read the live value. When Reduce Motion is on, pass `animationType="none"` to the `Modal` (result shows immediately); otherwise `animationType="slide"` (AC1's "slides up"). Do not introduce a reward animation this story would then have to suppress.

- [x] **Task 4: Widen `LogWatchInput` from one mood to many (AC2, AC4)**
  - [x] `LogWatchInput.mood?: string | null` → `moods?: string[] | null`. `insertPendingWatch` writes the JSON-encoded array into the new `moods` column (and nothing into the dead `mood` column), validating each element with `isValidMood` and rejecting `length > 2` — the same boundary check, widened.
  - [x] Update the one caller that passes a mood: `BulkLogSheet.handleConfirm` (Task 2). `HomeScreen`/`AddScreen` pass no mood on the initial commit — the reaction arrives afterward, through `setWatchReaction`.

- [x] **Task 5: Wire the prompt into the two single-watch commit sites (AC1)**
  - [x] **`HomeScreen.tsx` (`handleMarkWatched`)** — the NFR1 loop's canonical surface ("start = tap on the Up Next card"). Capture the returned `watchId` from `await logWatch({...})`, show `COPY_WATCHED` as today, and open the prompt. **Order matters:** show the confirmation and open the prompt *immediately* after `logWatch` resolves — before the existing `await triggerSync()` and the two `loadTracked()`/`loadWatchlist()` refetches. Today those three awaits sit between the local commit and any further UI; leaving the prompt behind them would put a network round-trip in front of AC1's "when the commit lands" and blow the 15s budget on a slow connection. The refetches continue in the background exactly as they do now.
  - [x] Note the interaction with `watchedPendingKeys`: its `finally` block clears the key when `handleMarkWatched` returns, which is now *before* the user has finished rating. That is correct and unchanged — the pending marker tracks the **commit**, not the reaction. Do not extend it to cover the prompt's lifetime.
  - [x] **`AddScreen.tsx` (`handleLog`)** — same treatment. `handleLog` is `.then()`-chained rather than `async`; capture the resolved id there and open the prompt alongside the existing `showToast(COPY_LOGGED)`. The prompt is a `Modal`, so it composes with AddScreen's existing animated toast without either fighting the other for the same screen region.
  - [x] Both screens hold `const [promptWatchId, setPromptWatchId] = useState<string | null>(null)` and render `<RatingPrompt watchId={promptWatchId} visible={promptWatchId != null} onDismiss={() => setPromptWatchId(null)} />` **once**, at the screen level — mirroring how `TitleDetailScreen` renders `BulkLogSheet` once rather than per-row.
  - [x] **`BulkLogSheet` gets no prompt** (scope wall). Do not touch `TitleDetailScreen.tsx`.

- [x] **Task 6: Verification + the AC3 named regression check (AC: all)**
  - [x] Standing gates, run from `app/`: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles.
  - [x] `node scripts/smoke-check.mjs` (i.e. `pnpm run verify`) passes against the local stack; flag as outstanding if the stack isn't up.
  - [x] **AC3's "named regression test, must be automated."** No test framework exists and this story does not add one (scope wall). Add durable, committed checks to `scripts/smoke-check.mjs` — the home Story 1.6 established for exactly this (it moved the cross-user RLS isolation check there rather than leaving it in a throwaway script). Follow that file's existing `ok()`/`fail()` + fixed-smoke-account conventions. Two assertions, both server-side, both naming the hazard in their message text:
    1. **A bare `PATCH` against a not-yet-existing `watches` row silently affects nothing** — `PATCH /rest/v1/watches?id=eq.<random uuid>` returns success with zero rows affected, never an error. This is the *reason* AC2's branch exists: an unguarded reaction write against a pending row would be lost with no error surface. Assert the silent-no-op explicitly, so a future PostgREST upgrade that starts erroring here (or, worse, starts upserting) trips the check.
    2. **A single upsert carrying `rating` + `mood` together lands exactly one row with both fields set** — the shape the outbox emits for a pending row (AC3's success path). Insert with a fixed client-generated uuid via `upsert`/`on_conflict=id`, read it back, assert `rating` and `mood` round-trip (`mood` as a `text[]`), then re-upsert the same id with a changed rating and assert it is still **one** row, updated in place (AC5's "that watch's row updates," and the `onConflict` idempotency 1.5 relies on).
  - [x] Also assert (same file, cheap to add next to the above) that the `0008` `CHECK` still rejects a non-locked mood value, and that a **two**-element locked array is accepted — AC4's "validated in the DB, not only client-side," and the direct proof that this story's 0–2 selection needs no new migration.
  - [x] Manual / DB-layer verification pass against the local stack, recorded in Completion Notes. Exercise each branch explicitly:
    - **The fast-path hazard, end to end (AC3).** Network off → tap ✓ Watched on an Up Next card → the prompt appears immediately (the commit is local) → tap 4½★ and two chips → dismiss. Confirm `pending_watches` holds **one** row with `synced_at is null`, `rating = 9`, `moods = '["…","…"]'`, `reaction_rev = 2`, `synced_rev is null`. Network on → foreground/reconnect trigger drains → exactly **one** `watches` row exists carrying the watch *and* the reaction. Zero `PATCH` requests were issued. This is the named regression scenario.
    - **The synced-row `PATCH` branch (AC2).** Network on → log a watch → let it sync (the row's `synced_at` fills) → *then* rate it. Confirm a `PATCH` lands on the existing row, `synced_rev` catches up to `reaction_rev`, and no second `watches` row appears.
    - **The lost-update guard (Task 1d).** Rate a row while its upsert is in flight (throttle the network or add a temporary delay). Confirm the reaction is not lost: `synced_rev` lags `reaction_rev`, the next drain re-upserts, and the final `watches` row carries the *later* rating.
    - **AC5 across watches of the same title.** Log the same film twice (a rewatch is legitimate — AD-3), rate them differently, and confirm two `watches` rows exist with two distinct ratings — the second reaction did not overwrite the first.
    - **AC1 non-blocking.** Skip dismisses in one tap and writes nothing (`rating`/`moods` stay null on that row). Dismissing via the backdrop and via hardware back behave identically.
    - **AC6.** With Reduce Motion enabled (Android: Settings → Accessibility → Remove animations), the prompt appears with no slide. TalkBack announces star values ("Rate 4.5 stars") and chip names ("Moved"), not bare emoji.
    - **Pointer untouched by a reaction (Task 1d).** Rating a synced tv episode fires **no** `recompute_next_episode_pointer` call, and `tracked_shows.next_episode_pointer` is unchanged.
  - [x] Re-running the migration folder is **not** required — this story adds no SQL migration (see Dev Notes).

### Review Findings

Joint code review of Story 3.5 + Story 3.6 (both landed uncommitted in the same working tree, 2026-07-11). 3-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against `git diff HEAD` (11 files, 795+/198-, plus 3 new files). 1 decision-needed resolved, 6 patches applied, 3 deferred, 4 dismissed as noise. `tsc --noEmit` clean after patches.

**Decision resolved:**
- [x] [Review][Decision] Unauthorized "Series/Movies" tabs feature (HomeScreen `MEDIA_TABS`/tab bar/pager, `TitleCard.watchedIcon`, new `theme.colors.success`) is bundled into this diff with no AC/Task/File-List authorization in either 3.5 or 3.6, and shipped with a real bug (tracked movies never appeared in Up Next). User decision: keep the tabs feature, fix its bugs now as patches (see below) rather than splitting it out.

**Patches applied:**
- [x] [Review][Patch] Up Next shelf was hidden entirely on the Movies tab (`trackedByTab.movie` computed but never rendered) — tracked films regressed out of Up Next, undoing Story 3.2/3.3. [app/features/home/HomeScreen.tsx:461]
- [x] [Review][Patch] `handleTabPress` silently no-op'd a tap that landed before `pagerWidth` was measured on first layout. [app/features/home/HomeScreen.tsx:111]
- [x] [Review][Patch] `migrateSchema`'s `moods` column add + legacy backfill wasn't crash-safe — a kill between the `ALTER TABLE` and the backfill loop permanently skipped the backfill (`has('moods')` stays true forever), silently losing any un-migrated legacy `mood` value. Now wrapped in `db.withTransactionAsync` so SQLite's transactional DDL rolls the column back too on an interrupted run, and the whole block retries next launch. [app/data/db.ts:71]
- [x] [Review][Patch] `setWatchReaction`'s "already synced" `PATCH` branch never called `triggerSync()` on success or failure (unlike the "not yet synced" branch), so a lost-update race between this PATCH and a concurrent drain had no guaranteed follow-up drain to self-heal the `reaction_rev`/`synced_rev` mismatch. Now fires `triggerSync()` after every outcome of that branch. [app/data/watchLog.ts:263]

(Two more patches — note-length clamp and debounce-timer unmount cleanup — are 3.6-scoped; recorded in that story's Review Findings.)

**Deferred:**
- [x] [Review][Defer] `isProgrammaticScroll` ref can theoretically desync if a user grabs/interrupts a programmatic tab-scroll mid-animation before `onMomentumScrollEnd` fires. [app/features/home/HomeScreen.tsx:109] — deferred, pre-existing in the (now-kept) tabs feature; low severity, no reported repro.
- [x] [Review][Defer] Deeper concurrency between `setWatchReaction`'s PATCH (captured-args payload, not a fresh row read) and `triggerSync`'s drain — no mutex serializes the two paths. [app/data/watchLog.ts:210] — deferred, accepted eventual-consistency tradeoff per the code's own `reaction_rev`/`synced_rev` design; the triggerSync patch above narrows the window but full serialization would be a larger design change.
- [x] [Review][Defer] Note whitespace handled inconsistently — `persist()` stores the untrimmed note while the "is this empty" check uses `.trim()`, so a note of only whitespace round-trips with padding intact. [app/components/RatingPrompt.tsx:100] — deferred, cosmetic, no AC implicated (3.6-scoped).

**Dismissed (verified as noise):**
- "`getLoggedKeys` used with no import" (Blind Hunter, no file access) — import confirmed present at `HomeScreen.tsx:48`.
- "smoke-check.mjs fixture never torn down" (Blind Hunter) — matches this file's existing no-teardown convention throughout; not a deviation.
- "`watchedIcon` a11y label incoherent for disabled state" (Blind Hunter) — copied verbatim from the pre-existing non-icon Watched pill's own label pattern; not new, and part of the (approved) tabs feature.
- `app.json`/`app/eas.json`/`.easignore` changes present in the diff (Acceptance Auditor) — pre-existing unrelated EAS/build config already flagged by this story's own Dev Notes as "leave alone."

## Dev Notes

### The code has moved past Story 3.4's story file — read the source, not that doc

3.4 is `review`, not `done`, and its own File List is already stale: the review/commit that followed it (`5af6b75`, `cde9cb1`) introduced **`app/data/moods.ts`** (the `MOODS` array + `isValidMood`, which 3.4's doc never mentions), **`logWatchBatch()`** (a transactional batch insert that replaced 3.4's specced sequential `for...of` of `logWatch()` calls), and moved `watchSync`'s pointer-recompute dedupe from *per-pass* to *per-whole-drain*. Trust `app/data/*.ts` as it stands today. Two consequences for this story:

- `moods.ts` already exists as the client's copy of the locked FR18 set. **Do not create a second mood constant.** `MoodChipRow` renders `MOODS`; `insertPendingWatch`/`setWatchReaction` validate with `isValidMood`.
- One item in `deferred-work.md` (from 1.5's review) is **stale and should not be acted on**: it claims `pending_watches.mood` "is stored as a JSON-stringified string (`db.ts:26`)". It is not — 3.4 writes a bare emoji into a bare `text` column, and `watchSync` array-wraps it at the boundary. This story is what actually makes the local column JSON (as `moods`). Mentioning it here so the dev doesn't chase a fix that's already been overtaken.

### Why a revision counter, not a dirty flag

AC3 names one hazard (rate-before-sync). There is a second, subtler one the ACs don't name but that a correct implementation must not lose to: **rating a row while its own upsert is in flight.** `triggerSync()` snapshots rows with a `select`, `await`s an upsert, then marks the row synced. A rating tapped inside that window mutates the local row *after* the snapshot was taken, so the upsert sends the pre-rating values — and then the "mark synced" write would clear a boolean dirty flag that was set for a change the server never saw. The rating is silently gone until the user edits it again.

A monotonically-incrementing `reaction_rev`, paired with a `synced_rev` that records *which* rev was pushed, closes this. The drain marks `synced_rev = <the rev it snapshotted>`, not "clean". If the rev has since advanced, `synced_rev <> reaction_rev` still holds, the row stays in the selection predicate, and the next pass re-upserts it. A boolean cannot express "clean as of version 2, but version 3 exists."

Per this workflow's standing rule — *a story must leave the system working end-to-end, not merely satisfy its literal AC text* — this belongs in 3.5, not a follow-up. It is the same class of bug as 3.4's Task 1c (a correct-looking write firing against a snapshot that no longer reflects reality), and this story is the first to make it reachable, because it is the first to mutate an outbox row *after* it was created.

### Why no new migration

Every AC4 requirement is already satisfied by schema in the tree:

- `watches.rating smallint check (rating is null or (rating >= 0 and rating <= 10))` — `0003_watches.sql:39`. Its header comment even names this story: *"Populated by Epic 3 (Story 3.5)."*
- `watches.mood text[]` — `0003_watches.sql:43` — with the FR18 locked-set `CHECK` added by `0008_watches_mood_check.sql` (`mood <@ array[…8 emoji…]`). `<@` is *containment*, so a two-element array of locked values passes unchanged; the constraint needs no widening for a 0–2 selection.
- No cardinality constraint, deliberately. `0008`'s header says so explicitly: *"Leaving count unconstrained is Story 3.5's call (its own mood concept is a 0–2 multi-select)."* **The call is: leave it unconstrained.** FR18's wording is "multi-select (0–2 **typical**)" — typical, not a hard rule — and ARCH-10 scopes the DB constraint to the *value set*, never the count. Enforce the cap in `MoodChipRow` (`max={2}`) and at the `setWatchReaction`/`insertPendingWatch` boundary. A DB length check would be an un-asked-for schema rule that Story 3.7's edit path and any future import would then have to honor.

**Column-name divergence, do not "fix":** the epics text for AC4 says "`moods` is a `text[]`", but the actual server column created in `0003` and constrained in `0008` is singular **`mood`**. The DB is the source of truth; ARCH-10's naming rule binds `tmdb_id`/`media_type`/`tmdb_episode_id`, not this. Renaming the server column would mean a migration, a `packages/shared-types` change, and a rewrite of 3.4's verified sync path — for cosmetics. Keep the server column `mood text[]`. The *local* new column is `moods` (JSON array), and the TS field is `moods: string[]` — the singular/plural seam lives at the sync boundary, in exactly one place, and is commented there.

### Existing code this story extends (read before touching)

- **`app/data/watchLog.ts`** — **UPDATE**. `logWatch`/`logWatchBatch` return ids (1a); `LogWatchInput.mood` → `moods` (Task 4); new `setWatchReaction()` (1c). The AD-4 ordering (local write is the commit; sync is fire-and-forget) is preserved verbatim — `setWatchReaction` obeys the same rule, writing locally before deciding whether to touch the network.
- **`app/data/db.ts`** — **UPDATE** (narrow). Two new columns + one backfill in the existing additive `migrateSchema` pattern. The `SCHEMA` string (fresh installs) and `migrateSchema` (existing installs) must agree — a fresh install must land the same columns the migration path adds.
- **`app/data/watchSync.ts`** — **UPDATE** (narrow, correctness-critical). Selection predicate, `mood` → `JSON.parse(moods)` at the boundary, snapshot-rev-guarded "mark synced", recompute gated on `synced_at === null`. Do **not** touch the `syncing` guard, the `while(true)` pass loop, the timeout/abort shape, or the once-per-drain recompute placement that 3.4 fixed and verified.
- **`app/features/title-detail/BulkLogSheet.tsx`** — **UPDATE** (mechanical). Consumes the two extracted components; passes `moods: [mood]`. Its own behavior, copy, error handling, and `savingRef` double-tap guard are unchanged. This file's header comment says the shared extraction is 3.5's call — update that comment to say it happened.
- **`app/features/home/HomeScreen.tsx`**, **`app/features/add/AddScreen.tsx`** — **UPDATE**. Capture the watch id, mount `RatingPrompt` once, open it the moment the local commit resolves (before any network call). Everything else — `watchedPendingKeys`, `requestSeq`, the toast, the shelf reload dance — is untouched.
- **`app/data/moods.ts`, `app/data/trackedShows.ts`, `app/components/TitleCard.tsx`, `app/features/title-detail/TitleDetailScreen.tsx`, `supabase/migrations/*`** — **read-only.**
- **`scripts/smoke-check.mjs`** — **UPDATE** (append checks only, in the established `ok()`/`fail()` style).

### Where the prompt does and doesn't fire

There are exactly three watch-commit call sites in the app today, and this story touches two:

| Call site | Commits | Prompt? | Why |
|---|---|---|---|
| `HomeScreen.handleMarkWatched` | `logWatch()` — one episode or film | **Yes** | NFR1's canonical loop: "start = tap on the Up Next card; stop = rating prompt dismissed or submitted." |
| `AddScreen.handleLog` | `logWatch()` — one title | **Yes** | AC1 says "a committed watch," not "a committed watch from Home." |
| `BulkLogSheet.handleConfirm` | `logWatchBatch()` — N episodes | **No** | Collects its own season-level reaction inside the sheet (3.4 AC3). A prompt here would double-write and ask one question about N episodes. |

`TitleDetailScreen` has no single-watch commit control (3.2 and 3.3 each declined to add one), so it gets no prompt.

### Testing standards summary

No test framework exists in this repo — restated every story from 1.3 through 3.4, and **not** introduced here. The done-bar is unchanged: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, `node scripts/smoke-check.mjs` (`pnpm run verify`) passes against the local stack, plus a recorded manual/DB-layer verification pass in Completion Notes.

AC3 uniquely says *"named regression test, must be automated"* — the only AC in the whole epic set to demand automation. Task 6 honors it the way 1.6 did: durable, committed assertions in `scripts/smoke-check.mjs`, which is what this project has instead of a test suite. Be honest in the Completion Notes about what those checks do and don't cover: they pin the **server-side invariants** the hazard depends on (a bare `PATCH` at a missing row is a silent no-op; one upsert carrying commit + reaction lands one complete row; re-upsert updates in place). They do **not** execute the client's `expo-sqlite` branch logic, which no node-side harness in this repo can reach. That gap is the last item in Open Questions.

### Previous Story Intelligence

- **3.4** is the direct parent: it fixed `LogWatchInput`'s missing rating/mood passthrough, added the `mood` array-wrap at the sync boundary, added `0008`'s CHECK, and built the first `Modal` sheet in the codebase (`BulkLogSheet.tsx`) — whose star row, chip row, sheet chrome, backdrop-dismiss, and `savingRef` double-tap guard this story lifts, generalizes, and reuses. Its scope wall named 3.5 four times, each time deferring something to here; this story collects all four (multi-select moods, the shared component extraction, the mood cardinality decision, the post-watch prompt).
- **3.2** established "the recompute is a side effect of a row's own successful sync, in its own try/catch" — Task 1d narrows *which* rows trigger it, without touching that shape.
- **3.2 + 3.3's joint code review** hardened exactly the class of race this story re-enters: `watchedPendingKeys`' per-key lifecycle, and a synchronous `savingRef`/`trackedRef` mirror for same-frame double-taps (React state is stale until the next render). `RatingPrompt`'s write serialization (Task 3) and `setWatchReaction`'s rev counter are the same lesson applied one layer down, at the storage boundary rather than the tap boundary.
- **1.5** built the outbox and its `onConflict: 'id'` idempotency — the property that lets Task 1d re-upsert a reaction-only change without duplicating a row. Nothing about that mechanism changes; this story just gives the drain a second reason to pick a row up.
- **Standing conventions carried forward:** every network call races a bounded `AbortController` timeout, never the platform default; the local write is the commit, confirmed before any network attempt; best-effort reads/writes degrade quietly and re-attempt on the next natural trigger; no new npm dependency without an architecture reason; each screen owns its own transient confirmation (no shared toast infra has been extracted, and this story does not extract one).

### Git Intelligence Summary

Recent commits (most recent first):

```
cde9cb1 fix: fix the scroll on the main page
5af6b75 feat: implement bulk logging for entire seasons with mood and rating support
a120e67 core: try another config for node version
30d757c core: update eas with more recent version
fa0332b core: add eas json
```

`5af6b75` is 3.4's feature commit; `cde9cb1` is its follow-up `fix:` — the pattern every story in this repo has followed (feature commit, then a `fix:` once review lands). The uncommitted working tree carries only EAS/build config (`app/app.json`, `app/eas.json`, `.easignore`), unrelated to this story; leave it alone.

Budget review attention on **Task 1d** above everything else. It is the change with no AC pointing directly at it, the highest chance of a silent regression (a lost rating leaves no error, no log, and no failing check), and it sits in the one file — `watchSync.ts` — that 3.4 already rewrote once and that every story in Epic 3 depends on. The trap to watch for: writing `synced_rev` from a *re-read* of `reaction_rev` after the upsert instead of from the value snapshotted before it. That version passes every happy-path check and drops exactly the ratings tapped during a sync.

### Project Structure Notes

- **New:** `app/components/RatingPrompt.tsx`, `app/components/StarRating.tsx`, `app/components/MoodChipRow.tsx`.
- **Updated:** `app/data/watchLog.ts`, `app/data/watchSync.ts`, `app/data/db.ts`, `app/features/home/HomeScreen.tsx`, `app/features/add/AddScreen.tsx`, `app/features/title-detail/BulkLogSheet.tsx`, `scripts/smoke-check.mjs`.
- **No new migration**, no new npm dependency, no `packages/shared-types` change. (The zod mood/rating schemas that package's placeholder comment anticipates are still not needed — validation lives in `moods.ts` client-side and in `0008`'s CHECK server-side. Generating them is a `shared-types` task, not this story's.)
- The three new components go in `app/components/` (shared UI primitives per ARCH-2's structural seed), **not** in `app/features/title-detail/` — `RatingPrompt` is mounted by `home/` and `add/`, and both leaf controls are consumed by three features. This is the first component in `app/components/` that isn't a card/screen primitive; that's correct, not a smell.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.5: Rate and react after a watch] — story statement + all six ACs (FR17–FR20, ARCH-8/AD-4, ARCH-10, UX-DR7/8/17/23/25).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3] — the LOCKED 8-chip mood set, the pointer-RPC contract note, and NFR1's exit gate ("stop = rating prompt dismissed or submitted") that this story's prompt terminates.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-4] — the exact contract Task 1c implements: *"A rating/mood/note edit always writes to the local row first — it is never a bare PATCH assumed to hit an already-synced server row… if the row is still pending, it's a single insert carrying commit + rating/mood/note together; if the commit already synced, the edit becomes a normal PATCH keyed by the now-known server id."*
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-3] — watch is the atomic timestamped unit; re-tapping updates *that row*, never collapsing rows across separate watches (AC5).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-10] — derive-from-full-watch-set pointer RPC; why a stray recompute is harmless but still shouldn't fire on a reaction edit (Task 1d).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Consistency Conventions] — `rating` smallint half-steps 0–10; moods as `text[]` + CHECK, "never validated only in client code."
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#State Patterns] — "Rating prompt | Post-watch sheet | Header 'How was it?'; 5 gold stars + mood chips; one-tap **Skip** always present. Never blocks the watch."
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Key Flows, Flow 1] — the bedtime-log beat this story implements: soft confirmation → prompt slides up → 4½★ + 😭 → dismissible in one tap.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Interaction Primitives] — "Rating is offered after every watch and is always skippable in one tap"; half-star drag/tap; **banned:** forced rating gates.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md#Accessibility Floor] — stars announce value ("4 and a half stars"), chips announce name; ≥44pt/48dp targets including stars and chips; Reduce Motion skips reward animations (AC6).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md#Components] — `star-rating`: "5 stars, ½-step. gold. Empty stars at 28% opacity of gold." · `mood-chip`: "pill, single emoji. Small curated set. Selected = filled surface-sunken."
- [Source: app/data/watchLog.ts] — `logWatch`/`logWatchBatch`/`insertPendingWatch`/`LogWatchInput`, all extended by Tasks 1a/1c/4.
- [Source: app/data/watchSync.ts] — the drain loop, the `onConflict:'id'` upsert, the mood array-wrap line Task 1d replaces, and the once-per-drain recompute Task 1d gates.
- [Source: app/data/db.ts] — `SCHEMA` + the additive `migrateSchema` pattern Task 1b follows.
- [Source: app/data/moods.ts] — `MOODS` (canonical order) + `isValidMood`; the client-side half of the locked set. Already exists — do not duplicate.
- [Source: app/features/title-detail/BulkLogSheet.tsx] — the star row, chip row, `Modal` sheet chrome, and `displaySeason` close-animation trick Tasks 2/3 lift; also the file whose header comment defers the shared extraction to this story.
- [Source: app/features/add/AddScreen.tsx] — the `AccessibilityInfo` Reduce-Motion pattern Task 3 reuses, and `handleLog`, the second prompt call site.
- [Source: app/features/home/HomeScreen.tsx] — `handleMarkWatched` and the `watchedPendingKeys` lifecycle Task 5 must not disturb.
- [Source: supabase/migrations/0003_watches.sql] — `rating` CHECK + `mood text[]`, both already correct for AC4; its comment naming Story 3.5 as the story that finally writes `rating`.
- [Source: supabase/migrations/0008_watches_mood_check.sql] — the locked-set CHECK, and its explicit deferral of the cardinality decision to this story.
- [Source: scripts/smoke-check.mjs] — the `ok()`/`fail()` + fixed-smoke-account conventions Task 6's AC3 checks follow (Story 1.6's precedent for durable committed checks).
- [Source: _bmad-output/implementation-artifacts/3-4-bulk-log-a-whole-season.md] — parent story: its scope wall's four deferrals to 3.5, and its Task 1c recompute-timing fix.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — the (now stale) 1.5 note about `pending_watches.mood` being JSON-stringified; superseded by Task 1b.

## Open Questions

Saved for after implementation, per the workflow — none of these block the dev:

1. **AC3's "must be automated" vs. no test framework.** Task 6 pins the server-side invariants in `smoke-check.mjs`, but nothing in this repo can execute `setWatchReaction`'s `expo-sqlite` branch — the one place the hazard actually lives. A `bmad-testarch-framework` run (a jest-expo + `expo-sqlite` in-memory harness) would close it properly and is the natural home for the "log offline → rate → reconnect → assert one row" test as a real unit test. Worth scheduling before Epic 4, since the Diary will read these rows.
2. **`watches.mood` (singular column, plural contents).** Kept as-is deliberately (see Dev Notes). If a rename to `moods` is ever wanted, the moment to do it is Story 3.7 — it already touches the edit/delete path and `packages/shared-types` will need generated types by then anyway.
3. **The Flow-1 memory beat** ("Nice — that's 47 episodes of The Bear this year") sits right after the rating prompt in EXPERIENCE.md and belongs to no story's ACs. It needs Epic 4's year-stats aggregation. Flagging it so it doesn't fall through the gap between Epic 3 and Epic 4 — likely a Story 4.1 or 4.2 addendum.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8)

### Debug Log References

- `npx tsc --noEmit` (from `app/`) — clean.
- `npx expo export --platform android` (from `app/`) — bundles (`index-*.hbc`, 3.4MB).
- `node scripts/smoke-check.mjs` (`pnpm run verify`) — passes against the local stack, including all five new Story 3.5 assertions (check block 10).

### Completion Notes List

**What shipped, by AC:**

- **AC1** — `RatingPrompt.tsx` (new): a bottom-anchored transparent `Modal` (same sheet shape as `BulkLogSheet`, no new dependency) with header "How was it?", a ½-step gold `StarRating`, a 0–2 `MoodChipRow`, and a one-tap **Skip**. Wired into the two single-watch commit sites (`HomeScreen.handleMarkWatched`, `AddScreen.handleLog`) and opened the instant the *local* `logWatch` commit resolves — before `triggerSync`/refetches on Home — so no network round-trip sits in front of "when the commit lands". `BulkLogSheet` (bulk path) gets no prompt; `TitleDetailScreen` untouched.
- **AC2** — new `setWatchReaction(watchId, { rating, moods })` in `watchLog.ts` implements AD-4 verbatim: local write first (one `withTransactionAsync`, reading back `synced_at`+`reaction_rev` in the same tx), then branch — `synced_at is null` sends nothing and lets the drain carry commit + reaction as one row; `synced_at` set issues a real bounded `PATCH` (`REACTION_PATCH_TIMEOUT_MS`) keyed by the now-known id. A missing local row falls through to the PATCH branch (warn, never silent no-op) rather than dropping the edit.
- **AC3** — the fast-path hazard is unrepresentable: while pending, there is no separate PATCH to lose — the reaction is columns on the same outbox row the drain upserts. Pinned server-side in `smoke-check.mjs` (block 10): a bare PATCH at a not-yet-existing `watches` row is a silent 0-row no-op; one upsert carrying `rating`+`mood[]` lands a single complete row.
- **AC4** — no new migration (0003's rating CHECK + 0008's locked-set `<@` CHECK already satisfy it, per Dev Notes). smoke-check asserts the server CHECK rejects a non-locked mood and accepts a two-element locked array — proving the 0–2 selection needs no schema change.
- **AC5** — every prompt tap calls `setWatchReaction` for the *same* `watchId`, so re-tapping updates that row; the `onConflict:'id'` upsert updates in place (smoke-check asserts re-upsert stays exactly one row). Each watch is its own row, so reactions on earlier watches of the same title are never overwritten.
- **AC6** — `RatingPrompt` copies `AddScreen`'s Reduce-Motion pattern (ref-mirrored `AccessibilityInfo` subscription): `animationType="none"` when Reduce Motion is on, `"slide"` otherwise. Stars announce their value and chips announce their name (labels lifted verbatim into the shared components).

**Correctness-critical (Task 1d, `watchSync.ts`):** the drain now also selects reaction-only-dirty rows (`coalesce(synced_rev,-1) <> coalesce(reaction_rev,0)`), decodes `moods` JSON at the sync boundary (guarded, degrades to null), snapshots `reaction_rev`/`synced_at` **before** the upsert and writes `synced_rev = <snapshot>` (not a re-read) so a rating tapped mid-upsert leaves `synced_rev < reaction_rev` and is re-sent next pass — the lost-update guard the Dev Notes flagged as the highest-risk change. Pointer recompute is gated additionally on the snapshotted `wasUnsynced`, so a reaction edit never fires a pointer RPC. `synced_at` is preserved via `coalesce` on re-sync.

**Schema (`db.ts`):** `moods text` (JSON array), `reaction_rev integer` (backfilled to 0), `synced_rev integer` (backfilled to 0 only for already-synced rows) added to both `SCHEMA` (fresh installs) and `migrateSchema` (additive, `pragma table_info`-guarded). The dead singular `mood` column is retained (SQLite `drop column` is version-dependent) and forward-ported into `moods` once in TS; a comment marks it dead.

**Verification honesty:** the automated AC3 checks pin the **server-side** invariants the hazard depends on. They do **not** execute `setWatchReaction`'s `expo-sqlite` branch logic — no node harness in this repo can reach it (Open Question 1: a future `bmad-testarch-framework` jest-expo + in-memory sqlite run is the proper home for the "log offline → rate → reconnect → assert one row" unit test). **On-device manual UI pass is outstanding** (no emulator in this environment) — the same standing gap every Epic 3 story has carried. The end-to-end fast-path/lost-update/AC5-across-watches scenarios in Task 6 need a device to exercise and are recorded here as outstanding rather than claimed.

### File List

**New:**
- `app/components/RatingPrompt.tsx`
- `app/components/StarRating.tsx`
- `app/components/MoodChipRow.tsx`

**Updated:**
- `app/data/watchLog.ts` (logWatch/logWatchBatch return ids; `LogWatchInput.mood`→`moods`; new `setWatchReaction`; shared `assertValidReaction`/`encodeMoods`; `MAX_MOODS`)
- `app/data/watchSync.ts` (reaction-dirty selection predicate; moods JSON decode at boundary; snapshot-rev-guarded mark-synced; recompute gated on `wasUnsynced`)
- `app/data/db.ts` (`moods`/`reaction_rev`/`synced_rev` columns + additive migration + legacy backfill)
- `app/features/title-detail/BulkLogSheet.tsx` (consumes `StarRating`/`MoodChipRow`; passes `moods:[mood]`; header comment updated)
- `app/features/home/HomeScreen.tsx` (capture watch id; mount `RatingPrompt`; open before network awaits)
- `app/features/add/AddScreen.tsx` (capture watch id; mount `RatingPrompt`)
- `scripts/smoke-check.mjs` (check block 10 — Story 3.5 reaction invariants)

## Change Log

| Date | Change |
|------|--------|
| 2026-07-10 | Implemented Story 3.5: post-watch rating prompt (new `RatingPrompt`/`StarRating`/`MoodChipRow`), `setWatchReaction` + `reaction_rev`/`synced_rev` outbox plumbing (AC2/AC3/AC5 hazards made unrepresentable), local `moods` JSON column, `LogWatchInput` widened to 0–2 moods, wired into Home + Add commit sites, `BulkLogSheet` refactored onto the shared controls. Added AC3's named regression assertions to `smoke-check.mjs`. tsc/expo export/smoke-check clean; on-device UI pass outstanding (no emulator). Status → review. |
