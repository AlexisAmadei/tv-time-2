---
title: "PRD: TV Time 2 (working name)"
status: final
created: 2026-07-02
updated: 2026-07-02
---

# PRD: TV Time 2 (working name)

## Overview

TV Time — the app millions used to track shows and films and remember how they felt about them — deletes **all** user viewing history on **July 15, 2026**. TV Time 2 is its open-source, community-driven successor: a fast, honest **personal watch-memory** first, and a **light social network** second.

You log what you watch, rate it and react in a tap, and over time build a private, timestamped timeline of your viewing life — *what* you watched, *when*, and *how it felt then*. Because it's multi-user, you can also follow friends, see their reactions, and share lists — the human part of TV Time that a solo journaling app never replaces.

This is a **passion project, not a business**: no monetization, ever. It ships to the App Store, Google Play, and **F-Droid**, and is open source.

- **Core promise:** *logging is faster than forgetting.* The log → rate → react loop completes in seconds (see NFR1), and rating never blocks a watch.
- **The differentiator** is the **timestamped mood layer** — a reaction bound to *when you watched* (FR17–FR20). It records not just what you thought of a title but *who you were when you watched it* — the chapter of your life it belongs to — so history reads as an autobiography, not a single evolving score. (Not "no stars" — it keeps a familiar ½-star quality scale *and* adds the feeling layer TV Time was loved for.)
- **The moat is care and openness, not technology.** Anyone could build this; the point is that someone who actually watches a lot builds it, keeps it alive, and never turns it into a funnel. That intent is what turns the honest single-instance limitation from an apology into the whole point.
- **Primary user:** the heavy, reflective watcher (the creator is the archetype) who lost — or is about to lose — years of TV Time history.
- **Form factor:** single-surface **mobile app** — iOS + Android, feature parity — from one Expo / React Native codebase. **Web is post-v1** (see Scope). Dark mode default; Paper White light theme a setting.
- **Companion docs:** experience/behavior spine in `EXPERIENCE.md`; visual identity in `DESIGN.md`; product rationale in `brief.md`; technical options and rejected alternatives in `addendum.md`.

## Goals & Success Criteria

**Product goals (v1)**
1. Give heavy watchers a durable, feeling-aware record of their viewing life, and make *their copy* of that record impossible to lose (portable export, FR4).
2. Make logging a watch + reaction effortless — seconds, not a form.
3. Rescue existing TV Time history via import before it's gone.
4. Provide a small, honest, non-algorithmic social layer among real friends.
5. Be genuinely open — installable from stores **and** F-Droid, inspectable, forkable.

**On durability — an honest scope note.** TV Time 2 runs as a **single centrally-hosted instance** by a solo maintainer with no revenue. That is the same structural single-point-of-failure that killed TV Time, and this PRD will not pretend otherwise. What v1 *does* guarantee: (a) every user can export their full data at any time (FR4), and (b) a committed **wind-down pledge** — if the instance is ever shut down, all users get a final export and reasonable notice (NFR11). The promise is therefore *"your history is yours and portable,"* **not** *"the service will outlive its maintainer."* Community-run instances / federation are a post-v1 survivability path, not a v1 commitment.

