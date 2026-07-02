# Adversarial Review — TV Time 2 PRD

Reviewer posture: cynical, adversarial, fair. Scope: `prd.md`, `addendum.md`, `brief.md`, `EXPERIENCE.md`.
Date: 2026-07-02.

## Overall verdict

The PRD is unusually self-aware — it flags most of its own soft spots with `[ASSUMPTION]` tags and a starred Open Questions list. That honesty is real, but it is also doing a lot of load-bearing work: several of the "just an open question, doesn't block architecture" items are in fact launch-blocking, data-model-defining, or time-critical, and labeling them as deferrable is where the document quietly lies to itself. The two founding promises — *durable, never-lost history* and *effortless logging* — each rest on a foundation the PRD has not verified (a solo-funded single backend; an uninspected TV Time export; a push channel that may not fire on Android; a "< 15s" target with no measurement). None of these are fatal to the idea, but every one of them can derail the build or hollow out the founding promise if it stays unaddressed. Fix the four Criticals before architecture calls itself "started."

Finding counts: **Critical 4 · High 3 · Medium 6 · Low 4** (17 total).

---

## CRITICAL

### C1 — The durability promise structurally reproduces the TV Time failure mode
**Location:** Overview / Goals #1 & #5 / NFR5 / Scope "Out: Self-hosting" / addendum "backend required."
**Problem:** The founding promise is a "durable, feeling-aware record that *no vendor can silently delete*" and history that can "outlive any single maintainer." The chosen architecture is a **single centrally-hosted instance**, **self-hosting explicitly out of scope**, run by **one solo maintainer** with **no monetization, ever**. That is precisely the TV Time shape: one owner, one server, one funding source. When the solo maintainer stops paying the bill or loses interest, every user's centrally-hosted history dies — the exact event the product exists to prevent. Data *export* (FR4/NFR5) mitigates individual loss but does nothing for the social graph, the shared instance, or non-technical users who never export.
**Risk:** The product's entire emotional and moral pitch ("your history is safe now") is undercut by its own hosting model. Prospective users (and the creator in five years) inherit the same single-point-of-failure they fled. If unaddressed, the durability claim is marketing, not architecture.
**What honesty would require:** either scope in a survivability plan (community-run instances / federation / documented dump-and-restore / a "wind-down export to all users" commitment), or downgrade the promise from "outlive any maintainer" to "your *export* survives; the service may not."

### C2 — "No history is lost" rests on an uninspected export, and the inspection is time-critical but marked non-blocking
**Location:** Success criteria ("No history is lost") / FR38–41 / Open Question #2 (starred) / addendum import spike / Scope "Hard external deadline."
**Problem:** The #1 emotional hook and a headline success criterion is "No history is lost." The single requirement that delivers it — the TV Time importer — depends on an export format the PRD admits is **"not yet inspected … not a settled contract."** Two compounding dangers the PRD does not connect:
1. **If the export lacks per-watch dates or per-episode granularity, the core differentiator collapses for all migrated history.** The entire thesis is *timestamped feeling — how you felt then* (FR15, FR20). If TV Time's export is a flat "watched" list without reliable per-episode timestamps or the original mood/rating, then years of imported history arrive as an undated, feeling-less blob — a database, not the "watch-memory" the product promises. The pre-existing history (the very thing being rescued) would be the *least* feeling-aware data in the app.
2. **The inspection is a 13-day fuse, not a relaxed one.** Today is 2026-07-02; TV Time deletes everything 2026-07-15. After that date you can never obtain a *different or better* export. Yet Open Questions says "None should block starting architecture" and the deadline note frames export as merely "save it before July 15." Saving an export you haven't inspected is not the same as knowing it contains what the product needs. If it turns out lossy, there is no do-over.
**Risk:** Ship an importer that "works" but strips the temporal/feeling layer, silently failing the founding promise for exactly the users it was built for — while the window to get better source data has already closed.
**What honesty would require:** promote the export **inspection** (not just the save) to a do-now, pre-architecture action with a hard July-15 gate, and state explicitly what the importer does if dates/ratings are absent.

