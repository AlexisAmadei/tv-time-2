---
title: "Sprint Change Proposal — Popcorn Time"
date: 2026-07-02
author: Alex (via Correct Course workflow)
status: approved
approved_by: Alex
approved_date: 2026-07-02
mode: incremental
triggered_by: implementation-readiness-report-2026-07-02.md
---

# Sprint Change Proposal — Popcorn Time

**Date:** 2026-07-02 · **Project:** tv-time-2 · **Change mode:** Incremental

## Section 1 — Issue Summary

The pre-implementation **Implementation Readiness review (2026-07-02)** surfaced one blocking cross-artifact inconsistency plus three unresolved open questions that gate specific stories.

- **Primary problem — TV Time Import descope was recorded in only one of three artifacts.** The `epics.md` had already cut the TV Time Import feature (FR38–41) by product decision, but `prd.md` **and** `ARCHITECTURE-SPINE.md` both still treated import as in-scope (FR38–41, Goal #3, do-now export inspection; AD-7, the `import-tvtime` Edge Function, the `IMPORTS` entity, and a dual-caller next-episode pointer). Implementers would have been handed three disagreeing sources.
- **Three open questions still marked unresolved**, blocking their stories: OQ#5 (mood-chip set — a live PRD FR18 ↔ DESIGN.md contradiction), OQ#10 (profile aggregation rule, `[decision needed before build]` in Story 4.2), OQ#6 (friend-discovery mechanism, `[decision needed]` in Story 5.1).

**Discovery context:** found during readiness validation, before any code was written (greenfield, pre-build).

**Type of change:** artifact drift + deliberate scope reduction not yet propagated; not a technical failure.

### Time-sensitive decision consciously taken

The TV Time shutdown is **2026-07-15** — the export window was still open (13 days out) at decision time. It was explicitly flagged that cutting import permanently forecloses rescuing the creator's own history after that date. **Decision (Alex, 2026-07-02): cut import entirely** — accounts start fresh, no export-rescue, no post-v1 obligation created beyond an optional community-supplied-export importer.

## Section 2 — Impact Analysis

| Area | Impact |
|------|--------|
| **Epic impact** | **None structural.** The epics were already correct; this pass brought the upstream docs down to the epics, plus landed three open-question decisions into three story ACs. No epic added, removed, or resequenced. |
| **Story impact** | 3 stories updated: **1.2** (profile schema gains `username`), **4.2** (aggregation rule landed), **5.1** (discovery mechanism landed). No stories cut — import never had stories. |
| **PRD conflicts** | FR38–41, Goal #3, import success criterion, do-now export note, Dependencies + OQ#2, Assumptions Index — all reconciled. FR2/FR18/FR23/FR32 + OQ#5/#6/#10 resolved. Companion `addendum.md` import spike-notes retired. |
| **Architecture conflicts** | AD-7 retired in place (number preserved); `import-tvtime`, `IMPORTS` entity, `source_watch_id`, import field-mapping deferral removed; AD-10 simplified to a single organic caller and renamed `recompute_next_episode_pointer` (adopting the epics' standing recommendation); OQ#5 mood note marked resolved. |
| **UX conflicts** | `DESIGN.md` mood-chip line corrected from the stale 5-chip set to FR18's locked 8-chip set. |
| **Technical / code impact** | None — greenfield, no code exists yet. MVP **shrinks** (Goal #3 dropped); nothing to roll back. |

## Section 3 — Recommended Approach

**Selected path: Direct Adjustment (Option 1) + PRD MVP reduction ratified (Option 3).**

- **Effort:** Low · **Risk:** Low · **Timeline impact:** none (removes work; unblocks build).
- **Rationale:** the decision was already made and coherently implemented in the epics; the only work was propagating it and closing three open questions. Zero rework, removes the sole blocking inconsistency, and shrinks scope. Rollback (Option 2) was N/A — nothing built.

## Section 4 — Detailed Change Proposals (all APPLIED)

### Stories (`epics.md`)
- **1.2** — `profiles` schema adds `username text unique not null` (the `@handle`, captured at sign-up) + a new AC validating it required/unique (FR2, FR32, OQ#6).
- **4.2** — aggregation rule landed: year stats = raw episode-watch count + distinct-title film/show counts; favorites = distinct titles with max watch-rating ≥ 4.5★, recency-ordered (FR23, OQ#10).
- **5.1** — discovery landed: exact `@username` lookup or share/deep link, no fuzzy browsing (FR32, OQ#6).
- Requirements-inventory FR2/FR23/FR32 lines + UX-DR8 + Epic 3 mood-set note synced to the resolutions.

### PRD (`prd.md` + `addendum.md`)
- Import cut: Goal #3, FR38–41 block, Scope In/Out, deadline paragraph → historical note, Dependencies bullet, OQ#2 → moot, success criteria + Assumptions Index cleaned, residual "imported" phrasings scrubbed (FR16/FR29/Glossary). Addendum import spike-notes → retired.
- OQ resolutions: FR2 (+username), FR18 (mood set locked, `[ASSUMPTION]` dropped), FR23 (aggregation rule), FR32 (discovery); OQ#5/#6/#10 marked resolved.

### Architecture (`ARCHITECTURE-SPINE.md`)
- Import cut: scope line, Design Paradigm, AD-1/AD-2 binds, AD-7 retired, AD-10 simplified + RPC renamed, Structural Seed, Capability Map row, ER `IMPORTS`, Deferred import bullet.
- OQ#5: Consistency Conventions mood note + Deferred bullet marked resolved.

### UX (`DESIGN.md`)
- Mood-chip component line → FR18's locked 8-chip set.

## Section 5 — Implementation Handoff

**Change scope classification: Moderate** (multi-artifact reconciliation + backlog decisions; no code, no rollback).

- **Primary recipient:** Developer agent — the epics/stories are now build-ready; proceed to story implementation starting with Epic 1 (walking skeleton).
- **Product Owner / PM:** none required beyond this proposal — scope reduction is documented and internally consistent.
- **Success criteria:** all five artifacts free of import references (except explicit cut/retired notes) and free of `[decision needed]` markers; `username` present in Story 1.2 schema; mood set identical across FR18 / DESIGN.md / ARCH.

**New follow-on constraint introduced by this change (for the build):**
- `profiles.username` is a **unique, required, sign-up-time** field (case-insensitive uniqueness) — a small addition to the Epic 1 auth flow (Story 1.2) and the Epic 5 discovery path (Story 5.1).

## Verification

Grep sweeps confirmed: PRD/addendum carry no live import references (only cut notes); Architecture carries no `import-tvtime`/`IMPORTS`/`source_watch_id`/`advance_next_episode_pointer` (only retired/cut notes); epics carry no remaining `[decision needed]` or open mood-set contradiction. Mood set is byte-identical across FR18, DESIGN.md, ARCH, and epics.

---

*Generated by the Correct Course (bmad-correct-course) workflow · Assessor: Developer navigating change · 2026-07-02*