**Success criteria**
- The creator uses it **daily and enjoys it** — logging is a small pleasure, not a chore — and never defects to Letterboxd or a spreadsheet for this purpose. Delight is a first-class measure here, not just retention.
- **Import fidelity is transparent:** the importer preserves everything the TV Time export actually contains and reports precisely what it could and couldn't map (FR41). "Nothing is silently dropped" — the honest, testable form of "no history lost." `[ASSUMPTION]` fidelity is bounded by the export (see FR38–FR41 + Open Questions).
- Logging a watch + reaction meets the NFR1 latency bar.
- At least a **handful of real friends** run their own accounts (validates the community bet). `[ASSUMPTION — rough target; tune to what "worth it" means.]`
- It is **open source and installable** from stores + F-Droid.
- *(Optional behavioral proxy, if we want an external signal beyond the creator's willpower: log-loop completion rate without abandonment, and import-completion rate.)*

**Counter-metrics (things we refuse to optimize)**
- Not daily-active-users at any cost: **zero** guilt/streak mechanics, **zero** "we miss you" re-engagement pushes. Engagement that isn't a genuine new episode is a failure, not a win.
- Not feed dwell-time: the feed stays chronological, never engagement-ranked.
- **Banned interaction patterns** (from `EXPERIENCE.md`, enforced as requirements): no streak/guilt mechanics, no forced rating gates, no re-engagement nag pushes, and **no auto-playing hero video**.

## Users & Context

- **Primary — the heavy, reflective watcher.** Watches a lot, tracked it in TV Time, wants a durable record that feels *theirs*. Success = logging is effortless and history feels safe.
- **Secondary — their friends / small communities.** Want to see what friends are watching and how they reacted, and share lists — the reason this beats a spreadsheet.
- **Tertiary `[ASSUMPTION]` — the open-source / privacy-minded crowd** who want a non-commercial, F-Droid alternative to closed trackers.

Persona context is carried inline in the User Journeys (protagonists: **Léa, 27** and **Théo, 24**, from `EXPERIENCE.md`).

## User Journeys

**UJ-1 — The bedtime log (Léa, 11:20pm, just finished tonight's episode).** Opens the app (dark). *The Bear* is top of **Up Next**. One tap on the card → S3E5 pre-selected → **✓ Watched** (soft confirm, pointer advances to S3E6). A rating prompt slides up; she taps **4½★** and **😭** (could have dismissed in one tap). **The payoff is the memory beat** — a warm line lands: *"Nice — that's 47 episodes of The Bear this year."* She feels seen, not nagged; phone down in seconds. *(If a recommendation shelf is present, she might ❤️ one to her watchlist — but the emotional peak is the year-count line, which does not depend on recommendations existing.)* *Failure path:* slow catalog fetch still logs from cached episode data; any recommendation shelf shows a skeleton, never blocks the log.

**UJ-2 — The binge catch-up (Théo, after a rainy Sunday of Severance).** Opens *Severance* → **S1** row → **"Mark whole season watched."** Bulk-log sheet: all 9 episodes pre-checked; he confirms once. Optional 5★ + 😱 on the season. His Diary fills; year-count jumps; *"That's a whole season in one sitting. Respect."* Bingeing is one confirmation, not nine taps.

**UJ-3 — Adding something new (Léa hears about Shōgun).** Center **(+)** → types "sho" → catalog results instantly → taps *Shōgun* → **Add to Watchlist**. *"We'll tell you when it's time"*, notify bell available. She trusts the app to remember.

**UJ-4 — What are my friends into? (Théo, on his commute).** Opens **Feed**. Because Léa has opted her activity visible to friends, he sees she rated *The Bear* 4½★ 😭 with a note; another friend watchlisted *Dune II*. He taps Léa's entry, reads her note, ❤️s *The Bear* to his own watchlist — word-of-mouth discovery, not an algorithm.

**UJ-5 — Making it yours (Léa, first Sunday).** **Profile** → shelf still thin → **Settings** → switches to **Paper White** → flips global notifications on (trusting per-title bells to keep it quiet) → scrolls back to stats: *"3 films, 1 show, 12 episodes — and it's only week one."* The shelf starts to feel like hers.

## Functional Requirements

FRs are grouped by capability with globally stable IDs. See the **Glossary** for domain nouns. Rating is always optional and never gates committing a watch.

### Accounts & Identity
- **FR1** — Users can create an account and sign in; accounts are multi-user and centrally hosted (single shared instance; self-hosting is out of v1).
- **FR2** — A user has a profile: display name, optional avatar `[ASSUMPTION]`, and public-facing stats/favorites (see FR22–FR23), subject to the visibility model (FR29a).
- **FR3** — Account creation and sign-in work **without any Google/Firebase dependency** in the F-Droid build (see NFR3).
- **FR4** — A user can export their own data (watches, ratings, moods, notes, lists) in a portable format at any time, so history is never vendor-locked. `[ASSUMPTION]` JSON is the likely baseline.
- **FR5** — A user can delete their account and all associated personal data. *(Committed — legally expected for a hosted service holding personal data; relied on by NFR6.)*

### Catalog & Search
- **FR6** — Users can search a public film/TV catalog by title and see results (poster, title, year, type) quickly — results appear as you type. Because catalog access is backend-proxied, architecture must keep this fast under load (NFR9). `[ASSUMPTION: TMDB]`
- **FR7** — A title detail view shows metadata (poster, synopsis, year); for shows, it shows seasons and episodes.
- **FR8** — When the catalog is unreachable, search shows a clear retry state and preserves the typed query; title detail falls back to cached basics rather than a blank screen (see `EXPERIENCE.md` → State Patterns).
- **FR9** — Missing/loading posters render a gradient placeholder, never a broken image.

### Tracking & Logging
- **FR10** — Users can start tracking a show or film; tracked shows appear in **Home / Up Next**.
- **FR11** — For a tracked show, the app maintains a **next-episode pointer**; a single **✓ Watched** commits the current episode and advances the pointer.
- **FR12** — Users can log a film as watched in one action.
- **FR13** — **Bulk season log:** from a season row, a sheet pre-checks all episodes; the user deselects any and confirms once. An optional season-level rating may be applied.
- **FR14** — Committing a watch is instant and gives a soft confirmation; it is **never** blocked by rating or by catalog latency (logs from cached episode data if needed). *(Testable: watch commits with the network disabled.)*
- **FR15** — Each watch is **timestamped** at log time (the basis of the temporal watch-memory).
- **FR16** — Users can edit or remove a logged watch (correct mistakes, including imported ones). *(Committed — the repair path that makes imported/mistyped history trustworthy.)*

### Rating & Reaction
- **FR17** — After a committed watch, a rating prompt offers a **½-step 5-star quality rating** and **mood chips**; a one-tap **Skip** is always present. Rating never blocks the watch.
- **FR18** — **Mood chips** are a **curated set** (not free emoji), multi-select (0–2 typical), applied to the episode (shows) or the title (films). `[ASSUMPTION]` **Proposed v1 set:** 😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling — fixed set for v1 (see Open Question #5). This vocabulary is a hard dependency for the rating UI, feed rendering, the mood enum in the data model, and the v2 sentiment feature.
- **FR19** — Ratings and moods are **re-tappable** — a user can change a rating/mood later.
- **FR20** — A rating/mood is **bound to the watch's timestamp** — it records how the user felt *then*, not a single evolving score. Prior reactions on earlier watches are preserved, not overwritten.
- **FR21** — Users can attach an optional short **note / mini-review** to a watch. `[ASSUMPTION]` ~500-char cap, plain text.

### Watch-Memory (Diary) & Profile
- **FR22** — A **Diary** shows the user's personal history of watched titles/episodes with their ratings, moods, notes, and dates, over time.
- **FR23** — A **Profile** (labeled **"You"** in the UI per `DESIGN.md`) shows aggregate stats (e.g. year counts of films/shows/episodes), favorites, watchlist, and friends. `[ASSUMPTION]` "favorites" and aggregate stats are derived from the user's watches; the exact aggregation rule against the multi-watch model (FR20) is defined in Open Question #10.
- **FR24** — Empty states are warm and route to a first action rather than showing cold zeroes (see `EXPERIENCE.md` → State Patterns).

### Watchlist
- **FR25** — Users can add any title to a **Watchlist** (❤️) for later, from search, title detail, Home shelves, or the feed.
- **FR26** — The Watchlist is surfaced as a Home shelf and on Profile.

### Community / Social (light)
- **FR27** — Users can **follow / unfollow** other users; a user has a friends/following list.
- **FR28** — A **chronological activity feed** shows followed users' recent *visible* watches, ratings, moods, and notes. **Non-algorithmic** — reverse-chronological, never engagement-ranked.
- **FR29** — **Privacy is private-by-default.** A user's watches, ratings, moods, and notes are visible to no one until the user explicitly opts in. Nothing imported or logged is ever exposed without an affirmative action by the owner.
- **FR29a** — **Visibility is a first-class, per-entry-capable property** in the data model (not a bolt-on). v1 exposes at least a **global "share my activity with friends" toggle** (default off); per-entry overrides may ship in v1 or later, but the schema must not preclude them. Followers only ever see entries the owner has made visible.
- **FR30** — From a feed entry, a user can ❤️ the title to their own watchlist.
- **FR31** — Users can create **shared lists** — named, curated collections of titles — and share them with / make them visible to friends.
- **FR32** `[ASSUMPTION]` — A user can find/add friends (by username or share link). Discovery mechanism TBD (Open Question #6).
- **Out of v1 scope:** comments/replies on others' entries; likes; algorithmic ranking; public global discovery.

### Notifications (the one retention lever)
- **FR33** — Each title has a **notify bell** toggling new-episode alerts for that title, **independent** of whether it's tracked.
- **FR34** — When a user finishes the last available episode/season ("caught up"), a contextual dialog offers to enable alerts for that title.
- **FR35** — Push notifications fire **only** on genuine new-episode availability (from the catalog), addressed to the person, in the warm voice. **No** digests, **no** re-engagement/"we miss you" pushes, **no** streak nags.
- **FR36** — A **global notifications toggle** lives in Profile → Settings; per-title bells govern only their own title.
- **FR37** — Push delivery uses the platform-appropriate channel per build (APNs on iOS; FCM on Play Store Android; **UnifiedPush** on the F-Droid Android build — no Google dependency there; see NFR3). When no push channel is available (e.g. an F-Droid build with no UnifiedPush distributor installed), the app **degrades gracefully**: in-app "what's new" surfaces the same new-episode info on next open, and the app does not pretend a push was delivered.

### TV Time Import
- **FR38** — Users can **import their TV Time data export** so years of history survive the shutdown.
- **FR39** — Import maps, at minimum, **watched titles/episodes and their dates** into the timeline; ratings/moods are mapped **where the export provides them**. **The importer never fabricates data:** if the export lacks per-watch dates, those watches are flagged as *undated/approximate* rather than given invented timestamps; if it lacks ratings/moods, those are left empty for the user to fill (FR16). `[ASSUMPTION]` exact field coverage depends on the export format — see Open Question #2 (a do-now inspection, not a downstream question).
- **FR40** — Import is **idempotent and non-destructive** (hard requirement): re-running import, or importing over existing data, must not duplicate or clobber entries. Identity is keyed on a stable (title, episode, source-id/timestamp) tuple.
- **FR41** — Import surfaces a clear summary of what was and wasn't imported (unmapped fields, undated rows, skipped rows), so the user knows the fidelity of their rescue.

### Recommendations (v1 = optional, non-LLM)
- **FR42** — Home *may* show a **Recommendations shelf**. For v1 this is at most a **simple, non-LLM** heuristic (e.g. recently-added or genre-adjacent) or a curated shelf; it must never block the log loop and **may ship empty/absent**. No user journey's payoff depends on it (see UJ-1). **LLM-powered recommendations are explicitly v2** (see Vision).

### Navigation & Interaction
- **FR43** — A persistent bottom **tab bar** with five slots — **Home · Diary · (+) · Feed · Profile** — is the primary navigation. The center **(+)** is the fast-add / log entry point and is **always one tap away** from anywhere (it embodies the "faster than forgetting" promise). Bottom sheets stack at most one level deep.
- **FR44** — Core actions (log a watch, rate, skip, add to watchlist) are **tap-to-act — no long-press required** to reach any core action. Long-press may exist only as an optional accelerator, never as the sole path.
- **FR45** — Users can switch **theme** — dark (default) or Paper White (light) — in Settings; the choice persists.

## Non-Functional Requirements

- **NFR1 — Speed / the core loop (measurable).** Cold open shows cached **Up Next** instantly (skeletons for uncached shelves). The **log → rate loop completes at p95 ≤ 15 seconds on a mid-tier device from a warm start**, with rating included and network irrelevant to the commit. Committing a watch (FR14) is never blocked by network latency. *(Start = tap on the Up Next card; stop = rating prompt dismissed or submitted.)*
- **NFR2 — Cross-platform parity (v1 = mobile).** Native **iOS + Android** with feature parity, from **one Expo / React Native codebase**. Note: the F-Droid Android build is a **per-distribution variant** of that codebase (Google-free push/auth per NFR3), so "one codebase" carries a build-variant asterisk, not divergent product behavior. **Web is post-v1.**
- **NFR3 — F-Droid eligibility (hard constraint, scoped).** The **F-Droid Android build** ships with **no proprietary Google/Firebase/Play Services dependencies** — this shapes its **auth, push, and analytics** paths. The Play Store Android build and the iOS build may use FCM/APNs. The *F-Droid constraint* is non-negotiable; the mechanism is deferred to architecture (see addendum for candidate approaches and the build-variant cost).
- **NFR4 — Open source.** Source is public and buildable by the community; distribution via App Store, Google Play, **and** F-Droid.
- **NFR5 — Data portability & durability.** Users can export their own data (FR4) at any time; no design choice may make a user's *own copy* of their history vendor-locked. This is the project's founding principle.
- **NFR6 — Privacy & data governance.** Multi-user central hosting means stewardship of others' personal data: **private-by-default** (FR29), clear visibility of what's shared, account/data deletion (FR5). Viewing history is sensitive personal data; the creator and users are EU-based, so **GDPR obligations apply** (lawful basis, deletion, export, breach handling) — to be met, not hand-waved. `[ASSUMPTION]` the precise DPA/hosting-jurisdiction details are an architecture/ops concern.
- **NFR7 — Accessibility floor (WCAG AA basics).** VoiceOver/TalkBack labels with role + state (Watched announces state change; stars announce value; mood chips announce name); Dynamic Type honored with **no truncated or clipped controls at the largest setting**; tap targets ≥ 44pt iOS / 48dp Android including stars and chips; color never the sole signal; Reduce Motion skips reward animations.
- **NFR8 — Offline (basic, not optimized for v1).** Show last cached data; a logged watch queues and syncs on reconnect; no blocking offline banner.
- **NFR9 — Catalog dependency resilience.** The app degrades gracefully when the external catalog is slow or down (FR8/FR9); catalog outages never block logging. Catalog access is expected to be proxied via the backend (see addendum H2) — architecture must budget its latency/cost so FR6 stays fast under load.
- **NFR10 — Voice & tone.** Warm, personal, lightly sentimental; **one emoji max in system copy** (this rule governs product copy, not user-selected mood chips); never pushy, never guilt-driven (see `EXPERIENCE.md` → Voice & Tone). A product requirement, not decoration — it's the differentiator against cold trackers.
- **NFR11 — Survivability / wind-down pledge.** If the central instance is ever shut down, the maintainer commits to giving all users reasonable advance notice and a final full data export (FR4) before data is deleted. This is the honest bound on the "never lost" promise (see Goals → durability note).

## Scope

**In (v1):** accounts (multi-user, hosted) · catalog search · track shows/films with progress · one-tap Watched + bulk season log · hybrid rating (½-star + mood chips) + optional notes · timestamped watch-memory (Diary) · Profile stats · Watchlist · light social (follow, chronological feed, private-by-default visibility, notes-in-feed, shared lists) · earned new-episode notifications (per-platform push channel) · **TV Time import** · optional non-LLM recommendation shelf · native **iOS + Android** (one codebase, F-Droid variant) · dark + Paper White themes.

**Out (v1):**
- **Web** — moved to post-v1 (v1 behavior contract in `EXPERIENCE.md` is mobile-only; web has no design yet).
- **LLM recommendations** — deferred to **v2** (the flagship v2 feature).
- **Comments/likes on others' entries**, algorithmic feed, public global discovery — post-v1.
- **Monetization / paid tiers** — permanently out.
- **Self-hosting / federation / community-run instances** — out of v1 (a post-v1 survivability path, per Goals durability note).
- **Proprietary Google-only dependencies in the F-Droid build** — out by constraint (NFR3).
- **Offline optimization** beyond the basic cache/queue (NFR8).

**Hard external deadline & do-now action:** TV Time deletes all user data after **July 15, 2026** (13 days out). ⚠️ **Before then — and before architecture is called "started" — the creator must not just *save* but *inspect* a TV Time export** (Open Question #2): confirm it contains per-watch dates and, ideally, ratings/moods. After July 15 no better export can ever be obtained; if the export is lossy, the temporal-feeling thesis is degraded for all migrated history and the importer's behavior (FR39) must account for it. The *build* timeline itself is relaxed (passion project); the *export inspection* is not.

## Dependencies & Constraints

- **External catalog** (TMDB or equivalent) for title/episode/poster metadata — hard runtime dependency. In an open-source/F-Droid client the API key cannot be embedded, so catalog traffic is expected to be **proxied through the backend** (adds a latency/cost chokepoint — architecture must budget it; see addendum H2). Licensing + F-Droid compatibility to verify before architecture. `[ASSUMPTION: TMDB]`
- **F-Droid eligibility** constrains the F-Droid build's auth, push, and analytics (NFR3).
- **TV Time export format** — unknown until inspected; gates import fidelity (FR38–FR41) and the do-now action above.
- **Push transport** — per-platform (APNs / FCM / UnifiedPush); the F-Droid path needs a UnifiedPush distributor and graceful degradation (FR37; addendum).
- **New-episode push is backend-intensive** — polling the catalog per notified title/user and fanning out is the heaviest v1 component on a no-budget instance; bounded cadence + stale-air-date handling to be designed (addendum H3).

## Open Questions

*(Carried forward for architecture / next phase. ⭐ = should be decided at or before the start of architecture; the export inspection is do-now.)*

1. ~~Privacy default~~ — **RESOLVED: private-by-default** (FR29). Remaining sub-question: does per-entry visibility ship in v1 or later? (Schema supports it either way, FR29a.)
2. ⭐🔴 **TV Time export format — DO NOW (pre-July-15).** Inspect the actual export; confirm per-watch dates and rating/mood coverage; finalize the FR39 mapping and missing-data behavior.
3. ⭐ **Auth + push mechanism** — pick the F-Droid-compatible approach (UnifiedPush distributor strategy, self-hosted auth) since it shapes the backend and build variants from day one (addendum).
4. ⭐ **Backend hosting & cost** — where the single instance runs, and the polling/fan-out budget for notifications (addendum H3); informs the NFR11 wind-down process.
5. **Mood chip set** — confirm/adjust the proposed v1 set (FR18) and lock fixed-vs-extensible before building the rating component. ⚠️ **Contradiction to resolve:** `DESIGN.md` currently lists a *different* 5-emoji set (😭 cried · 😱 shook · 🤣 laughed · 🥹 touched · 😌 satisfied). **FR18 is canonical** for the mood enum; DESIGN.md must be updated to match once the set is locked.
6. **Friend discovery** — username search vs invite/share link vs both (FR32).
7. **Recommendation heuristic (v1)** — what powers the optional non-LLM shelf, or ship absent until v2 (FR42).
8. **Data export format** for FR4 (JSON baseline?).
9. **Note length cap / formatting** (FR21).
10. **Profile aggregation rule** — how "favorites" and stats are derived against the multi-watch, timestamped-rating model (FR20/FR23).
11. **TMDB licensing + F-Droid compatibility** confirmation, and a named fallback catalog trigger (FR6; addendum H2).

## Vision (post-v1)

If it works, TV Time 2 becomes the **durable, open home for watch-memories**. **v2 flagship: LLM-powered recommendations** that read your own history and **mood/rating sentiment** to suggest what to watch next, mood-aware. **Web** (at least a read-only companion) and a **survivability path** (community-run instances / federation) are the other leading post-v1 threads. Longer term: a small, healthy, non-commercial community of watchers sharing honest, in-the-moment reactions — the good part of TV Time, kept alive by the people who loved it.

## Glossary

- **Watch** — a single logged viewing of a film or a show episode; the atomic, timestamped unit. Ratings/moods/notes hang off a watch.
- **Rating** — the ½-step 5-star quality score for a watch (optional).
- **Mood chip** — a curated, multi-select emoji reaction on a watch (optional); the differentiating "feeling" layer.
- **Note** — an optional short personal mini-review attached to a watch.
- **Track / tracking** — following a show's progress via the next-episode pointer; distinct from the notify bell and from the watchlist.
- **Next-episode pointer** — per (user, tracked show) marker of the next unwatched episode.
- **Watchlist** — titles saved for later (❤️), not yet watched.
- **Diary** — the user's personal, chronological watch-memory.
- **Feed** — the reverse-chronological stream of followed users' *visible* activity.
- **Visibility** — per-user (and schema-permitting per-entry) control over who can see a watch; **private by default**.
- **Notify bell** — per-title toggle for genuine new-episode push alerts, independent of tracking.
- **Import** — bringing a TV Time data export into the app.
- **F-Droid build** — the Google-free Android build variant (UnifiedPush, no Play Services).

## Assumptions Index

Inline `[ASSUMPTION]` tags, collected (resolve before or during architecture):
- **FR2** — profile includes an optional avatar.
- **FR4 / OQ#8** — export format is JSON (baseline).
- **FR6 / OQ#11** — catalog source is TMDB (licensing/F-Droid compat unverified).
- **FR18 / OQ#5** — the proposed v1 mood set and its fixed-vs-extensible nature.
- **FR21 / OQ#9** — ~500-char plain-text note cap.
- **FR23 / OQ#10** — Profile aggregation derives from watches; exact rule TBD.
- **FR32 / OQ#6** — friend discovery mechanism.
- **NFR6** — precise GDPR/DPA/hosting-jurisdiction details are an ops concern.
- **Success criteria** — "handful of friends" is a rough target; import "fidelity" is bounded by the export.
- **Users** — the tertiary open-source/privacy audience.
