-- 0004_visibility.sql — the private-by-default wall's schema half (Story 1.6).
--
-- Follows the pattern 0001/0002/0003 established:
--   * snake_case DB objects (ARCH-10)
--   * idempotent / re-runnable (guarded DO block for ADD CONSTRAINT, which has
--     no `IF NOT EXISTS` form; `CREATE OR REPLACE FUNCTION` is idempotent by
--     construction), no migration-tracking table yet, so
--     `pnpm run supabase:migrate` re-applies the whole folder.
--
-- What this migration IS: the SQL half of AD-1's target formula
-- (`owner_id = auth.uid() OR (EXISTS follow-edge AND effective_visibility =
-- 'shared')`) that can be built today — a domain constraint on
-- `watches.visibility` (created null-only by 0003_watches.sql / Story 1.5) and
-- a pure `effective_visibility()` function computing row-override-else-global.
--
-- What this migration deliberately is NOT: it does NOT touch any RLS policy.
-- `follows` (Epic 5) doesn't exist yet, so there is no follow-edge to gate a
-- `'shared'` branch safely. Wiring `... OR effective_visibility = 'shared'`
-- into `watches_select_own` today, with no follow-edge check, would let *any*
-- authenticated user read *any* row whose `visibility` happens to be
-- `'shared'` — an access-control bug, and the exact opposite of what this
-- story exists to prove. Epic 5's own dependency note (epics.md) explicitly
-- assigns that policy ALTER to itself, once `follows` exists. Do not
-- "helpfully" wire the OR-branch here or in any later story without also
-- adding the `EXISTS follow-edge` guard alongside it.

-- Restrict watches.visibility to the only values effective_visibility() (below)
-- and Epic 5's future policy branch can meaningfully distinguish. 0003_watches.sql
-- created this column nullable with no CHECK; add it now via a guarded DO block
-- (ADD CONSTRAINT has no IF NOT EXISTS form), copying 0001_profiles.sql's
-- profiles_display_name_length/profiles_avatar_length pattern verbatim.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'watches_visibility_values') then
    alter table public.watches
      add constraint watches_visibility_values check (visibility is null or visibility in ('private', 'shared'));
  end if;
end $$;

-- Row-override-else-global-toggle. `immutable` (not `stable`/`volatile`) is
-- correct: it only reads its two scalar arguments, no table/session access
-- (auth.uid() never appears here) — that's what will let Epic 5 inline it
-- directly into an RLS policy expression later without a per-row subquery
-- cost, and what makes it trivially unit-testable with no auth context at all.
create or replace function public.effective_visibility(row_visibility text, share_activity boolean)
returns text
language sql
immutable
as $$
  select coalesce(row_visibility, case when share_activity then 'shared' else 'private' end);
$$;
