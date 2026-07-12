# PRD Quality Review — Popcorn Time (working name)

## Overall verdict
This is a genuinely good PRD: it has a real thesis ("logging is faster than forgetting," watch-memory first / social second), decisions are made rather than deferred, and the substance bar is met throughout — thresholds instead of adjectives, counter-metrics that name what it refuses to optimize, and rejected alternatives documented in the addendum. What's at risk is downstream mechanical hygiene: cross-references use descriptive names ("NFR-FDroid", "FR-Import", "FR-Diary/Profile") that don't resolve to the actual numeric IDs, there's no Glossary or Assumptions Index for a PRD explicitly built to feed UX/architecture/stories, and a handful of FRs still lean on soft adjectives. None of these threaten the PRD's core usefulness; they're friction for the workflows it feeds.

## Decision-readiness — strong
A decision-maker can act on this. The hard constraints are stated as constraints, not considerations: F-Droid eligibility is "non-negotiable" (NFR3), monetization is "permanently out" (Scope/Out), self-hosting is "deliberately out." The rating model is a made decision with the alternatives it beat documented in `addendum.md` (rejected emoji-only and stars-only, each with the reason it lost). Trade-offs are named with what was given up — emoji-only was "simpler and more distinctive but drops the familiar quality scale."

Open Questions are actually open, and the PRD grades them: the three starred items (privacy model, TV Time export format, auth+push mechanism) are flagged as needing a decision early, and each carries a current working assumption rather than a rhetorical dodge (e.g. Q1: "friends-visible with a global toggle — confirm"). Counter-metrics are present and pointed — refusing DAU-at-any-cost and feed dwell-time. This is the opposite of a smoothed-to-neutral PRD.

## Substance over theater — strong
The content is earned. No persona theater: there is no standalone persona gallery, protagonists (Léa, Théo) are carried inline in the User Journeys where they drive concrete flows, and the user tiers are three with the tertiary honestly tagged `[ASSUMPTION]`. NFRs carry product-specific thresholds rather than boilerplate — NFR1 "< 15 seconds," NFR7 "tap targets ≥ 44pt iOS / 48dp Android including stars and chips," "color never the sole signal," "Reduce Motion skips reward animations." NFR10 (Voice & Tone) explicitly defends itself against being decoration: "This is a product requirement, not decoration — it's the differentiator against cold trackers."

The Vision is category-specific, not swappable: v2 LLM recommendations "that read your own history and emoji/mood sentiment to suggest what to watch next, mood-aware" is a concrete bet flowing from this product's own data model (FR20's per-watch timestamped reactions), not generic aspiration.

## Strategic coherence — strong
The PRD has a clear thesis and bets on it: a "personal watch-memory first, and a light social network second," anchored to the concrete precipitating event (TV Time deleting all history July 15, 2026). Feature prioritization follows the thesis — the log→rate→react loop, timestamped watch-memory, and TV Time import are the load-bearing capabilities; social is deliberately "light" and recommendations are explicitly a v1 placeholder (FR42) with the real feature pushed to v2.

