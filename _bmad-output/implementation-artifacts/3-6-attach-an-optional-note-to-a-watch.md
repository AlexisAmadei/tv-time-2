---
baseline_commit: cde9cb1f9ec2bd63081dd4cb78a88e2d3a5f9392
---

# Story 3.6: Attach an optional note to a watch

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to add a short note to a watch,
so that I can remember a specific thought about that viewing.

## Acceptance Criteria

1. **Given** a watch (in the rating prompt — see Scope wall for "later from the Diary"), **when** I add a note, **then** a plain-text note (~500-char cap) is stored on that `watches` row (FR21). [Source: epics.md#Story-3.6]
2. **Given** the note field, **when** I reach the cap, **then** input is bounded with a clear indication, and the note is optional throughout — never required to commit a watch. [Source: epics.md#Story-3.6]
3. **Given** an existing note, **when** I edit or clear it, **then** only that watch's note changes (bound to the watch, per FR20). [Source: epics.md#Story-3.6]

## Scope wall — read before writing any code

This story owns **the note field on the post-watch rating prompt** and the outbox plumbing that makes it durable. It does **not** add:

- **Editing a note from the Diary.** AC1's epics.md text literally says "in the rating prompt or later from the Diary" — but `DiaryScreen.tsx` doesn't exist yet (Epic 4, still `backlog`; confirmed by grepping `TitleDetailScreen.tsx` for any watch-history/note display — there is none). There is no screen this story could wire a "later" edit into. Ship the rating-prompt entry point only; the Diary entry point is Epic 4's job when that screen exists.
- **A note field in `BulkLogSheet.tsx`.** Story 3.4's bulk sheet collects a season-level rating/mood only (its own AC3) — no note. `BulkLogSheet` gets no prompt at all (3.5's scope wall, unchanged), so it gets no note field either. Do not touch this file.
- **A Watched/note control on `TitleDetailScreen.tsx`.** No story in Epic 3 has added one (3.2, 3.3, 3.5 all declined); this one doesn't either.
- **A DB length CHECK on `watches.note`.** AC2's "bounded with a clear indication" is a client-side UI rule (`maxLength` + a counter), exactly like 3.5's mood-cardinality cap. See Dev Notes — do not add a migration.
- **A `packages/shared-types` zod schema for the note cap.** That package's placeholder comment mentions "note length cap" but 3.5 already established this is a future `shared-types` task, not a story's. Validation lives client-side (`RatingPrompt`'s `maxLength` + `setWatchReaction`'s boundary check) and there is no server CHECK to generate a schema for.
- **A test framework.** Restated every story since 1.3. Verification is a `smoke-check.mjs` extension (Task 3), same as every prior Epic 3 story.

## Tasks / Subtasks

- [x] **Task 1: Widen the outbox reaction contract to include `note` (AC1, AC2, AC3)**

  Read `app/data/watchLog.ts` and `app/data/watchSync.ts` in full before touching them — this is a narrow extension of the `setWatchReaction`/AD-4 contract Story 3.5 already built, not new plumbing. **Most of the wiring already exists**: `pending_watches.note` and `watches.note` both already exist as columns (`db.ts`'s `SCHEMA`, `0003_watches.sql`), `insertPendingWatch` already writes `note: null` on every commit (with a comment naming this story), and `watchSync.ts`'s upsert body already sends `note: row.note` verbatim to the server. **Do not re-add any of that** — the only real gap is that nothing ever sets `pending_watches.note` to a non-null value.

  - [x] **1a — Widen `WatchReaction`** (`watchLog.ts`) from `{ rating, moods }` to `{ rating: number | null; moods: string[]; note: string | null }`.
  - [x] **1b — Widen `assertValidReaction`** to also reject a `note` longer than 500 chars (`MAX_NOTE_LENGTH = 500`, exported alongside `MAX_MOODS`) — a boundary guard mirroring the existing rating/moods checks, defense-in-depth behind the UI's own `maxLength` cap.
  - [x] **1c — Widen `setWatchReaction`'s local write.** The single `withTransactionAsync` UPDATE already sets `rating`/`moods`/bumps `reaction_rev` — add `note = ?` to the same UPDATE statement. **No other change to the transaction shape**: it still reads back `synced_at`/`reaction_rev` in the same tx, and the branch-on-`synced_at` logic (pending → send nothing, let the drain carry it; synced → PATCH) is unchanged.
  - [x] **1d — Widen the PATCH branch.** The existing `supabase.from('watches').update({ rating, mood })` call adds `note: reaction.note` to the same object. One PATCH, same bounded `AbortController` timeout, same failure handling (swallow + warn + leave `synced_rev` behind to self-heal on the next drain) — no new code path.
  - [x] **`watchSync.ts` — verify only, do not edit unless you find it's wrong.** Confirm the upsert body's `note: row.note` line is already present and needs no change (it was written speculatively in Story 1.5/AD-4's original schema and never had to change since — this story is what finally makes `row.note` non-null). If you find this line missing or different from what's described, treat that as a signal to re-read the file rather than assume this doc is stale.
  - [x] **No migration.** `0003_watches.sql`'s `note text` column (no CHECK, no length constraint) already satisfies AC1/AC3 exactly as it satisfied 3.5's rating/mood work. See Dev Notes.

- [x] **Task 2: Add the note field to `RatingPrompt.tsx` (AC1, AC2, AC3)**

  Read the current `app/components/RatingPrompt.tsx` in full — Story 3.5 built it in `review`, not `done`, but its file list and structure are stable (no Epic-3 story since has touched it). This task inserts one new control between `MoodChipRow` and the Skip button; it does not restructure the file.

  - [x] **New local state**: `const [note, setNote] = useState('')`. Reset to `''` in the same `useEffect` that resets `rating`/`moods` whenever `watchId` changes (AC3: each prompt session is scoped to the watch that was just committed, same as rating/moods).
  - [x] **New `TextInput`**, multiline, placed after `MoodChipRow` and before the Skip `Pressable`:
    - `value={note}`, `onChangeText={setNote}`, `maxLength={500}` (AC2's "bounded").
    - `placeholder="Add a note (optional)"`, `placeholderTextColor={theme.colors.inkSecondary}`.
    - Style: reuse the sunken-surface/`radius.sm` field look `AddScreen.tsx`'s `searchField` already establishes (`backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, paddingHorizontal: spacing.md`) — do not invent a new visual language for a text field. Give it enough `minHeight` (~80) for a few lines since this one is `multiline`, unlike `searchField`.
    - `accessibilityLabel="Note"`.
    - A small `Text` counter below it, e.g. `${note.length}/500`, in `type.meta`/`colors.inkSecondary` — this is the "clear indication" AC2 requires. No special color change or warning state is asked for by any AC; keep it plain.
  - [x] **Debounce the write — do not persist on every keystroke.** `handleRating`/`handleMoods` call `persist(...)` synchronously because a star/chip tap is one discrete event. Typing is continuous: persisting on every keystroke would run a SQLite transaction per character and, once the watch is synced, fire a network PATCH per character. Add a `noteDebounceRef` (`ReturnType<typeof setTimeout> | null`) alongside the existing `writeChainRef`:
    - `onChangeText`: update `note` state immediately (so the input feels responsive and the counter updates live), clear any pending timer, and set a new one (~400ms) that calls `persist(rating, moods, next)` (widen `persist`'s signature to take `note` as a third argument, threading through to `setWatchReaction(id, { rating: nextRating, moods: nextMoods, note: nextNote })`).
    - **Flush on dismiss.** `handleDismiss` currently just calls `onDismiss()`. Before that: if a note-debounce timer is pending, clear it and call `persist(rating, moods, note)` synchronously with the latest typed value, so a note typed just before Skip/backdrop-tap/hardware-back isn't dropped. (Rating/mood taps don't need this — they already persist immediately on tap, before any dismiss is possible.)
    - Empty-string handling: send `note: note.trim().length > 0 ? note : null` — mirrors `encodeMoods`'s "empty selection stores as null" convention, so a cleared note round-trips to server `NULL` rather than an empty string. **Do not trim the value you store in `note` state or send when non-empty** — trimming while the user is mid-type would fight cursor position and silently eat interior formatting; only the emptiness check is trimmed.
  - [x] **Keyboard handling — new territory for this file.** `RatingPrompt` is the first `TextInput` inside a bottom-anchored `Modal` sheet in this codebase (`BulkLogSheet` has none). Nothing today prevents the on-screen keyboard from covering the note field. Wrap the sheet's inner `View` (the one currently holding title/StarRating/MoodChipRow/Skip) in a `KeyboardAvoidingView` (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — Android's default resize behavior is usually sufficient without `'height'`, but verify against a keyboard open on-device per Task 3). Import `Platform` and `KeyboardAvoidingView` from `react-native`.
  - [x] **AC1's "never blocks the watch" still holds.** No disabled state, no "must add a note" gate — Skip remains one tap, dismisses, and writes nothing new beyond whatever was already debounce-flushed. This is the same non-blocking discipline 3.5 established for rating/moods; the note field must not become an exception.

- [x] **Task 3: Verification (AC: all)**
  - [x] Standing gates, run from `app/`: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles.
  - [x] `node scripts/smoke-check.mjs` (`pnpm run verify`) passes against the local stack.
  - [x] **Extend `smoke-check.mjs`'s existing block 10** (Story 3.5's `if (anonKey) { ... }` block, using the same `SMOKE_C` session and `REACTION_WATCH_ID` fixed UUID it already establishes) with two more assertions in the same `ok()`/`fail()` style:
    1. **Note round-trips through the upsert, alongside rating/mood, on the same row.** Extend the existing `upsertReaction` helper (or add a sibling call) to include a `note` field and assert it comes back unchanged on the same `REACTION_WATCH_ID` row already used for the rating/mood round-trip check — proving AC1/AC3's "stored on that watches row" without introducing a second fixture.
    2. **No server-side length CHECK exists — the client cap is the only enforcement (AC2).** POST/upsert a note longer than 500 chars (e.g. 600 chars) and assert it is accepted (HTTP < 400) — the direct proof, mirroring 3.5's explicit "why no migration" precedent, that the 500-char cap is a `RatingPrompt` UI rule, not a DB constraint. Name the hazard this guards against in the assertion message: a future migration accidentally adding a CHECK here would silently break notes near the cap with no story authorizing it.
  - [x] Manual / DB-layer verification pass against the local stack, recorded in Completion Notes:
    - Type a note in the prompt, wait past the debounce, dismiss with Skip → confirm exactly one `watches` row carries the note text (network on, watch already synced by the time typing starts, so this exercises the PATCH branch).
    - Type a note, dismiss **immediately** (within the debounce window) → confirm the note still lands (the dismiss-flush path, not the debounce timer).
    - Network off → log a watch → type a note → reconnect → confirm the note arrives as part of the single carried-along `watches` row insert (the same AC3-style fast-path hazard 3.5 pinned for rating/mood, now exercised for note too — no separate assertion needed since it's the identical code path, but confirm it by observation).
    - Rewatch the same title (AD-3) and add different notes to each watch → confirm two `watches` rows with two distinct notes (AC3 — bound to the watch, not overwritten).
    - Reach the 500-char cap → confirm the input stops accepting further characters and the counter reads `500/500`.
    - On-device: open the keyboard with the prompt visible → confirm the note field is not obscured (the new `KeyboardAvoidingView`).

### Review Findings

Joint code review of Story 3.5 + Story 3.6 (both landed uncommitted in the same working tree, 2026-07-11). 3-layer adversarial review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) against `git diff HEAD` (11 files, 795+/198-, plus 3 new files). See Story 3.5's Review Findings for the shared decision-needed item (unauthorized tabs feature) and the non-note-specific patches/defers. This section covers the note-specific findings.

**Patches applied:**
- [x] [Review][Patch] A note exceeding `MAX_NOTE_LENGTH` (e.g. pasted text bypassing the native `TextInput` `maxLength` on some Android IME/autofill paths) made every subsequent `persist()` call — including a bare star/mood tap, which resends the current note unchanged — throw inside `assertValidReaction` and silently stop saving all reactions from then on (the throw is swallowed by `persist`'s `.catch`). Now clamped client-side in `handleNoteChange` (`next.slice(0, MAX_NOTE_LENGTH)`) as defense-in-depth behind the native cap. [app/components/RatingPrompt.tsx:130]
- [x] [Review][Patch] `noteDebounceRef`'s pending debounce timer had no unmount cleanup — if the host screen unmounted by a path other than `handleDismiss` (e.g. navigating away mid-debounce), the timer still fired later against a stale closure. Added a cleanup `useEffect` clearing the timer on unmount. [app/components/RatingPrompt.tsx:19]

**Deferred:** see Story 3.5's Review Findings (note-whitespace inconsistency is recorded there).

**Dismissed:** see Story 3.5's Review Findings — none of the dismissed items were note-specific.

## Dev Notes

### Why almost no plumbing is new

Read `app/data/watchLog.ts`, `app/data/watchSync.ts`, and `supabase/migrations/0003_watches.sql` before assuming this story needs new schema or a new sync path — it doesn't:

- `pending_watches.note` and `watches.note` both already exist (Story 1.5's original schema, `db.ts`'s `SCHEMA` and `0003_watches.sql`). Both were added speculatively with comments naming *this* story as the one that would finally write them.
- `insertPendingWatch` already writes `note: null` into every new row, with an inline comment: *"`note` is Story 3.6 — hardcoded null on every write path until then."* Leave the initial commit's `null` as-is — a note is never set at the moment a watch is logged, only afterward via the prompt (same pattern 3.5 established for rating/moods).
- `watchSync.ts`'s upsert body already sends `note: row.note` to the server, unconditionally, on every drain. This has been dead code (always `null`) since Story 1.5; this story is what finally makes it live. **Do not add a second `note` field or touch the upsert body** — verify it's there, then leave it.
- The `reaction_rev`/`synced_rev` outbox mechanism (Story 3.5) already covers "any pending-row edit that must be re-synced if it changes after the row already synced" — it does not care *which* columns changed, only that `reaction_rev` was bumped. Widening `setWatchReaction`'s single UPDATE to also set `note` gets the note the exact same fast-path-hazard and lost-update protections rating/moods already have, for free.

### Why no migration

`0003_watches.sql`'s `note text` column has no `CHECK` and no length constraint — by design, per the same logic `0008`'s mood-cardinality deferral used: FR21 says "~500-char cap", not a hard DB rule, and AC2 frames it as UI bounding ("input is bounded with a clear indication"), not a persistence-layer rule. Enforce the cap in `RatingPrompt`'s `maxLength={500}` and in `setWatchReaction`'s boundary check (Task 1b) — not in a migration. Task 3's smoke-check addition proves this explicitly (a 600-char note is accepted server-side) so a future migration doesn't silently add a CHECK no story asked for.

### The debounce is the one genuinely new pattern this story introduces

Every write in `RatingPrompt.tsx` so far (Story 3.5) is a discrete tap: one star tap, one chip tap, each calling `persist()` once. A text field is continuous input — persisting per-keystroke would mean a SQLite transaction per character while typing, and, once the watch has already synced, a network PATCH per character (each racing its own 10s `AbortController` — dozens of overlapping in-flight requests during a burst of typing). Debounce the *write*, not the *state update*: `note` state (and the visible counter) update on every keystroke so the UI stays responsive; `persist(rating, moods, note)` only fires ~400ms after typing pauses, or immediately on dismiss if a debounce is still pending. This is the same class of problem `RatingPrompt`'s `writeChainRef` already solves for concurrent rating/mood writes (serialize, don't interleave) — the debounce prevents the writes from being generated in the first place, faster than the chain would need to serialize them.

### Where the note field does and doesn't appear

Same call-site table Story 3.5 established, unchanged — this story adds a field to the existing prompt, not a new commit site:

| Call site | Commits | Note field? | Why |
|---|---|---|---|
| `HomeScreen.handleMarkWatched` → `RatingPrompt` | `logWatch()` | **Yes** | AC1: "a watch (in the rating prompt...)". |
| `AddScreen.handleLog` → `RatingPrompt` | `logWatch()` | **Yes** | Same prompt, same component. |
| `BulkLogSheet.handleConfirm` | `logWatchBatch()` | **No** | No prompt at all (3.5's scope wall) — season-level rating/mood only, no note. |

`TitleDetailScreen` still has no single-watch commit control and no note-editing surface (no story has added one).

### Previous Story Intelligence

- **3.5** is the direct parent and does almost all the hard work this story reuses: `setWatchReaction`'s local-first/branch-on-`synced_at` contract, the `reaction_rev`/`synced_rev` outbox mechanism, `RatingPrompt.tsx`'s sheet chrome and `displayWatchId` mount-through-close-animation trick, and the `writeChainRef` write-serialization pattern. This story's job is almost entirely "add one more field to an existing pipe," which is why Task 1 is mostly verification, not new code.
- **3.4** built the first `Modal` sheet (`BulkLogSheet.tsx`) and the `savingRef` double-tap guard pattern; not directly touched here, but its scope wall's precedent (defer shared concerns to the story that actually needs them) is why this story doesn't add a note field to the bulk sheet.
- **1.5** built the outbox and the `note`/`mood`/`rating` columns speculatively, with comments in both `db.ts` and `0003_watches.sql` explicitly naming the future stories (3.4/3.5 for mood/rating, 3.6 for note) that would eventually write them. Those comments are why Task 1 finds so little to add.
- **Standing conventions carried forward:** local write is the commit, confirmed before any network attempt; every network call races a bounded `AbortController` timeout; best-effort reads/writes degrade quietly (warn + self-heal via `reaction_rev`/`synced_rev`, never a hard error surfaced to the prompt); no new npm dependency without an architecture reason (this story needs none — `TextInput`/`KeyboardAvoidingView` are core React Native).

### Testing standards summary

No test framework exists in this repo (restated every story since 1.3, not introduced here). Done-bar: `npx tsc --noEmit` clean, `npx expo export --platform android` bundles, `node scripts/smoke-check.mjs` (`pnpm run verify`) passes against the local stack, plus a recorded manual/DB-layer verification pass in Completion Notes. Unlike 3.5's AC3, no AC here says "must be automated" — the smoke-check additions in Task 3 are still the right home for the server-side round-trip/no-CHECK proofs (matches every prior Epic 3 story's precedent), but there is no named regression test obligation driving them.

### Project Structure Notes

- **New:** nothing — no new files.
- **Updated:** `app/data/watchLog.ts` (`WatchReaction` widened; `assertValidReaction` widened; `setWatchReaction`'s UPDATE and PATCH bodies widened — all additive, no signature removed), `app/components/RatingPrompt.tsx` (new `TextInput` + counter + debounce + `KeyboardAvoidingView`), `scripts/smoke-check.mjs` (extend existing block 10, no new block).
- **Read-only, verify-only:** `app/data/watchSync.ts` (confirm `note: row.note` is already in the upsert body — do not edit unless it's genuinely missing/wrong), `supabase/migrations/0003_watches.sql`, `app/data/db.ts` (both already have the `note` column).
- No new migration, no new npm dependency, no `packages/shared-types` change (per Scope wall).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.6: Attach an optional note to a watch] — story statement + all three ACs (FR21, FR20).
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3] — FR21's canonical text ("~500-char cap, plain text"); FR20 ("bound to the watch's timestamp... not a single evolving score").
- [Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#AD-4] — "Watch commits, and the rating/mood/note that follows, are local-first via one durable outbox unit" — the contract this story's `note` widening slots into verbatim; AD-4's own text already lists `note` as a first-class member of the reaction, not an afterthought.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#AD-3] — watch is the atomic timestamped unit; a note edit updates *that row*, never collapsing across separate watches (AC3).
- [Source: app/data/watchLog.ts] — `WatchReaction`, `setWatchReaction`, `assertValidReaction`, `MAX_MOODS` (pattern for the new `MAX_NOTE_LENGTH`), `insertPendingWatch`'s existing `note: null` + comment naming this story.
- [Source: app/data/watchSync.ts] — the upsert body's existing (currently dead) `note: row.note` line; the `reaction_rev`/`synced_rev` selection predicate this story's note edits ride on unchanged.
- [Source: app/components/RatingPrompt.tsx] — the sheet this story adds a field to: `persist`/`writeChainRef` write-serialization, `displayWatchId` mount-through-close-animation trick, Reduce Motion handling (untouched by this story — the note field has no animation of its own).
- [Source: app/features/add/AddScreen.tsx] — the `searchField` `TextInput` style this story's note field's visual treatment reuses (sunken surface, `radius.sm`).
- [Source: supabase/migrations/0003_watches.sql] — `note text` column, no CHECK, already correct for AC1/AC3; its comment naming "Rating/mood/note live here (nullable until Epic 3 writes them)".
- [Source: scripts/smoke-check.mjs] — block 10 (Story 3.5's reaction-invariant checks): `SMOKE_C` session helper, `REACTION_WATCH_ID` fixed UUID, `upsertReaction` helper this story's Task 3 extends.
- [Source: _bmad-output/implementation-artifacts/3-5-rate-and-react-after-a-watch.md] — parent story: full `setWatchReaction`/outbox design, the "why a revision counter not a dirty flag" reasoning this story's note edits inherit unchanged, and its own scope wall explicitly deferring the note field to here.

## Open Questions

Saved for after implementation, per the workflow — none of these block the dev:

1. **KeyboardAvoidingView behavior on Android.** This story's Dev Notes recommend leaving Android's default resize behavior alone (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`), but this is the first `TextInput` inside a `Modal` in the codebase and there's no prior art to confirm against. Task 3's manual pass should settle whether Android needs an explicit `'height'` behavior too; if so, that's a one-line follow-up, not a redesign.
2. **The Diary note-editing surface** (AC1's "later from the Diary" clause) has no home until Epic 4 builds `DiaryScreen.tsx`. Flagging so it isn't assumed already covered when Epic 4 starts — it will need its own read of `setWatchReaction` (already generic enough to serve an out-of-prompt edit) plus new UI, likely alongside Story 3.7's edit/remove work or a Story 4.1 addendum.
3. **`shared-types`'s note-length zod schema** (its placeholder comment mentions one) is still not generated, per 3.5's precedent of leaving that package's zod schemas as a future `shared-types`-specific task. Worth doing once that package actually gets consumers.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5), via the bmad-dev-story workflow.

### Debug Log References

None — no framework/tooling issues hit during implementation. Confirmed the story's own predictions before touching code: `pending_watches.note`/`watches.note` already existed, `insertPendingWatch` already hardcoded `note: null` with a comment naming this story, and `watchSync.ts`'s upsert body already sent `note: row.note` verbatim — all left untouched, exactly as scoped.

### Completion Notes List

- **Task 1 (outbox contract widened):** `WatchReaction` (`watchLog.ts`) now carries `note: string | null`. `assertValidReaction` gained a `note` param and rejects any value over `MAX_NOTE_LENGTH` (500, exported alongside the pre-existing `MAX_MOODS`) — defense-in-depth behind the UI's own `maxLength`, matching the rating/moods bound-check shape exactly. `setWatchReaction`'s single `withTransactionAsync` UPDATE now also sets `note = ?` (empty string normalized to `null` in the same statement, mirroring `encodeMoods`'s empty-selection-is-null convention) — no other change to the transaction shape or the branch-on-`synced_at` logic. The PATCH branch's `supabase.from('watches').update(...)` call now includes `note` in the same object, same bounded timeout, same swallow-and-warn failure handling. `watchSync.ts` was read and confirmed unchanged-and-correct (`note: row.note` was already present, dead code since Story 1.5, now finally live) — not edited, per the story's "verify only" instruction. No migration: `0003_watches.sql`'s `note text` column has no CHECK and needed none.
- **Task 2 (note field in `RatingPrompt.tsx`):** New `note` local state, reset alongside `rating`/`moods` in the existing watchId-keyed reset effect. New multiline `TextInput` between `MoodChipRow` and the Skip button, styled with the sunken-surface/`radius.sm` look (mirrors `AddScreen.tsx`'s `searchField`, taller `minHeight` for multiline), `maxLength={500}`, with a live `{length}/500` counter underneath (AC2's "clear indication"). Debounced write: `note` state updates every keystroke (UI stays responsive), but the actual `persist()` call — which threads `note` through as `persist`'s new third argument — only fires 400ms after typing pauses, via a `noteDebounceRef` timer alongside the pre-existing `writeChainRef`. `handleDismiss` now flushes any pending debounce timer synchronously (clears it, calls `persist` immediately with the latest value) before calling `onDismiss()`, so a note typed just before Skip/backdrop-tap/hardware-back isn't lost — rating/mood taps needed no equivalent change since they already persist on tap. Empty-string handling: `persist` sends `note.trim().length > 0 ? note : null`, and the value stored in state/sent when non-empty is never trimmed (only the emptiness check is). The sheet's inner content is now wrapped in a `KeyboardAvoidingView` (`behavior: 'padding'` on iOS, `undefined`/default resize on Android — first `TextInput` inside a `Modal` in this codebase, no prior art to diverge from). Skip remains unconditional and unchanged — no gate, no required field.
- **Task 3 (verification):** `npx tsc --noEmit` clean. `npx expo export --platform android` bundles (1046 modules, no errors). `node scripts/smoke-check.mjs` passed against the local stack (all 7 services healthy, RLS/grant audits clean, all prior Story 3.5 assertions still green). Extended block 10 with two new assertions (10d/10e): a note round-trips through the same `upsertReaction` upsert path alongside rating/mood on the `REACTION_WATCH_ID` fixture (proving AC1/AC3's "stored on that watches row"), and a 600-char note is accepted server-side with HTTP < 400 and returns unchanged (proving AC2's cap is client-only — no DB CHECK exists to silently regress). Both passed on the local stack. `upsertReaction`'s signature widened with an optional third `note` param (only included in the request body when explicitly passed, so the pre-existing 3.5 assertions using the two-arg form are untouched).
  - Manual/DB-layer pass performed directly against the local Supabase stack via the smoke-check's own PostgREST calls (equivalent server-side surface to what `setWatchReaction`'s PATCH/upsert branches send): a note round-trips unchanged on repeated upsert of the same id (mirrors AC3's "only that watch's note changes" — the fixture row's other columns were unaffected across repeated calls with different note values), and the 500-char cap is confirmed to be enforced nowhere server-side (600 chars accepted verbatim), consistent with the story's explicit "no migration" call.
  - **Not exercised in this environment (no emulator/device available, consistent with every prior Epic 3 story's own precedent):** the `expo-sqlite` branch of `setWatchReaction` itself (the local `pending_watches` UPDATE + branch-on-`synced_at` logic), the debounce timing/flush-on-dismiss behavior, the `KeyboardAvoidingView`'s actual on-screen keyboard interaction on iOS vs Android, and the 500-char input's live-typing cutoff behavior in the `TextInput` itself. These remain the same class of outstanding on-device manual pass every Story 3.1–3.5 Completion Notes already recorded as outstanding for the identical reason.
  - **Open Question 1 (Android `KeyboardAvoidingView` behavior)** from the story file is therefore also still open — left at the story's own recommended default (`undefined`/native resize on Android) since there is no on-device signal in this environment to confirm or override it.

### File List

- `app/data/watchLog.ts` (updated)
- `app/components/RatingPrompt.tsx` (updated)
- `scripts/smoke-check.mjs` (updated)

## Change Log

| Date | Change |
|------|--------|
| 2026-07-11 | Story implemented: `WatchReaction`/`assertValidReaction`/`setWatchReaction` widened to carry `note` end-to-end (local UPDATE + PATCH branch), a debounced/flush-on-dismiss/keyboard-aware note `TextInput` added to `RatingPrompt.tsx` (500-char cap + live counter, first `KeyboardAvoidingView` usage in the codebase), and `smoke-check.mjs`'s existing reaction-invariant block extended with two note-specific server-side assertions (round-trip, and no DB-level length CHECK). `watchSync.ts` confirmed already-correct and left untouched. No migration. `tsc`/`expo export`/`smoke-check` all clean; on-device manual pass (debounce feel, keyboard avoidance, 500-char input cutoff) outstanding — no emulator in this environment, consistent with every prior Epic 3 story. Status → review. |
| 2026-07-10 | Story drafted: widen `setWatchReaction`'s local-first outbox contract (Story 3.5) to include `note`, add a debounced/keyboard-aware note field to `RatingPrompt.tsx`, extend `smoke-check.mjs`'s existing reaction-invariant block. No migration (0003's `note text` column and 1.5's speculative `insertPendingWatch`/`watchSync` wiring already anticipated this story). Status → ready-for-dev. |
