# Review: Version & Reality-Check Verification — ARCHITECTURE-SPINE.md

**Reviewer lens:** every committed decision/version claim must be web-researched or reality-checked, not asserted from training data.

**Verdict:** The stack is overwhelmingly accurate and current as of July 2026 (Expo SDK 56, Postgres 17-in-Supabase, pg_cron/pg_net bundling, the Docker-networking `localhost` gotcha, and `expo-unified-push`'s Android-only scope all check out against live sources), but one line-item is stale and internally inconsistent with its own table: the pinned TypeScript version.

---

## Findings

### 1. TypeScript version claim is stale and self-contradicting — **HIGH**

- **Claimed:** `TypeScript | latest 5.x, shared across client + Edge Functions`
- **Found:** TypeScript 6.0 shipped March 23, 2026 (the last JS-based compiler release before the Go-based TS7 rewrite; TS7 itself reached RC on June 18, 2026, with stable expected within about a month of that — i.e., right around this document's July 2, 2026 date). More importantly, **Expo SDK 56 itself — pinned two rows above in the same Stack table — bumps its own TypeScript baseline to 6.0.3.** So "latest 5.x" is not just outdated, it directly contradicts the Expo SDK 56 row in the same table.
- **Why it matters:** TS 6.0 has real breaking changes relevant to this stack — `target` now defaults to ES2023 (was ES3), `module` defaults to ESNext, and `types` defaults to an empty array instead of auto-pulling all `@types` packages (this last one can silently break Deno/Edge Function type resolution if `@types` packages were being picked up implicitly). Anyone scaffolding from this spine and pinning `typescript@^5` will diverge from what Expo SDK 56 actually ships and test against a materially different compiler.
- **Fix:** update to `latest 6.x (matches Expo SDK 56's TS 6.0.3 baseline)` and note the `types` default-empty-array change if Edge Function tsconfig relies on ambient `@types`.

### 2. Postgres 17 pin — accurate, but worth a footnote — **LOW**

- **Claimed:** `Postgres (bundled in Supabase image) | 17`
- **Found:** Correct and current *for Supabase specifically*. Supabase's self-hosted `docker-compose.yml` only moved its default db image from Postgres 15 → 17 as of mid-June 2026, and Supabase has not yet shipped Postgres 18 support (community discussions as of June 2026 still show no GA date). So pinning 17 isn't a stale choice, it's the only current option.
- **Context for the reader:** upstream/vanilla PostgreSQL is a generation ahead of what's cited — Postgres 18 GA'd September 25, 2025, and Postgres 19 hit Beta 1 on June 4, 2026. This is fine as written (the row is explicitly scoped to "bundled in Supabase image," not vanilla Postgres) but could be read as implying 17 is the latest Postgres overall, which it isn't. No action required beyond awareness; not worth a doc change.

### 3. pg_cron/pg_net "bundled" claim — confirmed accurate, one implementation nuance — **LOW**

- **Claimed:** `pg_cron, pg_net (Postgres extensions) | bundled in the self-hosted Supabase Postgres image`
- **Found:** Confirmed via Supabase docs and the `supabase/postgres` image description ("Unmodified Postgres with some useful extensions") — both `pg_cron` and `pg_net` ship pre-compiled in the self-hosted image.
- **Nuance not stated in the doc:** "bundled" means the extension binary is available, not auto-enabled — `pg_cron` requires `shared_preload_libraries` configuration and `CREATE EXTENSION pg_cron` before AD-5's `poll-new-episodes` scheduling can run, and there are live GitHub issues (e.g., supabase/supabase#42413) about `pg_cron`/Supabase Cron friction with custom DB names on self-hosted setups. Not a factual error in the spine, but AD-5's build-time execution should account for an explicit enable step, not assume "bundled" means "on."

### 4. Docker-internal networking gotcha (AD-5) — confirmed accurate — **none (informational)**

- **Claimed:** "`pg_net` ... over Docker-internal networking (never `localhost`/`127.0.0.1` — the DB container cannot reach itself that way)."
- **Found:** Confirmed against Supabase's own GitHub discussions on this exact topic: inside a Docker container, `localhost` resolves to that container's own network namespace, not the host or sibling containers. Reaching the Edge Functions container requires the Compose service name (Docker-internal DNS) or `host.docker.internal` for host-machine targets. AD-5's rule is technically correct as written.

### 5. `expo-unified-push` fit-for-purpose check — confirmed accurate — **none (informational)**

- **Claimed (Stack + Deferred):** Android-only UnifiedPush integration for Expo/RN, used for the F-Droid push path.
- **Found:** `expo-unified-push` (npm, under the `expo-community` GitHub org) is described by its own docs as "Expo integration of the android UnifiedPush library... only supported on Android at the moment," explicitly recommending `expo-notifications` or RN push libs for iOS. This matches AD-5/Deferred's framing exactly.
- **One thing the doc doesn't flag:** this is a third-party community package (`expo-community` org), not an official Expo SDK module — i.e., it carries the usual solo-maintainer external-dependency risk. The spine already treats the whole UnifiedPush wiring as a "Deferred... hands-on spike," so this is adequately hedged already; no doc change needed, just confirming the risk framing holds up.

### 6. Remaining Stack table rows — confirmed accurate, no changes needed

- **Expo SDK 56 / React Native 0.85 / React 19.2:** confirmed — Expo SDK 56 released May 21, 2026, ships RN 0.85 and React 19.2. Matches doc's parenthetical exactly.
- **`@tanstack/react-query` latest 5.x:** confirmed — still v5 as of the most recent release (June 27, 2026); no v6 exists yet. Claim holds, unlike the TypeScript row.
- **`expo-sqlite` latest matching Expo SDK 56:** confirmed — current published version is `56.0.5`, aligned to SDK 56, with SDK 56 changelog specifically calling out native `ArrayBuffer` blob support relevant to this package.
- **`expo-notifications` (iOS APNs, Play Store Android FCM):** description is accurate. Worth noting (not a version error) that Android push requires the FCM HTTP v1 API with a service-account OAuth setup — the legacy FCM API was fully shut down back in September 2024 — so "Play Store Android FCM" implies more setup than the one-line stack entry suggests. This is an implementation-detail gap, not a factual/version error.
- **Docker Engine / Docker Compose `20.10+ / v2+`:** confirmed still valid/current — Compose spec is at v5.0 ("Mont Blanc," Dec 2025) and the CLI plugin is well past v2.24 as of mid-2026; the stated floor versions remain compatible and not stale.

---

## Summary Table

| # | Item | Severity | Status |
| - | --- | --- | --- |
| 1 | TypeScript pinned to "latest 5.x" while Expo SDK 56 (same table) ships TS 6.0.3; TS 6.0 has been out since March 2026 | High | Needs fix |
| 2 | Postgres 17 pin | Low | Accurate, footnote only |
| 3 | pg_cron/pg_net "bundled" | Low | Accurate, enable-step nuance |
| 4 | Docker-internal networking / no-localhost gotcha | None | Confirmed correct |
| 5 | `expo-unified-push` Android-only fit | None | Confirmed correct |
| 6 | Expo SDK 56/RN 0.85/React 19.2, TanStack Query v5, expo-sqlite, expo-notifications, Docker Compose v2 | None | Confirmed accurate |
