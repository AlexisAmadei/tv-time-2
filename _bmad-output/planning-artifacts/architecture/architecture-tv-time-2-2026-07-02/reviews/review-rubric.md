---
title: Good-Spine Checklist Review — ARCHITECTURE-SPINE.md
target: architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md
method: score against the 8-point good-spine checklist (divergence coverage, Rule enforceability, Deferred safety, tech currency, terseness, structural-dimension coverage, diagram validity, capability-map coverage)
created: 2026-07-02
sibling-reviews:
  - review-version-verification.md (tech-currency deep dive)
  - review-adversarial-divergence.md (Rule-enforceability deep dive via two-compliant-units construction)
---

# Good-Spine Checklist Review — tv-time-2 Architecture Spine

## Verdict

**Solid, well-verified spine with real but fixable gaps** — it earns its terseness, its diagrams are genuine and its tech claims mostly check out on live verification, but it silently drops one legally-material dimension (GDPR hosting jurisdiction), leaves the F-Droid auth constraint unenforced by any Rule, and — corroborating `review-adversarial-divergence.md` — has a handful of internal inconsistencies (AD-1's bind list, the mood-storage fork) that a rubric pass alone would otherwise have to rediscover from scratch.

This review focuses on the 8 checklist items as scoped; where a finding overlaps a sibling review, that's noted rather than re-derived, and I independently verified two live tech claims via web search (see Item 4).

---

## Checklist walk-through (quick map)

| # | Item | Status |
| - | --- | --- |
| 1 | Fixes real divergence points, misses none | Partial — see Critical #1, High #2, Medium #5 |
| 2 | Every AD's Rule is enforceable | Mostly — see sibling `review-adversarial-divergence.md` for the deep pass (9 findings); one addition here (AD-9, Low #7) |
| 3 | Deferred is divergence-safe | Mostly — one item (mood storage mechanism) already flagged Medium by the sibling review; the mood *set* deferral itself is well-mitigated via the shared-types package |
| 4 | Named tech verified-current | Mostly — spot-checked and confirmed for Expo SDK 56 / Postgres-in-Supabase; TypeScript row is stale (High #3, corroborating sibling review) |
| 5 | Appropriately terse | Clean pass — no material filler found |
| 6 | Every structural/operational dimension owned | Partial — GDPR jurisdiction dropped (Critical #1), version pinning gap (Medium #5) |
| 7 | Diagrams valid + substantive | Mostly — all three are valid Mermaid and convey real structure; one omission (Medium #4) |
| 8 | Capability map covers PRD FR groups | Clean pass on coverage; one row's "Governed by" is thin (see High #2) |

---

## Critical

### C1 — GDPR hosting jurisdiction / data residency is silently dropped, not decided or deferred

The PRD is explicit that this is an architecture-level obligation, not something to hand-wave: NFR6 says *"the creator and users are EU-based, so GDPR obligations apply... to be met, not hand-waved"* and its own `[ASSUMPTION]` tag reads *"the precise DPA/hosting-jurisdiction details are an architecture/ops concern."* PRD Open Question #4 (starred, "should be decided at or before start of architecture") also asks *"where the single instance runs."*

The spine's Deployment & Environments section picks **"Custom Linux VPS (Docker host)"** — a real, useful decision (it resolves *that* infra is self-managed rather than a cloud PaaS) — but never states a hosting jurisdiction or data-residency commitment (e.g., "VPS provider located in the EU/EEA"). It's not in the Deferred list, not in an Open Questions carry-forward, not anywhere. Per checklist item 6, this is exactly the dangerous failure mode: a dimension the PRD explicitly assigned to this altitude is neither decided nor flagged as open — it's just absent.

**Fix:** Either state the jurisdiction commitment now (e.g., "VPS hosted in an EU/EEA jurisdiction to keep GDPR data-residency simple") as part of the Deployment section, or explicitly carry it into Deferred/Open Questions with a named owner and a "must resolve before go-live" gate, the same way AD-9 treats backups as a release gate.

---

## High

### H2 — F-Droid auth constraint (NFR3) has no explicit Rule

NFR3 is called a **hard, non-negotiable constraint**: the F-Droid build must ship with no proprietary Google/Firebase/Play-Services dependency, and this "shapes its auth, push, and analytics paths." PRD Open Question #3 (starred) bundles this with push: *"pick the F-Droid-compatible approach (UnifiedPush distributor strategy, self-hosted auth) since it shapes the backend and build variants from day one."*

The spine resolves the **push** half explicitly (AD-5's channel-per-`push_devices`-row design, plus the Deferred "F-Droid UnifiedPush wiring" spike) and resolves the **catalog-key** half explicitly (AD-6: the TMDB key never ships in the client binary). But the **auth** half gets no equivalent treatment. "GoTrue owns identity" (Design Paradigm) implicitly satisfies NFR3 — self-hosted GoTrue's core flows (email/password, magic link) carry no Google dependency — but nothing in the spine says so, and nothing rules out a future engineer wiring a native "Sign in with Google" button for the Play Store/iOS builds that then has to be awkwardly excluded from the F-Droid variant after the fact, or worse, shipped everywhere and breaking F-Droid eligibility. This is the one F-Droid-shaped NFR3 sub-question that doesn't get an AD, a Rule, or even a Deferred entry — unlike its two siblings.

This also makes the Capability → Architecture Map's "Accounts & Identity (FR1-5) → Governed by AD-8" entry thin: AD-8 only actually governs FR4/FR5 (export/delete); FR1 (create account/sign in) and FR3 (F-Droid auth constraint) have no governing AD at all.

**Fix:** Add a one-line Rule (either as part of AD-2's client/server-logic split or a new short AD) stating that GoTrue's configured auth methods are limited to flows with no Google/Firebase dependency (email/password + magic link), and that any OAuth provider addition must be audited against NFR3 before being enabled. Or, if this is considered sufficiently covered by "just don't add Google OAuth," say that explicitly rather than leaving it implicit.

### H3 — Stack table's TypeScript row is stale and self-contradicts its own table

Corroborating `review-version-verification.md` Finding #1: the Stack table pins `TypeScript | latest 5.x, shared across client + Edge Functions`, but two rows above it pins `Expo SDK 56`, and Expo SDK 56 itself bumps its TypeScript baseline to 6.0.3 (TS 6.0 shipped March 2026, with real breaking changes — `target` defaults to ES2023, `module` to ESNext, and `types` defaults to an empty array instead of auto-pulling `@types` packages, which can silently break Edge Function type resolution). This is precisely the checklist-item-4 failure mode: a claim that reads as "verified" (the table carries a `<!-- verified 2026-07-02 -->` comment) but is internally inconsistent with a sibling row in the same table, meaning it wasn't actually cross-checked against the other pinned versions.

I independently spot-checked two other rows via live web search and both hold up: Expo SDK 56 released May 21, 2026, with RN 0.85/React 19.2 (matches exactly), and self-hosted Supabase's default Postgres image moved 15→17 the week of June 15, 2026 (so "17" is current, not stale — good catch by whoever verified it, since it changed only ~2 weeks before this doc's date).

**Fix:** Update the TypeScript row to `latest 6.x (matches Expo SDK 56's TS 6.0.3 baseline)` and note the `types`-default-empty-array change if Edge Function `tsconfig` relies on ambient `@types`.

---

## Medium

### M4 — Deployment diagram omits the pg_net → Edge-Functions edge that realizes AD-5

The Deployment & Environments Mermaid diagram draws exactly two flows that don't originate from the client: `PG -->|nightly| Backup` (the AD-9 backup path) and the standard `Kong2 --> ... --> PG` request path. It does **not** draw the AD-5 mechanism — `pg_cron` invoking `poll-new-episodes` via `pg_net` over Docker-internal networking — even though AD-5's Rule spells this out in unusual detail (including the "never localhost" gotcha) precisely because it's an easy-to-get-wrong, non-obvious flow. Since the backup path *did* get drawn, the omission of the cron→function path reads as an accidental gap rather than a deliberate simplification, and it means the diagram doesn't fully convey one of only two automated (non-client-triggered) code paths in the system — a partial miss on checklist item 7's "diagrams actually convey structure."

**Fix:** Add a `PG -->|pg_net, daily| Functions2` edge (or an annotated dashed edge distinguishing it from the request-response HTTP flows) to the deployment diagram.

### M5 — Self-hosted Supabase pinned to "latest monthly release channel," not a specific tag

The Stack table pins `Self-hosted Supabase (docker-compose) | latest monthly release channel` and several dependent rows to "bundled version from the Supabase docker-compose release in use." Unlike every other row (which names a specific version or SDK), this is a moving target. Given the spine's own Deployment section establishes exactly two environments — local dev and the single production VPS — and given self-hosted Supabase's `docker-compose.yml` has changed meaningfully within the last month of this document's own writing (Postgres 15→17 default switch, Analytics/Logflare removed from the default compose file, both June 2026), "latest" pulled at different times for dev vs. prod is a real, if low-stakes, divergence risk — exactly what checklist item 1 asks the spine to close off, and checklist item 6's operational envelope should own (reproducible environments).

**Fix:** Pin to a specific dated release tag (e.g., a specific `supabase/postgres` image tag as recorded in `docker-compose.yml`) and document the upgrade cadence/process, rather than tracking "latest" implicitly.

### M6 — AD-1's Binds list is narrower than the spine's own ER diagram (corroborating sibling review)

Already identified independently in `review-adversarial-divergence.md` Finding 4: AD-1 binds `watches, watchlist_items, notify_bells, lists, list_items, profiles`, but the Core Entity Relationships diagram shows `tracked_shows`, `push_devices`, `imports`, and the self-referential `follows` relationship as equally owner-scoped. AD-1's closing sentence ("no table is exposed without an explicit RLS policy — deny by default") should save this functionally, but the explicit Binds enumeration is the part of an AD meant to be scannable/enforceable per checklist item 2, and as written it gives a literal-minded implementer textual grounds to treat the four omitted tables as out of scope. Flagging here because it's a direct hit on two checklist items at once (2: Rule enforceability, and the Binds field specifically) rather than re-deriving the sibling review's full "two divergent units" construction.

**Fix:** As the sibling review suggests — either say "all tables with an `owner_id` FK to `auth.users`, including but not limited to: …" or enumerate the full set.

---

## Low

### L7 — AD-9's Rule is enforceable only by process discipline, not by any structural mechanism

Every other AD's Rule is checkable against code/schema (a migration either has the constraint or it doesn't; an Edge Function either holds the TMDB key or it doesn't). AD-9's Rule — "a nightly `pg_dump`... ships off the VPS... before the app is considered launch-ready. This is a release gate, not a nice-to-have." — is real and important, but nothing in the spine ties it to an actual enforcement mechanism (a CI check, a launch checklist artifact, a monitoring alert on backup freshness). Low severity because the intent is unambiguous and unlikely to be misread, unlike the Critical/High findings above — but worth tightening since the doc calls it a "gate" without naming what enforces the gate.

**Fix:** One line naming how the gate is enforced (e.g., "launch checklist item, verified by a dated backup file existing in off-box storage before DNS goes live") would close the loop.

### L8 — NFR9's "budget latency/cost under load" is only half-addressed

AD-6 gives `catalog_cache` a TTL, which handles repeat-query cost, but NFR9 also asks the architecture to keep FR6 "fast under load," and nothing addresses what happens if TMDB itself throttles/rate-limits the proxy under a burst of cache-miss traffic (no backpressure, circuit-breaker, or queuing behavior mentioned). Low severity given v1's expected scale (solo instance, "a handful of friends"), but worth at least a Deferred line acknowledging it's out of scope for v1 rather than silently unaddressed.

### L9 — Consider a one-line verification footnote on the Stack table

The `<!-- verified 2026-07-02 -->` comment is a good practice, but as H3 shows, "verified" didn't catch an internal contradiction between two rows in the same table. Given several of these facts changed within weeks of the document's own date (Postgres 15→17 switch, TS 6.0 release), a one-line note of *how* verification was done (e.g., "checked against Expo/Supabase changelogs and npm on 2026-07-02") would make the claim auditable rather than just asserted — and would have made the TypeScript/Expo-SDK mismatch easier to catch at authoring time.

---

## Notes on items with no material findings

- **Terseness (item 5):** No filler found. The Binds/Prevents/Rule structure keeps rationale scoped to "why this Rule exists," not restated PRD prose; the Deployment section's one-sentence justification for "no staging" is proportionate, not padding.
- **Diagram validity (item 7):** All three Mermaid diagrams (paradigm `graph LR`, deployment `graph TB`, ER `erDiagram`) parse as valid Mermaid and convey real, non-placeholder structure. The `catalog_cache`-excluded-from-the-ER-diagram choice is explicitly explained in prose immediately after the diagram, which is exactly the right move (checklist item 7 wants diagrams that convey structure, and an explained omission is more informative than a decorative inclusion). Only ding is M4 above.
- **Capability map coverage (item 8):** All eleven PRD FR groups (FR1–FR45) appear as rows with no group skipped. The one weakness is the thinness of the "Governed by" column for the Accounts & Identity row, covered under H2.
