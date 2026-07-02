---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/prd.md
  - _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-tv-time-2-2026-07-02/EXPERIENCE.md
---

# TV Time 2 - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for TV Time 2, decomposing the requirements from the PRD, UX Design, and Architecture Spine into implementable stories.

## Requirements Inventory

### Functional Requirements

**Accounts & Identity**
- FR1 — Users can create an account and sign in; accounts are multi-user and centrally hosted (single shared instance; self-hosting out of v1).
- FR2 — A user has a profile: a unique `@username` (handle, set at sign-up), display name, optional avatar, and public-facing stats/favorites (FR22–FR23), subject to the visibility model (FR29a).
- FR3 — Account creation and sign-in work without any Google/Firebase dependency in the F-Droid build (NFR3).
- FR4 — A user can export their own data (watches, ratings, moods, notes, lists) in a portable format at any time.
- FR5 — A user can delete their account and all associated personal data.

**Catalog & Search**
- FR6 — Users can search a public film/TV catalog by title; results (poster, title, year, type) appear as you type; backend-proxied and fast under load (NFR9).
- FR7 — A title detail view shows metadata (poster, synopsis, year); for shows, seasons and episodes.
- FR8 — When the catalog is unreachable, search shows a clear retry state and preserves the typed query; title detail falls back to cached basics, never a blank screen.
- FR9 — Missing/loading posters render a gradient placeholder, never a broken image.

**Tracking & Logging**
- FR10 — Users can start tracking a show or film; tracked shows appear in Home / Up Next.
- FR11 — For a tracked show, the app maintains a next-episode pointer; a single ✓ Watched commits the current episode and advances the pointer.
- FR12 — Users can log a film as watched in one action.
- FR13 — Bulk season log: from a season row, a sheet pre-checks all episodes; user deselects any and confirms once. Optional season-level rating.
- FR14 — Committing a watch is instant with a soft confirmation; never blocked by rating or catalog latency (logs from cached episode data). Testable: watch commits with the network disabled.
- FR15 — Each watch is timestamped at log time (basis of the temporal watch-memory).
- FR16 — Users can edit or remove a logged watch (including imported ones).

**Rating & Reaction**
- FR17 — After a committed watch, a rating prompt offers a ½-step 5-star quality rating and mood chips; a one-tap Skip is always present. Rating never blocks the watch.
- FR18 — Mood chips are a curated set (not free emoji), multi-select (0–2 typical), applied to the episode (shows) or title (films). Proposed v1 set: 😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling. This vocabulary is a hard dependency for the rating UI, feed rendering, and the mood enum.
- FR19 — Ratings and moods are re-tappable — a user can change a rating/mood later.
- FR20 — A rating/mood is bound to the watch's timestamp — records how the user felt then, not a single evolving score. Prior reactions preserved, not overwritten.
- FR21 — Users can attach an optional short note / mini-review to a watch (~500-char cap, plain text).