### C3 — Privacy default is unresolved yet it is launch-blocking and data-model-defining
**Location:** Open Question #1 (starred) / NFR6 (`[ASSUMPTION]`) / FR29 / FR2.
**Problem:** The PRD carries an unresolved "private-by-default vs friends-visible-by-default" question with a working assumption of **"friends-visible with a global toggle."** For a multi-user service **hosting other people's personal data**, this is not a deferrable UI detail:
- Viewing history is sensitive personal data — what someone watches can reveal sexual orientation, religion, health, politics, pregnancy, etc. Defaulting a freshly-**imported** multi-year history to friends-visible the moment a user follows someone is a privacy incident waiting to happen.
- The PRD itself says this "shapes data model and UI" (per-entry vs global visibility flags) — then files it as a non-blocking open question. That is a direct contradiction: you cannot design the watch/feed schema without deciding the visibility model. Retrofitting per-entry visibility later is a migration, not a tweak.
- No mention of GDPR/EU obligations, though the creator and personas are plainly EU (proton.me, Léa/Théo). Hosting EU users' personal data carries legal weight the PRD addresses with a single `[ASSUMPTION]` NFR.
**Risk:** Either a privacy blow-up on launch (sensitive history exposed by default) or a costly data-model rewrite when the default is reversed. Undermines the "honest, feels like *theirs* and safe" trust pitch.
**What honesty would require:** decide the default *now* (private-by-default is the defensible choice for imported history), make FR5 deletion a committed requirement not an assumption, and treat visibility as a first-class column in the data model.

### C4 — "Push without Google" is technically keepable but the PRD hides its cost, and NFR3's scope is ambiguous
**Location:** NFR3 / FR35 / FR37 / addendum "Auth + Push without Google."
**Problem:** NFR3 bans "proprietary Google/Firebase/Play Services dependencies **anywhere in the shipped Android app**" as non-negotiable, and FR37 promises push "works without Google/Firebase." The addendum's honest answer — **UnifiedPush** — carries consequences the PRD never surfaces:
- **UnifiedPush requires the *user* to install and configure a separate distributor app** (e.g. ntfy). On a from-source F-Droid build with no distributor present, notifications simply do not arrive. The "one retention lever" (FR33–35) — the only mechanism the product allows itself for bringing users back — may silently not fire for a large share of Android users. That directly contradicts the "effortless / it just works" posture.
- **Scope ambiguity:** "the shipped Android app" is singular. Does the ban apply only to the F-Droid variant, or to the Play Store variant too? If it applies to *all* Android builds, then even Play Store users are denied reliable FCM push and pushed onto UnifiedPush — a constraint far stricter than F-Droid itself requires, degrading the majority of users to satisfy a minority channel. If it applies only to F-Droid, then "one codebase" (NFR2) now has per-distribution build variants and a divergent push path the PRD hasn't acknowledged. Either reading has an unbudgeted cost.
- Auth (email/password, magic-link) genuinely is Google-free and cheap — that half of the promise is fine.
**Risk:** The retention lever is unreliable exactly where the constraint bites hardest (F-Droid), or the constraint needlessly degrades Play Store users, or the "single codebase" claim quietly becomes two build flavors. Any of these erodes a headline claim.
**What honesty would require:** state per-distribution build variants explicitly, acknowledge the distributor-app dependency and its UX cost, and define the graceful-degradation behavior when no push channel is available.

---

## HIGH

### H1 — Web is "in v1 scope" but the behavior contract designs for mobile only
**Location:** PRD Scope "In (v1): … + web" / NFR2 "feature parity … plus web" / brief Scope / **EXPERIENCE.md** Foundation ("Single-surface **mobile app** (iOS + Android, parity)").
**Problem:** The PRD and brief put **web** in v1 scope with **feature parity**. The EXPERIENCE spine — the authoritative behavior contract the PRD points to for flows and states — is explicitly **mobile-only** ("single-surface mobile app," bottom tab bar, system permission prompts, no web anywhere). Web is undesigned: no navigation model, no web-push story, no responsive/desktop flows. Expo web also does *not* deliver free parity — many native modules and notification behaviors don't carry over.
**Risk:** Silent scope expansion. "Web with parity" is committed in the PRD but has zero design behind it and unbudgeted platform-parity work. Either it slips (breaking the scope promise) or it consumes disproportionate solo-dev time.
**Fix:** Either cut web to post-v1 / "read-only companion," or add a web section to EXPERIENCE and budget it.

