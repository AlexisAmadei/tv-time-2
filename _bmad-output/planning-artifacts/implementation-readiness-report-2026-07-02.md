---
stepsCompleted: [step-01-document-discovery, step-02-prd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
documentsIncluded:
  - prds/prd-tv-time-2-2026-07-02/prd.md
  - prds/prd-tv-time-2-2026-07-02/addendum.md
  - architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md
  - epics.md
  - ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md
  - ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-02
**Project:** tv-time-2

## Document Inventory

| Type | File(s) | Status |
|------|---------|--------|
| PRD | `prd.md` (227 lines) + `addendum.md` (67 lines) | ✅ Found |
| Architecture | `ARCHITECTURE-SPINE.md` (253 lines) | ✅ Found |
| Epics & Stories | `epics.md` (1141 lines) | ✅ Found |
| UX Design | `DESIGN.md` (142 lines) + `EXPERIENCE.md` (157 lines) | ✅ Found |
| Product Brief (context) | `brief.md` (90 lines) | ℹ️ Reference |

**Duplicates:** None. **Missing required docs:** None.

## PRD Analysis

Source: `prd.md` (FR/NFR canonical) + `addendum.md` (architecture-facing rationale). Requirements are explicitly numbered in the PRD, which is a strong traceability foundation.

### Functional Requirements (46 total: FR1–FR45 + FR29a)

**Accounts & Identity**
- FR1 — Create account / sign in; multi-user, centrally hosted single instance.
- FR2 — User profile: display name, optional avatar, public stats/favorites (subject to FR29a visibility).
- FR3 — Account creation & sign-in work with **no Google/Firebase dependency** in F-Droid build.
- FR4 — Export own data (watches, ratings, moods, notes, lists) in a portable format anytime.
- FR5 — Delete account and all associated personal data.

**Catalog & Search**
- FR6 — Search public film/TV catalog by title; results-as-you-type (backend-proxied, must stay fast under load).
- FR7 — Title detail: metadata + seasons/episodes for shows.
- FR8 — Catalog unreachable → clear retry state, preserves typed query, cached fallback (no blank screen).
- FR9 — Missing/loading posters render gradient placeholder, never broken image.

**Tracking & Logging**
- FR10 — Start tracking a show/film; tracked shows appear in Home / Up Next.
- FR11 — Next-episode pointer per tracked show; single ✓ Watched commits + advances pointer.
- FR12 — Log a film as watched in one action.
- FR13 — Bulk season log: sheet pre-checks all episodes, deselect + confirm once, optional season rating.
- FR14 — Committing a watch is instant, soft confirm; **never blocked by rating or catalog latency** (logs from cache; testable with network disabled).
- FR15 — Each watch is timestamped at log time.
- FR16 — Edit or remove a logged watch (incl. imported ones).

**Rating & Reaction**
- FR17 — Post-watch rating prompt: ½-step 5-star + mood chips; one-tap Skip always present; never blocks watch.
- FR18 — Mood chips are a **curated fixed v1 set** (😭😂😱🥰🤯😴😬🔥), multi-select 0–2, on episode/title. Hard dependency for rating UI, feed, mood enum, v2 sentiment.
- FR19 — Ratings/moods are re-tappable (changeable later).
- FR20 — Rating/mood bound to the watch's timestamp; prior reactions preserved, not overwritten (multi-watch model).
- FR21 — Optional short note/mini-review (~500-char, plain text).

**Watch-Memory (Diary) & Profile**
- FR22 — Diary: personal history of watched titles/episodes with ratings, moods, notes, dates over time.
- FR23 — Profile ("You"): aggregate stats (year counts), favorites, watchlist, friends.
- FR24 — Empty states are warm and route to a first action.

**Watchlist**
- FR25 — Add any title to Watchlist (❤️) from search, detail, Home shelves, or feed.
- FR26 — Watchlist surfaced as Home shelf and on Profile.

**Community / Social (light)**
- FR27 — Follow / unfollow other users; friends/following list.
- FR28 — Chronological (non-algorithmic, reverse-chron) activity feed of followed users' visible activity.
- FR29 — Private-by-default: nothing visible until explicit opt-in.
- FR29a — Visibility is a first-class, per-entry-capable schema property; v1 exposes ≥ global "share with friends" toggle (default off); schema must not preclude per-entry.
- FR30 — From a feed entry, ❤️ the title to own watchlist.
- FR31 — Create shared lists (named curated collections) and share with friends.
- FR32 — Find/add friends by username or share link (mechanism TBD, OQ#6).

**Notifications**
- FR33 — Per-title notify bell, independent of tracking.
- FR34 — On "caught up," contextual dialog offers alerts for that title.
- FR35 — Push fires only on genuine new-episode availability, warm voice; no digests/re-engagement/streak nags.
- FR36 — Global notifications toggle in Profile → Settings; per-title bells govern their own title.
- FR37 — Platform-appropriate push (APNs / FCM / UnifiedPush on F-Droid); graceful degradation when no channel (in-app "what's new," never fake a push).

**TV Time Import**
- FR38 — Import TV Time data export.
- FR39 — Map watched titles/episodes + dates; ratings/moods where present; **never fabricate** (undated → flagged, missing rating → empty).
- FR40 — Import idempotent & non-destructive (hard req); identity keyed on (title, episode, source-id/timestamp).
- FR41 — Import surfaces clear summary of what was/wasn't imported (fidelity report).

**Recommendations**
- FR42 — Optional Home Recommendations shelf; v1 = simple non-LLM heuristic or curated, may ship empty/absent, never blocks log loop. LLM recs = v2.

**Navigation & Interaction**
- FR43 — Persistent bottom tab bar: Home · Diary · (+) · Feed · Profile; center (+) always one tap away; sheets stack ≤ 1 level.
- FR44 — Core actions tap-to-act, no long-press required (long-press only as optional accelerator).
- FR45 — Theme switch: dark (default) / Paper White (light), persisted.

### Non-Functional Requirements (11 total: NFR1–NFR11)

- NFR1 — **Speed/core loop (measurable):** cold open shows cached Up Next instantly; log→rate loop p95 ≤ 15s on mid-tier device warm start; commit never blocked by network.
- NFR2 — Cross-platform parity, native iOS + Android from one Expo/RN codebase (F-Droid = build variant). Web post-v1.
- NFR3 — **F-Droid eligibility (hard constraint):** F-Droid Android build has no proprietary Google/Firebase/Play Services deps (shapes auth, push, analytics).
- NFR4 — Open source; distribution via App Store, Google Play, and F-Droid.
- NFR5 — Data portability & durability; no design may vendor-lock a user's own copy.
- NFR6 — Privacy & data governance; private-by-default; account/data deletion; **GDPR applies**.
- NFR7 — Accessibility floor (WCAG AA basics): VoiceOver/TalkBack labels w/ role+state, Dynamic Type no clipping, tap targets ≥ 44pt/48dp, color never sole signal, Reduce Motion.
- NFR8 — Offline (basic): show last cached; queued watch syncs on reconnect; no blocking banner.
- NFR9 — Catalog dependency resilience; outages never block logging; proxy latency budgeted.
- NFR10 — Voice & tone: warm, one emoji max in system copy, never pushy/guilt-driven.
- NFR11 — Survivability / wind-down pledge: on shutdown, advance notice + final full export before deletion.

### Additional Requirements & Constraints

- **Banned interaction patterns (enforced as requirements):** no streak/guilt mechanics, no forced rating gates, no re-engagement nag pushes, no auto-playing hero video.
- **Counter-metrics (refused optimizations):** not DAU-at-any-cost, not feed dwell-time; feed stays chronological.
- **Hard external deadline / do-now:** TV Time deletes all data after **2026-07-15**; the creator must **inspect** a real export before then (OQ#2) — gates FR38–FR41. Build timeline relaxed; export inspection is not.
- **Dependencies:** external catalog (TMDB assumed, backend-proxied, licensing/F-Droid compat unverified); per-platform push transport; new-episode polling/fan-out is the heaviest v1 backend component.
- **11 Open Questions** carried to architecture; ⭐ = decide at/before architecture start. Notably **OQ#5 flags a live contradiction:** `DESIGN.md` lists a *different* 5-emoji mood set than FR18's 8-chip canonical set — DESIGN.md must be reconciled.
- **10+ `[ASSUMPTION]` tags** indexed for resolution during architecture (avatar, JSON export, TMDB, mood set, note cap, profile aggregation, friend discovery, GDPR details).

### PRD Completeness Assessment

**Strong.** Requirements are explicitly numbered, grouped by capability, and cross-referenced to NFRs, UX docs, and open questions. Testability is called out for the critical loop (FR14, NFR1). Scope in/out is unambiguous, and the honest durability framing is a maturity signal. Gaps are **acknowledged, not hidden** — open questions and assumptions are indexed rather than buried. Two items to watch downstream: (1) the FR18 ↔ DESIGN.md mood-set contradiction (OQ#5) must be resolved before the rating component is built; (2) several `[ASSUMPTION]` items (export format, TMDB licensing) gate real implementation decisions and are correctly deferred to architecture — epics must not assume them resolved.

## Epic Coverage Validation

The epics document (`epics.md`) carries an explicit **FR Coverage Map** mapping every active FR to a primary epic, plus a per-story acceptance-criteria trace. I verified each mapped FR resolves to at least one concrete story with acceptance criteria (not just a map claim).

### Coverage Matrix

| FR | Requirement (short) | Epic / Story | Status |
|----|---------------------|--------------|--------|
| FR1 | Account create / sign-in | E1 · S1.2 | ✅ Covered |
| FR2 | Profile record | E1 · S1.2; E4 · S4.2/4.4 | ✅ Covered |
| FR3 | Google-free auth | E1 · S1.2 | ✅ Covered |
| FR4 | Data export | E7 · S7.1 | ✅ Covered |
| FR5 | Account/data delete | E7 · S7.2 | ✅ Covered |
| FR6 | Catalog search-as-you-type | E2 · S2.1 (seed E1 · S1.4) | ✅ Covered |
| FR7 | Title detail (seasons/eps) | E2 · S2.2 | ✅ Covered |
| FR8 | Catalog-unreachable retry | E2 · S2.1/2.2 | ✅ Covered |
| FR9 | Poster gradient placeholder | E2 · S2.1 | ✅ Covered |
| FR10 | Start tracking | E3 · S3.1 | ✅ Covered |
| FR11 | Pointer + ✓ Watched | E3 · S3.2 | ✅ Covered |
| FR12 | One-action film log | E3 · S3.3 | ✅ Covered |
| FR13 | Bulk season log | E3 · S3.4 | ✅ Covered |
| FR14 | Instant network-independent commit | E3 · S3.2 (seed E1 · S1.5) | ✅ Covered |
| FR15 | Timestamped watch | E3 · S3.2 (seed E1 · S1.5) | ✅ Covered |
| FR16 | Edit/remove a watch | E3 · S3.7 | ✅ Covered |
| FR17 | Post-watch rating prompt | E3 · S3.5 | ✅ Covered |
| FR18 | Curated mood chips | E3 · S3.5 (set LOCKED in epic) | ✅ Covered |
| FR19 | Re-tappable rating/mood | E3 · S3.5 | ✅ Covered |
| FR20 | Rating bound to timestamp | E3 · S3.5 | ✅ Covered |
| FR21 | Optional note | E3 · S3.6 | ✅ Covered |
| FR22 | Diary history | E4 · S4.1 | ✅ Covered |
| FR23 | Profile stats/favorites | E4 · S4.2 | ✅ Covered |
| FR24 | Warm empty states | E1 · S1.3; E4 · S4.1/4.2 | ✅ Covered |
| FR25 | Add to Watchlist | E2 · S2.3 | ✅ Covered |
| FR26 | Watchlist on Home + Profile | E2 · S2.4; E4 · S4.2 | ✅ Covered |
| FR27 | Follow/unfollow | E5 · S5.1 | ✅ Covered |
| FR28 | Chronological feed | E5 · S5.3 | ✅ Covered |
| FR29 | Private-by-default | E1 · S1.6 | ✅ Covered |
| FR29a | Visibility first-class schema | E1 · S1.6 (UI E5 · S5.2) | ✅ Covered |
| FR30 | ❤️ from feed entry | E5 · S5.4 | ✅ Covered |
| FR31 | Shared lists | E5 · S5.5 | ✅ Covered |
| FR32 | Find/add friends | E5 · S5.1 | ✅ Covered |
| FR33 | Per-title notify bell | E6 · S6.1 | ✅ Covered |
| FR34 | Caught-up nudge | E6 · S6.2 | ✅ Covered |
| FR35 | Genuine-new-episode pushes | E6 · S6.4 | ✅ Covered |
| FR36 | Global notifications toggle | E6 · S6.1 | ✅ Covered |
| FR37 | Per-platform push + degrade | E6 · S6.3 | ✅ Covered |
| **FR38** | **TV Time import** | **CUT from v1** | ⚠️ **Descoped** |
| **FR39** | **Import mapping / no-fabricate** | **CUT from v1** | ⚠️ **Descoped** |
| **FR40** | **Import idempotency** | **CUT from v1** | ⚠️ **Descoped** |
| **FR41** | **Import fidelity report** | **CUT from v1** | ⚠️ **Descoped** |
| FR42 | Optional recommendations shelf | E3 · S3.8 | ✅ Covered |
| FR43 | Bottom tab bar + (+) | E1 · S1.3 | ✅ Covered |
| FR44 | Tap-to-act, no long-press | E1 · S1.3 (cross-cutting) | ✅ Covered |
| FR45 | Theme switch (Paper White) | E4 · S4.3 (seed E1 · S1.3) | ✅ Covered |

### Missing Requirements

**No unaccounted-for FRs.** Every FR is either covered by a concrete story or *deliberately descoped* with documented rationale. There are **zero silent gaps** — a strong result.

**One critical divergence requiring reconciliation (not a gap, a documented conflict):**

- ⚠️ **FR38–FR41 (TV Time Import) — CUT from v1 by the epics, but still IN-SCOPE in the PRD.** The epics record a product decision (2026-07-02): the creator never obtained a TV Time export, and after the 2026-07-15 shutdown none can be obtained, so there is nothing to import. Goal #3 ("rescue existing history via import") is dropped; accounts start fresh. The epics explicitly flag the divergence and recommend reconciling the PRD via correct-course.
  - **Impact:** `prd.md` still lists FR38–41, Goal #3, the import success criterion, and the "do-now export inspection" as in-scope — a live PRD↔epics inconsistency. Architecture ripples are already handled in the epics (import Edge Function, ARCH import-idempotency, and `source_watch_id` pointer clause all removed).
  - **Recommendation:** Run **correct-course** on `prd.md` to formally move FR38–41 + Goal #3 to post-v1 (community-supplied-export importer thread) **before** implementation, so the PRD and epics agree. This is the single most important pre-implementation reconciliation. It is a **deliberate, coherent decision**, not an oversight — but leaving the PRD unreconciled invites confusion later.

### Coverage Statistics

- **Total PRD FRs:** 46 (FR1–FR45 + FR29a)
- **Covered by a concrete story:** 42
- **Deliberately descoped (import, FR38–41):** 4
- **Genuinely missing / unaccounted:** **0**
- **Coverage of in-scope FRs:** 42 / 42 = **100%**
- **Coverage against PRD-as-written:** 42 / 46 = **91%** (the 9% is the known import descope pending PRD reconciliation)
- **Reverse check (FRs in epics but not PRD):** none — the epics introduce no invented requirements; ARCH-*/UX-DR-* items are correctly traced to architecture and UX sources, not smuggled in as FRs.

## UX Alignment Assessment

### UX Document Status

**Found** — two complementary artifacts forming one UX set:
- `DESIGN.md` — visual identity: two-mode color tokens (VHS Dusk / Paper White), Fraunces + DM Sans typography, spacing/radius/elevation, component visual specs.
- `EXPERIENCE.md` — behavior spine: IA (5-tab bottom nav), voice/tone table, component behavioral rules, 13 state patterns, interaction primitives, accessibility floor, notifications discipline, and 5 key flows.

Both are `status: final`. The epics already distilled them into 25 story-generating UX-DR items (UX-DR1–25), fully traced into stories — a strong sign UX made it into the build plan rather than sitting on a shelf.

### UX ↔ PRD Alignment

**Excellent — near 1:1.**
- The 5 UX key flows map exactly onto PRD user journeys UJ-1…UJ-5 (bedtime log, binge catch-up, adding new, friends' feed, making it yours), with matching protagonists (Léa, Théo) and the same emotional payoff beats ("47 episodes this year," "whole season… Respect").
- Every UX state pattern and component traces to an FR (empty states → FR24; rating prompt → FR17; notify bell → FR33/34; offline queue → NFR8; etc.).
- The banned-patterns list is consistent across PRD (counter-metrics), EXPERIENCE.md (Interaction Primitives → Banned), and DESIGN.md (Do/Don't) — no drift.

⚠️ **One known contradiction (documented, has an owner, not a blocker):**
- **Mood-chip set mismatch.** `DESIGN.md` (line 127) still lists a **5-chip** set (😭 cried · 😱 shook · 🤣 laughed · 🥹 touched · 😌 satisfied), while PRD **FR18** defines an **8-chip** set (😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling). This is PRD Open Question #5.
  - **Resolution already decided:** the epics **LOCK** the set to FR18's 8 chips (Epic 3 header note) and enforce it as a Postgres `CHECK` constraint; architecture keeps it as a migratable `text[]`+`CHECK` (not an ENUM) precisely so the contested set can move. **Action outstanding:** update `DESIGN.md`'s mood-chip line to the locked 8-chip set before the rating component (Story 3.5) is built. Low effort, clear owner.

### UX ↔ Architecture Alignment

**Strong — the architecture visibly anticipated the UX, not just the PRD.**
- **NFR1 sub-15s loop / instant commit (UX "Watched confirmed," Flow 1):** directly supported by **AD-4** (local-first `expo-sqlite` outbox — commit before any network call).
- **UJ-1 "log then rate in one beat" (UX rating prompt slides up after commit):** **AD-4 explicitly handles the exact fast-path hazard** — a rating tapped before the watch has synced arrives as a single `watches` row, never a lost `PATCH`. Story 3.5 even carries a named regression test for it. This is architecture engaging with a specific UX sequence, a maturity signal.
- **Poster gradient placeholder / never-broken-image (UX-DR5):** backed by **AD-6** catalog proxy + `catalog_cache`.
- **Offline queue, no blocking banner (UX Offline state, NFR8):** the same AD-4 outbox; architecture correctly caps v1 at "basic, not optimized."
- **Notify bell + caught-up (UX-DR12/18):** backed by **AD-5** daily poller + `known_episode_state`.
- **Theme switch, avatar upload, tap-to-act a11y:** all client-side concerns with no architectural conflict (avatar → `profiles.avatar` + Supabase Storage, Story 4.4).
- **No UX requirement is left unsupported by architecture.**

### Warnings / Cross-Document Consistency

- ⚠️ **The import descope diverges the Architecture Spine too, not only the PRD.** Refining the Step 3 finding: the epics cut FR38–41, but **both** `prd.md` **and** `ARCHITECTURE-SPINE.md` still treat import as in-scope — the spine retains **AD-7** (import idempotency), the `import-tvtime` Edge Function (Design Paradigm, Structural Seed, Capability Map FR38-41), the `IMPORTS` entity in the ER diagram, and the `source_watch_id` clause in AD-7/AD-10. So the **epics are the outlier**, having cut a feature both upstream docs retain.
  - **Consequence for the reconciliation recommendation:** a correct-course pass must update **both** `prd.md` (FR38–41, Goal #3, success criteria, do-now export inspection) **and** `ARCHITECTURE-SPINE.md` (retire AD-7, drop `import-tvtime`/`IMPORTS`/`source_watch_id`, simplify AD-10 to organic-logging single-caller). The epics' own ripple note already enumerates most of these edits.
- ✅ **No UX document missing** — UI is fully specified for the mobile surface. Web is correctly out of v1 (no design exists, PRD defers it), so its absence is intended scope, not a gap.

## Epic Quality Review

Rigorous validation of all 7 epics and 30 stories against create-epics-and-stories standards: user value, epic independence, forward dependencies, story sizing, AC quality, table-creation timing, and greenfield setup.

### Best-Practices Compliance Checklist

| Check | Result | Evidence |
|-------|--------|----------|
| Epics deliver user value (not technical milestones) | ✅ Pass | All 7 epics are user-centric outcomes (log a watch, discover, remember, share, get notified, own your data). No "Setup DB"/"API layer"/"Infrastructure" epics. |
| Epic independence (Epic N doesn't need N+1) | ✅ Pass | Dependency flow 1 → {2,3} → {4,5,6} → 7; every dependency points **backward**. Stated "each epic standalone, requires no later epic." |
| No forward dependencies in stories | ✅ Pass | Forward *references* exist ("Paper White is Epic 4," "toggle implemented in Epic 6") but are **scope-deferrals**, not dependencies — the owning story completes without the later work. |
| Stories appropriately sized | ✅ Pass | Each story is a coherent, independently completable slice; none is a disguised epic. |
| Database tables created when first needed | ✅ **Exemplary** | Story 1.1 creates **zero** tables; each table lands in the story that first needs it (`profiles`→1.2, `watches`→1.5, `watchlist_items`→2.3, `tracked_shows`→3.1, `follows`→5.1, `lists`→5.5, `notify_bells`→6.1, `push_devices`→6.3, `known_episode_state`→6.4). No upfront schema dump. |
| Clear, testable acceptance criteria | ✅ Pass | Every story uses Given/When/Then; ACs cover happy path **and** errors/edges (offline, empty, retry, idempotency, RLS-deny). |
| Traceability to FRs maintained | ✅ Pass | Every story AC carries FR/ARCH/UX-DR tags; the epic FR Coverage Map is complete. |
| Greenfield setup story present | ✅ Pass | Story 1.1 "Project foundation boots locally" is the required initial-setup story (pinned stack + Expo scaffold + connectivity). |

### 🔴 Critical Violations

**None.** No technical-milestone epics, no forward dependencies, no epic-sized unstoppable stories. This breakdown avoids the classic failure modes.

### 🟠 Major Issues

- **None structural.** The only major cross-artifact issue is the **import descope inconsistency** (FR38–41 cut in epics, retained in PRD *and* Architecture — see Epic Coverage & UX Alignment sections). It is a documented reconciliation task, not an epic-structure defect, but it must be resolved before build so implementers aren't handed three disagreeing sources.

### 🟡 Minor Concerns

1. **Three unresolved decisions gate specific stories (flagged inline, good).** Story 4.2 profile-aggregation rule (PRD OQ#10, "[decision needed before build]"), Story 5.1 friend-discovery mechanism (OQ#6), and the mood-set lock/`DESIGN.md` update (OQ#5). These stories are structurally ready but **not build-ready until the decision lands**. Correctly surfaced in-story rather than hidden — resolve before pulling them into a sprint.
2. **`DESIGN.md` mood-chip line still un-updated** to the FR18-locked 8-chip set (carried from UX Alignment). Blocks Story 3.5 cleanliness; low effort.
3. **No explicit early CI/CD story.** Greenfield best practice suggests CI/CD early; here it's folded into the launch checklist and the F-Droid CI variant is a deferred spike. **Deliberate and reasonable** for a solo, two-environment (no-staging) passion project — noted, not a defect.
4. **Epic 1 mixes a pure-developer story (1.1) into a user-value epic.** Acceptable and expected per the greenfield setup-story rule; the epic as a whole still delivers a genuine end-to-end user capability (log a private, offline-surviving watch).

### Notable Strengths (above baseline)

- **Walking-skeleton Epic 1** threads all four load-bearing invariants (auth, proxy boundary, local-first outbox, RLS wall) through one thin vertical slice instead of building substrate up front — and a prior party-mode structural review already moved **private-by-default RLS + visibility schema into Epic 1** (privacy as the default state of every row, not a social bolt-on) and **extracted go-live gates** into a cross-cutting launch checklist.
- **Executable exit criteria per epic:** Epic 1 (second user cannot `SELECT` the first's watch + offline-persist), Epic 3 (NFR1 p95 ≤ 15 s named test with network off).
- **A named regression test for the subtle rate-before-sync hazard** (Story 3.5) — evidence the plan engaged with real concurrency edges, not just the happy path.

## Summary and Recommendations

### Overall Readiness Status

## ✅ **READY — with one reconciliation to do first**

The planning set (PRD, UX ×2, Architecture Spine, Epics/Stories) is **coherent, complete, and traceable to an above-average degree**. Every in-scope FR has a concrete story; every story traces back to an FR/ARCH/UX source; the architecture engages with specific UX sequences and real edge cases. There are **no critical structural defects and no silent gaps**. The single thing standing between "ready" and "clean" is a **documented, deliberate scope decision (import descope) that has not yet been propagated back into the PRD and Architecture** — a reconciliation task, not a rethink.

### Critical Issues Requiring Immediate Action

1. **Reconcile the TV Time Import descope across all three upstream docs (the one blocking inconsistency).** The epics cut FR38–41 (import) by explicit product decision; but `prd.md` **and** `ARCHITECTURE-SPINE.md` both still treat import as in-scope. Implementers would otherwise be handed three disagreeing sources. This is the top pre-build action.

### Recommended Next Steps

1. **Run `correct-course` to propagate the import descope:**
   - **`prd.md`** — move FR38–41, Goal #3 ("rescue history via import"), the import success criterion, and the "do-now export inspection" note to post-v1 (community-supplied-export thread).
   - **`ARCHITECTURE-SPINE.md`** — retire **AD-7**, drop the `import-tvtime` function (Design Paradigm, Structural Seed, Capability Map), remove the `IMPORTS` entity from the ER diagram, and simplify **AD-10** to organic-logging as the single pointer caller. (The epics' ripple note already enumerates most edits.)
2. **Resolve the three build-gating open questions before the affected stories enter a sprint:**
   - **OQ#5 — mood-chip set:** confirm FR18's 8-chip set (epics already lock it) and **update `DESIGN.md`'s 5-chip line to match** → unblocks Story 3.5 / the rating component.
   - **OQ#10 — profile aggregation rule** (how stats/favorites derive against the multi-watch timestamped model) → unblocks Story 4.2.
   - **OQ#6 — friend-discovery mechanism** (username vs share-link vs both) → unblocks Story 5.1.
3. **Verify the architecture's deferred external dependencies before they become blockers:** TMDB licensing + F-Droid compatibility + named fallback (OQ#11), and the Expo/F-Droid Google-free audit. These are correctly deferred, but they gate real go-live.
4. **Optional / non-blocking:** the `[ASSUMPTION]` items (JSON export format, ~500-char note cap, avatar) are safe defaults; confirm opportunistically. No early-CI story exists — acceptable for the solo, no-staging scope, but revisit if community contributors arrive.

### Final Note

This assessment reviewed **6 planning documents** and found **1 critical cross-artifact inconsistency** (import descope, spanning PRD + Architecture), **0 major structural defects**, and **~4 minor concerns** (three build-gating open questions + one stale DESIGN.md line). Coverage of in-scope functional requirements is **100% (42/42)** with **zero silent gaps**; the epic/story structure passes every best-practice check, several **exemplarily** (tables-when-needed, executable exit criteria, walking-skeleton Epic 1).

**Verdict:** proceed to implementation **after** the import reconciliation (Step 1 above) — do not start building against three disagreeing docs. The three open questions can be resolved just-in-time, per epic, as long as they're closed before their stories are pulled. This is one of the more implementation-ready planning sets you could hand a developer.

---

*Assessed by: Implementation Readiness workflow (BMad) · Assessor role: PM / requirements-traceability · Date: 2026-07-02 · Project: tv-time-2*