Success criteria validate the thesis rather than measure raw activity: "The creator uses it daily and never defects to Letterboxd or a spreadsheet," "No history is lost," "full loop < 15s." The counter-metrics reinforce coherence by naming what would count as failure (engagement that isn't a genuine new episode). Scope kind reads as an experience/problem-solving MVP and the scope logic matches. This is not a backlog with headings.

## Done-ness clarity — adequate
Most FRs carry a testable consequence. FR11's "single ✓ Watched commits the current episode and advances the pointer," FR13's "all episodes pre-checked; the user deselects any and confirms once," FR20's "prior reactions on earlier watches are preserved, not overwritten," and NFR1's "< 15 seconds" are all verifiable. The qualitative UX behaviors mostly defer to `EXPERIENCE.md` state patterns, which is a legitimate move for a chain-top PRD.

The soft spots are real but contained. A few requirements still lean on adjectives that a story author can't test as written, and a few `[ASSUMPTION]` FRs remain underspecified in ways that will need resolution before their stories can close.

### Findings
- **medium** Soft performance adjectives without bounds (§ Catalog & Search FR6; Tracking FR14) — FR6 says search returns results "effectively instantly" and FR14 says committing is "instant"; neither names a bound. NFR1's "< 15s" covers the whole loop but not these sub-steps. *Fix:* give search and commit their own latency targets (e.g. results < 300ms on cache, commit optimistic/synchronous < 100ms) or explicitly fold them under a stated NFR1 sub-budget.
- **low** "Idempotent where feasible" is unbounded (§ TV Time Import FR40) — "does not duplicate or clobber prior entries" is testable, but "where feasible" gives an implementer an escape hatch with no criterion. *Fix:* state the dedup key (e.g. title+episode+date) that defines a duplicate; note this depends on Q2 (export inspection).
- **low** Underspecified assumption-FRs (§ FR16 edit/remove, FR21 note length cap) — these are correctly tagged `[ASSUMPTION]` but their "done" is genuinely unknown (length cap "TBD (e.g. ~500 chars)"). *Fix:* fine to defer, but route to Open Questions (Q9 already covers the note cap) so story creation doesn't treat them as settled.

## Scope honesty — strong
Omissions are explicit and load-bearing. The Scope/Out section separates deferred-to-v2 (LLM recommendations), post-v1 (comments/likes/algorithmic feed), permanently-out (monetization, self-hosting), and out-by-constraint (Google-only deps). Per-FR non-goals appear where they'd otherwise be silently assumed — FR-set "Out of v1 scope: comments/replies on others' entries; likes; algorithmic ranking; public global discovery." Inferences are tagged `[ASSUMPTION]` inline throughout, and the deferred decisions land in Open Questions with the starred ones prioritized.

The honesty extends to the deadline handling: the PRD distinguishes the urgent operational prerequisite (save the TV Time export before July 15) from the relaxed build timeline, and flags it with a ⚠️ in both Scope and the addendum. Open-items density (9 Open Questions, ~15 inline assumptions) is appropriate — this is a pre-architecture chain-top PRD, not a green-light-to-build, and it says so.

### Findings
- **low** No collected Assumptions Index (§ document tail) — the PRD uses `[ASSUMPTION]` tags well inline but never rolls them up, so a reader can't audit the full inference surface in one place. *Fix:* add a short Assumptions Index section listing each inline assumption; this also closes the rubric's roundtrip check.

## Downstream usability — adequate
This PRD is explicitly chain-top (it names EXPERIENCE.md, DESIGN.md, brief.md, addendum.md as companions and is meant to feed UX/architecture/stories), so this dimension matters. IDs are contiguous and unique (FR1–FR42, NFR1–NFR10, UJ-1–UJ-5); each UJ has a named protagonist carrying context inline; sections largely stand alone. The addendum cleanly separates how-candidates from the what.

The weakness is cross-reference resolvability. Several references are descriptive rather than ID-based and won't resolve for a downstream extractor keying on IDs, and there's no Glossary despite the PRD relying on precise domain nouns (Watch, watch-memory, Up Next, mood chips, next-episode pointer).

### Findings
- **medium** Cross-references use non-resolving descriptive names (§ throughout — FR2/FR23 "see FR-Diary/Profile"; FR3/FR37/NFR3 "NFR-FDroid"; SC/FR39 "FR-Import") — the actual IDs are FR22–23, NFR3, and FR38–41 respectively, so "NFR-FDroid" / "FR-Import" don't resolve mechanically. *Fix:* replace descriptive refs with the numeric IDs (or add ID aliases), so UX/architecture extraction can follow references without inference.
- **medium** No Glossary for a chain-top PRD (§ absent) — "Watch" is defined inline in the FR preamble, but watch-memory, Up Next, next-episode pointer, mood chips, Diary, Watchlist, and "caught up" are used as load-bearing terms with no single definition source. *Fix:* add a short Glossary; downstream UX and story creation should source these terms identically from one place.

## Shape fit — strong
The PRD is shaped correctly for what it is. As a consumer product with meaningful UX, its User Journeys with named protagonists (Léa, Théo) are load-bearing and concrete rather than ceremonial — each UJ walks an actual flow with failure paths (UJ-1: "slow catalog fetch still logs from cached episode data"). As a hobby/solo project it keeps rigor appropriately light — the timeline is "relaxed (passion project)," there's no elaborate stakeholder analysis or metrics apparatus — while still holding the substance bar (real thresholds, real counter-metrics). It is neither over-formalized (no UJ bloat) nor under-formalized (a consumer product that skipped UJs). Chain-top responsibilities are acknowledged via the companion-doc structure. Good fit.

## Mechanical notes
- **Cross-ref drift (downstream):** descriptive references ("NFR-FDroid", "FR-Import", "FR-Diary/Profile", "FR-Diary") do not map to the numeric ID scheme; see Downstream usability finding. Also "EXPERIENCE State Patterns" / "EXPERIENCE Voice & Tone" point to an external file's sections not indexed here.
- **Assumptions Index roundtrip:** ~15 inline `[ASSUMPTION]` tags (FR2, FR4, FR5, FR6, FR16, FR21, FR29, FR32, FR39, FR40; NFR6; Users tertiary; SC "accurately" and "handful of friends"; Q1) with no collected index — cannot verify roundtrip. Recommend adding the index.
- **ID continuity:** FR1–FR42 contiguous and unique; NFR1–NFR10 clean; UJ-1–UJ-5 clean. No gaps or duplicates found.
- **UJ protagonist naming:** all five UJs carry a named protagonist (Léa / Théo) with context inline. Good.
- **Glossary:** absent; "Watch" defined inline only. See Downstream usability.
- **Required sections:** Overview, Goals/Success Criteria (with counter-metrics), Users, User Journeys, FRs, NFRs, Scope, Dependencies, Open Questions, Vision all present — appropriate for the agreed stakes and product type.