### H2 — TMDB is a hard runtime dependency with an API-key problem in an open-source/F-Droid client
**Location:** FR6 (`[ASSUMPTION: TMDB]`) / NFR9 / Dependencies / addendum "Metadata source."
**Problem:** The catalog is a hard runtime dependency and the app is non-functional without it. Two unaddressed consequences:
- **API key in a public, reproducibly-built client.** You cannot embed a TMDB key in an open-source, F-Droid-distributed binary without exposing it. The practical fix is to **proxy all catalog traffic through the shared backend** — which makes the solo-hosted instance the single chokepoint for every search (FR6 "effectively instantly"), adds rate-limit and cost exposure, and contradicts the "instant" claim under load.
- **Relocated vendor fragility.** The product's whole pitch is escaping vendor dependency, yet its *function* now depends entirely on TMDB's terms, uptime, and licensing (attribution/allowed-use). If TMDB changes terms or blocks the app, it dies — the same fragility, moved from "your history" to "the app working at all."
**Risk:** Latency/cost/reliability chokepoint on a no-budget backend; licensing/F-Droid-compatibility not yet verified; app-level single vendor dependency contradicting the founding ethos.
**Fix:** Confirm TMDB licensing + F-Droid compatibility before architecture; design catalog access as a cacheable backend proxy with explicit cost/rate assumptions; name a fallback (Trakt/TVDB/Wikidata) trigger.

### H3 — New-episode notifications are the most backend-intensive feature, on a no-budget instance
**Location:** FR33–35 / addendum "backend required (push origination)."
**Problem:** "Push only on genuine new-episode availability from the catalog" requires an always-on backend service that polls TMDB for every notified title across every user, dedups, and fans out via UnifiedPush + APNs + Web Push. The "one retention lever" is thus the single most infrastructure-heavy component — polling, scheduling, fan-out — running continuously on a solo-funded server (see C1). Reliability is also bound by TMDB air-date accuracy/timeliness; late or missing air-date data = missed or false "new episode" pushes, breaking the one promise the product makes about notifications.
**Risk:** The retention mechanism is expensive, operationally fragile, and only as trustworthy as third-party air-date data — with no budget to harden it.
**Fix:** Cost the polling/fan-out service explicitly; define behavior when catalog air-date data is stale/wrong; consider a bounded cadence rather than real-time.

---

## MEDIUM

### M1 — "< 15 seconds" is a vibe, not a verifiable condition
**Location:** Overview "Core promise" / NFR1 ("targets < 15 seconds") / Success criteria / UJ-1.
**Problem:** The headline promise is stated as a **target** with no measurement contract: no defined start/stop points, no percentile (p50/p95), no device class, no network assumption, no cold-vs-warm-start definition. UJ-1's "~15 seconds" is narrative color, and it bundles rating *and* ❤️ing a recommendation into the timing, while the stated "core loop" is log→rate→react — so even *what* is being measured is ambiguous. "Never blocks" (FR14) is genuinely testable and fine; the 15s number is not falsifiable as written.
**Risk:** The core promise can never pass or fail a test; it will be argued about instead of measured, and can silently regress.
**Fix:** Define it as, e.g., "p95 log→rate loop ≤ 15s on a mid-tier device from warm start, network irrelevant to commit."

### M2 — The flagship user journey's emotional peak is a feature that may be empty in v1
**Location:** UJ-1 climax / EXPERIENCE Flow 1 step 6 / FR42 / Open Question #7.
**Problem:** UJ-1 (the marquee "bedtime log" story) climaxes with a personalized recommendation ("Because you loved The Bear… save *Boiling Point*"). But FR42 says v1 recommendations are a "simple non-LLM heuristic or curated shelf" that "**may be a skeleton/empty state**," and Open Question #7 openly floats "ship empty until v2." So the demoed emotional high point of the primary journey may not exist in v1.
**Risk:** The showcased v1 experience oversells what ships; the "feeling seen" beat is unfunded.
**Fix:** Either commit to a minimum real recommendation heuristic for v1, or rewrite UJ-1 so its payoff doesn't depend on recommendations.

### M3 — Rating-model pivot muddies the stated differentiator and adds friction
**Location:** addendum "Rating model" / brief "The Solution" & "What Makes This Different" / PRD FR17–20 / NFR10.
**Problem:** The brief defines the product **explicitly against stars** ("an emoji reaction rather than a flattened star rating"; differentiator "versus Letterboxd/IMDb"). The PRD adopts a hybrid that **imports Letterboxd's ½-star scale** — the very mechanism the brief derided as flattening feeling. FR20 (rating bound to timestamp, not evolving) partially reconciles this, but the positioning is now internally muddy: the product both condemns and ships the static-style star rating. Separately, adding a *second* dimension (stars **and** moods) to every post-watch prompt is more friction than the brief's one-tap emoji, in tension with the "effortless / seconds" promise.
**Risk:** Differentiator narrative is blurred; the effort budget for the core loop quietly grows.
**Fix:** Restate the differentiator around the *timestamped mood layer* specifically (not "no stars"), and confirm the two-dimensional prompt still hits the 15s/effortless bar.

