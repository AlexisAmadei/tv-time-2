-- 0008_watches_mood_check.sql — lock `watches.mood` to the FR18 canonical
-- emoji set (Story 3.4, AC3).
--
-- Follows the pattern established by every prior migration:
--   * idempotent / re-runnable — no migration-tracking table yet, so
--     `pnpm run supabase:migrate` re-applies the whole folder every time.
--   * snake_case DB objects (ARCH-10).
--
-- 0003_watches.sql deliberately created `mood` with no CHECK ("the
-- mood-set enum-via-CHECK is Epic 3/FR17-21's job when the column starts
-- being written"). This story (3.4) is the first to actually write `mood`
-- (Task 1a/1b), so this is that job. Per ARCHITECTURE-SPINE.md's Consistency
-- Conventions: "Moods: text[] constrained by a Postgres check constraint...
-- never validated only in client code" — the DB, not the client, is the
-- source of truth for the locked set.
--
-- Deliberately NO cardinality (array length) constraint — this story only
-- ever writes 0 or 1 elements, but the locked-set rule is about which VALUES
-- are allowed, not how many. Leaving count unconstrained is Story 3.5's call
-- (its own mood concept is a 0–2 multi-select).
--
-- Postgres has no native `ADD CONSTRAINT IF NOT EXISTS`, so guard the ALTER
-- with an explicit existence check against `pg_constraint`. `mood` has only
-- ever been written null (this is the first story to write it — Task 1a/1b),
-- so there are no legacy rows for the implicit validation scan to trip on.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'watches_mood_check'
  ) then
    alter table public.watches
      add constraint watches_mood_check
      check (mood is null or mood <@ array['😭','😂','😱','🥰','🤯','😴','😬','🔥']::text[]);
  end if;
end $$;
