# DESIGN ↔ PRD Reconciliation

**Source DESIGN:** `_bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/DESIGN.md`
**Derived PRD:** `_bmad-output/planning-artifacts/prds/prd-popcorn-time-2026-07-02/prd.md`
**Date:** 2026-07-02
**Scope of this pass:** DESIGN owns visual identity; PRD owns capabilities. Flag only (a) DESIGN detail that implies a *product requirement* the PRD should carry, or (b) genuine DESIGN↔PRD *contradictions*. Pure visual styling that correctly lives only in DESIGN is intentionally left alone.

**Verdict:** Light, as expected. The two docs are well aligned — dark-default + Paper White, WCAG AA floor, Dynamic Type, Reduce Motion, TMDB posters/gradient placeholder, notify bell, half-star + mood rating, and the (+) fast-add loop are all consistently represented. One real contradiction and a few low-severity notes below.

---

## Findings

### 1. Mood-chip vocabulary contradiction — importance: MEDIUM
- **DESIGN location:** frontmatter `components.mood-chip` and `## Components` → Mood chip. Curated set given as **5** chips: 😭 cried · 😱 shook · 🤣 laughed · 🥹 touched · 😌 satisfied.
- **PRD location:** FR18 (and Glossary "Mood chip", Open Question #5). Proposed v1 set is a **different, 8**-chip set: 😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling.
- **Conflict:** The two source docs specify *different* curated mood vocabularies (different count, different emojis, and even overlapping emojis carry different labels — 😭 "cried" vs "moved"; 😱 "shook" vs "shocked"). FR18 explicitly declares itself the owner of this vocabulary ("a hard dependency for the rating UI, feed rendering, the mood enum in the data model, and the v2 sentiment feature"), so DESIGN showing a divergent set is a genuine contradiction, not a styling detail.
- **Implication for PRD/DESIGN:** Pick one canonical set. Recommend PRD FR18 remains the owner and DESIGN's mood-chip example is updated to match it (or explicitly labeled "illustrative, see FR18"). Open Question #5 should call out that DESIGN currently disagrees so the reconciliation isn't lost when the set is locked.

### 2. Bottom-nav Profile tab is labeled "You" in the UI — importance: LOW
- **DESIGN location:** frontmatter `components.bottom-nav` and `## Components` → Bottom nav: *"Profile (labeled 'You' in UI)"*.
- **PRD location:** FR22–FR23, UJ-4/UJ-5, Glossary all call it **"Profile"** with no mention of the "You" label.
- **Implication:** Mostly a UI-copy detail (fine to live in DESIGN/EXPERIENCE), but the user-facing tab name is a small product/copy decision worth a one-line note in the PRD (or EXPERIENCE.md) so "Profile" vs "You" stays consistent across spec and build. Not a capability gap.

### 3. "Continue pill" component implies a resume/continue affordance — importance: LOW
- **DESIGN location:** frontmatter `components.watched-badge` / `## Components` → "**Watched badge / Continue pill**".
- **PRD location:** No explicit mention of a "Continue" pill; the resume behavior is implied by the next-episode pointer (FR11) and Home/Up Next (FR10, UJ-1).
- **Implication:** Likely already covered by the Up Next + next-episode-pointer capability — the "Continue pill" is the visual affordance for it. No new requirement needed; confirm the Up Next card's one-tap continue is understood to be this pill so nothing is dropped. Flagging only so the term is traced.

### 4. User-selectable theme has no dedicated FR — importance: LOW
- **DESIGN location:** `## Brand & Style` / `## Colors` / Do's & Don'ts — dark default + user-switchable Paper White day mode.
- **PRD location:** Theme switching appears in Overview, Scope ("dark + Paper White themes"), and UJ-5 (Settings → switches to Paper White), but there is **no functional requirement** for a theme-selection setting.
- **Implication:** The capability is committed via Scope + journey, so this is not a true gap; noting only that theme selection lives in Settings implicitly (alongside FR36's global notifications toggle) and could be made explicit if the PM wants every user-facing setting enumerated. Optional.

---

## Explicitly NOT flagged (correctly DESIGN-only or already in PRD)

- Palette hex values, VHS Dusk / Paper White naming, elevation-by-tone vs shadow, corner radii, spacing scale, Fraunces/DM Sans type scale — pure visual identity; correctly DESIGN-only. PRD already points to DESIGN.md for visual identity.
- "Honor OS dynamic-type scaling; controls legible/untruncated at largest setting" (DESIGN Typography) — already carried by **NFR7** (Dynamic Type honored).
- Reward-animation "moments of delight" — Reduce-Motion handling already in **NFR7**.
- Poster from TMDB + gradient placeholder, never broken-image (DESIGN Poster) — already **FR6/FR9** (and TMDB assumption consistent).
- Notify bell outline→gold, caught-up dialog affordance — already **FR33/FR34**.
- Star rating ½-step, gold — already **FR17** / Glossary.
- Fast-add (+) one-tap log/search entry — already **FR12** + UJ-3 + NFR1 loop.
- Error/success functional red/green (DESIGN Colors) — generic state styling; no missing capability.
