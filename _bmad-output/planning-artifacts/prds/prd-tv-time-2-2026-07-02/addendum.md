# Addendum — TV Time 2

Depth captured during PRD discovery that belongs downstream (architecture / UX / build), not in the PRD narrative. The PRD states *what*; this holds *how* candidates, rejected alternatives, and rationale.

## Auth + Push without Google (F-Droid constraint, NFR3) — scoped to the F-Droid build

**Decision (C4):** NFR3 applies to the **F-Droid Android build only**. The Play Store Android build and iOS build may use FCM/APNs. This means **per-distribution build variants** of the one Expo/RN codebase — same product behavior, different push/auth transport. Architecture must plan for this variance explicitly; it is the acknowledged cost of the F-Droid promise.

Per-platform push channel:
- **iOS:** APNs directly (no Google on Apple's side).
- **Play Store Android:** FCM (normal path, reliable for the majority).
- **F-Droid Android:** [UnifiedPush](https://unifiedpush.org/) — no Google dependency. ⚠️ **Cost the PRD now surfaces (FR37):** UnifiedPush requires the *user* to have a distributor app (e.g. ntfy) installed; with none present, push simply won't arrive. The product's *one* retention lever can therefore silently not fire for some F-Droid users. Mitigation: **graceful degradation** — surface new-episode info in-app on next open (an in-app "what's new"), never pretend a push was sent, and consider prompting F-Droid users to install a distributor.
- **Web (post-v1):** Web Push standard when web ships.

Auth: self-hosted email/password or magic-link, or a self-hosted OSS identity provider — anything not bound to Google Sign-In. Genuinely Google-free and cheap on all builds; this half of the constraint is easy. Analytics: privacy-respecting/self-hosted, or none (not required for v1).

Implication: a **backend / shared instance** is required (accounts, social graph, feed fan-out, push origination, catalog proxy/caching). Forced by the PRD's central-hosting + F-Droid choices.

## Durability & wind-down (C1 / NFR11)

The honest position: a solo-funded single instance **is** a single point of failure — the TV Time shape. The PRD does not claim to escape it; it claims two concrete guarantees instead:
- **FR4** — every user can export their full data at any time (their own copy is safe).
- **NFR11 wind-down pledge** — if the instance shuts down, all users get reasonable notice + a final export before deletion.

Post-v1 survivability paths (not v1 commitments): community-run instances, federation, or a documented dump-and-restore. If durability is ever to become a *service* guarantee rather than an *export* guarantee, one of these must be scoped.

## Catalog access — API key & proxy (H2)

TMDB (or any keyed catalog) **cannot embed its API key in an open-source, reproducibly-built F-Droid binary**. Practical resolution: **proxy all catalog traffic through the backend**, which (a) keeps the key server-side, (b) enables caching, but (c) makes the solo instance the chokepoint for every search — so FR6's "low latency" must be budgeted under load (caching, rate limits, cost). Also relocates vendor-fragility: the app's *function* now depends on TMDB's terms/uptime. Verify licensing + attribution + F-Droid compatibility before architecture; name a fallback (Trakt / TVDB / Wikidata) and the trigger to switch.

## New-episode notifications — backend cost (H3)

"Push only on genuine new episodes" (FR35) needs an always-on service polling the catalog for every notified title across all users, dedup, and fan-out across APNs/FCM/UnifiedPush. This is the **heaviest v1 component** on a no-budget server, and its trustworthiness is bounded by catalog air-date accuracy (late/missing air-dates → missed or false pushes). Architecture should: cost the polling/fan-out, prefer a **bounded cadence** (e.g. daily) over real-time, and define behavior when air-date data is stale or wrong.

## Platform / stack rationale

- **Expo / React Native** chosen for one codebase across iOS + Android + web, per brief. Verify Expo's F-Droid story (bare workflow / no proprietary modules) — some Expo modules pull Google deps; audit early.

## Metadata source

- **TMDB** is the assumed catalog. Verify: API licensing terms, attribution requirements, and whether the client integration is F-Droid-compatible (no proprietary SDK; plain HTTP API is fine). Alternatives if blocked: Trakt, TVDB, Wikidata/OMDb — each with tradeoffs.

## Rating model — decision & rejected alternatives

- **Chosen (v1):** hybrid — ½-step 5-star **quality** rating + curated multi-select **mood chips**, per episode/title, both optional, timestamped. Lifted from TV Time (mood layer) + Letterboxd (½-star scale).
- **Rejected — emoji-reaction-only** (the brief's earlier framing): simpler and more distinctive but drops the familiar quality scale; superseded by the UX hybrid.
- **Rejected — stars-only:** loses the "how did it feel then" signal that is the core differentiator.

## Explicitly rejected patterns (from EXPERIENCE.md — enforce in build)

- Streaks / guilt / "you missed a day" mechanics — **never**.
- Algorithmic / engagement-ranked feed — feed stays chronological.
- Forced rating gates — watched always commits instantly.
- Re-engagement "we miss you" pushes — pushes only on genuine new episodes.
- Auto-playing hero video.

## Data model notes (for architecture)

- A **watch** is the atomic, timestamped unit; rating/mood/note hang off a watch, and multiple watches of the same title over time each keep their own reaction (FR20). Don't model rating as a single mutable field on a title.
- Next-episode pointer per (user, tracked show).
- Social graph (follow edges), feed (fan-out vs read-time aggregation — scale is small, read-time likely fine), shared lists (list + membership + visibility).

## Import (TV Time) — spike notes

- Export format **not yet inspected**. Before writing the importer: obtain a real export, catalog its fields, and map to the watch/rating/mood/date model. Treat import fidelity as bounded by what the export contains; report unmapped data to the user (FR41) rather than silently dropping it. **The importer never fabricates timestamps** (FR39): missing dates → flagged undated/approximate, not invented.
- ⚠️ **Do-now, not just "before build" (C2):** *saving* an export is not enough — **inspect** it before **2026-07-15** to confirm it carries per-watch dates and (ideally) ratings/moods. After that date no better export is obtainable, and the temporal-feeling thesis (FR15/FR20) is only as good as the imported data. This gates the FR39 mapping and is Open Question #2.
- Idempotency (FR40, hard req): key identity on a stable (title, episode, source-id/timestamp) tuple so re-import never duplicates or clobbers.
