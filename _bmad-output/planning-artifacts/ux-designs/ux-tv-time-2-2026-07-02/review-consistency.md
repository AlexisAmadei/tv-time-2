# Consistency / Cross-Reference Review — popcorn-time UX spec

Lens: cross-referencing `EXPERIENCE.md` (behavior spine) against `DESIGN.md` (visual spine) and the `mockups/key-screens.html` render. Spine wins on any spine-vs-mock conflict; mock issues are flagged as fix-notes. Scope: token resolution, doc-vs-doc contradictions, mock-vs-spine contradictions, and light/dark role-mapping consistency.

**Token resolution: all `{token.path}` references in EXPERIENCE.md resolve cleanly.** The referenced tokens are `{components.star-rating}`, `{components.mood-chip}`, `{components.fast-add-fab}`, `{components.poster}` (×3), and `{colors.primary}` — every one is defined in DESIGN.md frontmatter. `{DESIGN.md}` is a doc reference (not a token), and `{show}` is a runtime content placeholder — both correctly not tokens. No dangling references. (One semantic caveat under SHOULD-FIX re: the notify bell.)

---

## CRITICAL

- **Mood set contradiction — `🤯` is not in the curated set.** `EXPERIENCE.md` Flow 2, step 4 (line 120) has Théo "drops a 🤯", but the curated mood set defined in `DESIGN.md` Components (line 124) and echoed by the mockup log sheet (lines 221–225) is exactly **😭 😱 🤣 🥹 😌**. `EXPERIENCE.md` line 51 itself states "Curated set only." Fix: change the Flow 2 emoji to one of the five curated moods (e.g. 😌 satisfied), or explicitly add 🤯 to the curated set in DESIGN.md line 124 + the mockup — but the mock and DESIGN must then agree.

- **"Gold for stars only" rule is violated by DESIGN's own notify-bell spec and by the mock.** `DESIGN.md` states gold is "rating stars only… The one place gold appears" (lines 59, 84, 93, 123, Do/Don't line 136), yet the same doc gives the **notify bell a `gold` fill when on** (line 128). The mockup then spends gold in several more places: the caught-up kicker text (line 161, `color:var(--gold)`), the "47 episodes" reward number (line 93/227), the bell border (line 63/159), and a gold poster-placeholder gradient (`.poster.p3`, lines 38/126/133). This breaks the cross-mode "gold = identity constant for stars" claim that anchors the light/dark role mapping. Fix: reconcile the rule — either soften DESIGN's "stars only" wording to "stars + the notify-bell on-state" and forbid the rest, or re-color the kicker/reward/poster-placeholder off gold. State the one authoritative rule and make DESIGN, EXPERIENCE, and the mock obey it.

## SHOULD-FIX

- **Mock nav label "You" vs spine "Profile".** Spine is fixed: Home · Diary · (+) · Feed · Profile (`EXPERIENCE.md` line 27, `DESIGN.md` line 63/127). The mockup nav renders the 5th slot as **"You"** (lines 147 & 195). Order is correct; only the label differs. Spine wins — mock fix-note: relabel "You" → "Profile" (or ratify "You" in both spines if intended).

- **Mock logo reads "tv-time", app name is "popcorn-time".** Mockup `.logo` shows "tv-time" (lines 109 & 205). Low-stakes but it's the wordmark. Mock fix-note: set to "popcorn-time" (or document the shortened wordmark in DESIGN Typography as intentional).

- **Notify bell has no frontmatter component token; EXPERIENCE points at `{components.poster}` as a proxy.** `EXPERIENCE.md` lines 55 & 96 tag the notify bell with `{components.poster}` "context," but the bell is a distinct component described only in DESIGN prose (line 128) with no frontmatter entry. The reference technically resolves (poster exists) but is semantically wrong. Fix: add a `notify-bell` (or `bell`) entry to `DESIGN.md` frontmatter `components:` and point EXPERIENCE at `{components.notify-bell}`.

- **Mock (+) FAB geometry drifts from spec.** DESIGN fast-add-fab = `rounded/md` (13px) fill, lifted **−16px** (line 61/125). Mockup `.fab` uses `border-radius:14px` and `margin-top:-18px` (line 59). Mock fix-note: 13px radius, −16px lift.

## NICE-TO-HAVE

- **Empty-star opacity inconsistent inside the mock.** Spec is 28% (`DESIGN.md` line 59/123). Mock honors it in card stars (`.stars .e{opacity:.28}`, line 43) but the log-sheet big stars use `opacity:.35` (line 218). Mock fix-note: 28% both places.

- **Type/shape values in mock slightly off the frontmatter scale.** Hero title renders 26px (lines 20/64) vs `hero: 27px` (DESIGN line 37); action buttons use 11px radius (line 67) and the mini-poster/`.mp` uses 11px (line 51), neither of which is on the `rounded` scale (sm 8 / md 13 / lg 18). Cosmetic; align to scale when the mock is refreshed.

- **Inactive nav opacity 50% vs spec ~55%.** DESIGN line 127 says inactive nav icons sit at "~55% opacity"; mock `.ni{opacity:.5}` (line 56). Trivial; note for pixel parity.

---

### Confirmed consistent (no action)
- Nav slot **order** matches across both spines and the mock: Home · Diary · (+) · Feed · Profile.
- Dark-by-default / VHS Dusk hero palette agrees across all three (DESIGN frontmatter, EXPERIENCE Foundation, mock `:root`).
- Rating mechanism (½-step 5-star + mood chips, rating optional/never-blocking) agrees across DESIGN, EXPERIENCE, and mock.
- Notification model (caught-up contextual nudge + per-title bell, new-episode-only) agrees between EXPERIENCE Notifications and the mock's "You're all caught up" + bell.
- Light/dark **primary** (coral→magenta) and **secondary/avatar** (teal→cyan) role mapping is consistent across modes; the only role-mapping wrinkle is the gold-usage contradiction under CRITICAL.
