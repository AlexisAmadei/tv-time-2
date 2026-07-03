---
baseline_commit: 58e6308e54e5f5e4aace6fff63b2de36613ce409
---

# Story 1.2: Create an account and sign in (Google-free)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a new user,
I want to create an account and sign in with email/password or a magic link,
so that I have an identity the app can attach my history to — with no Google dependency.

## Acceptance Criteria

1. **Given** the sign-up screen, **when** I register with email + password, **then** a GoTrue account is created and I receive a valid JWT session. [Source: epics.md#Story-1.2; FR1]
2. **Given** an existing account, **when** I request a magic link, **then** I can sign in via the emailed link. [Source: epics.md#Story-1.2; FR1]
3. **Given** GoTrue configuration, **when** the enabled auth methods are inspected, **then** only email/password and magic link are enabled — no Google/Firebase provider anywhere. [Source: epics.md#Story-1.2; FR3, AD-12, NFR3]
4. **Given** a new account, **when** it is created, **then** a `profiles` row is created (uuid PK, `username text unique not null` — the `@handle`, captured at sign-up — `display_name`, nullable `avatar`, `share_activity boolean default false`), **and** an RLS policy allows only the owner (`owner_id = auth.uid()`) to select/update it. [Source: epics.md#Story-1.2; FR2, AD-1]
5. **Given** the sign-up flow, **when** I choose my `@username`, **then** it is required and validated unique (case-insensitive), and becomes my exact-match discovery handle. [Source: epics.md#Story-1.2; FR2, FR32, OQ#6]
6. **Given** an unauthenticated request, **when** it hits any PostgREST table, **then** it is denied by default (no anonymous access). [Source: epics.md#Story-1.2; AD-1]

## Tasks / Subtasks

- [x] Task 1: First migration — `profiles` table, RLS, and the new-user trigger (AC: #4, #5, #6)
  - [x] Create `supabase/migrations/0001_profiles.sql` (first migration in the repo). Chose the zero-padded ordinal scheme (`0001_…`, `0002_…`) applied in sort order; documented in `supabase/README.md`. Added `supabase/scripts/apply-migrations.mjs` + `pnpm run supabase:migrate` (init-script mounts only run on a fresh volume, so an explicit apply path was needed).
  - [x] Define `public.profiles`: `id uuid primary key default gen_random_uuid()`, `owner_id uuid not null unique references auth.users(id) on delete cascade`, `username text not null`, `display_name text`, `avatar text` (nullable), `share_activity boolean not null default false`, `created_at timestamptz not null default now()`. `snake_case` per ARCH-10. `owner_id` FK is `ON DELETE CASCADE` (AD-8).
  - [x] Case-insensitive username uniqueness via functional unique index `profiles_username_lower_idx on (lower(username))`. Added `profiles_username_format` CHECK (`^[A-Za-z0-9_]{3,30}$`) — length + charset guard.
  - [x] `enable row level security` + policies: **SELECT** `using (owner_id = auth.uid())`, **UPDATE** `using/with check (owner_id = auth.uid())`. No INSERT policy (trigger owns creation). No `anon` policy → anonymous SELECT returns zero rows (AC6).
  - [x] Grants: `revoke all ... from anon, authenticated` (base image auto-grants ALL via default privileges — stripped back), then `grant select, update ... to authenticated`. anon = nothing; `service_role` untouched. Verified with `role_table_grants`.
  - [x] Auto-profile `handle_new_user()` (SECURITY DEFINER, `search_path = ''`) + `on_auth_user_created after insert on auth.users` trigger. Verified against the live DB: trigger creates the profile from `raw_user_meta_data`; duplicate (case-insensitive), bad-format, and missing username each roll the sign-up transaction back (AC5).
- [x] Task 2: Wire a real local mail catcher so magic-link / confirmation email is testable (AC: #2)
  - [x] Added a `mail` service (`container_name: supabase-mail`) to `docker-compose.yml` — **Inbucket `inbucket/inbucket:3.0.3`** pinned (AD-13), SMTP `2500`, web UI bound to `127.0.0.1:9000`. GoTrue's `SMTP_HOST=supabase-mail` resolves to it on the default network.
  - [x] Fixed a real blocker: GoTrue returned `500 "Error sending confirmation email" / "unencrypted connection"` — it refuses to send SMTP **credentials** over Inbucket's plaintext link. Cleared `SMTP_USER`/`SMTP_PASS` (Inbucket needs no auth) in `.env` + `.env.example`. Also set `SMTP_SENDER_NAME=TV Time 2`. Added `auth` `depends_on: mail (service_started)`.
  - [x] Documented in `supabase/README.md` (new "Auth & email in local dev" section): emails land in Inbucket at `http://localhost:9000`; magic-link uses the emailed 6-digit code.
  - [x] Added `mail` to the smoke-check `EXPECTED` healthy set (Inbucket ships its own healthcheck → reports healthy). Verified end-to-end: OTP request → email captured → `verifyOtp` → session.
- [x] Task 3: Audit + lock GoTrue to email/password + magic link only (AC: #1, #2, #3)
  - [x] Confirmed `.env`/`.env.example`: `ENABLE_EMAIL_SIGNUP=true`, `ENABLE_PHONE_SIGNUP=false`, `ENABLE_ANONYMOUS_USERS=false`, `DISABLE_SIGNUP=false`. Grepped compose + env — no `GOTRUE_EXTERNAL_<provider>` / OAuth / firebase config anywhere (only comments asserting its absence).
  - [x] **Decided: `ENABLE_EMAIL_AUTOCONFIRM=true` for local dev** (set in `.env` + `.env.example` with a comment that production sets it false once real SMTP exists). Password sign-up returns a JWT session immediately (clean AC1); magic-link/OTP still sends a real email (AC2), independent of this flag.
  - [x] Verified AC3 via `GET /auth/v1/settings`: `external.email === true`, `phone false`, and every OAuth provider `false`. Baked this as a permanent assertion in `scripts/smoke-check.mjs` (check 3).
- [x] Task 4: Session-gated auth UI + a single auth/session source in the client (AC: #1, #2)
  - [x] Created `app/features/auth/` (new cross-cutting module; the five nav modules untouched): `AuthScreen.tsx` (sign-in / sign-up / magic-link modes) + `SignedInScreen.tsx` (minimal placeholder with sign-out until 1.3's shell). Minimal styling only.
  - [x] Added `app/data/auth.ts`: `useSession()` hook (initial `getSession` + `onAuthStateChange` subscription) + `signOut()` + `USERNAME_RE`. Uses the ONE client from `supabaseClient.ts`.
  - [x] Gated `App.tsx`: kept `checkSupabaseHealth()` probe, then `AuthGate` branches on session — no session → `AuthScreen`, session → `SignedInScreen`.
  - [x] Sign-up passes `options.data.{username,display_name}` for the trigger; password sign-in via `signInWithPassword`.
  - [x] Duplicate-username path: `signUp` failure matching "Database error saving new user" maps to a friendly "that @username may already be taken" (client also pre-validates format against `USERNAME_RE`). No pre-flight RPC (kept scope tight).
  - [x] Magic link = **OTP-code path**: `signInWithOtp({ shouldCreateUser:false })` → 6-digit code → `verifyOtp({ type:'email' })`. Confirmed the default GoTrue email template already includes the code ("enter the code: NNNNNN") — no custom template needed. No `expo-linking`/deep-linking added. Verified: `tsc --noEmit` clean + `expo export` bundles (637 modules).
- [x] Task 5: Verify end-to-end + update docs (AC: all)
  - [x] Verified all 6 ACs against the live stack: password sign-up → `auth.users` + `public.profiles` row (correct shape) + JWT session; duplicate username (case-insensitive) → HTTP 500 reject; magic-link OTP → Inbucket → `verifyOtp` → session; owner sees only own row; user B cannot read user A's row (RLS → 0 rows); anon request to `/rest/v1/profiles` → HTTP 401 (deny-by-default). Trigger constraints also unit-checked in a rolled-back transaction (dup / bad-format / missing username).
  - [x] Extended `scripts/smoke-check.mjs` with two durable read-only guardrails: check 3 (auth is email-only, no OAuth) and check 4 (anon table read denied), plus `mail` in the health set. `pnpm run verify` green.
  - [x] Left `packages/shared-types` unchanged — generating a `Profile` type is optional (README note says Story 1.5+), the client doesn't read `profiles` yet (only auth), and a hand-written type would risk drift. Deferred to the first story that reads profile data.

## Dev Notes

**This is the second code-producing story. Story 1.1 (done) established the substrate — read its File List and the current files before writing anything.** The stack, the single `supabase-js` client, the pnpm workspace, and the empty `migrations/`+`functions/` dirs already exist. This story adds the **first migration**, the **first RLS policy**, and the **first real UI** on top of them. Everything you set here (migration naming, the RLS pattern, the auto-profile trigger, the auth/session hook) becomes the pattern 1.4/1.5/1.6 imitate — get it right.

### Existing code this story builds on (read before modifying)

- `app/data/supabaseClient.ts` — the ONE client (already configured with AsyncStorage session persistence, `autoRefreshToken`, `persistSession`, `detectSessionInUrl:false`). **Do not create a second client.** Auth calls (`supabase.auth.signUp`, `signInWithPassword`, `signInWithOtp`, `onAuthStateChange`) go through this instance. Session persistence to AsyncStorage is already wired, so a signed-in user survives app restart for free.
- `app/App.tsx` — currently renders a health-check screen. You will add session-gating around it. Preserve the `checkSupabaseHealth()` startup probe (it's the AC2 connectivity guard from 1.1).
- `app/features/{home,diary,add,feed,profile}/*Screen.tsx` — stub screens. Leave them; the authed branch can keep showing them until 1.3 builds the real shell.
- `packages/shared-types/src/index.ts` — `ErrorEnvelope` + `isErrorEnvelope`. Note the correction from 1.1's review: **GoTrue errors use `msg`, not `message`, and omit `details`** — so a GoTrue error object is NOT a valid `ErrorEnvelope`. If you surface GoTrue auth errors, read `error.message` off the `supabase-js` `AuthError` (the JS SDK already normalizes to `.message`), don't assume the raw envelope.
- `supabase/docker-compose.yml` — the `auth` (GoTrue `v2.189.0`) service block already maps all `GOTRUE_SMTP_*` / `GOTRUE_MAILER_*` / `GOTRUE_EXTERNAL_EMAIL_ENABLED` env. The **only** wired key path is legacy HS256 (`GOTRUE_JWT_SECRET`) — AD-12 compliant, no OAuth. You're adding the `supabase-mail` service and (optionally) tuning env, not restructuring `auth`.
- `supabase/.env.example` — auth section already has the right flags and the dummy-mailer placeholders (`SMTP_HOST=supabase-mail`, `SMTP_PORT=2500`) explicitly labeled "Wired up in Story 1.2". This story makes that mailer real.

### Architecture constraints this story must satisfy

- **AD-1 / ARCH-5 (RLS-as-authorization):** authorization lives in Postgres RLS, never in client TypeScript. `profiles` gets an explicit RLS policy the moment it's created — no table is reachable through PostgREST without one (deny-by-default). The SELECT/UPDATE policies are owner-scoped (`owner_id = auth.uid()`). This is the first instance of the pattern every later owner-scoped table (`watches` in 1.5, everything in 1.6) will follow. [Source: ARCHITECTURE-SPINE.md#AD-1]
  - Note on `owner_id` vs PK: the AC specifies a separate `uuid` PK **and** `owner_id = auth.uid()`, so use a distinct `id` PK plus a unique `owner_id` FK to `auth.users` (rather than the common shortcut of making the PK itself the user id). Follow the AC as written; the trigger sets `owner_id = new.id`.
- **AD-8 (structural cascade for GDPR):** `profiles.owner_id` → `auth.users(id)` is `ON DELETE CASCADE`. Every FK to `auth.users.id` in the whole schema cascades — set the precedent here so 1.5's `watches.user_id` and later tables follow it and `delete-my-account` (Epic 7) works by cascade, not hand-maintained deletes. [Source: ARCHITECTURE-SPINE.md#AD-8]
- **AD-12 / NFR3 (F-Droid Google-free auth):** enabled auth methods are email/password + magic link ONLY. No `GOTRUE_EXTERNAL_<provider>_*` vars, no "Sign in with Google" button, no Firebase. Adding any OAuth provider is a deliberate, audited correct-course decision — never a drive-by. AC3 is verifiable via `/auth/v1/settings`. [Source: ARCHITECTURE-SPINE.md#AD-12]
- **ARCH-10 (consistency conventions):** DB is `snake_case`, TS is `camelCase`; ids are `uuid` (`gen_random_uuid()`); timestamps `timestamptz` UTC. The error envelope is `{message, code, details}` for Edge Functions — GoTrue/PostgREST are the upstream services whose native shapes differ (GoTrue `msg`), so normalize only when you re-emit through a function (none in this story). [Source: ARCHITECTURE-SPINE.md#Consistency Conventions]
- **Username = exact-match discovery handle (FR32, OQ#6 resolved):** `username` is unique, case-insensitive, captured at sign-up, and later used for exact-match friend lookup (Epic 5) — never fuzzy browsing (preserves the private posture). Enforce case-insensitivity with `lower(username)` unique index now; the actual friend-lookup query is Epic 5's concern. [Source: prds/…/prd.md#FR32; epics.md OQ#6]

### Key design decisions / traps

- **Auto-profile via trigger, username via signup metadata.** The client cannot INSERT into `profiles` directly (no INSERT policy, deny-by-default). Instead, `signUp({..., options:{ data:{ username, display_name }}})` stashes them in `auth.users.raw_user_meta_data`, and the `handle_new_user()` SECURITY DEFINER trigger reads them to create the profile row in the **same transaction**. Consequence: a bad/duplicate username fails the whole sign-up atomically (good — that's the enforcement), but the error GoTrue returns is a generic "Database error saving new user". Map it in the UI.
- **Case-insensitive uniqueness is a functional index, not `unique`.** `username text unique` alone lets `Alice` and `alice` coexist. Use `create unique index … on public.profiles (lower(username))`. (Avoid `citext` unless you want the extra extension.)
- **GRANTs gate the table; RLS filters rows.** Both are required. `grant select, update on public.profiles to authenticated;` and NO grant to `anon`. Omitting the grant makes the owner get a permission error; granting `anon` breaks deny-by-default.
- **Magic link on mobile — DECIDED: OTP code, not deep link.** `expo-linking` is NOT a dependency and the app has no URL scheme/deep-link config, and we are not adding it here. Use the **OTP-code path**: `signInWithOtp({ email, options:{ shouldCreateUser:false } })` emails a 6-digit token (ensure the magic-link email template includes `{{ .Token }}`); the app collects it and calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`. No deep-link plumbing; works cleanly with the Inbucket catcher and satisfies AC2 ("sign in via the emailed link" — the email carries the credential). Deep-linking (`expo-linking` + URL scheme + `ADDITIONAL_REDIRECT_URLS` / `GOTRUE_URI_ALLOW_LIST`) is explicitly **deferred** to a later story / production config — do not build it now.
- **Username availability pre-check is optional.** RLS blocks reading other users' rows, so a client `SELECT` can't check availability. If you want inline "username taken" before submit, add a `SECURITY DEFINER` RPC `is_username_available(text) returns boolean` (searches `lower(username)`) — but that's an enhancement; the atomic sign-up failure already guarantees uniqueness. Don't over-build.
- **`supabase-mail` (Inbucket) must be pinned (AD-13).** Don't add `inbucket/inbucket:latest`. Pin a dated tag like Story 1.1 did for every other service.

### What this story deliberately does NOT include

- No themed visual identity, design tokens, or bottom-nav shell — that's **Story 1.3**. Auth screens here are minimal/functional.
- No `catalog-search` or any Edge Function — **Story 1.4**. `supabase/functions/` stays as-is.
- No `watches` table, outbox, or log path — **Story 1.5**.
- No visibility-override column / `effective_visibility` formula / cross-user follow-edge policy — that's the **1.6** private-by-default wall and Epic 5's share branch. `profiles` here only needs owner-scoped SELECT/UPDATE + `share_activity default false` (the column exists now; its read semantics are exercised later).
- No production SMTP, no real email provider, no deep-link production config — local Inbucket only.
- No avatar upload flow — `avatar` is a nullable column only (upload is Epic 4, Story 4.4).

### Testing standards summary

Same posture as Story 1.1: no automated test framework is initialized yet (a future `bmad-testarch-framework` run owns that). "Done" is a **scripted/manual smoke check**, extended from 1.1's `pnpm run verify` (`scripts/smoke-check.mjs`):
- Password sign-up → `auth.users` + `public.profiles` row created with correct shape; valid JWT session returned.
- Duplicate username (case-insensitive) → sign-up rejected.
- Magic-link email captured in Inbucket → sign-in/`verifyOtp` succeeds.
- `/auth/v1/settings` shows email-only, no OAuth (AC3).
- Anon (no JWT) `GET /rest/v1/profiles` → denied / zero rows (AC6).
- User B cannot SELECT user A's profile row.
Don't over-engineer — add targeted assertions to the existing smoke script, not a new framework.

### Project Structure Notes

- New: `supabase/migrations/0001_profiles.sql` (first migration — sets the naming convention for all later ones), `supabase-mail` service in `docker-compose.yml`, `app/features/auth/` module, `app/data/auth.ts` (or equivalent session source).
- Aligns with the ARCH-2 structural seed: `migrations/` and `data/` already exist; `features/auth/` is a new cross-cutting module (the five nav modules are untouched). No variance from the established layout.
- No conflicts with Story 1.1's scaffold — this is purely additive on top of it.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Create an account and sign in (Google-free)] — story statement, ACs, epic framing
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-1] — RLS-as-authorization, owner_id + deny-by-default
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-8] — every FK to auth.users cascades (GDPR)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#AD-12] — F-Droid Google-free auth by construction
- [Source: _bmad-output/planning-artifacts/architecture/architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md#Consistency Conventions] — snake_case/camelCase, uuid/timestamptz, error envelope
- [Source: _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/prd.md#FR1-FR3, FR32] — account/sign-in, Google-free, exact-match @username; OQ#6 resolved (unique handle at sign-up)
- [Source: _bmad-output/implementation-artifacts/1-1-project-foundation-boots-locally.md] — substrate this story builds on (client, workspace, compose, env, shared-types); review-finding that GoTrue uses `msg` not `message`
- [Web: https://supabase.com/docs/guides/auth/managing-user-data] — canonical `handle_new_user()` trigger + SECURITY DEFINER pattern (verify against current docs at implementation time)
- [Web: https://supabase.com/docs/guides/local-development] / Inbucket — local mail-catcher pattern for magic-link/confirmation email (`supabase-mail`, SMTP 2500 / web 9000)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (claude-opus-4-8) — BMad Dev Story workflow.

### Debug Log References

- Migration applied via new `pnpm run supabase:migrate`; re-applied to confirm idempotency (create-if-not-exists / drop-then-create). Schema, RLS policies, grants, trigger, and `search_path=''` verified with `\d`, `pg_policies`, `role_table_grants`, `pg_trigger`, `pg_proc`.
- Trigger + constraints unit-checked in a rolled-back transaction: valid metadata → profile created (`share_activity` false, `avatar` null); case-insensitive dup → `profiles_username_lower_idx` violation; bad charset → `profiles_username_format` check; missing username → NOT NULL. All rolled back, 0 rows leaked.
- **SMTP blocker fixed:** GoTrue `500 "Error sending confirmation email" / error:"unencrypted connection"` — it refuses to transmit SMTP creds over Inbucket's plaintext link. Cleared `SMTP_USER`/`SMTP_PASS`; email then delivered.
- End-to-end AC run against the live stack (ad-hoc script): AC1 signup→JWT, AC4 owner-only + cross-user 0 rows, AC5 dup→500, AC6 anon `/rest/v1/profiles`→401. Magic-link OTP: request→Inbucket email (code present in default template)→`/auth/v1/verify`→session.
- `pnpm run verify` green (7 services healthy + gateway + email-only settings + anon-deny). `app` `tsc --noEmit` clean; `expo export --platform android` bundles 637 modules.

### Completion Notes List

- **All 6 ACs satisfied and verified against a live stack** (Docker was available and the stack running). "Done" here is the extended scripted smoke check (`pnpm run verify`) + direct GoTrue/PostgREST verification — no automated test framework yet (deferred to a future `testarch-framework` run), per the story's Testing Standards.
- **Migrations mechanism established (first migration).** Base-image init scripts only run on a fresh volume, so added `supabase/scripts/apply-migrations.mjs` + `pnpm run supabase:migrate`, applying `migrations/*.sql` in sort order via `psql` with `ON_ERROR_STOP=1`. Scheme = zero-padded ordinal (`0001_…`). No tracking table yet (migrations written idempotent); a real runner is deferred. Removed the now-obsolete `migrations/.gitkeep`.
- **Least-privilege grants (Supabase gotcha).** The base image's `ALTER DEFAULT PRIVILEGES` auto-granted `authenticated` + `anon` ALL on new public tables. The migration `revoke all ... from anon, authenticated` then `grant select, update ... to authenticated` — anon ends with nothing (hard deny), authenticated with SELECT/UPDATE only (RLS scopes to owner). Flagged for the 1.6 deny-by-default audit: this needs doing per table until a project-wide default-privileges fix lands.
- **Decision: `ENABLE_EMAIL_AUTOCONFIRM` — local dev uses `true`.** Gives AC1 an immediate JWT session without mail infra; magic-link/OTP still exercises email. The tracked `.env.example` ships the **production-safe `false`** (see code-review fix below); the gitignored local `.env` is `true`.
- **Decision: magic link = OTP code, not deep link** (as agreed). No `expo-linking`/URL-scheme work. The default GoTrue magic-link template already emits the 6-digit code, so no custom template was needed.
- **Inbucket mail catcher** (`mail` service, pinned `inbucket/inbucket:3.0.3`, web UI on loopback:9000) makes AC2 testable locally; added to the smoke-check health set (it ships its own healthcheck).
- **`profiles` schema faithful to the AC:** distinct `id` uuid PK + unique `owner_id` FK (`ON DELETE CASCADE`, AD-8), not the PK-is-user-id shortcut. `shared-types` left unchanged (no profile reads in the client yet; a hand-written type would risk drift — deferred).
- **Note for reviewer:** the pre-existing uncommitted Story-1.1 review fixes + BMad config churn in the working tree were left untouched; this story's changes are additive on top.
- **Code-review fixes applied (findings 1, 3, 5):** (1) duplicate-username sign-up showed the user a raw `"{}"` — GoTrue v2.189 doesn't emit the "Database error saving new user" string the mapping keyed on; replaced with a heuristic (empty / `{}` / duplicate/constraint → friendly "email or @username may already be in use"), verified via the real `supabase-js` client (genuine errors like weak password still pass through). (3) the tracked `.env.example` now defaults `ENABLE_EMAIL_AUTOCONFIRM=false` (prod-safe) so copying it never accepts unverified sign-ups; local dev opts into `true`. (5) auth mode tabs are disabled while a request is in flight, so a mode switch can't apply a resolving request's result to a different mode. Findings 2 (smoke-check anon-deny can pass vacuously on an empty table) and 4 (no sign-up feedback when autoconfirm is off) were left as-is per the user.

### File List

**Repo root**
- `package.json` (modified — added `supabase:migrate` script)
- `scripts/smoke-check.mjs` (modified — `mail` in health set; check 3 email-only auth; check 4 anon deny-by-default)

**supabase/**
- `migrations/0001_profiles.sql` (new — profiles table, case-insensitive unique username, owner-only RLS, least-privilege grants, `handle_new_user()` SECURITY DEFINER trigger)
- `migrations/.gitkeep` (removed the local placeholder — the folder now has a real migration; it was never tracked in git)
- `scripts/apply-migrations.mjs` (new — applies migrations to the running db)
- `docker-compose.yml` (modified — `mail` (Inbucket) service; `auth` `depends_on: mail`)
- `.env.example` (modified, tracked — autoconfirm=false prod-safe default, empty SMTP creds, Inbucket comments)
- `.env` (modified, **gitignored** — mirrored the same env changes)
- `README.md` (modified — mail service row, migrations section, "Auth & email in local dev" section)

**app/**
- `App.tsx` (modified — session gate around the health check)
- `data/auth.ts` (new — `useSession()` hook, `signOut()`, `USERNAME_RE`)
- `features/auth/AuthScreen.tsx` (new — sign-in / sign-up / magic-link OTP UI)
- `features/auth/SignedInScreen.tsx` (new — minimal signed-in placeholder until Story 1.3)

## Change Log

| Date | Change |
| --- | --- |
| 2026-07-03 | Story 1.2 implemented: first migration (`profiles` + owner-only RLS + auto-profile trigger), Inbucket local mail catcher, GoTrue locked to email/password + magic-link OTP (Google-free), and session-gated auth UI. All 6 ACs verified against the live stack; `pnpm run verify` extended and green. Status → review. |
| 2026-07-03 | Applied code-review fixes (findings 1, 3, 5): friendly duplicate-username message (the old regex never matched GoTrue v2.189's error); prod-safe `ENABLE_EMAIL_AUTOCONFIRM=false` default in the tracked `.env.example`; auth mode tabs disabled while a request is in flight. tsc + smoke check re-verified. |