**Watch-Memory (Diary) & Profile**
- FR22 — A Diary shows the user's personal history of watched titles/episodes with ratings, moods, notes, and dates, over time.
- FR23 — A Profile (labeled "You" in the UI) shows aggregate stats (year counts of films/shows/episodes), favorites, watchlist, and friends. Aggregation (OQ#10 resolved): year stats = raw episode count + distinct-title film/show counts; favorites = titles with a max watch-rating ≥ 4.5★.
- FR24 — Empty states are warm and route to a first action rather than showing cold zeroes.

**Watchlist**
- FR25 — Users can add any title to a Watchlist (❤️) from search, title detail, Home shelves, or the feed.
- FR26 — The Watchlist is surfaced as a Home shelf and on Profile.

**Community / Social (light)**
- FR27 — Users can follow / unfollow other users; a user has a friends/following list.
- FR28 — A chronological activity feed shows followed users' recent visible watches, ratings, moods, and notes. Non-algorithmic — reverse-chronological, never engagement-ranked.
- FR29 — Privacy is private-by-default. A user's watches, ratings, moods, and notes are visible to no one until explicit opt-in. Nothing imported or logged is exposed without an affirmative action by the owner.
- FR29a — Visibility is a first-class, per-entry-capable property in the data model. v1 exposes at least a global "share my activity with friends" toggle (default off); per-entry overrides may ship in v1 or later, but the schema must not preclude them. Followers only ever see entries the owner has made visible.
- FR30 — From a feed entry, a user can ❤️ the title to their own watchlist.
- FR31 — Users can create shared lists — named, curated collections of titles — and share them with / make them visible to friends.
- FR32 — A user can find/add friends by exact `@username` lookup or a share/deep link — no fuzzy browsing (OQ#6 resolved). Requires a unique `username` on the profile.
- Out of v1 scope: comments/replies, likes, algorithmic ranking, public global discovery.

**Notifications**
- FR33 — Each title has a notify bell toggling new-episode alerts for that title, independent of whether it's tracked.
- FR34 — When a user finishes the last available episode/season ("caught up"), a contextual dialog offers to enable alerts for that title.
- FR35 — Push notifications fire only on genuine new-episode availability, addressed to the person, in the warm voice. No digests, no re-engagement pushes, no streak nags.
- FR36 — A global notifications toggle lives in Profile → Settings; per-title bells govern only their own title.
- FR37 — Push delivery uses the platform-appropriate channel per build (APNs iOS; FCM Play Store Android; UnifiedPush F-Droid). When no push channel is available, the app degrades gracefully: in-app "what's new" surfaces the same new-episode info on next open, and never pretends a push was delivered.

**TV Time Import — CUT from v1**
- FR38–FR41 — ~~TV Time data-export import~~. **Removed from v1 scope** (product decision, 2026-07-02): the creator never obtained a TV Time export, and after the July 15 2026 shutdown no export can be obtained, so there is nothing to import or inspect. Goal #3 ("rescue existing history via import") is dropped; accounts start fresh. *(A future community-supplied-export importer remains a possible post-v1 thread but is not v1 work.)* Ripple: removes the `import-tvtime` Edge Function, ARCH import-idempotency requirement, and the `source_watch_id`/import clause from the pointer path. **PRD divergence noted** — `prd.md` still lists FR38–41, Goal #3, and import success criteria as in-scope; recommend reconciling the PRD via correct-course, but the epics proceed without import.

**Recommendations (v1 = optional, non-LLM)**
- FR42 — Home may show a Recommendations shelf. For v1 at most a simple non-LLM heuristic or curated shelf; must never block the log loop and may ship empty/absent. No user journey's payoff depends on it. LLM recommendations are explicitly v2.

**Navigation & Interaction**
- FR43 — A persistent bottom tab bar with five slots — Home · Diary · (+) · Feed · Profile — is the primary navigation. Center (+) is the fast-add/log entry point, always one tap away. Bottom sheets stack at most one level deep.
- FR44 — Core actions (log, rate, skip, add to watchlist) are tap-to-act — no long-press required. Long-press may exist only as an optional accelerator.
- FR45 — Users can switch theme — dark (default) or Paper White (light) — in Settings; the choice persists.

### NonFunctional Requirements

- NFR1 — Speed / core loop (measurable). Cold open shows cached Up Next instantly (skeletons for uncached shelves). The log → rate loop completes at p95 ≤ 15 seconds on a mid-tier device from a warm start, rating included, network irrelevant to the commit. (Start = tap on Up Next card; stop = rating prompt dismissed or submitted.)
- NFR2 — Cross-platform parity (v1 = mobile). Native iOS + Android with feature parity from one Expo / React Native codebase. F-Droid Android is a per-distribution build variant. Web is post-v1.
- NFR3 — F-Droid eligibility (hard constraint, scoped). The F-Droid Android build ships with no proprietary Google/Firebase/Play Services dependencies — shapes auth, push, analytics. Play Store Android and iOS may use FCM/APNs.
- NFR4 — Open source. Source is public and buildable by the community; distribution via App Store, Google Play, and F-Droid.
- NFR5 — Data portability & durability. Users can export their own data (FR4) at any time; no design choice may make a user's own copy vendor-locked.
- NFR6 — Privacy & data governance. Private-by-default (FR29), clear visibility of what's shared, account/data deletion (FR5). GDPR obligations apply (lawful basis, deletion, export, breach handling).
- NFR7 — Accessibility floor (WCAG AA basics). VoiceOver/TalkBack labels with role + state; Dynamic Type honored with no truncated/clipped controls at largest setting; tap targets ≥ 44pt iOS / 48dp Android including stars and chips; color never the sole signal; Reduce Motion skips reward animations.
- NFR8 — Offline (basic, not optimized for v1). Show last cached data; a logged watch queues and syncs on reconnect; no blocking offline banner.
- NFR9 — Catalog dependency resilience. Graceful degradation when the external catalog is slow/down (FR8/FR9); catalog outages never block logging. Catalog access proxied via backend; budget latency/cost so FR6 stays fast under load.
- NFR10 — Voice & tone. Warm, personal, lightly sentimental; one emoji max in system copy; never pushy or guilt-driven. A product requirement, not decoration.
- NFR11 — Survivability / wind-down pledge. If the central instance is shut down, the maintainer commits to reasonable advance notice and a final full data export (FR4) before deletion.

### Additional Requirements

Technical requirements from the Architecture Spine (ADs) that shape epics/stories. These are largely foundational (Epic 1) or cross-cutting constraints on later epics.

**Foundational infrastructure (Epic 1 candidates)**
- ARCH-1 — Self-hosted Supabase stack via `docker-compose.yml`, pinned to a specific dated release tag recorded in-repo — never `latest` (AD-13). Stack: Postgres 17 (bundled), GoTrue, PostgREST, Storage, Edge Functions (Deno runtime), Kong.
- ARCH-2 — Expo/React Native client scaffold, feature-modular (one module per bottom-nav tab: home, diary, add, feed, profile), plus `data/` (supabase-js client, typed query hooks, outbox/sync worker) and `components/`. Stack: Expo SDK 56 (RN 0.85, React 19.2), TypeScript 6.0.3. Monorepo `packages/shared-types` (generated Supabase types + zod schemas shared client↔functions).
- ARCH-3 — `pg_cron` and `pg_net` enabled via explicit `CREATE EXTENSION` + `shared_preload_libraries` migration ("bundled" ≠ "enabled") (AD-5).
- ARCH-4 — Two environments only: local dev (docker compose + Expo dev client) and single production VPS. No staging in v1.

**Authorization & data model (cross-cutting)**
- ARCH-5 — Authorization lives in Postgres RLS, not app code (AD-1). Every table with an actor FK to `auth.users` carries `owner_id` (or relevant actor columns) + nullable per-row `visibility` override on owner-scoped content. No table exposed through PostgREST without an explicit RLS policy — deny by default. SELECT policy: `owner_id = auth.uid() OR (follow-edge AND effective_visibility = 'shared')`.
- ARCH-6 — Edge Functions are the only home for custom logic (AD-2). Named functions in `supabase/functions/`: `catalog-search`, `catalog-title`, `poll-new-episodes`, `export-my-data`, `delete-my-account` (`import-tvtime` cut with import). Client + pg_cron are the only callers; only Edge Functions hold the TMDB key, push credentials, or cross-user DB access.
- ARCH-7 — Watch is the atomic timestamped unit (AD-3). Rating, mood(s), note are columns on `watches`, never on a title/catalog entity. Each logged watch is its own row; re-tapping updates that row, never collapses rows across separate watches.
- ARCH-8 — Watch commit + rating/mood/note are local-first via one durable outbox unit (AD-4). Client writes to a local `expo-sqlite` `pending_watches` table synchronously before any network call; sync worker drains to `watches` via PostgREST. The only durable local write path (not a general offline framework); other reads use TanStack Query's disposable persisted cache.
- ARCH-9 — Next-episode pointer is derived, single-writer, never client-computed (AD-10). Advancement only via `advance_next_episode_pointer(user_id, tmdb_id)` Postgres function exposed as a PostgREST RPC; the client never issues a raw PATCH against the pointer. (Import was the second caller in the architecture; with import cut, organic logging is the sole caller — but the single-writer RPC discipline stays, since rewatch/edit paths still touch it.)
- ARCH-10 — Consistency conventions (binding). Catalog identifiers: `tmdb_id` + `media_type` ('movie'|'tv') discriminator; `watches` additionally carries nullable `tmdb_episode_id`. Ids: `uuid` (`gen_random_uuid()`). Timestamps: `timestamptz` UTC ISO 8601 at boundary. Rating: `smallint` half-steps (0–10). Moods: `text[]` + Postgres CHECK constraint (not ENUM). Errors: `{message, code, details}` envelope for both PostgREST/GoTrue and Edge Functions. Snake_case DB, camelCase TS.

**Pipeline-specific (later epics)**
- ARCH-11 — Notification fan-out runs on a bounded daily cadence, never per-event real-time (AD-5). `pg_cron` invokes `poll-new-episodes` daily via `pg_net` over Docker-internal networking. Diffs against dedicated `known_episode_state` table (separate from `catalog_cache`). Fans out per `push_devices` row using recorded channel.
- ARCH-12 — Catalog access always proxied and cached (AD-6). Client calls only `catalog-search`/`catalog-title`; these hold the TMDB key server-side, read/write `catalog_cache` (`tmdb_id`, `media_type`, `payload jsonb`, `fetched_at`) with a TTL, sole callers of the external catalog. Cache is disposable, distinct from `known_episode_state`.
- *(ARCH-13 — TV Time import idempotency — **cut** with the import feature.)*
- ARCH-13 — GDPR export/delete are dedicated, structurally-cascading Edge Functions (AD-8). Every FK referencing `auth.users.id` is `ON DELETE CASCADE` (including self-referential `follows.follower_id` and `follows.followee_id`). `delete-my-account` relies on cascade; `export-my-data` enumerates tables by FK introspection, not a hardcoded list.
- ARCH-14 — F-Droid auth stays Google/Firebase-free by construction (AD-12). GoTrue enabled auth methods limited to email/password and magic link for v1. Any OAuth provider addition must be audited against NFR3 first.

**Go-live gates (release checklist)**
- ARCH-15 — Nightly off-box backup is mandatory before go-live (AD-9). A nightly `pg_dump`/snapshot ships off the VPS to separate storage; go-live blocked until a dated backup file is confirmed present off-box.
- ARCH-16 — GDPR hosting jurisdiction is EU/EEA, confirmed before go-live (AD-11).

**Deferred by architecture (not v1 build work unless product decides):** F-Droid UnifiedPush wiring is a build-time spike (config-plugin, degraded UX, CI variant); TMDB licensing + fallback catalog verification; mood-chip canonical set; per-entry visibility override UI; selective per-recipient list sharing; TMDB rate-limit/backpressure; recommendations heuristic.

### UX Design Requirements

Extracted from DESIGN.md (visual identity/tokens) and EXPERIENCE.md (behavior/states/flows). Each is scoped to be story-generating.

**Design tokens & theming**
- UX-DR1 — Implement the two-mode color system as design tokens with consistent role mapping across modes (so behavior never depends on theme). Dark (VHS Dusk, default): base `#16131E`, raised `#211C2C`, sunken `#2A2438`, ink `#ECE7F2`/`#8A82A0`, primary magenta `#EC5A92` (+press `#D43F7B`), cool cyan `#45C2CF`, gold `#F2C14E`, hairline `#2E2A3A`. Light (Paper White): base `#FAF9F7`, raised `#FFFFFF`, sunken `#F4F5F6`, ink `#262B2A`/`#7E857F`, primary coral `#E0654F` (+press `#C24F3B`), cool teal `#2F8F88`, gold `#DCA82E`, hairline `#ECE9E4`. Gold is reserved for memory/identity moments (stars, notify/caught-up) — never buttons/nav/decoration.
- UX-DR2 — Implement typography tokens: Fraunces (display: logo, hero, section headings, weights 700–800, optical sizing) and DM Sans (body/UI: meta, buttons, labels, weights 400/600), loaded as fonts. Scale: hero 27 · title 20 · card-title 15 (Fraunces) · body 15 · label 12 · meta 11 · kicker 10 uppercase (DM Sans). Fraunces never used for body/dense meta.
- UX-DR3 — Implement spacing scale (4/8/12/16/24/32, 16px screen margins), corner-radius scale (sm 8 / md 13 / lg 18 / pill), and elevation rules (light: soft low shadow on cards; dark: separate by tone not shadow; the (+) is the one element with a real lift). No hard 90° corners; no fully-circular surfaces except avatar.
- UX-DR4 — Theme switching (FR45): dark default / Paper White light, toggled in Settings, choice persists.

**Reusable components (behavioral + visual)**
- UX-DR5 — Poster: rounded-md TMDB thumbnail; cool→dark gradient placeholder with a small glyph while loading or when art is missing; never a broken-image state (FR9).
- UX-DR6 — Title card: poster left; title (Fraunces card-title), meta, star row, mood chips right; surface-raised; tap → title detail. Shows current-episode state for tracked shows.
- UX-DR7 — Star rating: 5 stars, ½-step, gold, empty portion at 28% opacity; half-star drag/tap; optional — never required to commit; re-tappable (FR17/FR19).
- UX-DR8 — Mood chip: pill, single emoji from the **locked 8-chip set** (FR18: 😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling), multi-select (0–2 typical), selected fills surface-sunken. OQ#5 resolved (2026-07-02); DESIGN.md reconciled and the mood enum locked.
- UX-DR9 — Fast-add (+): center bottom-nav slot, primary fill, rounded-md, lifted −16px above the bar; opens the search-first log flow; always present (FR43).
- UX-DR10 — Watched badge / Continue pill: rounded-sm, primary fill, uppercase label; single tap commits watched and advances the pointer (FR11).
- UX-DR11 — Bulk-log sheet: from a season row, all episodes pre-checked; user deselects any and confirms once; optional season-level rating (FR13).
- UX-DR12 — Notify bell: title-detail toggle, outline (off) → gold fill (on); also the affordance in the caught-up dialog (FR33/FR34).
- UX-DR13 — Bottom nav: 5 slots (Home · Diary · (+) · Feed · Profile, labeled "You"), surface-raised, hairline top border; active icon in primary + label, inactive ink ~55% opacity; color never the sole active signal (FR43, NFR7).

**State patterns (warm empty/error/offline states — FR24, FR8, NFR8)**
- UX-DR14 — Warm empty states routing to a first action for: Home (new user), Diary, Watchlist, Feed, Profile (new user) — each with the specified copy, never cold zeroes.
- UX-DR15 — Cold open shows cached Up Next instantly with skeleton posters for uncached shelves (NFR1).
- UX-DR16 — Catalog/search error and title-detail fetch error states: clear retry affordance, preserve typed query, fall back to cached basics, never a blank screen (FR8).
- UX-DR17 — Watched-confirmed state: soft confirmation ("Logged — nice one."), pointer advances, rating prompt slides up. Rating prompt: header "How was it?", 5 gold stars + mood chips, one-tap Skip always present, never blocks the watch (FR14/FR17).
- UX-DR18 — Caught-up state: "You're all caught up on {show}." + notify-me dialog (FR34).
- UX-DR19 — Offline state (v1 basic): show last cached data; queue a logged watch and sync on reconnect; no blocking banner (NFR8).

**Voice, tone & interaction discipline**
- UX-DR20 — Voice & tone system: warm, personal, lightly sentimental system copy; one emoji max; the memory-beat payoff lines (e.g. "Nice — that's 47 episodes this year"); never pushy/guilt copy (NFR10). Enforce the Do/Don't copy table.
- UX-DR21 — Interaction primitives: tap-to-act (no long-press required), one-tap Watched + one-tap dismiss, half-star drag/tap, horizontal-scroll shelves + vertical page, bulk-select via pre-checked sheet (FR44).
- UX-DR22 — Banned patterns enforced as anti-requirements: no streak/guilt mechanics, no re-engagement nag pushes, no forced rating gates, no auto-playing hero video.

**Accessibility (NFR7)**
- UX-DR23 — VoiceOver/TalkBack: every interactive element labeled with role + state ("Watched" announces state change; stars announce value; mood chips announce name).
- UX-DR24 — Dynamic Type honored via the typography scale with no truncated/clipped controls at the largest setting; tap targets ≥ 44pt iOS / 48dp Android including stars and chips.
- UX-DR25 — Color never the sole signal (Watched carries a label, active nav carries label+icon); Reduce Motion skips watched-confirmation and reward animations, showing the result immediately.

### FR Coverage Map

Every active FR (FR38–FR41 cut with import) maps to a **primary** epic that fully satisfies it. A few FRs are *seeded* by the Epic 1 walking skeleton (a thin thread) and *completed* in their primary epic — noted inline. NFRs are woven through as constraints, not standalone epics.

- FR1 → Epic 1 — account creation & sign-in
- FR2 → Epic 1 — profile record (`profiles`, incl. `share_activity` toggle); display/stats surface in Epic 4
- FR3 → Epic 1 — Google-free auth (F-Droid)
- FR4 → Epic 7 — data export
- FR5 → Epic 7 — account & data deletion
- FR6 → Epic 2 — full catalog search-as-you-type; *seeded in Epic 1* (`catalog-search` skeleton)
- FR7 → Epic 2 — title detail (seasons/episodes)
- FR8 → Epic 2 — catalog-unreachable retry state
- FR9 → Epic 2 — poster gradient placeholder
- FR10 → Epic 3 — start tracking a show/film
- FR11 → Epic 3 — next-episode pointer + ✓ Watched
- FR12 → Epic 3 — one-action film log
- FR13 → Epic 3 — bulk season log
- FR14 → Epic 3 — full instant, network-independent commit + non-blocking rating; *seeded in Epic 1* (offline-persist log via outbox)
- FR15 → Epic 3 — timestamped watch; *seeded in Epic 1*
- FR16 → Epic 3 — edit/remove a logged watch
- FR17 → Epic 3 — post-watch rating prompt (skippable)
- FR18 → Epic 3 — curated mood chips (**set must be locked before the rating component is built**)
- FR19 → Epic 3 — re-tappable rating/mood
- FR20 → Epic 3 — rating bound to watch timestamp
- FR21 → Epic 3 — optional note
- FR22 → Epic 4 — Diary history
- FR23 → Epic 4 — Profile stats/favorites
- FR24 → Epic 1 (pattern) + Epic 4 (Diary/Profile surfaces) — warm empty states
- FR25 → Epic 2 — add to Watchlist
- FR26 → Epic 2 — Watchlist on Home + Profile
- FR27 → Epic 5 — follow/unfollow
- FR28 → Epic 5 — chronological feed
- FR29 → **Epic 1** — private-by-default is the default state of every row from first insert (RLS); *exercised* by the share path in Epic 5
- FR29a → **Epic 1** — visibility as a first-class schema property (nullable per-row override + `share_activity`); global share-toggle UI in Epic 5
- FR30 → Epic 5 — ❤️ from feed entry
- FR31 → Epic 5 — shared lists
- FR32 → Epic 5 — find/add friends
- FR33 → Epic 6 — per-title notify bell
- FR34 → Epic 6 — caught-up nudge
- FR35 → Epic 6 — genuine-new-episode pushes only
- FR36 → Epic 6 — global notifications toggle
- FR37 → Epic 6 — per-platform push channel + graceful degradation
- FR42 → Epic 3 — optional Recommendations shelf (may ship absent)
- FR43 → Epic 1 — 5-slot bottom tab bar + center (+) (tabs route to their epics' surfaces as they land)
- FR44 → Epic 1 — tap-to-act (no long-press required) — cross-cutting interaction principle
- FR45 → Epic 4 — theme switch to Paper White in Profile → Settings (persisted); *tokens defined + dark wired in Epic 1*

> **Structural note (party-mode review, 2026-07-02):** Epic 1 was reshaped from a broad "Foundation & Identity" epic into a thin **vertical walking skeleton** — it threads a single slice through every layer (auth → proxied catalog-search → log-a-watch via outbox → RLS wall) rather than building the whole substrate up front. The rest of "foundation" (full theming, full nav contents, remaining components) **accretes** as each feature epic needs it. Two structural corrections also landed: **private-by-default RLS + the visibility schema moved out of Epic 5 into Epic 1** (privacy is the default state of every row, not a social feature bolted on later), and the **go-live gates left Epic 7** to become a cross-cutting launch checklist (below).

## Epic List

### Epic 1: First Watch (Walking Skeleton)
A single vertical slice proving the whole architecture posture end-to-end: a user signs in (email/password + magic link, Google-free), searches a **real** title through the proxied catalog, logs a watch that **survives a network drop**, and **no other user can read it**. Deliberately thin — it establishes the four load-bearing invariants (auth, the proxy boundary, the local-first outbox, and the private-by-default RLS wall) plus the design-token system, then lets everything else grow onto them.
**FRs covered:** FR1, FR2, FR3, FR43, FR44; FR29, FR29a (visibility schema + private-by-default RLS); FR24 (empty-state pattern); seeds FR6 (search-only), FR14/FR15 (offline-persist log), FR45 (tokens + dark)
**Foundation:** Supabase self-hosted stack (ARCH-1), Expo scaffold + feature-modular structure + shared-types (ARCH-2), RLS-as-authorization + visibility schema (ARCH-5), Edge-Function discipline with **`catalog-search` only** (ARCH-6/ARCH-12 — the one function; no title-detail/seasons here), local-first outbox for the log path (ARCH-8), consistency conventions (ARCH-10), F-Droid-safe auth (ARCH-14); design tokens defined two-mode + **dark wired** (UX-DR1–3), bottom-nav shell (UX-DR13), tap-to-act + banned patterns + a11y + voice foundations (UX-DR20–25).
**Exit criterion (test):** a second user cannot `SELECT` the first user's watch, **and** a watch logged with the network disabled still persists and later syncs.

### Epic 2: Catalog & Discovery
Building on the skeleton's `catalog-search`, a user can search the catalog as they type, open a title detail (film, or show with seasons/episodes), and save titles to a Watchlist (❤️) surfaced on Home and Profile.
**FRs covered:** FR6 (completed), FR7, FR8, FR9, FR25, FR26
**Foundation:** `catalog-title` + fuller catalog proxy/cache (ARCH-12), NFR9 resilience; poster + placeholder (UX-DR5), title card (UX-DR6), search/detail error states (UX-DR16).

### Epic 3: The Core Log Loop
The sub-15-second log → rate → react loop, thickening the skeleton's minimal log path. Track a show/film, one-tap ✓ Watched with pointer advance, bulk-log a whole season, add a ½-star rating + mood chips + optional note, edit/remove a watch — all local-first and network-independent. The product's core promise.
**FRs covered:** FR10, FR11, FR12, FR13, FR14 (completed), FR15 (completed), FR16, FR17, FR18, FR19, FR20, FR21, FR42
**Foundation:** watch-as-atomic-unit (ARCH-7), local-first outbox extended to rating/mood/note (ARCH-8), derived pointer RPC (ARCH-9); star rating (UX-DR7), mood chip + **mood-set lock before build** (UX-DR8), watched badge (UX-DR10), bulk-log sheet (UX-DR11), cold-open skeletons (UX-DR15), watched-confirmed + rating prompt (UX-DR17), offline (UX-DR19), interaction primitives (UX-DR21).
**Exit criterion (test):** NFR1 — the log → rate loop completes at p95 ≤ 15 s on a mid-tier device from a warm start, rating included, with the network disabled.

### Epic 4: Watch-Memory — Diary, Profile & Settings
A Diary of the user's timestamped history (ratings, moods, notes) and a Profile ("You") with year stats, favorites, watchlist, and friends — where accumulated logs become an autobiography — plus the Settings surface (theme switch to Paper White, persisted). A standalone read layer over Epic 3's data.
**FRs covered:** FR22, FR23, FR24 (Diary/Profile surfaces), FR45 (theme switch in Settings; completes the tokens seeded in Epic 1), FR2 (profile display/stats)
**Foundation:** RLS-guarded reads over `watches`/`profiles` (ARCH-5); Diary/Profile empty states (UX-DR14), Paper White mode wired (UX-DR4).

### Epic 5: Light Social
On top of Epic 1's visibility schema, add the *sharing* exception branch: follow/unfollow friends, a chronological feed of their **visible** activity, ❤️ a title from the feed, shared lists, and the global "share my activity" toggle UI. Privacy stays default-off; this epic only opens the opt-in path.
**FRs covered:** FR27, FR28, FR30, FR31, FR32; FR29/FR29a *exercised* (schema + default owned by Epic 1)
**Foundation:** RLS follow-edge "shared" branch on the Epic 1 baseline (ARCH-5), NFR6 privacy; empty feed state (UX-DR14).

### Epic 6: Earned Notifications
A per-title notify bell, a caught-up nudge, and genuine new-episode pushes only, with a global toggle and graceful degradation where no push channel exists.
**FRs covered:** FR33, FR34, FR35, FR36, FR37
**Foundation:** pg_cron/pg_net enablement (ARCH-3), daily poller + fan-out (ARCH-11); notify bell (UX-DR12), caught-up dialog (UX-DR18). UnifiedPush wiring remains a build-time spike (architecture Deferred).

### Epic 7: Data Rights (Export & Delete)
A user can export all their data and delete their account (GDPR) — making "your history is yours" real.
**FRs covered:** FR4, FR5
**Foundation:** cascading GDPR export/delete Edge Functions (ARCH-13); NFR4/NFR5/NFR6/NFR11.

### Launch Checklist (cross-cutting go-live gates — not an epic)
Release gates that any epic can satisfy early; **go-live is blocked until all pass** (per architecture AD-9/AD-11):
- **Nightly off-box backup present** — a dated `pg_dump`/snapshot confirmed in off-box storage (ARCH-15).
- **EU/EEA hosting confirmed** — production VPS region verified (ARCH-16).
- Open-source + store/F-Droid distribution readiness (NFR4).

**Dependency flow:** 1 (skeleton, threads all layers) → 2 (thickens catalog) · 3 (thickens the log loop) → {4 reads 3 · 5 adds the share branch on 1's schema · 6 uses titles + tracking} → 7 (export/delete). Each epic is standalone and requires no later epic to function; the launch checklist is orthogonal and satisfied whenever convenient before go-live.

---

## Epic 1: First Watch (Walking Skeleton)

A single vertical slice proving the whole architecture posture end-to-end: sign in (Google-free), search a real title through the proxied catalog, log a watch that survives a network drop, and prove no other user can read it. Establishes the four load-bearing invariants (auth, proxy boundary, local-first outbox, private-by-default RLS) plus the design-token system, then lets everything else grow onto them.

### Story 1.1: Project foundation boots locally

As a developer,
I want the pinned self-hosted Supabase stack and the Expo client scaffolded and talking to each other locally,
So that every later story has a working, reproducible substrate to build on.

**Acceptance Criteria:**

**Given** a clean checkout
**When** I run the documented `docker compose up` in `supabase/`
**Then** the full stack (Postgres 17, GoTrue, PostgREST, Storage, Edge Functions runtime, Kong) starts from an explicitly pinned dated release tag recorded in-repo
**And** no service references a floating `latest` tag (ARCH-1, ARCH-13)

**Given** the stack is running
**When** the Expo app starts via the dev client
**Then** it initializes a single `supabase-js` client from `.env` (with `.env.example` tracked and the real `.env` untracked) and confirms connectivity with a health check

**Given** the monorepo layout
**When** I inspect the repo
**Then** it matches the structural seed (`app/features/{home,diary,add,feed,profile}`, `app/data`, `app/components`, `supabase/{migrations,functions}`, `packages/shared-types`) (ARCH-2)

**Given** the consistency conventions
**When** any schema or code is added
**Then** DB objects use `snake_case` and TS uses `camelCase`, and the shared error envelope is `{message, code, details}` (ARCH-10)

### Story 1.2: Create an account and sign in (Google-free)

As a new user,
I want to create an account and sign in with email/password or a magic link,
So that I have an identity the app can attach my history to — with no Google dependency.

**Acceptance Criteria:**

**Given** the sign-up screen
**When** I register with email + password
**Then** a GoTrue account is created and I receive a valid JWT session (FR1)

**Given** an existing account
**When** I request a magic link
**Then** I can sign in via the emailed link (FR1)

**Given** GoTrue configuration
**When** the enabled auth methods are inspected
**Then** only email/password and magic link are enabled — no Google/Firebase provider anywhere (FR3, ARCH-14, NFR3)

**Given** a new account
**When** it is created
**Then** a `profiles` row is created (uuid PK, `username text unique not null` (the `@handle`, captured at sign-up), `display_name`, nullable `avatar`, `share_activity boolean default false`)
**And** an RLS policy allows only the owner (`owner_id = auth.uid()`) to select/update it (FR2, ARCH-5)

**Given** the sign-up flow
**When** I choose my `@username`
**Then** it is required and validated unique (case-insensitive), and becomes my exact-match discovery handle (FR2, FR32, OQ#6)

**Given** an unauthenticated request
**When** it hits any PostgREST table
**Then** it is denied by default (no anonymous access)

### Story 1.3: Themed app shell with bottom navigation (dark mode)

As a user,
I want the app to open into the tv-time visual identity with the five-slot bottom navigation,
So that it feels like the product from first launch, not a generic demo.

**Acceptance Criteria:**

**Given** the design system
**When** tokens are defined
**Then** the full two-mode color, typography (Fraunces + DM Sans), spacing, radius, and elevation tokens exist as a single source (UX-DR1–3)
**And** only dark (VHS Dusk) is wired in this story (Paper White is Epic 4)

**Given** the app shell
**When** it renders
**Then** a persistent 5-slot bottom tab bar (Home · Diary · (+) · Feed · Profile "You") shows with the center (+) lifted, and active state carries icon + label, never color alone (FR43, UX-DR13, UX-DR25)

**Given** a brand-new user with no data
**When** Home renders
**Then** it shows the warm empty state ("Your story starts here. What did you watch tonight?") routing into (+), never cold zeroes (FR24, UX-DR14)

**Given** core navigation controls
**When** I use them
**Then** all are reachable tap-to-act with no long-press required, tap targets ≥ 44pt/48dp, and screen-reader labels expose role + state (FR44, UX-DR21, UX-DR23, UX-DR24)

**Given** any system copy in the shell
**When** shown
**Then** it follows the warm voice (one emoji max) with none of the banned patterns — no streaks, guilt, or nags (UX-DR20, UX-DR22)

### Story 1.4: Search a real title through the proxied catalog

As a user,
I want to search for a real film or show and see results,
So that I can find the title I'm about to log — while the app never holds the catalog key.

**Acceptance Criteria:**

**Given** the `catalog-search` Edge Function
**When** the client searches a query
**Then** results (poster, title, year, `media_type`) return via the function only — the client never calls TMDB directly and holds no TMDB key (FR6 seed, ARCH-6, ARCH-12)

**Given** the function fetches from TMDB
**When** it returns
**Then** it reads/writes `catalog_cache` (`tmdb_id`, `media_type`, `payload jsonb`, `fetched_at`) with a TTL and is the sole caller of the external catalog

**Given** any result referencing a title
**When** it is represented
**Then** it is keyed by `tmdb_id` + `media_type` (`'movie' | 'tv'`) per ARCH-10 — no local titles table, no synonym columns

**Given** the caller
**When** it invokes `catalog-search`
**Then** the function verifies the GoTrue JWT and rejects unsigned requests, emitting `{message, code, details}` on error

**Given** scope
**When** this story is built
**Then** it delivers search only — no title-detail, seasons, or episodes (those are Epic 2)

### Story 1.5: Log a watch, local-first, surviving a network drop

As a user,
I want to log that I watched something and have it stick even with no connection,
So that logging is truly faster than forgetting and never lost.

**Acceptance Criteria:**

**Given** a title from search
**When** I log a watch
**Then** a row is written synchronously to a local `expo-sqlite` `pending_watches` table before any network call (ARCH-8)

**Given** the network is disabled
**When** I log a watch
**Then** the commit still succeeds locally with a soft confirmation ("Logged — nice one.") (FR14 seed, UX-DR17 subset)

**Given** connectivity returns
**When** the sync worker runs
**Then** it drains the outbox into a `watches` row via PostgREST (uuid PK, `user_id` FK, `tmdb_id`, nullable `tmdb_episode_id`, `watched_at timestamptz`) (FR15 seed, ARCH-7, ARCH-10)

**Given** a created watch
**When** persisted
**Then** rating/mood/note columns exist on the row but are null (populated in Epic 3), and the row is not modeled on a titles/catalog entity (ARCH-3)

**Given** the `watches` table
**When** created
**Then** it ships with an owner-only RLS policy (`user_id = auth.uid()`) and a nullable `visibility` column defaulting to null (ARCH-5)

### Story 1.6: Prove the private-by-default wall

As any user,
I want my logged history to be invisible to everyone by default,
So that nothing I record is ever exposed without my explicit choice.

**Acceptance Criteria:**

**Given** the visibility schema
**When** defined
**Then** owner-scoped content tables carry a nullable per-row `visibility` override, `profiles.share_activity` defaults false, and the SELECT policy computes `effective_visibility` = row override else the owner's global toggle (FR29a, ARCH-5)

**Given** private-by-default
**When** user B (follower or not) queries user A's watches
**Then** zero rows are returned, because A has not opted in (FR29)

**Given** deny-by-default
**When** any table is exposed through PostgREST
**Then** it has an explicit RLS policy — an audit confirms no table is reachable without one (ARCH-5)

**Given** the epic exit test
**When** user A logs a watch with the network off and later syncs
**Then** the watch persists AND user B still cannot read it — the two skeleton guarantees hold together

---

## Epic 2: Catalog & Discovery

Building on the skeleton's `catalog-search`, a user can search the catalog as they type, open a title detail (film, or show with seasons/episodes), and save titles to a Watchlist surfaced on Home.

### Story 2.1: Full search experience

As a user,
I want catalog results to appear as I type, with graceful handling when the catalog is unreachable,
So that finding a title is instant and never a dead end.

**Acceptance Criteria:**

**Given** the search screen
**When** I type a query
**Then** results update as-you-type (debounced) showing poster, title, year, and `media_type` via `catalog-search` (FR6)

**Given** a missing or still-loading poster
**When** a result renders
**Then** a cool→dark gradient placeholder with a glyph shows, never a broken image (FR9, UX-DR5)

**Given** the catalog is unreachable
**When** a search fails
**Then** a clear retry state shows ("Couldn't reach the catalog — check your connection and try again.") and the typed query is preserved (FR8, UX-DR16)

**Given** no matches
**When** results are empty
**Then** warm empty-search copy shows ("Hmm, nothing by that name. Try another spelling or title?") with no auto-suggestions

### Story 2.2: Title detail for films and shows

As a user,
I want to open a title and see its details — seasons and episodes for shows —
So that I know exactly what I'm tracking or logging.

**Acceptance Criteria:**

**Given** a search result
**When** I tap it
**Then** a title detail view opens showing poster, synopsis, and year via a new `catalog-title` Edge Function (FR7, ARCH-12)

**Given** a show
**When** detail loads
**Then** its seasons and their episodes are listed; **given** a film, only title-level metadata shows (FR7)

**Given** `catalog-title`
**When** it fetches
**Then** it proxies TMDB server-side, reads/writes `catalog_cache` with a TTL as the sole caller, and verifies the GoTrue JWT (ARCH-6, ARCH-12)

**Given** a detail fetch error
**When** it fails
**Then** cached basics show if available, else "We couldn't load this right now." with retry — never a blank screen (FR8, UX-DR16)

**Given** the title-card pattern
**When** a title renders in any list
**Then** it is poster-left with title (Fraunces) / meta / star row / mood chips right, on `surface-raised`, tapping into detail (UX-DR6)

### Story 2.3: Save a title to the Watchlist

As a user,
I want to ❤️ any title to a watchlist for later,
So that I can trust the app to remember what I want to watch.

**Acceptance Criteria:**

**Given** a title from search or detail
**When** I tap ❤️
**Then** a `watchlist_items` row is created (uuid PK, `user_id` FK, `tmdb_id`, `media_type`, `created_at`) with an owner-only RLS policy and nullable `visibility` (FR25, ARCH-5, ARCH-10)

**Given** an already-watchlisted title
**When** I tap ❤️ again
**Then** it toggles off (removes) — idempotent, never duplicating an entry

**Given** the add affordance
**When** shown
**Then** it is reachable tap-to-act (no long-press) from search results and title detail (FR25, FR44)

**Given** a successful add
**When** it confirms
**Then** warm copy acknowledges it ("We'll tell you when it's time.") with one emoji max (UX-DR20)

### Story 2.4: Watchlist shelf on Home

As a user,
I want my watchlist to appear as a shelf on Home,
So that the things I saved are one glance away.

**Acceptance Criteria:**

**Given** watchlist items
**When** Home renders
**Then** a horizontally-scrolling Watchlist shelf shows their title cards, each tapping into title detail (FR26, UX-DR6)

**Given** an empty watchlist
**When** the shelf renders
**Then** the warm empty state shows ("Save something for later — tap ❤️ on any title.") (FR24, UX-DR14)

**Given** a poster with missing art
**When** a shelf card renders
**Then** the gradient placeholder shows (UX-DR5)

**Given** Profile surfacing (FR26)
**When** Profile is built in Epic 4
**Then** the same watchlist data is surfaced there — this story owns the Home shelf and the underlying data

---

## Epic 3: The Core Log Loop

The sub-15-second log → rate → react loop, thickening the skeleton's minimal log path. Track a show/film, one-tap ✓ Watched with pointer advance, bulk-log a season, rate + react + note, edit/remove — all local-first and network-independent.

> **Mood-chip set (LOCKED, per FR18 canonical):** 😭 moved · 😂 funny · 😱 shocked · 🥰 loved it · 🤯 mind-blown · 😴 boring · 😬 cringe · 🔥 thrilling. Enforced as a Postgres `CHECK` constraint on `moods text[]` (ARCH-10). (OQ#5 resolved 2026-07-02; `DESIGN.md` reconciled — follow-up done.)
>
> **Epic exit gate — NFR1:** the log → rate loop completes at p95 ≤ 15 s on a mid-tier device from a warm start, rating included, with the network disabled (start = tap on the Up Next card; stop = rating prompt dismissed or submitted).
>
> **Pointer-RPC contract (architecture note, party-mode 2026-07-02):** the single-writer pointer RPC (AD-10) is **derive/recompute-from-the-full-watch-set**, not a monotonic increment — so the same function correctly serves both organic *advance* (log) and *recompute-after-delete* (Story 3.7), and is idempotent under retry. Recommend renaming AD-10's `advance_next_episode_pointer` → `recompute_next_episode_pointer` in the architecture spine to stop the name implying forward-only.

### Story 3.1: Track a show or film into Up Next

As a user,
I want to start tracking a show or film so it appears in Home / Up Next,
So that what I'm watching is waiting for me the moment I open the app.

**Acceptance Criteria:**

**Given** a title detail
**When** I choose "I'm watching this"
**Then** a `tracked_shows` row is created (uuid PK, `user_id` FK, `tmdb_id`, `media_type`, `next_episode_pointer` nullable, `created_at`) with owner-only RLS and nullable `visibility` (FR10, ARCH-5, ARCH-10)

**Given** a tracked show
**When** it is created
**Then** its `next_episode_pointer` is initialized to the first unwatched episode via the `advance_next_episode_pointer` RPC — never client-computed (ARCH-9)

**Given** tracked titles
**When** Home opens
**Then** they appear in an Up Next shelf, cold-open showing cached data instantly with skeletons for uncached shelves (FR10, UX-DR15)

**Given** an already-tracked title
**When** I try to track it again
**Then** it is not duplicated

### Story 3.2: One-tap ✓ Watched advances the pointer

As a user,
I want a single ✓ Watched to log the current episode and advance to the next,
So that keeping up with a show is one tap from Up Next.

**Acceptance Criteria:**

**Given** a tracked show in Up Next with its next episode pre-selected
**When** I tap ✓ Watched
**Then** the episode commits instantly via the outbox with a soft confirmation, and the pointer advances through the `advance_next_episode_pointer` RPC (FR11, ARCH-9)

**Given** the network is disabled
**When** I tap ✓ Watched
**Then** the commit still succeeds and later syncs — rating and catalog latency never block it (FR14 completed, tested with network off)

**Given** a committed episode watch
**When** persisted
**Then** it carries a `watched_at timestamptz` at log time and a nullable `tmdb_episode_id` (FR15 completed)

**Given** the client
**When** it advances progress
**Then** it never issues a raw `PATCH` against `tracked_shows.next_episode_pointer` — only the RPC (ARCH-9)

**Given** the Watched control
**When** rendered
**Then** it is a rounded-sm primary-fill uppercase badge/continue pill, and announces its state change to screen readers (UX-DR10, UX-DR23)

### Story 3.3: Log a film in one action

As a user,
I want to log a film as watched in a single action,
So that films are as fast to record as episodes.

**Acceptance Criteria:**

**Given** a film title
**When** I log it watched
**Then** a single `watches` row is created (null `tmdb_episode_id`, `watched_at` at log time) via the outbox, instant and network-independent (FR12, FR14, FR15)

**Given** a film
**When** logged
**Then** no next-episode pointer is involved (films are single watches)

**Given** a soft confirmation
**When** the log commits
**Then** warm copy acknowledges it, one emoji max (UX-DR17, UX-DR20)

### Story 3.4: Bulk-log a whole season

As a user,
I want to mark an entire season watched in one confirmation,
So that a binge is one action, not one tap per episode.

**Acceptance Criteria:**

**Given** a season row on title detail
**When** I choose "Mark whole season watched"
**Then** a bulk-log sheet opens with all episodes pre-checked (deselect, don't select) (FR13, UX-DR11)

**Given** the sheet
**When** I deselect any episodes and confirm once
**Then** one `watches` row per selected episode is committed via the outbox, and the pointer advances to the next unwatched episode via the RPC (FR13, ARCH-9)

**Given** the bulk sheet
**When** I confirm
**Then** I may optionally apply a single season-level rating/mood applied to the season (FR13)

**Given** the commit
**When** it lands
**Then** a warm confirmation acknowledges the binge ("That's a whole season in one sitting. Respect.") (UX-DR20)

### Story 3.5: Rate and react after a watch

As a user,
I want an optional rating and mood reaction offered right after a watch,
So that I can capture how it felt then — without ever being forced to.

**Acceptance Criteria:**

**Given** a committed watch
**When** the commit lands
**Then** a rating prompt slides up ("How was it?") with a ½-step 5-star row (gold) and the locked mood-chip set, and a one-tap **Skip** always present — it never blocks the watch (FR17, UX-DR7, UX-DR8, UX-DR17)

**Given** the rating prompt
**When** I set a rating and/or select 0–2 mood chips
**Then** they are written to the same local outbox row as the watch (single unit if still pending, else a `PATCH` on the synced row) — never a bare `PATCH` assumed to hit an unsynced row (ARCH-8)

**Given** a watch logged with the network off and a rating tapped *before* it syncs (the fast-path hazard)
**When** the network is restored and the sync worker runs
**Then** the rating and the watch arrive as a **single** `watches` row — never a lost `PATCH` against a not-yet-existing server row (AD-4/ARCH-8) — *named regression test, must be automated*

**Given** persistence
**When** rating/moods save
**Then** `rating` is a `smallint` (0–10 = 0–5★) and `moods` is a `text[]` constrained by the `CHECK` to the locked set — validated in the DB, not only client-side (FR18, ARCH-10)

**Given** an existing rating/mood on a watch
**When** I re-tap to change it
**Then** that watch's row updates, and reactions on other (earlier) watches of the same title are preserved, not overwritten — each reaction is bound to its own watch's timestamp (FR19, FR20, ARCH-3)

**Given** Reduce Motion is on
**When** the prompt appears
**Then** reward/confirmation animations are skipped and the result shows immediately; stars announce their value and chips announce their name to screen readers (UX-DR25, UX-DR23)

### Story 3.6: Attach an optional note to a watch

As a user,
I want to add a short note to a watch,
So that I can remember a specific thought about that viewing.

**Acceptance Criteria:**

**Given** a watch (in the rating prompt or later from the Diary)
**When** I add a note
**Then** a plain-text note (~500-char cap) is stored on that `watches` row (FR21)

**Given** the note field
**When** I reach the cap
**Then** input is bounded with a clear indication, and the note is optional throughout — never required to commit a watch

**Given** an existing note
**When** I edit or clear it
**Then** only that watch's note changes (bound to the watch, per FR20)

### Story 3.7: Edit or remove a logged watch

As a user,
I want to correct or delete a logged watch,
So that my history stays trustworthy when I mistap.

**Acceptance Criteria:**

**Given** a logged watch in the Diary or title detail
**When** I edit its date, rating, moods, or note
**Then** the change persists to that `watches` row via PostgREST, guarded by owner-only RLS (FR16, ARCH-5)

**Given** a logged watch on a tracked show
**When** I remove it (including un-logging an episode *behind* the current pointer)
**Then** the watch is deleted and the pointer is **recomputed from the full remaining watch set** via the single-writer pointer RPC — which derives, never increments, so it can move the pointer backward correctly and is never client-computed (FR16, ARCH-9; see Epic 3 pointer-RPC note)

**Given** any edit/remove
**When** performed
**Then** it is reachable tap-to-act with no long-press required (FR44)

### Story 3.8: Optional Recommendations shelf (non-blocking)

As a user,
I want a light recommendations shelf on Home,
So that I might discover something — but it never gets in the way of logging.

**Acceptance Criteria:**

**Given** Home
**When** it renders
**Then** it *may* show a Recommendations shelf built from at most a simple non-LLM heuristic or curated list — and it **may ship absent/empty** (FR42)

**Given** a slow or empty recommendation source
**When** Home loads
**Then** the shelf shows a skeleton or is simply omitted — it never blocks the log loop or any user journey (FR42, UJ-1)

**Given** a recommended title
**When** I tap ❤️ on it
**Then** it is added to my Watchlist (reusing Epic 2's watchlist path)

---

## Epic 4: Watch-Memory — Diary, Profile & Settings

A Diary of the user's timestamped history and a Profile ("You") with stats, favorites, watchlist, and friends — plus the Settings surface (theme switch to Paper White). A standalone read layer over Epic 3's data.

### Story 4.1: The Diary — your chronological watch history

As a user,
I want a Diary of everything I've watched with my ratings, moods, notes, and dates,
So that my history reads like an autobiography.

**Acceptance Criteria:**

**Given** my watches
**When** I open Diary
**Then** they show in reverse-chronological order with title/episode, star rating, mood chips, note, and date (FR22)

**Given** the multi-watch model
**When** a title was watched more than once
**Then** each watch appears as its own dated entry with its own reaction — none collapsed into a single score (FR20, ARCH-3)

**Given** RLS
**When** Diary loads
**Then** it reads only my own rows through the PostgREST owner policy (ARCH-5)

**Given** an empty Diary
**When** I have no watches
**Then** the warm empty state shows ("Nothing logged yet — tonight's episode is your first entry.") linking to (+) (FR24, UX-DR14)

**Given** a Diary entry
**When** I tap it
**Then** I can edit or remove it (reusing Story 3.7)

### Story 4.2: Profile ("You") — stats, favorites, watchlist, friends

As a user,
I want a Profile showing my year stats and shelves,
So that my taste visibly accumulates in one place.

**Acceptance Criteria:**

**Given** my profile
**When** I open "You"
**Then** it shows my display name + optional avatar and aggregate stats — year counts of films/shows/episodes — derived from my watches (FR2, FR23)

**Given** favorites, watchlist, and friends
**When** Profile renders
**Then** it surfaces favorites, the Watchlist (reusing Epic 2's data), and a friends/following section (populated once Epic 5 exists) (FR23, FR26)

**Given** the aggregation rule
**When** stats and favorites are derived against the multi-watch, timestamped model
**Then** year stats = raw episode-watch count + distinct-title film/show counts for that year (by `watched_at`, user-local), and favorites = distinct titles with a **max watch-rating ≥ 4.5★** ordered by most-recent qualifying watch — uses max, never collapses the multi-watch Diary (FR23, OQ#10 resolved)

**Given** a brand-new Profile
**When** no data exists
**Then** the warm empty state shows ("Your shelf is empty for now — everything you watch lands here.") with a first-log CTA (FR24, UX-DR14)

**Given** RLS
**When** Profile loads
**Then** it reads only the owner's data (ARCH-5)

### Story 4.3: Settings — switch to Paper White (persisted)

As a user,
I want to switch to the Paper White light theme in Settings,
So that the app suits daytime and my preference sticks.

**Acceptance Criteria:**

**Given** Settings (in Profile)
**When** I switch theme to Paper White
**Then** the app re-themes using the light token set with consistent role mapping, and the choice persists across launches (FR45, UX-DR4)

**Given** the token system from Epic 1
**When** Paper White is wired
**Then** it completes the two-mode design (dark remains default) and no behavior depends on the active theme (UX-DR1, UX-DR4)

**Given** either theme
**When** active
**Then** contrast holds and color is never the sole signal (NFR7, UX-DR25)

**Given** the Settings surface
**When** built
**Then** it also hosts the global notifications toggle (implemented in Epic 6) — this story owns the Settings surface and the theme switch

### Story 4.4: Edit your profile (display name + avatar)

As a user,
I want to set my display name and upload an avatar,
So that my Profile feels like mine, not a default.

**Acceptance Criteria:**

**Given** my Profile
**When** I edit my display name
**Then** `profiles.display_name` updates via PostgREST under owner-only RLS (FR2, ARCH-5)

**Given** an avatar image
**When** I upload one
**Then** it is stored in a Supabase Storage bucket with owner-scoped access, and `profiles.avatar` references it (FR2)

**Given** no avatar set
**When** my Profile renders
**Then** a graceful default (initial/placeholder) shows — never a broken image (consistent with UX-DR5's no-broken-image rule)

**Given** the edit affordance
**When** used
**Then** it is reachable tap-to-act with no long-press (FR44), and changes persist across launches

---

## Epic 5: Light Social

Follow friends, see a chronological feed of their visible activity, ❤️ from the feed, and create shared lists — all private-by-default.

> **RLS note:** Epic 1 established owner-only RLS + the visibility schema (`share_activity`, per-row `visibility`). This epic ALTERs those SELECT policies to add the follow-edge "shared" branch once `follows` exists. Nothing here weakens private-by-default; it only opens an explicit opt-in path.

### Story 5.1: Follow friends and find them

As a user,
I want to follow other users and find friends,
So that I can see what people I trust are watching.

**Acceptance Criteria:**

**Given** another user
**When** I follow them
**Then** a `follows` row is created (`follower_id`, `followee_id`, both FK to `auth.users`, both `ON DELETE CASCADE`) with RLS so a user manages only their own follow edges (FR27, ARCH-13)

**Given** a followed user
**When** I unfollow
**Then** the edge is removed idempotently

**Given** friend discovery
**When** I do an exact `@username` lookup or open a share/deep link
**Then** I can find and add that user — exact-match only, no fuzzy browsing (FR32, OQ#6 resolved)

**Given** my following list
**When** I view it
**Then** it lists everyone I follow

### Story 5.2: Opt in to sharing my activity

As a user,
I want a single toggle to share my activity with friends,
So that my history stays private until I choose otherwise.

**Acceptance Criteria:**

**Given** Settings
**When** I flip "share my activity with friends" on
**Then** `profiles.share_activity` becomes true (default false) (FR29a)

**Given** the SELECT policies
**When** this epic is built
**Then** owner-scoped content tables' policies are ALTERed to add the follow-edge branch: a follower sees a row when `effective_visibility = 'shared'` (row override else my global toggle) (FR29, FR29a, ARCH-5)

**Given** I have not opted in
**When** any follower queries my activity
**Then** they see nothing — private-by-default is preserved

**Given** I opt back out
**When** I flip the toggle off
**Then** followers immediately stop seeing my entries

### Story 5.3: The chronological activity feed

As a user,
I want a reverse-chronological feed of my friends' visible activity,
So that discovery feels like word-of-mouth, not an algorithm.

**Acceptance Criteria:**

**Given** people I follow who have opted in
**When** I open Feed
**Then** I see their recent visible watches, ratings, moods, and notes in strict reverse-chronological order (FR28)

**Given** the feed
**When** it renders
**Then** it is never engagement-ranked or algorithmic (FR28, UX-DR22)

**Given** RLS
**When** the feed queries
**Then** it returns only rows the owner made visible via the shared branch — never a client-side visibility check (ARCH-1)

**Given** an empty feed
**When** no visible activity exists
**Then** the warm empty state shows ("It's quiet in here. Find a friend and see what they're loving.") → add-friend (FR24, UX-DR14)

### Story 5.4: Add to watchlist from a feed entry

As a user,
I want to ❤️ a title straight from a feed entry,
So that a friend's reaction can become my watchlist.

**Acceptance Criteria:**

**Given** a feed entry
**When** I tap ❤️ on its title
**Then** it is added to my Watchlist (reusing Epic 2's watchlist path) (FR30)

**Given** a feed entry
**When** I tap it
**Then** I can read the full note/reaction

### Story 5.5: Shared lists

As a user,
I want to create named lists of titles and share them with friends,
So that I can curate collections beyond my watchlist.

**Acceptance Criteria:**

**Given** lists
**When** I create one
**Then** `lists` (uuid, `owner_id`, `name`) and `list_items` (`list_id`, `tmdb_id`, `media_type`) rows are created with owner-only mutate RLS (FR31, ARCH-5)

**Given** a list
**When** I make it visible to friends
**Then** followers see it via the same follow-edge shared branch (FR31)

**Given** scope
**When** built
**Then** v1 lists are private-or-follower-visible only; selective per-recipient sharing (`list_shares`) is deferred (architecture Deferred)

**Given** list membership
**When** I add/remove titles
**Then** only my own lists are mutable

---

## Epic 6: Earned Notifications

A per-title notify bell, a caught-up nudge, and genuine new-episode pushes only, with a global toggle and graceful degradation where no push channel exists.

### Story 6.1: Per-title notify bell + global toggle

As a user,
I want a notify bell on each title and a global switch,
So that I control exactly what pings me.

**Acceptance Criteria:**

**Given** a title detail
**When** I toggle the notify bell
**Then** a `notify_bells` row (`user_id`, `tmdb_id`, `media_type`, on/off) is set with owner-only RLS, independent of whether the title is tracked (FR33, ARCH-5)

**Given** the bell UI
**When** off→on
**Then** it renders outline→gold fill (UX-DR12)

**Given** Profile → Settings
**When** I toggle global notifications
**Then** it governs delivery overall, while per-title bells govern only their own title (FR36)

**Given** a title I'm not tracking
**When** I set its bell
**Then** alerts still work — the bell is independent of tracking (FR33)

### Story 6.2: Caught-up nudge

As a user,
I want to be offered alerts when I finish everything available,
So that I don't have to remember to check back.

**Acceptance Criteria:**

**Given** a tracked show
**When** I log the last available episode/season
**Then** a contextual dialog offers to enable alerts ("You're all caught up on {show} — want a nudge when new episodes drop?") (FR34, UX-DR18)

**Given** the dialog
**When** I accept
**Then** the title's notify bell turns on (reusing Story 6.1)

**Given** the caught-up state
**When** shown
**Then** it uses the gold caught-up affordance and warm voice (UX-DR18, UX-DR20)

**Given** I decline
**When** I dismiss it
**Then** no nag repeats — no re-engagement pattern (UX-DR22)

### Story 6.3: Device registration + per-build push channel

As a user,
I want the app to register for push on my platform,
So that alerts can reach me — or degrade gracefully when they can't.

**Acceptance Criteria:**

**Given** app launch with notifications granted
**When** registering
**Then** a `push_devices` row records the token and channel per build (APNs iOS / FCM Play Store / UnifiedPush F-Droid) with owner-only RLS (FR37, ARCH-11)

**Given** the F-Droid build with no UnifiedPush distributor installed
**When** no channel is available
**Then** the app degrades gracefully — in-app "what's new" surfaces new-episode info on next open, and it never pretends a push was sent (FR37)

**Given** the F-Droid build
**When** a push transport is chosen
**Then** no Google/Firebase dependency is used (NFR3)

**Given** UnifiedPush wiring
**When** built
**Then** the config-plugin integration + F-Droid CI variant is handled as a build-time spike (architecture Deferred) — this story owns registration, channel selection, and degradation

### Story 6.4: Daily new-episode poller and fan-out

As a user,
I want alerts only when a genuinely new episode drops,
So that notifications are trustworthy, never spam.

**Acceptance Criteria:**

**Given** the scheduler
**When** enabled
**Then** `pg_cron` + `pg_net` are turned on via an explicit `CREATE EXTENSION` + `shared_preload_libraries` migration (ARCH-3)

**Given** a daily cadence
**When** `pg_cron` fires
**Then** it invokes `poll-new-episodes` once daily via `pg_net` over Docker-internal networking (never localhost) (ARCH-11)

**Given** the poller
**When** it runs
**Then** it walks distinct `tmdb_id` (`media_type = 'tv'`) with an active bell, diffs against `known_episode_state` (separate from `catalog_cache`), and fans out per `push_devices` channel — the only path that sends a push (FR35, ARCH-11)

**Given** delivery
**When** it fans out
**Then** pushes fire only on genuine new-episode availability — no digests, no re-engagement, no streak nags, in the warm voice (FR35, UX-DR22, NFR10)

**Given** stale or missing air-dates
**When** catalog data is unreliable
**Then** the poller avoids firing false pushes (bounded handling per addendum H3)

---

## Epic 7: Data Rights (Export & Delete)

A user can export all their data and delete their account (GDPR) — making "your history is yours" real.

### Story 7.1: Export my data

As a user,
I want to export all my data anytime,
So that my history is mine and never vendor-locked.

**Acceptance Criteria:**

**Given** my account
**When** I request an export
**Then** an `export-my-data` Edge Function returns a portable file (JSON baseline) of my watches, ratings, moods, notes, watchlist, lists, follows, and profile (FR4, NFR5)

**Given** completeness
**When** the export runs
**Then** it enumerates owner-scoped tables by FK introspection (not a hardcoded list), so new tables are included automatically (ARCH-13)

**Given** auth
**When** it is called
**Then** it verifies the JWT and exports only the caller's own data (ARCH-5)

**Given** the wind-down pledge
**When** the instance is ever shut down
**Then** this same export is the mechanism for each user's final full export (NFR11)

### Story 7.2: Delete my account

As a user,
I want to delete my account and all my data,
So that I can leave cleanly and completely.

**Acceptance Criteria:**

**Given** my account
**When** I confirm deletion
**Then** a `delete-my-account` Edge Function deletes the `auth.users` row and all personal data cascades away (FR5, NFR6)

**Given** cascading
**When** built
**Then** every FK referencing `auth.users.id` is `ON DELETE CASCADE`, including self-referential `follows.follower_id` AND `follows.followee_id` (both directions unwind) (ARCH-13)

**Given** a table added later
**When** it references `auth.users`
**Then** it is covered by cascade, not hand-maintained delete code (ARCH-13)

**Given** GDPR
**When** deletion completes
**Then** no residual personal data remains (NFR6)

---

## Launch Checklist — Go-Live Gates (cross-cutting, not an epic)

Ops/infra gates satisfied whenever convenient before launch; **go-live is blocked until all pass** (architecture AD-9/AD-11). Tracked as release-checklist items, not user stories:

- [ ] **Nightly off-box backup present** — a dated `pg_dump`/snapshot confirmed in off-box storage (ARCH-15).
- [ ] **EU/EEA hosting confirmed** — production VPS region verified (ARCH-16).
- [ ] **Open-source + distribution readiness** — public buildable source; App Store + Google Play + F-Droid pipelines (NFR4).
- [ ] **TMDB licensing + fallback verified** — terms/attribution/F-Droid compat confirmed, fallback catalog named (PRD OQ#11).
