# Review — Rubric Coverage Lens (tv-time-2 UX)

Reviewed DESIGN.md and EXPERIENCE.md against required-section coverage, component cross-references, IA-surface reachability, flow climaxes, per-surface state handling, and dangling [ASSUMPTION] tags. Date: 2026-07-02.

**Coverage confirmed (checked, no gap):**
- DESIGN.md — all 8 required sections present in canonical order (Brand & Style · Colors · Typography · Layout & Spacing · Elevation & Depth · Shapes · Components · Do's and Don'ts). Frontmatter carries all required tokens: `colors`, `typography`, `rounded`, `spacing`, `components`.
- EXPERIENCE.md — all 8 required sections present (Foundation · Information Architecture · Voice and Tone · Component Patterns · State Patterns · Interaction Primitives · Accessibility Floor · Key Flows), plus allowed invented sections (Notifications, Inspiration & Anti-patterns).
- Every Key Flow (1–4) has an explicit, clearly labeled **Climax** beat.
- No dangling `[ASSUMPTION]` tags in either document.

## CRITICAL

- **EXPERIENCE.md → Information Architecture / State Patterns / Key Flows (Profile surface):** Profile is listed as one of the 5 IA surfaces but no State Pattern covers it (no loading/empty/error) and no Key Flow ever reaches it. It is an unreachable surface in the spine. Fix: add at least one entry-point flow or state (e.g. a first-run "empty stats" / "0 friends" Profile state) and/or a flow beat that navigates to Profile settings (theme toggle, global notifications), so the surface is actually exercised.

## SHOULD-FIX

- **DESIGN.md → frontmatter `components` vs Components section / EXPERIENCE.md → Component Patterns:** "Notify bell" is specified in DESIGN.md prose and used in EXPERIENCE.md, but there is no `notify-bell` key in the frontmatter `components` token. EXPERIENCE.md compensates by referencing it as `{components.poster}` context (lines 55 & 96), which points at the wrong token. Fix: add a `notify-bell` entry to DESIGN frontmatter `components` and repoint the EXPERIENCE references to `{components.notify-bell}`.
- **EXPERIENCE.md → State Patterns (error handling):** Only `Offline` is handled as a failure state; there is no generic fetch-failure / error treatment. Search only has an "empty" state (no network-error variant distinct from "no matches"), and Title detail has no error state for a failed seasons/episodes fetch. The Flow 1 "Failure" note (slow catalog fetch) is never promoted into the State Patterns table. Fix: add an error/failed-fetch row (and a Search-network-error variant) so every fetching surface has a loading + empty + error triad.
- **DESIGN.md → Components vs EXPERIENCE.md → Component Patterns ("Bulk-log sheet"):** The bulk-log season sheet is specified behaviorally in EXPERIENCE (Component Patterns + Flow 2) but has no visual spec in DESIGN.md Components (only the generic bottom-sheet corner radius appears under Shapes). Fix: add a Bulk-log sheet entry to DESIGN Components (checkbox rows, pre-checked state, confirm affordance, optional season-rating placement).

## NICE-TO-HAVE

- **EXPERIENCE.md → State Patterns (Title detail loading):** Title detail has `Caught up` and `Watched confirmed` states but no explicit loading state while seasons/episodes load. Add a skeleton/loading treatment for the detail surface for completeness.
- **DESIGN.md / EXPERIENCE.md (naming drift):** DESIGN calls it "Watched badge / Continue pill"; EXPERIENCE calls it "Watched / Continue control." Align the name across both docs to avoid ambiguity about whether these are one component or two.
- **EXPERIENCE.md → State Patterns (Recommendations shelf):** Empty states exist for Home, Diary, Watchlist, Feed, and Search, but the Recommendations shelf (named in IA and Flow 1) has no empty/insufficient-data state. Add a "not enough history yet" treatment for the Recommendations shelf.
