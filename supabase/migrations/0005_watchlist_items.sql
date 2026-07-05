-- 0005_watchlist_items.sql — the `watchlist_items` table, owner-only RLS (Story 2.3).
--
-- Follows the pattern 0001_profiles.sql / 0002_catalog_cache.sql / 0003_watches.sql
-- established:
--   * snake_case DB objects (ARCH-10)
--   * explicit RLS the moment the table is created — deny-by-default (AD-1)
--   * every FK to auth.users(id) is ON DELETE CASCADE (AD-8)
--   * idempotent / re-runnable (create-if-not-exists, drop-then-create for
--     policies), no migration-tracking table yet, so `pnpm run supabase:migrate`
--     re-applies the whole folder.
--
-- What this table IS (FR25, ARCH-5): a saved-for-later entry — the user ❤️'d a
-- title to remember it. Identity is (tmdb_id, media_type) by VALUE (ARCH-10),
-- never an FK to a catalog entity; same modeling as `watches`.
--
-- What this table IS NOT:
--   * NOT `watches` — a watchlist item is a saved-for-later, not a logged/tracked
--     watch with a pointer. Distinct table, distinct purpose (Story 2.3 scope wall).
--   * NOT rewatch-friendly — unlike `watches` (which allows many rows per title,
--     AD-3), a watchlist holds AT MOST ONE entry per title per user. The unique
--     index below is the schema-level guarantee of that idempotency (AC2).
--   * NOT follower-visible — RLS is owner-only. `visibility` exists (mirroring
--     watches) but is created nullable and NEVER written by this story; Epic 5
--     ALTERs the policy once `follows` exists (same reasoning as 0004_visibility.sql).
--   * NOT updatable — this story has no field to update (visibility isn't written
--     until Epic 5), so there is deliberately NO update policy or grant.

create table if not exists public.watchlist_items (
  id           uuid primary key default gen_random_uuid(),
  -- Owner. Cascades so a future delete-my-account (Epic 7) unwinds structurally
  -- (AD-8), never via a hand-maintained loop.
  user_id      uuid not null references auth.users (id) on delete cascade,
  tmdb_id      integer not null,
  media_type   text not null check (media_type in ('movie', 'tv')),
  created_at   timestamptz not null default now(),
  -- Nullable, never written by this story (mirror of watches.visibility's final
  -- shape from 0003+0004). Since this is a fresh table the CHECK is inline rather
  -- than a later guarded ADD CONSTRAINT. Effective-visibility / follower branch
  -- is Epic 5's job (see 0004_visibility.sql for why it waits for `follows`).
  visibility   text check (visibility is null or visibility in ('private', 'shared'))
);

-- Idempotent uniqueness (AC2, the core of "never duplicating"): at most one row
-- per (owner, title). This is what makes an add upsertable and a re-tap-to-remove
-- unambiguous — the DB, not the client, guarantees at-most-one row. Contrast
-- `watches`, which deliberately has NO such index (rewatch is legitimate, AD-3).
create unique index if not exists watchlist_items_owner_title_idx
  on public.watchlist_items (user_id, tmdb_id, media_type);

-- RLS: owner-only. Do NOT add a follower-visibility OR clause here — `follows`
-- (Epic 5) doesn't exist yet, and a premature `... OR visibility = 'shared'`
-- branch with no follow-edge guard would let any authenticated user read any
-- 'shared' row (the exact access-control bug 0004_visibility.sql warns against).
alter table public.watchlist_items enable row level security;

drop policy if exists watchlist_items_select_own on public.watchlist_items;
create policy watchlist_items_select_own on public.watchlist_items
  for select using (user_id = auth.uid());

drop policy if exists watchlist_items_insert_own on public.watchlist_items;
create policy watchlist_items_insert_own on public.watchlist_items
  for insert with check (user_id = auth.uid());

-- No update policy — this story has no field to update. A later story (Epic 5,
-- when `visibility` starts being written) ALTERs to add one, least-privilege.

drop policy if exists watchlist_items_delete_own on public.watchlist_items;
create policy watchlist_items_delete_own on public.watchlist_items
  for delete using (user_id = auth.uid());

-- Gotcha (repeated every migration): the Supabase base image auto-grants ALL
-- privileges on every new public table to anon + authenticated. Strip that back,
-- then grant least privilege:
--   * anon          → nothing at all (deny-by-default). The smoke-check anon-grant
--                     audit (check 8) fails automatically if this is skipped.
--   * authenticated → select/insert/delete only (NO update — no writable field
--                     yet); RLS scopes every one to the owner's own rows.
--   * service_role  → untouched (trusted server role, bypasses RLS).
revoke all on public.watchlist_items from anon, authenticated;
grant select, insert, delete on public.watchlist_items to authenticated;
