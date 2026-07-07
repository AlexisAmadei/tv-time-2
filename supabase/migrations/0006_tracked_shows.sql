-- 0006_tracked_shows.sql — the `tracked_shows` table, owner-only RLS (Story 3.1).
--
-- Follows the pattern 0001_profiles.sql / 0002_catalog_cache.sql /
-- 0003_watches.sql / 0005_watchlist_items.sql established:
--   * snake_case DB objects (ARCH-10)
--   * explicit RLS the moment the table is created — deny-by-default (AD-1)
--   * every FK to auth.users(id) is ON DELETE CASCADE (AD-8)
--   * idempotent / re-runnable (create-if-not-exists, drop-then-create for
--     policies), no migration-tracking table yet, so `pnpm run supabase:migrate`
--     re-applies the whole folder.
--
-- What this table IS (FR10, ARCH-5, ARCH-10): a title the user is actively
-- tracking ("I'm watching this") — a show or film whose progress they want
-- surfaced on Home / Up Next. Identity is (tmdb_id, media_type) by VALUE
-- (ARCH-10), never an FK to a catalog entity; same modeling as `watches` and
-- `watchlist_items`.
--
-- What this table IS NOT:
--   * NOT `watchlist_items` — a watchlist entry is saved-for-later with no
--     progress concept; a tracked show carries `next_episode_pointer`, the
--     "where you are" state that only tracking has. Distinct table, distinct
--     purpose (Story 3.1 scope wall).
--   * NOT `watches` — tracking a show does not log a watch. Watching an
--     episode (3.2) or a film (3.3) is a separate `watches` row.
--   * NOT untrackable (yet) — no AC in Epic 3 asks for a remove/untrack
--     action, so there is deliberately no client DELETE grant. See the
--     UPDATE note below for the matching reasoning on write access.
--   * NOT follower-visible — RLS is owner-only. `visibility` exists
--     (mirroring watchlist_items/watches) but is created nullable and NEVER
--     written by this story; Epic 5 wires the follower branch later (same
--     reasoning as 0005_watchlist_items.sql's header comment).
--   * NOT client-writable on `next_episode_pointer` — that column is owned
--     entirely by the `recompute_next_episode_pointer` security-definer RPC
--     (0007), never by a raw client PATCH. See the grants note below.

create table if not exists public.tracked_shows (
  id                    uuid primary key default gen_random_uuid(),
  -- Owner. Cascades so a future delete-my-account (Epic 7) unwinds
  -- structurally (AD-8), never via a hand-maintained loop.
  user_id               uuid not null references auth.users (id) on delete cascade,
  tmdb_id               integer not null,
  media_type            text not null check (media_type in ('movie', 'tv')),
  -- A TMDB EPISODE id (not a season/episode-number pair) — the same per-
  -- episode identity `watches.tmdb_episode_id` (0003) references. Nullable:
  -- null on first track (before the RPC ever runs), permanently null for
  -- films (a film has no "next episode"), and null again once a show is
  -- fully caught up. Only ever written by the recompute RPC (0007) — see
  -- the grants note below for why there is no update policy for the client.
  next_episode_pointer  integer,
  created_at            timestamptz not null default now(),
  -- Nullable, never written by this story (mirror of watchlist_items.visibility
  -- / watches.visibility's shape). Epic 5 wires the follower branch once
  -- `follows` exists (see 0005_watchlist_items.sql for why it waits).
  visibility            text check (visibility is null or visibility in ('private', 'shared'))
);

-- Idempotent uniqueness (AC4, "not duplicated"): at most one tracked row per
-- (owner, title) — the DB, not the client, guarantees this. Mirrors
-- watchlist_items_owner_title_idx exactly.
create unique index if not exists tracked_shows_owner_title_idx
  on public.tracked_shows (user_id, tmdb_id, media_type);

-- RLS: owner-only. Do NOT add a follower-visibility OR clause here — `follows`
-- (Epic 5) doesn't exist yet, and a premature `... OR visibility = 'shared'`
-- branch with no follow-edge guard would let any authenticated user read any
-- 'shared' row (the exact access-control bug 0004_visibility.sql warns against).
alter table public.tracked_shows enable row level security;

drop policy if exists tracked_shows_select_own on public.tracked_shows;
create policy tracked_shows_select_own on public.tracked_shows
  for select using (user_id = auth.uid());

drop policy if exists tracked_shows_insert_own on public.tracked_shows;
create policy tracked_shows_insert_own on public.tracked_shows
  for insert with check (user_id = auth.uid());

-- Deliberately NO update or delete policy for `authenticated`. AD-10 requires
-- the client never issue a raw PATCH against `next_episode_pointer` — the
-- security-definer RPC (0007) is the only writer, now and in every future
-- story that touches this column (3.2, 3.7). There is also no untrack feature
-- in this story or anywhere in Epic 3 (scope wall) — building a delete policy
-- with no feature to use it would be dead access surface. Enforcing this at
-- the grant level (not just convention) is the point.

-- Gotcha (repeated every migration): the Supabase base image auto-grants ALL
-- privileges on every new public table to anon + authenticated. Strip that
-- back, then grant least privilege:
--   * anon          → nothing at all (deny-by-default). The smoke-check
--                     anon-grant audit (check 8) fails automatically if this
--                     is skipped.
--   * authenticated → select/insert only. NO update, NO delete — the pointer
--                     is RPC-owned (see above) and there is no untrack action.
--   * service_role  → untouched (trusted server role, bypasses RLS; the
--                     recompute RPC below still runs as `security definer`
--                     under the calling user's own role, not service_role).
revoke all on public.tracked_shows from anon, authenticated;
grant select, insert on public.tracked_shows to authenticated;