### M4 — The differentiating "mood layer" has no defined vocabulary
**Location:** FR18 / Open Question #5 / addendum data-model notes / Vision (v2 sentiment).
**Problem:** Mood chips are "a curated set (not free emoji)" and are billed as the human, differentiating layer — but the actual set is undefined ("fixed or extensible" TBD). You cannot build the rating UI, the feed rendering, the data model's mood enumeration, or the v2 "read your mood sentiment" LLM feature without this vocabulary.
**Risk:** Blocks a core feature's implementation and pre-commits the v2 flagship to an undefined taxonomy.
**Fix:** Define the v1 mood set (and fixed-vs-extensible decision) before building the rating component.

### M5 — Load-bearing requirements are marked `[ASSUMPTION]` (uncommitted)
**Location:** FR5 (delete account), FR16 (edit/remove a watch), FR2 (avatar), NFR6.
**Problem:** FR5 (account/data deletion) and FR16 (correct a logged watch) are tagged `[ASSUMPTION]`, i.e. not committed — yet both are load-bearing. FR5 is legally expected for a hosted service holding personal data and is relied on by NFR6. FR16 is essential to the import-trust story: the PRD *admits* import fidelity is imperfect (C2), so users will need to fix imported/mistaken watches; if editing is optional, the "accurate, trustworthy history" promise has no repair path.
**Risk:** Trust and legal-baseline features treated as maybes; import credibility has no correction mechanism.
**Fix:** Promote FR5 and FR16 to committed requirements.

### M6 — "Idempotent where feasible" is weasel wording on a correctness property
**Location:** FR40.
**Problem:** Import non-destructiveness/idempotency is a binary correctness property (re-import must not duplicate/clobber), but "where feasible" leaves it optional. Given users may re-run import (partial failure, retry after fixing), non-idempotent import means duplicated or clobbered history — the worst outcome for a product whose promise is *not losing* history.
**Risk:** Duplicate/corrupted timelines on re-import; directly violates the founding promise.
**Fix:** Make idempotency a hard requirement keyed on a stable (title, episode, timestamp/source-id) identity; drop "where feasible."

---

## LOW

### L1 — Residual "emoji" language from the dropped model
**Location:** Vision (post-v1): "read your … emoji/mood sentiment"; brief-era framing.
**Problem:** The v2 vision still references "emoji sentiment," a leftover from the superseded emoji-only model. Minor but shows the pivot wasn't fully swept through the doc.
**Risk:** Confusion about whether v2 analyzes emoji or the curated mood set. **Fix:** say "mood/rating sentiment."

### L2 — "One emoji max" copy rule vs multi-select mood chips
**Location:** NFR10 / EXPERIENCE Voice & Tone / FR18 (0–2 chips).
**Problem:** The "one emoji max" rule governs *product copy*, while mood chips (up to 2, rendered as emoji) are *user content*. Not a true conflict, but the overlap could confuse implementers into thinking chip count is capped by the voice rule (or vice versa).
**Risk:** Minor implementation ambiguity. **Fix:** clarify the rule applies to system copy, not user reactions.

### L3 — Profile aggregation semantics undefined against the multi-watch model
**Location:** FR23 ("favorites," year counts) vs FR20 (per-watch timestamped ratings).
**Problem:** With ratings deliberately *not* collapsed into one mutable score per title (FR20/addendum), it's undefined how "favorites" or aggregate stats are derived (latest rating? highest? most-recent mood?).
**Risk:** Ambiguous Profile computation; minor rework. **Fix:** define the aggregation rule.

### L4 — Success criteria are soft/self-referential
**Location:** Success criteria (creator uses it daily; "a handful of real friends").
**Problem:** For a passion project these are acceptable, but "creator uses it daily" and "a handful of friends" (already tagged as a rough target) are not independently verifiable product-quality signals.
**Risk:** Low — but there is no external validation signal for whether the *product* (vs the creator's willpower) is good. **Fix:** optionally add one behavioral proxy (e.g. import-completion rate, log-loop completion without abandonment).

---

## Cross-cutting note

The recurring pattern behind the four Criticals is the same: **cost and consequence deferred to "architecture" or "open questions" for decisions that actually constrain what architecture can be.** Privacy default, export fidelity, push channel, and backend survivability are not downstream of architecture — they *are* the architecture's premises. The PRD's admirable habit of flagging assumptions has, in these four cases, been used to postpone decisions that should gate the start of architecture, not follow it.
