---
title: Adversarial Divergence Review — ARCHITECTURE-SPINE.md
target: architecture-tv-time-2-2026-07-02/ARCHITECTURE-SPINE.md
method: construct two spine-compliant units one level down that still build incompatibly
created: 2026-07-02
---

# Adversarial Divergence Review — tv-time-2 Architecture Spine

## Verdict

The spine holds for the paths it explicitly modeled (RLS-as-auth for the core visibility formula, watch-as-atomic-unit, outbox-for-commit, notification cadence, import idempotency, GDPR cascade-by-FK) but it has nine real holes — four of them **critical** — where two engineers can each follow every AD to the letter and still ship incompatible systems: an unowned mutation path for the next-episode pointer, an outbox that only covers the watch commit and silently drops offline rating/mood edits, a GDPR cascade rule that breaks for the one self-referential table (`follows`) it never accounted for, and a "which catalog item is this" identifier that three different ADs name three different ways.

---

## Findings

### 1. `tracked_shows.next_episode_pointer` has no assigned owner or mutation path — CRITICAL

**Two divergent, spine-compliant units:**
- **Unit A (client-authoritative):** The client computes the next unwatched episode locally (it already has the season/episode list from `catalog-title`) and writes the new pointer via a plain `PATCH tracked_shows` through PostgREST — this is "plain RLS-guarded CRUD," fully compliant with AD-2's letter, no Edge Function needed.
- **Unit B (server-authoritative):** A future engineer reasons that the pointer must stay correct even for watches that never went through the client (imported history via `import-tvtime`, FR38-41, or a rewatch logged from a different device), so they recompute the pointer server-side — either via a Postgres trigger on `watches` insert, or a small `advance-pointer` Edge Function the importer also calls.

**Which AD failed to prevent it:** AD-2 only decides *where* logic that isn't plain CRUD must live (a named Edge Function) — it never decides *whether* pointer advancement is "plain CRUD" or "custom logic" in the first place, so both units can honestly claim compliance. AD-3 (watch is atomic) and AD-7 (import idempotency) are both silent on whether import is required to touch `tracked_shows` at all.

**Concrete breakage:** if Unit A ships (pointer is client-computed only) and TV Time import lands per AD-7 as written, imported watches populate `watches` but never touch `tracked_shows.next_episode_pointer` — every imported show's Up Next pointer is simply wrong on first load, silently, with no error surface (FR41's "clear summary of what was/wasn't imported" wouldn't even know to mention it, since the spine never named this as an import side effect).

**Suggested fix:** Add an AD (or extend AD-3/AD-7) that states: `tracked_shows.next_episode_pointer` is derived, not asserted — it is recomputed by a single named path (pick one: a Postgres function invoked by both the client-CRUD path and `import-tvtime`, or a trigger on `watches` insert) so there is exactly one writer, and explicitly require `import-tvtime` to update it.

---

### 2. AD-4's outbox covers the watch commit but not the rating/mood/note edit that follows it seconds later — CRITICAL

**Two divergent, spine-compliant units:**
- **Unit A:** Reads AD-4's "durable local write path" broadly — the rating prompt (FR17) is part of "the log flow," so rating/mood/note edits made before the outbox drains are merged into the same still-local `pending_watches` row and sync together.
- **Unit B:** Reads AD-4 literally — its Binds line says "the log flow (FR14)," and its last sentence says only *reads* use TanStack Query's disposable cache, leaving *rating mutations* unaddressed. Unit B implements the rating tap (FR17/FR19) as an immediate `PATCH watches/:id` call, on the reasonable premise that the commit already succeeded.

**Which AD failed to prevent it:** AD-4's Rule text never states which durable path rating/mood/note edits take. It binds only FR14 (the commit), even though FR17's rating prompt is functionally inseparable from the same offline-capable interaction the AD exists to protect, and NFR1 explicitly measures the loop through "rating prompt dismissed or submitted."

**Concrete breakage:** Unit B's `PATCH watches/:id` targets a server-assigned UUID that doesn't exist yet if the outbox hasn't drained (which, per AD-4, happens "on reconnect" — i.e., is the *normal* case whenever the user rates offline, which per UJ-1 is the default flow: log, then rate, in one uninterrupted beat). This isn't a theoretical race — it's the primary path AD-4 exists to protect, and the rating half of it 404s.

**Suggested fix:** Extend AD-4's Rule to explicitly cover rating/mood/note as part of the same durable local unit as the commit (either as columns already present on the queued `pending_watches` row, or as a queued patch keyed to a client-generated id that the sync worker reconciles), not a separate network call assumed to hit an already-synced row.

