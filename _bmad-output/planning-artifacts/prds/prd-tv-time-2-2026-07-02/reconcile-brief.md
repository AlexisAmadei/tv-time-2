# Brief → PRD Reconciliation — TV Time 2

**Date:** 2026-07-02
**Source of truth:** `brief.md` (final)
**Reviewed against:** `prd.md` (draft) + `addendum.md`
**Lens:** what the brief carries — especially *qualitative* ideas (tone, voice, feel, intent, emotional framing) — that a structured FR list tends to silently lose.

## How to read this

The PRD is a strong, honest derivation. Most functional content survives and several things are *strengthened* (notes committed as FR21, import fidelity made testable, privacy resolved, durability made honest). The gaps below are mostly **qualitative/emotional erosion**, not missing features — exactly the kind of loss the FR-ization tends to hide.

### Deliberate, already-reconciled changes (NOT flagged)
Confirmed handled coherently in the PRD; excluded from findings:
- **Emoji-only → hybrid ½-star + mood chips.** PRD Overline 19 explicitly pre-empts the brief's "rather than a flattened star rating" framing ("Not 'no stars' — it keeps a familiar ½-star scale *and* adds the feeling layer"). Coherent. Addendum records the rejected alternatives.
- **Web cut from v1.** Consistently applied across Overview, NFR2, Scope, Vision. Coherent.
- **Durability promise → export + wind-down pledge.** Handled with unusual honesty (Goals durability note, NFR5, NFR11, addendum C1). Coherent.
- **Private-by-default.** Brief left this an open question; PRD resolves it (FR29/29a, OQ#1). A strengthening, not a loss.

---

## Findings

### 1. The "moat is intent and care, not technology" humility is gone — MEDIUM
- **Brief:** *"Honest caveat: the 'moat' here is intent and openness, not technology. Anyone could build this; the point is that someone who cares does, and keeps it alive."* (§What Makes This Different)
- **PRD:** Dropped. The Overview lists differentiators (timestamped mood layer, open-source, F-Droid) but never states the brief's central, disarming thesis: the durability guarantee is *human*, not technical — a maintainer who cares. This is the emotional spine of the whole project.
- **Why it matters:** It reframes every honest scope-limit (single instance, solo maintainer, no revenue) from "weakness we admit" into "the actual point." Without it, the PRD's frank durability note reads as apology rather than philosophy. It's also the honest answer to "why won't this just die like TV Time?"
- **Fix:** One line in Overview or the Goals durability note — e.g. "The moat is intent and openness, not technology: anyone *could* build this; the point is someone who cares does, and keeps it alive."

### 2. "Who they were when they watched it" is flattened to "how it felt then" — MEDIUM
- **Brief:** The differentiator is framed autobiographically — *"records what they watched but not **who they were** when they watched it"* and *"you loved a show while you were watching it **in that chapter of your life**."* (§Problem, §Who This Serves)
- **PRD:** Reduced to the mechanical *"timestamped mood layer"* / *"how it felt then"* (Overview, FR20). Accurate but colder. The identity/self dimension — a watch-history as autobiography, not just a dated sentiment — is the poetic heart the brief keeps returning to, and it's the sharpest articulation of *why* timestamping matters emotionally.
- **Why it matters:** "How it felt then" is a data property; "who you were then" is the reason a user cares. The FR list can't carry this, so it needs to live in the Overview/differentiator prose or it's lost to the build.
- **Fix:** Restore the "chapter of your life / who you were" framing in the Overview's differentiator bullet, so DESIGN/EXPERIENCE and copywriting inherit it.

### 3. "Enjoy using the tool daily" — the delight signal — weakened as a success measure — MEDIUM
- **Brief:** Executive Summary defines success as two things: never lose history *and* *"**enjoy** using the tool daily."* Joy is an explicit, first-class success signal.
- **PRD:** Success criteria keep "uses it daily / never defects" but drop *enjoyment*. What's left is defensive (never defect, zero guilt mechanics, counter-metrics). Delight survives only implicitly, inside UJ-1's "memory beat." The positive emotional payoff is demoted from *goal* to *nice journey moment*.
- **Why it matters:** A product measured only by "doesn't lose data + user doesn't leave" optimizes for retention-by-absence-of-pain, not for the warmth the brief wants. The "memory beat" (year-count line) is arguably the single most important feature and it exists only inside a journey, not as a goal or FR.
- **Fix:** Add "the tool is a daily pleasure, not a chore" to Product goals or Success criteria; consider elevating the "memory beat" payoff to an explicit requirement so it can't be value-engineered out.

### 4. "Expressive / fun" texture of the reaction and the social layer thinned — LOW
- **Brief:** Reaction is *"fast, visual, **expressive**"*; social layer *"makes tracking more **fun** than a spreadsheet."*
- **PRD:** "Expressive" is structurally narrowed by the (intentional) move to a fixed 8-chip curated set — not something to re-fight, but the *word/intent* "expressive" no longer appears anywhere to remind the build to keep the reaction feeling personal. "Fun" becomes the flatter "the reason this beats a spreadsheet" (FR list / Users). NFR10 (warm, lightly sentimental voice) partly compensates.
- **Why it matters:** Minor, but these are the adjectives that keep the UI from feeling clinical. Low cost to reinject.
- **Fix:** Keep "expressive" in the rating-UI intent (FR17/FR18 or EXPERIENCE cross-ref) and "fun" in the social framing.

### 5. Import "preserves everything accurately" → "nothing silently dropped" — OK (noted, not a defect)
- **Brief:** Success criterion *"No history is lost: TV Time data import works and **preserves everything accurately**."*
- **PRD:** Reframed to the honest, testable *"nothing is silently dropped … reports what it could and couldn't map"* (Success criteria, FR39–FR41). This is a *weakening of the promise* but a coherent, deliberate one, consistent with the durability-honesty posture and with the real risk that the export is lossy. **Handled well — flagged only so it's a conscious call, not an accident.** No change needed.

### 6. Vision's mood-aware LLM recommendation intent — OK (preserved)
- **Brief:** v2 = *"LLM-powered recommendations that read your own history and emoji sentiment … mood-aware."*
- **PRD:** Preserved and even sharpened (Vision: "read your own history and mood/rating sentiment," FR18 notes mood vocabulary is "a hard dependency for … the v2 sentiment feature"). Good — the mood taxonomy is correctly treated as forward-load-bearing. No change needed.

---

## Net assessment
No high-severity defects; nothing in the PRD *contradicts* the brief. The reconciled changes (rating model, web cut, durability, privacy) are all handled coherently. The real leakage is **emotional/qualitative**: the brief's *why-this-is-worth-caring-about* — the care-not-tech moat (Finding 1), the autobiographical "who you were" framing (Finding 2), and enjoyment as a success measure (Finding 3) — has thinned in the crossing to an FR list. All three are cheap to restore in Overview/Goals prose and worth doing before the PRD is finalized, because DESIGN, EXPERIENCE, and copy will inherit whatever the PRD chooses to remember.
