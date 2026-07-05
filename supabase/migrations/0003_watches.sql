-- 0003_watches.sql — the `watches` table, owner-only RLS (Story 1.5).
--
-- Follows the pattern 0001_profiles.sql / 0002_catalog_cache.sql established:
--   * snake_case DB objects (ARCH-10)
--   * explicit RLS the moment the table is created — deny-by-default (AD-1)
--   * every FK to auth.users(id) is ON DELETE CASCADE (AD-8)
--   * idempotent / re-runnable (create-if-not-exists, drop-then-create for
--     policies), no migration-tracking table yet, so `pnpm run supabase:migrate`
--     re-applies the whole folder.
--
-- What this table IS (AD-3/AD-4): the atomic, timestamped unit of a logged
-- watch. Rating/mood/note live here (nullable until Epic 3 writes them) —
-- there is no titles/catalog entity this row is modeled on; a watch references
-- a title only by (tmdb_id, media_type) value, never by FK (ARCH-10).
--
-- What this table IS NOT (yet):
--   * NOT follower-visible — RLS is owner-only in 1.5. Story 1.6 ALTERs the
--     select policy to add the follower/effective_visibility OR-clause.
--   * NOT rated/moodded/noted — those columns exist now (so Epic 3 doesn't need
--     a schema migration later) but are always null until Epic 3 writes them.

create table if not exists public.watches (
  -- Client-generated (see app/data/watchLog.ts): the sync worker always
  -- supplies this explicitly and upserts on it, which is what makes a retry
  -- after a lost response idempotent (AC7). The default only serves a direct
  -- server-side insert path; the outbox path never relies on it.
  id               uuid primary key default gen_random_uuid(),
  -- Owner. Cascades so a future delete-my-account (Epic 7) unwinds structurally
  -- (AD-8), never via a hand-maintained loop.
  user_id          uuid not null references auth.users (id) on delete cascade,
  tmdb_id          integer not null,
  media_type       text not null check (media_type in ('movie', 'tv')),
  -- Episode-level granularity (Epic 3, Stories 3.1/3.2). Null for films always,
  -- and null for TV in 1.5 — this story logs at the title level only.
  tmdb_episode_id  integer,
  watched_at       timestamptz not null,
  -- Half-steps 0–10 (= 0–5★), nullable. Populated by Epic 3 (Story 3.5); never
  -- written by this story.
  rating           smallint check (rating is null or (rating >= 0 and rating <= 10)),
  -- Nullable, no CHECK yet — the mood-set enum-via-CHECK is Epic 3/FR17-21's
  -- job when the column starts being written. Adding an empty-set CHECK now
  -- that Epic 3 has to ALTER is churn, not idempotent architecture.
  mood             text[],
  note             text,
  -- Nullable, no default other than null (AC5). Effective-visibility
  -- computation is Story 1.6.
  visibility       text,
  created_at       timestamptz not null default now()
);

-- RLS: owner-only in 1.5 (AC5's literal formula). Do NOT add the
-- follower-visibility OR clause here — Story 1.6's job, and a premature clause
-- with no follows/share_activity logic wired yet is dead code this story can't
-- test.
alter table public.watches enable row level security;

drop policy if exists watches_select_own on public.watches;
create policy watches_select_own on public.watches
  for select using (user_id = auth.uid());

drop policy if exists watches_insert_own on public.watches;
create policy watches_insert_own on public.watches
  for insert with check (user_id = auth.uid());

drop policy if exists watches_update_own on public.watches;
create policy watches_update_own on public.watches
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists watches_delete_own on public.watches;
create policy watches_delete_own on public.watches
  for delete using (user_id = auth.uid());

-- Gotcha (repeated every migration): the Supabase base image auto-grants ALL
-- privileges on every new public table to anon + authenticated. Strip that
-- back, then grant least privilege:
--   * anon          → nothing at all (deny-by-default).
--   * authenticated → full CRUD; RLS scopes every one of these to the owner's
--     own rows. Unlike profiles, there is no trigger fronting writes here —
--     the client's own upsert via the sync worker is the intended path
--     (AD-1's Binds list explicitly describes INSERT/UPDATE/DELETE mirroring
--     the owner check for watches).
--   * service_role  → untouched (trusted server role, bypasses RLS).
revoke all on public.watches from anon, authenticated;
grant select, insert, update, delete on public.watches to authenticated;