---

### 3. Three different ADs name the "which catalog item" identifier three different ways — HIGH

- **Consistency Conventions** (the spine's own naming law): *"Every table referencing the external catalog uses the column name `tmdb_id`."*
- **AD-5**'s Rule: *"walks distinct `tmdb_show_id`s with an active bell."*
- **AD-7**'s Rule: unique constraint on `(user_id, mapped_title_or_episode_id, source_watch_id)`.

**Two divergent, spine-compliant units:** An engineer building `notify_bells`/`poll-new-episodes` follows AD-5 verbatim and names the column `tmdb_show_id`. An engineer building the importer follows AD-7 verbatim and names the column `mapped_title_or_episode_id`. A third engineer building `watches` for organic logging follows the Consistency Conventions verbatim and names it `tmdb_id`. All three are individually letter-compliant with the specific AD or convention they read; none of them match each other, and nothing in the spine says these three columns are even the same *kind* of identifier (show-level vs. episode-level vs. "title-or-episode" ambiguous-level).

**Which AD failed to prevent it:** the Consistency Conventions table exists specifically to prevent this kind of naming drift, but two of the spine's own ADs (AD-5, AD-7) contradict it in their own Rule text — the spine is not internally consistent about its own naming rule.

**Suggested fix:** Pick one identifier shape (e.g., `tmdb_id` + a `media_type` discriminator, or separate `tmdb_show_id`/`tmdb_episode_id` columns used consistently everywhere) and update AD-5 and AD-7's Rule text to use the exact same column name the Consistency Conventions mandates, so no future implementer has three "correct" answers to choose from.

---

### 4. AD-1's "owner-scoped tables" bind list is narrower than the spine's own ER diagram — HIGH

AD-1 binds: `watches, watchlist_items, notify_bells, lists, list_items, profiles`. The Core Entity Relationships diagram (same document) shows `PROFILES ||--o{ TRACKED_SHOWS`, `PROFILES ||--o{ PUSH_DEVICES`, `PROFILES ||--o{ IMPORTS`, and `PROFILES }o--o{ PROFILES : follows` as equally owner-scoped relationships — none of these four tables appear in AD-1's bind list.

**Two divergent, spine-compliant units:**
- **Unit A:** Applies AD-1's owner_id + deny-by-default RLS pattern uniformly to every owner-scoped table in the ER diagram, including the four not explicitly named — defensive, consistent, but not what AD-1 actually says.
- **Unit B:** Treats AD-1's bind list as exhaustive (it is explicit architecture text, after all) and hand-rolls ad hoc policies — or none — for `tracked_shows`, `push_devices`, `imports`, and `follows`, reasoning that AD-1 simply doesn't govern them.

**Which AD failed to prevent it:** AD-1's own Rule closes with "no table is exposed through PostgREST without an explicit RLS policy — deny by default," which *should* catch this, but the Binds line contradicts that closing sentence by naming only six tables, giving Unit B a textual basis for treating the other four as out of scope.

**Concrete breakage:** worst case, Unit B leaves `push_devices` (device push tokens) or `imports` (import run records, potentially containing raw export content) without RLS, which is exactly the class of leak AD-1 exists to prevent.

**Suggested fix:** Either make AD-1's Binds line say "all tables with an `owner_id` FK to `auth.users`, including but not limited to: …" or explicitly enumerate the full set (`tracked_shows`, `push_devices`, `imports`, `follows`) so there is no table left for an implementer to reasonably argue is exempt.

---

### 5. AD-8's GDPR cascade rule assumes a single `owner_id`; `follows` has two user references — CRITICAL

AD-8's Rule: *"every owner-scoped table's `owner_id` FK references `auth.users.id` with `ON DELETE CASCADE`."* `follows` (per the ER diagram, `PROFILES }o--o{ PROFILES : follows`) necessarily has two person-referencing columns (follower and followee), neither of which is unambiguously "the" `owner_id`.

**Two divergent, spine-compliant units:**
- **Unit A:** Cascades both columns (`follower_id` and `followee_id`) `ON DELETE CASCADE`, reasoning that AD-8's *intent* (deletion must fully unwind) requires it even though the Rule text only says "owner_id."
- **Unit B:** Implements the Rule literally — treats `follower_id` as the table's `owner_id` (the row "belongs to" whoever created the follow) with `ON DELETE CASCADE`, and leaves `followee_id` as an ordinary FK with default (`NO ACTION`/`RESTRICT`) behavior, since AD-8 never mentions a second reference.

**Which AD failed to prevent it:** AD-8's Rule is written for the single-owner case and never addresses multi-actor or self-referential tables, even though `follows` is exactly that and is one of only two many-to-many relationships in the whole ER diagram.

**Concrete breakage:** in Unit B, `delete-my-account` fails with a foreign-key violation for any user who has at least one follower — i.e., it silently works for lonely test accounts and breaks in production for exactly the socially-active users the "light social network" pillar of the product is built around. This directly violates FR5/NFR6 (GDPR deletion is "committed, legally expected"), which AD-8 exists to guarantee.

**Suggested fix:** Add an explicit clause to AD-8 covering multi-actor/self-referential tables: every FK to `auth.users.id` on any table — not just the primary "owner" column — must be `ON DELETE CASCADE`, and name `follows` as a worked example.

---

### 6. `catalog_cache` is given two incompatible durability contracts by AD-5 and AD-6 — HIGH

AD-6 frames `catalog_cache` as disposable: *"intentionally not FK'd into this graph... a disposable TTL cache... not an owned entity."* AD-5's `poll-new-episodes` needs to *"diff against cached air-dates"* once a day, which requires remembering yesterday's known air-date across cron runs — i.e., durable state, not a disposable read-through cache.

**Two divergent, spine-compliant units:**
- **Unit A** (owns `catalog-search`/`catalog-title`, per AD-6): implements aggressive TTL eviction/overwrite on `catalog_cache` — free to do so, since AD-6 explicitly calls it disposable and not an owned entity.
- **Unit B** (owns `poll-new-episodes`, per AD-5): assumes `catalog_cache` retains the previous day's payload long enough to diff against, since AD-5 never names any other table for this state and the spine provides no dedicated "last known air-date" table.

**Which AD failed to prevent it:** neither AD-5 nor AD-6 names a shared table for the diff state, and they make contradictory implicit assumptions about the one table that exists (`catalog_cache`) — AD-6 says it's freely evictable, AD-5 needs it to persist across a 24-hour window.

**Concrete breakage:** if Unit A's eviction policy runs more aggressively than Unit B assumed (e.g., search-driven cache churn evicts a show's cached payload before the next cron run), `poll-new-episodes` loses its diff baseline and either misses new-episode pushes or re-fires stale ones — a direct regression on the one addendum-flagged "heaviest v1 component" (H3).

