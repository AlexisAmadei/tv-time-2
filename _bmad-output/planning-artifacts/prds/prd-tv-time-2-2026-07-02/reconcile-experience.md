# Reconciliation — EXPERIENCE.md (spine) vs prd.md (+ addendum.md)

Date: 2026-07-02
Source of behavioral truth: `EXPERIENCE.md` (mobile-only, dark-by-default).
Reviewed against: `prd.md` and `addendum.md`.

## Method & scope notes

- **Deliberate changes NOT flagged:** web cut from v1 (EXPERIENCE is already mobile-only — consistent); privacy is private-by-default (PRD FR29). EXPERIENCE Flow 4/5 assume friends can see activity; the PRD made this coherent by adding "Because Léa has opted her activity visible to friends" to UJ-4 and per-title trust language to UJ-5. **Not incoherent — no flag.**
- The PRD intentionally delegates detailed state-pattern *copy* to `EXPERIENCE.md` (FR8, FR24 explicitly point there). Where the PRD carries the behavior and only defers the exact wording, that is acceptable and rated low.

Overall the PRD is a faithful derivation: the core loop, banned streak/guilt/re-engagement/forced-rating patterns, notifications model, hybrid rating, timestamped mood layer, offline/error/empty state behaviors, voice/tone, and the accessibility floor are all carried as requirements. The gaps below are mostly qualitative interaction/navigation detail an FR list tends to lose.

---

## Gaps

### 1. Auto-playing hero video ban not carried as a PRD requirement — MEDIUM
- **EXPERIENCE:** Interaction Primitives → "**Banned:** guilt/streak mechanics, re-engagement nag pushes…, forced rating gates, **auto-playing hero video**."
- **PRD:** Three of the four banned patterns are hardened into requirements/counter-metrics (streak/guilt → Counter-metrics + NFR10 + FR35; re-engagement pushes → FR35 + Counter-metrics; forced rating gates → FR14/FR17). **Auto-playing hero video appears only in `addendum.md` ("Explicitly rejected patterns… enforce in build"), not in the PRD proper.** It is the one banned pattern with no FR/NFR/counter-metric anchor.
- **Why it matters:** The task calls out banned-pattern preservation specifically. Three of four are hard requirements; this one degrades to a companion-doc note. A build team reading only the PRD requirement set could add an auto-playing poster/trailer hero without violating any stated requirement.
- **Fix:** Add auto-play to the counter-metrics or an NFR (e.g., extend NFR10 or add to Scope "Out"), matching the treatment of the other three bans.

### 2. "Tap to act — no long-press required" interaction primitive dropped — MEDIUM
- **EXPERIENCE:** Interaction Primitives → "**Tap to act.** The core loop is all taps — no long-press required to log or rate." Also "One-tap Watched, one-tap dismiss."
- **PRD:** One-tap Watched (FR11) and one-tap Skip (FR17) are captured, but the **general rule that no core action may require a long-press or hidden gesture** is not stated. NFR1 covers speed and NFR7 covers tap-target size, but neither forbids gating a primary action behind a long-press/swipe.
- **Why it matters:** This is a load-bearing accessibility/discoverability contract (long-press is undiscoverable and hard for motor/AT users). It's exactly the kind of qualitative interaction primitive an FR list loses.
- **Fix:** State in NFR7 or the Tracking/Logging FRs that all primary loop actions (log, rate, react, dismiss) are reachable by a single tap with no long-press dependency.

