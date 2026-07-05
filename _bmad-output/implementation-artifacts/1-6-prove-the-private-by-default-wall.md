---
baseline_commit: 44f6acaddba6b0b4207c39d7dda06c31f2c6c56b
---

# Story 1.6: Prove the private-by-default wall

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As any user,
I want my logged history to be invisible to everyone by default,
so that nothing I record is ever exposed without my explicit choice.

## Acceptance Criteria

1. **Given** the visibility schema, **when** defined, **then** owner-scoped content tables carry a nullable per-row `visibility` override, `profiles.share_activity` defaults false, and an `effective_visibility` computation exists (row override else the owner's global toggle). [Source: epics.md#Story-1.6; FR29a, ARCH-5]
2. **Given** private-by-default, **when** user B (follower or not) queries user A's watches, **then** zero rows are returned, because A has not opted in. [Source: epics.md#Story-1.6; FR29]
3. **Given** deny-by-default, **when** any table is exposed through PostgREST, **then** it has an explicit RLS policy or is otherwise unreachable — an audit confirms no `public`-schema table is exposed to `anon`/`authenticated` without RLS enabled. [Source: epics.md#Story-1.6; ARCH-5]
4. **Given** the epic exit test, **when** user A logs a watch with the network off and later syncs, **then** the watch persists AND user B still cannot read it — the two skeleton guarantees hold together. [Source: epics.md#Story-1.6; epic exit criterion]

Additional behavior that must hold for the feature to work end-to-end in the existing system (not new scope, but required for the ACs to be real):

5. **Given** `follows` does not exist yet (it lands in Epic 5), **when** this story is built, **then** the `watches` SELECT policy stays owner-only (`user_id = auth.uid()`) — **do not** add a `... OR effective_visibility = 'shared'` branch to any live policy in this story. Wiring that branch today, with no `follows` table to gate it, would let *any* authenticated user read *any* row whose `visibility` happens to be `'shared'` — the opposite of what this story proves. Epic 5's own dependency note (epics.md) explicitly assigns that ALTER to itself, once `follows` exists. `effective_visibility` is delivered here as a **pure, unwired SQL function** — correct and independently testable now, consumed by Epic 5's policy ALTER later. [Source: epics.md#Epic-5 RLS note; ARCHITECTURE-SPINE.md#AD-1]
6. **Given** the deny-by-default audit (AC3), **when** it runs, **then** it is a *generalized* check (queries `pg_tables`/grant catalog for every `public`-schema table), not one hardcoded to today's three tables (`profiles`, `catalog_cache`, `watches`) — so it automatically covers every table any later epic adds, per the review finding that flagged this gap. [Source: deferred-work.md "Deferred from: code review of story-1.2" — "No automated safeguard against a future migration forgetting the anon/authenticated revoke-then-grant boilerplate... explicitly slated for the Story 1.6 deny-by-default audit"]
7. **Given** the cross-user RLS check (AC2), **when** it runs, **then** it is a durable, committed check in `scripts/smoke-check.mjs` (or a script it calls) — not an ad-hoc throwaway script — per the review finding on Story 1.2 that this was verified manually and deferred to this story. [Source: deferred-work.md "Deferred from: code review of story-1.2" — "Testing Standards' cross-user RLS isolation... verified only via an ad-hoc throwaway script... a future testarch-framework run owns this properly" — superseded here: this story is the one that commits it]
8. **Given** `watches.visibility` (created null-only, no CHECK, by Story 1.5), **when** this story runs, **then** a CHECK constraint is added restricting it to `null | 'private' | 'shared'` — the only values `effective_visibility` (AC1) and Epic 5's future policy branch (`= 'shared'`) can meaningfully distinguish. [Source: ARCHITECTURE-SPINE.md#AD-1 "effective_visibility = 'shared'"]

## Tasks / Subtasks

- [ ] Task 1: Migration `0004_visibility.sql` — `effective_visibility()` function + `visibility` domain constraint (AC: #1, #5, #8)
  - [ ] **Hard prerequisite: `supabase/migrations/0003_watches.sql` (Story 1.5) must already exist and be applied** — this migration `ALTER`s the `watches` table 1.5 creates. If 1.5 hasn't landed in the working tree yet, stop and implement/apply it first; do not fork a copy of the `watches` DDL here.
  - [ ] Create `supabase/migrations/0004_visibility.sql` (fourth migration; follow the exact idempotent style of `0001`/`0002`/`0003`: header comment explaining intent, guarded `DO $$ ... $$` blocks for `ADD CONSTRAINT` since it has no `IF NOT EXISTS` form, `CREATE OR REPLACE FUNCTION` for the function).
  - [ ] Add the domain constraint on `watches.visibility` (guarded exactly like `0001_profiles.sql`'s `profiles_display_name_length`/`profiles_avatar_length` DO-block pattern — check `pg_constraint` by name before adding): `watches_visibility_values check (visibility is null or visibility in ('private', 'shared'))`.
  - [ ] Define `public.effective_visibility(row_visibility text, share_activity boolean) returns text language sql immutable` as `coalesce(row_visibility, case when share_activity then 'shared' else 'private' end)`. `immutable` (not `stable`/`volatile`) is correct — it only reads its arguments, no table access — which is what lets it later be used directly inside an RLS policy expression without a per-row subquery cost.
  - [ ] **Explicit code comment on why no policy is ALTERed here**: state plainly that `follows` doesn't exist until Epic 5, wiring `OR effective_visibility = 'shared'` today with no follow-edge check would be an access-control bug (any authenticated user could read any `'shared'`-flagged row), and Epic 5's own RLS note (epics.md) owns that ALTER. This is the single most important comment in the file — a future reader (dev or LLM) must not "helpfully" wire the OR-branch in a later story without also adding the `EXISTS follow-edge` guard.
  - [ ] Apply via `pnpm run supabase:migrate`, re-run once to confirm idempotency (the guarded DO block must no-op on a second pass; `CREATE OR REPLACE FUNCTION` is idempotent by construction).
  - [ ] Verify manually: `select public.effective_visibility(null, false)` → `'private'`; `select public.effective_visibility(null, true)` → `'shared'`; `select public.effective_visibility('private', true)` → `'private'` (row override wins even against an "on" global toggle); `select public.effective_visibility('shared', false)` → `'shared'` (row override wins the other direction too). Also confirm inserting `visibility = 'nonsense'` into `watches` is rejected by the new CHECK.

- [ ] Task 2: Deny-by-default audit — generalized, durable check in `scripts/smoke-check.mjs` (AC: #3, #6)
  - [ ] Add a `runPsql(sql)` helper to `scripts/smoke-check.mjs` that shells out via the exact same pattern `supabase/scripts/apply-migrations.mjs` already uses: `docker compose -f <composeFile> --project-directory <supabaseDir> exec -T db psql -U postgres -d postgres -t -A -c "<sql>"` (`-t -A` = tuples-only, unaligned, for easy parsing; reuse `execFileSync`, already imported).
  - [ ] Audit query A (RLS-enabled-everywhere): `select tablename from pg_tables where schemaname = 'public' and rowsecurity = false;` — assert this returns **zero rows**. Any row returned names a table shipped without RLS enabled at all — an instant fail, printed by name.
  - [ ] Audit query B (anon has nothing, anywhere): `select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public';` — assert **zero rows**. This is the exact safeguard the 1.2 review asked for: it catches a future migration that forgets the `revoke all ... from anon, authenticated` boilerplate, for *any* table, not just the three that exist today.
  - [ ] Both queries are schema-driven (no hardcoded table names) — confirm this by reasoning, not by adding a table and testing (that's Task 5's job): a `watchlist_items` table added in Epic 2 with no RLS or a leaked `anon` grant must fail this check without touching `smoke-check.mjs` again.
  - [ ] Report each violation individually (`fail(...)` per offending table name), not just a pass/fail boolean — mirrors the existing script's per-check granularity.

- [ ] Task 3: Cross-user RLS wall proof — durable check in `scripts/smoke-check.mjs` (AC: #2, #4, #7)
  - [ ] Add a `getOrCreateSession(email, password, username)` helper: first try `POST {baseUrl}/auth/v1/token?grant_type=password` (apikey header + `{email, password}` body) to sign in; on failure, `POST {baseUrl}/auth/v1/signup` (apikey header + `{email, password, data: {username, display_name: username}}`) to create the account. Local dev has `ENABLE_EMAIL_AUTOCONFIRM=true` (confirmed in `supabase/.env`), so signup returns a usable session directly — no email/OTP round-trip needed, matching how 1.2's own ad-hoc verification worked. Both paths return `{ access_token, user: { id } }` — return that shape from the helper either way.
  - [ ] Use two fixed, clearly-named smoke accounts so reruns are idempotent and never accumulate junk users: `smoke-test-a@tv-time-2.invalid` / `smoke-test-b@tv-time-2.invalid`, usernames `smoketestusera` / `smoketestuserb`, a shared fixed password. (`.invalid` is the RFC 2606 reserved TLD for exactly this "will never be a real deliverable address" case — appropriate for a synthetic identity that must never accidentally match a real signup.)
  - [ ] As **user A**: `POST {baseUrl}/rest/v1/watches` with `Authorization: Bearer <A's access_token>`, `apikey: <anonKey>`, `Prefer: resolution=merge-duplicates`, body `{ id: '<fixed smoke-test uuid constant>', tmdb_id: 0, media_type: 'movie', watched_at: '<now ISO>' }`. Use a **fixed literal UUID constant** (not freshly generated per run) as the row's `id` and `Prefer: resolution=merge-duplicates` (upsert-by-PK) — exactly 1.5's own idempotency mechanism (client-generated id, upsert keyed on it) — so reruns update the same row instead of erroring on a PK conflict or accumulating rows.
  - [ ] As **user B**: `GET {baseUrl}/rest/v1/watches?select=id&id=eq.<that same fixed uuid>` with `Authorization: Bearer <B's access_token>`, `apikey: <anonKey>`. Assert **HTTP 200 with a zero-length array** — this is the load-bearing distinction from checks 4/6 in the existing script: B is a *valid authenticated user with a real SELECT grant*, so PostgREST returns 200, not a 4xx; RLS is what silently filters the row to nothing. A non-empty array here is the actual privacy bug this story exists to prevent — fail loudly, printing the row count.
  - [ ] Do **not** delete the smoke-test users or their row at the end — leaving them in place is what makes the next run idempotent (sign-in succeeds, upsert updates the same row). Note this choice in a code comment so a future reader doesn't "clean up" and break idempotency.

- [ ] Task 4: Manual verification of the combined epic-exit test (AC: #4)
  - [ ] This is the one AC that isn't practically end-to-end automatable without a real device/emulator network-toggle step (1.5's own Task 5 treats the offline half the same way). Manually: (a) as a real signed-in user, disable networking, log a watch via the Add-tab flow from 1.5; (b) confirm the local soft confirmation still appears (1.5's guarantee); (c) re-enable networking, confirm the row appears in `watches` (sync worker drains it); (d) as a second real account, confirm you cannot see that row anywhere (no UI surfaces cross-user reads yet, so this is really "confirm the automated Task 3 check above passes against this exact row" — the manual step is confirming the two guarantees compose for one real, non-synthetic watch, not re-deriving RLS by hand).
  - [ ] Record the manual run in Dev Agent Record → Completion Notes (this codebase's established "done" bar per 1.3/1.4/1.5 — no test framework yet, manual verification is a first-class, recorded part of "done").

- [ ] Task 5: Docs + close the loop on the deferred item (AC: all)
  - [ ] Update `_bmad-output/implementation-artifacts/deferred-work.md`: the two 1.2-review items this story explicitly resolves ("No automated safeguard against a future migration forgetting the anon/authenticated revoke-then-grant boilerplate" and "Testing Standards' cross-user RLS isolation... verified only via an ad-hoc throwaway script") should be marked resolved/struck through with a pointer to this story, not left dangling as if still open. Do not delete the historical entries — annotate them (matches how other resolved items in that file are already handled, e.g. the mood-chip OQ#5 note style in epics.md).
  - [ ] `pnpm run verify` stays the single source of truth for "done" — confirm the new checks are additive to the existing six (container health, gateway reachability, email-only auth, anon-deny on `profiles`, catalog-search unauthenticated-deny, anon-deny on `catalog_cache`), not a replacement.
  - [ ] No `app/` client changes are expected in this story (it is entirely backend/RLS/audit) — if you find yourself editing anything under `app/`, stop and re-check you haven't wandered into Epic 2/3/5 scope.

## Dev Notes

**This is the sixth code-producing story and the last of Epic 1's four load-bearing invariants (auth → proxy boundary → local-first outbox → private-by-default RLS wall, this one).** It is pure backend: schema/RLS/audit only, no client code. Read `1-5-log-a-watch-local-first-surviving-a-network-drop.md` first — **this story's entire schema surface (`watches.visibility`) is created by 1.5, not by this story**; 1.6 only `ALTER`s what 1.5 built. If 1.5's `0003_watches.sql` isn't in the tree yet, this story cannot start.

### Existing code this story builds on (read before modifying)

- `supabase/migrations/0001_profiles.sql` — `profiles.share_activity boolean not null default false` already exists (added in Story 1.2, comment already forward-references this story: "Its read semantics (effective visibility) are exercised in Story 1.6 / Epic 5"). Also the exact guarded-DO-block pattern for adding a `CHECK` constraint to an existing table post-hoc (`profiles_display_name_length`/`profiles_avatar_length`) — copy this pattern verbatim for `watches_visibility_values` in Task 1. [Source: supabase/migrations/0001_profiles.sql]
- `supabase/migrations/0003_watches.sql` (Story 1.5, must exist before this story starts) — creates `watches.visibility text` nullable, no CHECK yet, owner-only RLS (`select`/`insert`/`update`/`delete` all `user_id = auth.uid()`). 1.5's own dev notes explicitly say "Story 1.6 later ALTERs the select policy to add the follow-edge OR-clause" — **this is superseded by the epics-level Epic 5 RLS note and must NOT be followed**; see AC5 above for why. Trust the epics.md epic-level note over a forward-reference written inside an earlier story before the party-mode structural review landed. [Source: 1-5 story file Dev Notes / Key design decisions; epics.md#Epic-5 RLS note]
- `supabase/scripts/apply-migrations.mjs` — the exact `docker compose exec -T db psql ...` invocation pattern to copy into `scripts/smoke-check.mjs`'s new `runPsql` helper (Task 2). [Source: supabase/scripts/apply-migrations.mjs]
- `scripts/smoke-check.mjs` — six existing checks (container health, gateway+anon key, email-only auth, `profiles` anon-deny, `catalog-search` unauthenticated-deny, `catalog_cache` anon-deny). Checks 4 and 6 are the *specific* precedent for the *generalized* audit this story adds in Task 2 — read them first so the new check is consistent in style (same `fail`/`ok` helpers, same `if (anonKey) { try { ... } catch {} }` shape) rather than a structurally different addition. [Source: scripts/smoke-check.mjs]
- `supabase/.env` — `ENABLE_EMAIL_AUTOCONFIRM=true` locally (confirmed) and `SERVICE_ROLE_KEY` present — Task 3's two-user flow does not need the service-role key (plain signup/sign-in as two normal users is sufficient and is a better proof: it exercises the exact same PostgREST/RLS path a real user hits, not a privileged bypass). [Source: supabase/.env]

### Architecture constraints this story must satisfy

- **AD-1 — RLS deny-by-default; the full target formula is `owner_id = auth.uid() OR (EXISTS follow-edge AND effective_visibility = 'shared')`, but the follow-edge half cannot exist before Epic 5's `follows` table.** This story delivers the `effective_visibility` half in isolation (a pure function, AC1/AC5) and proves the owner-only half holds under a real cross-user query (AC2). It explicitly does **not** attempt the OR-clause. [Source: ARCHITECTURE-SPINE.md#AD-1]
- **ARCH-5 (epics.md Requirements Inventory) — "No table is exposed through PostgREST without an explicit RLS policy — deny by default."** Read literally this asks for every table to have an explicit policy; in practice `catalog_cache` (Story 1.4) is deny-by-default via RLS-enabled-with-zero-policies-and-zero-grants (belt-and-suspenders: no grant means PostgREST refuses before RLS is even evaluated). The audit in Task 2 checks both layers generally (RLS enabled on every table; `anon` granted nothing on any table) rather than requiring a literal non-empty policy list on every table, which would wrongly flag `catalog_cache`'s intentional design. [Source: ARCHITECTURE-SPINE.md#AD-6; supabase/migrations/0002_catalog_cache.sql]
- **NFR6 / GDPR — private-by-default is a compliance requirement, not just a UX nicety.** This story is the one that makes that claim testable and enforced, not just declared. [Source: epics.md#NFR6]

### Key design decisions / traps

- **Do not wire the follow-edge OR-clause into any policy in this story — see AC5.** This is the single most important trap: the epics.md text for this story's own AC1 ("the SELECT policy computes effective_visibility") reads as if the policy itself should branch on it today. It should not — there is no `follows` table to gate a `'shared'` branch safely, and shipping one anyway is a privacy regression in the very story whose job is to prove privacy holds. Deliver `effective_visibility` as an inert, correct, independently-testable function; let Epic 5 consume it in a real policy ALTER once `follows` exists.
- **The cross-user check (Task 3) must prove a *populated* row is invisible, not just an empty table.** A test that only confirms `SELECT` on an empty `watches` table returns `[]` proves nothing about RLS — an ungranted, RLS-off table would also return `[]` if empty, or error. The check must insert a real row as user A first, then query it by exact known id as user B, and see it disappear specifically *because of RLS*, not because it doesn't exist.
- **200 + empty array vs. 4xx are different failure signatures — don't conflate them.** Checks 4/6 in the existing script assert *denial* via a 4xx (or 200 + always-empty because there's no grant at all for `anon`). Task 3's check asserts *filtering* via 200 + empty array for an *authenticated* user who does have a real grant — mixing these two assertion styles up (e.g. expecting a 4xx from user B) would make the check trivially wrong.
- **Idempotency, not cleanup.** Every other script in this repo (`apply-migrations.mjs`, `smoke-check.mjs`'s existing checks) is designed to be re-run indefinitely without manual teardown. The two smoke-test users and their fixed-id watch row follow the same discipline — reuse via sign-in-or-signup and upsert-by-fixed-id, never create-and-delete.
- **`effective_visibility` is `immutable`, not `stable`.** It touches only its two scalar arguments, no table/session state (`auth.uid()` etc. never appears inside it) — that's what makes it safe to inline directly into a future RLS policy expression (Epic 5) without per-row evaluation cost, and also what makes it trivially unit-testable via a bare `SELECT` with no auth context at all.

### Previous-story intelligence (from 1.1 → 1.5)

- **Grant surgery is per-table and easy to forget — this story turns that into an automated gate instead of a documented discipline.** Every migration so far (`0001`, `0002`, and 1.5's `0003`) has had to remember `revoke all ... from anon, authenticated` by hand; the 1.2 code review flagged that nothing enforces this for tables added later. Task 2 is that enforcement. [Source: 1-2, 1-4 Completion Notes; deferred-work.md]
- **Migration mechanism unchanged:** idempotent SQL, `pnpm run supabase:migrate`, no tracking table, zero-padded ordinal — this story's file is `0004_visibility.sql`. [Source: 1-1 → 1.5 Completion Notes]
- **Testing posture unchanged:** no framework yet. "Done" = the extended `scripts/smoke-check.mjs` passes + a recorded manual verification (Task 4) — same bar 1.3/1.4/1.5 used. [Source: 1-3, 1-4, 1-5 Dev Notes]
- **Sign-up/sign-in mechanics already proven manually in 1.2** (`signUp` with `options.data` for username/display_name; GoTrue's `handle_new_user()` trigger creates the profile row atomically) — Task 3 automates the same flow via raw `fetch`, not the `supabase-js` client (this script has no app/client dependency, it talks to GoTrue's REST endpoints directly, same as the existing checks 3–6 do against PostgREST/Edge Functions). [Source: 1-2 Dev Notes; supabase/migrations/0001_profiles.sql `handle_new_user()`]
- **Git context:** recent commits are 1.4 (`44f6aca`) and its TMDB-key follow-up (`ceee5a7`); 1.5 is drafted (`ready-for-dev`, not yet implemented) with its own `0003_watches.sql` planned but not yet applied. Uncommitted working-tree changes at story-creation time include 1.2/1.3 retrospective fixes (`profiles_display_name_length`/`profiles_avatar_length` CHECK constraints, already reflected above) — these are unrelated to this story but explain why `0001_profiles.sql` already differs slightly from the committed `44f6aca` baseline. [Source: git log; git diff at story-creation time]

### What this story deliberately does NOT include

- **No follow-edge / `follows` table, no ALTER of any live SELECT policy** — Epic 5 (see AC5). This is the most important scope wall in this story.
- **No per-entry visibility override UI** — architecture Deferred list; a UX/epics call for a later epic, not this one.
- **No client (`app/`) changes at all** — this story is 100% backend/RLS/audit-tooling.
- **No new tables** — `watches.visibility` and `profiles.share_activity` already exist (from 1.5 and 1.2 respectively); this story only adds a function and a constraint.

### Project Structure Notes

- **New:** `supabase/migrations/0004_visibility.sql`.
- **Modified:** `scripts/smoke-check.mjs` (Task 2's generalized audit + Task 3's cross-user check, both additive); `_bmad-output/implementation-artifacts/deferred-work.md` (annotate the two resolved items).
- No new top-level directories; purely additive to `supabase/migrations/` and `scripts/`, consistent with the ARCH-2 seed.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6: Prove the private-by-default wall] — story, ACs, epic exit criterion
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5: Light Social — RLS note] — the authoritative "Epic 5 ALTERs the SELECT policy once `follows` exists" statement this story's scope wall (AC5) is built on
- [Source: …/ARCHITECTURE-SPINE.md#AD-1] — the full target RLS formula, `effective_visibility` term of art
- [Source: …/ARCHITECTURE-SPINE.md#AD-6] — `catalog_cache`'s no-grant/no-policy deny-by-default design, why the Task 2 audit checks grants+RLS-enabled rather than requiring a non-empty policy list everywhere
- [Source: _bmad-output/planning-artifacts/prds/prd-tv-time-2-2026-07-02/prd.md#FR29, FR29a] — privacy/visibility requirements verbatim
- [Source: _bmad-output/implementation-artifacts/1-5-log-a-watch-local-first-surviving-a-network-drop.md] — creates `watches.visibility`, the exact schema this story alters; also the client-generated-id/upsert idempotency pattern reused in Task 3
- [Source: _bmad-output/implementation-artifacts/1-2-create-an-account-and-sign-in-google-free.md] — `profiles.share_activity`, migration/grant-surgery pattern, sign-up mechanics
- [Source: supabase/migrations/0001_profiles.sql, 0002_catalog_cache.sql, 0003_watches.sql] — exact migration/constraint patterns to copy
- [Source: supabase/scripts/apply-migrations.mjs] — `docker compose exec -T db psql` pattern reused for the Task 2 audit
- [Source: scripts/smoke-check.mjs] — existing check style/structure the new checks extend
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#"Deferred from: code review of story-1.2"] — the two review findings this story is explicitly chartered to resolve

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
</content>