**Suggested fix:** Give `poll-new-episodes` its own durable state table (e.g., `known_episode_state(tmdb_show_id, last_known_air_date, checked_at)`) explicitly separate from the disposable search cache, and bind it under AD-5.

---

### 7. AD-1's single visibility formula doesn't fit FR31's "shared lists" sharing shape — MEDIUM

AD-1's RLS formula is uniform: `owner_id = auth.uid() OR (follow-edge AND effective_visibility = 'shared')` — visibility is binary, toggled per row or globally, and gated only by "is this viewer a follower." FR31 describes lists that are "shared with" friends, which reads as selective (specific recipients), not "visible to any follower with sharing on."

**Two divergent, spine-compliant units:**
- **Unit A:** Implements `lists`/`list_items` sharing purely through AD-1's existing mechanism — a list is either private or visible to all followers, full stop. Fully compliant with AD-1's letter.
- **Unit B:** Reads FR31 literally and adds a `list_shares(list_id, shared_with_user_id)` join table to support selective recipients — a second, additive sharing mechanism that AD-1 never anticipated and that isn't in AD-1's bind list or the ER diagram.

**Which AD failed to prevent it:** AD-1 doesn't acknowledge that "shared with friends" (FR31, selective) and "visible to friends" (FR29a, blanket toggle) are different sharing shapes, and applies one formula to both without flagging the mismatch.

**Suggested fix:** Either explicitly scope AD-1's formula to personal-activity visibility only and add a second, named mechanism for list-level selective sharing, or clarify in the spine that "shared lists" in v1 means the same blanket follower-visibility as everything else (no selective recipients) — either is fine, but the spine must pick one.

---

### 8. Mood storage mechanism is left as an explicit either/or, and the choice has real migration consequences — MEDIUM

Consistency Conventions: *"Moods: `text[]` constrained by a Postgres check constraint **/** enum migration."* This is not a convention, it's a literal fork left unresolved in the document meant to prevent forks. The two options have materially different properties: a Postgres `ENUM` type is rigid (values can only be appended, never cleanly removed/renamed, and `ALTER TYPE ... ADD VALUE` has transaction-boundary caveats), while a `text[]` + `CHECK` constraint is trivially migratable in both directions. The mood set itself is an unresolved PRD contradiction (FR18 vs. `DESIGN.md`, Open Question #5) that the spine correctly defers as non-architectural — but *which storage mechanism* is used is architectural, because it determines how painful it is to fix that contradiction later.