### 3. Navigation / IA contract not carried as a requirement — MEDIUM
- **EXPERIENCE:** Information Architecture → 5-slot bottom tab bar (**Home · Diary · (+) · Feed · Profile**); "the center **(+)** is the fast-add / log entry point, **always one tap away**"; "**Bottom sheets stack one level deep**." Component Patterns → Fast-add (+) "Center slot, always present," "opens search-first log flow."
- **PRD:** The individual surfaces map to FRs (Home/Up Next FR10, search FR6, Diary FR22, Feed FR28, Profile FR23), and UJ-3 references the center (+), but there is **no requirement establishing the persistent bottom-tab structure, the always-present center (+) fast-add as the primary log entry point, or the one-level-deep sheet constraint.** The (+) "search-first log flow" primitive is only implied.
- **Why it matters:** The always-one-tap (+) is the physical embodiment of "logging is faster than forgetting" — the product's core promise. Leaving the entry-point/navigation model unstated risks the log flow being buried a screen deeper than intended.
- **Fix:** Add an FR (or IA note) fixing the persistent nav model and the center-(+) fast-add entry point; optionally the sheet-depth constraint.

### 4. Search *empty* state "no auto-suggestions" behavior not carried — LOW
- **EXPERIENCE:** State Patterns → Search empty: "'Hmm, nothing by that name. Try another spelling or title?' **No auto-suggestions.**"
- **PRD:** FR8 covers search *error*/retry and query preservation, but the empty-result behavior — and specifically the deliberate "no auto-suggestions" rule — is not called out (only generally delegated to EXPERIENCE state patterns).
- **Why it matters:** Minor behavioral intent; "no auto-suggestions" is a small deliberate choice that could be reversed without noticing. Delegation to EXPERIENCE mostly covers it.

### 5. Accessibility: "no truncated controls at largest Dynamic Type" softened — LOW
- **EXPERIENCE:** Accessibility Floor → "Dynamic type honored…; **no truncated controls at largest setting.**"
- **PRD:** NFR7 says "Dynamic Type honored" but drops the explicit "no truncated controls at largest setting" testable clause.
- **Why it matters:** Small loss of a concrete, testable acceptance condition. Low.

### 6. Title card "shows current-episode state for tracked shows" not explicit — LOW
- **EXPERIENCE:** Component Patterns → Title card: "Shows current-episode state for tracked shows."
- **PRD:** Implied by Up Next (FR10) + next-episode pointer (FR11) but not stated as a card-rendering requirement.
- **Why it matters:** Low; behavior is reconstructable from the pointer model.

### 7. Warm micro-copy examples (empty/caught-up/error strings) live only in EXPERIENCE — LOW (acceptable by design)
- **EXPERIENCE:** Voice/Tone table + State Patterns carry specific strings ("Your story starts here…", "You're all caught up on {show}…", "Couldn't reach the catalog…").
- **PRD:** NFR10 requires the voice as a product requirement and FR8/FR24 point to EXPERIENCE for the exact copy. This is the PRD's stated delegation strategy — **not a true gap**, noted for completeness so it isn't re-flagged.

---

## Confirmed faithful (no action)

- Banned streak/guilt/"missed a day" → Counter-metrics + NFR10 + FR35. ✔
- Re-engagement "we miss you" pushes banned → FR35 + Counter-metrics. ✔
- Forced rating gates banned; watched commits instantly → FR14 + FR17 (testable with network off). ✔
- Notifications model (per-title bell independent of tracking, caught-up contextual nudge, push only on genuine new episodes, global toggle, warm voice) → FR33–FR37. ✔
- Hybrid rating (½-star + curated multi-select mood chips, both optional, re-tappable, timestamped) → FR17–FR20. ✔
- Bulk season log, all pre-checked, deselect-don't-select, optional season rating → FR13. ✔
- Offline (cache + queue + sync, no blocking banner) → NFR8. ✔
- Error/empty/cold-open/poster states → FR8, FR9, FR24, NFR1 (+ EXPERIENCE delegation). ✔
- Voice/tone as a requirement, one-emoji-max → NFR10. ✔
- Accessibility floor (role+state labels, tap targets, color-not-sole-signal, Reduce Motion) → NFR7. ✔
- 15-second loop → NFR1 (strengthened to measurable p95). ✔
- Memory-beat payoffs (year-count line, "whole season… Respect") → UJ-1, UJ-2. ✔
- Privacy coherence with Flows 4/5 → resolved via UJ-4/UJ-5 opt-in language + FR29/FR29a. ✔
