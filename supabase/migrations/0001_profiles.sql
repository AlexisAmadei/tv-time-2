-- 0001_profiles.sql — the FIRST migration in this repo (Story 1.2).
--
-- Establishes the pattern every later migration follows:
--   * snake_case DB objects (ARCH-10)
--   * explicit RLS the moment a table is created — deny-by-default (AD-1)
--   * every FK to auth.users(id) is ON DELETE CASCADE (AD-8, GDPR)
--
-- Written idempotent / re-runnable (create-if-not-exists, drop-then-create for
-- policies/trigger, create-or-replace for the function): there is no migration-
-- tracking table yet (a real runner is deferred), so `pnpm run supabase:migrate`
-- can safely re-apply the whole folder.

-- The @handle discovery record for each account (FR2, FR32). One row per user,
-- created automatically by the trigger below when a GoTrue user is inserted.
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  -- The account this profile belongs to. Distinct uuid PK + owner_id FK per the
  -- story AC (owner_id = auth.uid()). ON DELETE CASCADE so delete-my-account
  -- (Epic 7) unwinds by cascade, never a hand-maintained loop (AD-8).
  owner_id       uuid not null unique references auth.users (id) on delete cascade,
  -- The @username handle, captured at sign-up. Case-insensitively unique (index
  -- below). Format/length guarded so a bad handle fails the sign-up transaction.
  username       text not null,
  display_name   text,
  -- Nullable — avatar upload is Epic 4 (Story 4.4); the column exists now.
  avatar         text,
  -- Private-by-default global toggle (FR29a). Its read semantics (effective
  -- visibility) are exercised in Story 1.6 / Epic 5; here it just defaults off.
  share_activity boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,30}$')
);

-- Case-insensitive uniqueness for the handle. A plain `unique` on username is
-- case-sensitive and would let 'Alice' and 'alice' coexist — use lower().
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- RLS: owner-only. No policy for anon => anonymous SELECT returns zero rows.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (owner_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- GRANTs gate table visibility; RLS filters the rows within. Both are required:
-- with no grant even the owner gets a permission error, not an empty set.
--
-- Gotcha: the Supabase base image sets ALTER DEFAULT PRIVILEGES that auto-grant
-- ALL privileges on every new public table to anon + authenticated. Strip that
-- back to least privilege here (later stories / the 1.6 deny-by-default audit
-- rely on this being explicit per table):
--   * anon          → nothing at all (deny-by-default, AC6)
--   * authenticated → SELECT + UPDATE only; RLS scopes those to the owner's row.
--     No INSERT/DELETE grant — the client never mutates profiles directly; the
--     SECURITY DEFINER trigger below owns creation (and runs as its definer, not
--     as authenticated, so revoking INSERT here does not break sign-up).
--   * service_role  → untouched (trusted server role, bypasses RLS).
revoke all on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

-- Auto-create the profile row when a GoTrue user is created. Reads the username
-- + display_name the client stashed in raw_user_meta_data at sign-up. Runs in
-- the SAME transaction as the auth.users insert, so a duplicate username
-- (unique-index violation) or a missing/blank username (NOT NULL / format check)
-- rolls the whole sign-up back — enforcing "username required + unique" atomically.
-- security definer + empty search_path: needed to insert into public.profiles
-- from the auth trigger, and injection-safe (every name is fully qualified).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (owner_id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bound display_name/avatar length. Unlike username (CHECK above), these were
-- unconstrained text columns populated via the SECURITY DEFINER trigger from
-- client-controlled sign-up metadata — nothing stopped an arbitrarily large
-- string from being stored. Added via a guarded DO block (not `if not exists`,
-- which ADD CONSTRAINT doesn't support) so re-applying this file stays safe.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_length') then
    alter table public.profiles
      add constraint profiles_display_name_length check (display_name is null or char_length(display_name) <= 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_length') then
    alter table public.profiles
      add constraint profiles_avatar_length check (avatar is null or char_length(avatar) <= 2048);
  end if;
end $$;