**Two divergent, spine-compliant units:** the engineer writing the DB migration picks a Postgres `ENUM` type (nicer generated TS union via Supabase codegen). The engineer wiring `packages/shared-types`' zod schema assumes a plain `text[]` with app/DB-level validation (matching the Deferred section's framing of "extensible"). Both are compliant with the Consistency Conventions' literal "check constraint / enum migration" text — because it names both.

**Suggested fix:** Pick one mechanism now (a `text[]` + `CHECK` constraint is the safer default given the mood set is still contested) and remove the slash.

---

### 9. AD-1's Rule is written for `SELECT` only; write policies are implied, not specified — LOW

AD-1's Rule spells out the `SELECT` policy formula in full but says nothing explicit about `INSERT`/`UPDATE`/`DELETE` policies beyond the general "deny by default" framing. In practice this is low-risk because the obvious `owner_id = auth.uid()` write policy is the only sane reading, and AD-3/AD-4's rules about which columns are mutable narrow it further — but a spine whose stated goal is to make divergence structurally impossible should say this rather than leave it to convention. Flagged as low severity because no two compliant implementations plausibly diverge here in a harmful way, unlike Findings 1-8.

---

## Good-Spine Checklist

**Does every AD's Rule actually prevent its stated divergence?**
- AD-3 (watch atomicity), AD-6 (catalog proxy), AD-7 (import idempotency mechanism, independent of the naming issue in Finding 3), and AD-9 (backup) hold — their Rules are concrete enough that two compliant implementations converge.
- AD-1, AD-2, AD-4, AD-5, and AD-8 each have a real gap (Findings 1, 2, 4, 5, 6, 7, 9 above) where the Rule states an intent but the letter of the text leaves room for two compliant-but-incompatible builds.

**Does anything under "Deferred" risk letting two units diverge in a way that should have been fixed?**
- Yes, one item: "Mood chip canonical set" is correctly deferred as a *product* question (which emojis), but it silently carries an architectural question along with it — the storage mechanism (Finding 8) — that should have been resolved in the spine itself, not left as a slash-separated option.
- The rest of Deferred is legitimately non-architectural or genuinely schema-agnostic: F-Droid UnifiedPush wiring, TMDB fallback trigger, staging environment, per-entry visibility UI, and the recommendations heuristic are all correctly deferred — none of them leave a shared-data-shape or mutation-path ambiguity behind, because AD-1 (visibility schema), AD-6 (provider boundary), and FR42's "never load-bearing" framing already close off the divergence risk.

**Is any dimension the spine should own left completely silent (not decided, not deferred)?**
- Not completely silent on any of the six named dimensions (data model, auth, offline, deployment, notifications, GDPR) — each has at least one AD. But within those dimensions, several sub-questions are silent rather than decided-or-deferred: pointer-mutation ownership (Finding 1), offline rating/mood/note durability (Finding 2), catalog-item identifier naming (Finding 3), RLS coverage of `tracked_shows`/`push_devices`/`imports`/`follows` (Finding 4), and multi-actor GDPR cascade (Finding 5). These aren't flagged anywhere as Deferred — they simply aren't mentioned, which is the more dangerous failure mode, since an implementer has no signal that a decision is still open.

---

## Summary Table

| # | Finding | AD(s) involved | Severity |
| --- | --- | --- | --- |
| 1 | Next-episode pointer mutation has no assigned owner; import can silently desync it | AD-2, AD-3, AD-7 | Critical |
| 2 | Outbox (AD-4) covers the commit, not the rating/mood/note edit that follows it | AD-4 | Critical |
| 3 | Three ADs name the catalog-item identifier three different ways | Consistency Conventions, AD-5, AD-7 | High |
| 4 | AD-1's bind list omits `tracked_shows`, `push_devices`, `imports`, `follows` | AD-1 | High |
| 5 | GDPR cascade rule assumes single `owner_id`; breaks for self-referential `follows` | AD-8 | Critical |
| 6 | `catalog_cache` given contradictory durability contracts by AD-5 vs AD-6 | AD-5, AD-6 | High |
| 7 | AD-1's visibility formula doesn't fit FR31's selective list-sharing shape | AD-1 | Medium |
| 8 | Mood storage mechanism left as an unresolved either/or with real migration cost | Consistency Conventions | Medium |
| 9 | AD-1's Rule specifies SELECT policy only; write policies implied not stated | AD-1 | Low |
