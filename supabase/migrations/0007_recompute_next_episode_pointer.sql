-- 0007_recompute_next_episode_pointer.sql — the pointer RPC (Story 3.1, AD-10).
--
-- What this function IS: the SOLE writer of `tracked_shows.next_episode_pointer`
-- — now (3.1, initializing the pointer at track-time) and in every future story
-- that touches this column (3.2 organic advancement, 3.7 recompute-after-edit).
-- No other code path may PATCH this column directly (0006's grants enforce
-- this: `authenticated` has no update privilege on `tracked_shows` at all).
--
-- The name matters: this DERIVES the pointer from the user's full `watches`
-- set every call (a user who logged episodes before ever tracking correctly
-- skips past them) — it is not a monotonic "advance by one" increment. The
-- epics.md text still says `advance_next_episode_pointer`; the architecture
-- spine (AD-10, binding) already renamed it to `recompute_next_episode_pointer`
-- for exactly this reason. Build against the spine, not the stale epics text.
--
-- Why `security definer` (the first one in this codebase — every prior
-- function is `security invoker`/`immutable`): this function must read
-- `catalog_cache` for episode ordering, but `catalog_cache` has ZERO grants
-- for `authenticated` (0002 — deny-by-default, only the Edge Function's
-- service-role key reads it). A `security invoker` function running as the
-- calling authenticated role would fail that read outright. `security
-- definer` bridges it — but it also means every query inside this function
-- (including against `tracked_shows` and `watches`) bypasses RLS, not just the
-- catalog_cache read. That is why the very first thing this function does is
-- verify `p_user_id = auth.uid()` and quietly no-op otherwise: without that
-- check, any authenticated caller could pass an arbitrary `p_user_id` and both
-- read and mutate a stranger's tracked show — a straightforward privacy break
-- of exactly the kind AD-1/FR29 exists to prevent. `set search_path = public,
-- pg_temp` is standard `security definer` hardening against search-path
-- hijacking (no prior function in this codebase needed it — this is the first
-- security-definer precedent).
--
-- `p_media_type` (added in code review): `tmdb_id` values are only unique
-- *within* a media type (a movie and a tv show can legitimately share the
-- same numeric TMDB id), and `tracked_shows`' unique index is on
-- `(user_id, tmdb_id, media_type)` — so a user can genuinely have two
-- distinct tracked rows for the same `(user_id, tmdb_id)`. Every lookup and
-- write below is filtered by `p_media_type` to make sure this function only
-- ever touches the one row the caller means, never the other.
create or replace function public.recompute_next_episode_pointer(
  p_user_id uuid,
  p_tmdb_id integer,
  p_media_type text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current    integer;
  v_payload    jsonb;
  v_ordered    integer[];
  v_watched    integer[];
  v_next       integer;
begin
  -- Mandatory security-definer guard (read the header comment above before
  -- touching this) — quietly no-op rather than raising, matching this
  -- codebase's best-effort-degrade convention elsewhere.
  if p_user_id is distinct from auth.uid() then
    return null;
  end if;

  -- Step 1: is this title even tracked by this user? If not, nothing to do.
  -- Filtered by media_type too (see header note) — tmdb_id alone doesn't
  -- uniquely identify a tracked_shows row.
  select next_episode_pointer
    into v_current
    from public.tracked_shows
    where user_id = p_user_id and tmdb_id = p_tmdb_id and media_type = p_media_type
    limit 1;

  if not found then
    return null;
  end if;

  -- Step 2: films never have a next-episode pointer.
  if p_media_type = 'movie' then
    update public.tracked_shows
      set next_episode_pointer = null
      where user_id = p_user_id and tmdb_id = p_tmdb_id and media_type = p_media_type;
    return null;
  end if;

  -- Step 3: tv — build the chronological ordered episode-id list from
  -- catalog_cache.payload->'seasons' (seasonNumber asc, episodeNumber asc
  -- within a season). Skip any episode whose tmdbEpisodeId is null/absent
  -- (pre-Task-2 cached rows, or a malformed entry) rather than erroring —
  -- ->> returns SQL NULL for both a missing key and a JSON null value, so
  -- filtering on "is not null" covers both cases in one check.
  select payload into v_payload
    from public.catalog_cache
    where tmdb_id = p_tmdb_id and media_type = 'tv';

  if v_payload is null or jsonb_typeof(v_payload -> 'seasons') is distinct from 'array' then
    -- Step 4 (part 1): no usable cache row yet — graceful degradation. Leave
    -- the pointer at whatever it currently is (null on first track) and
    -- return that. The user may have tapped "I'm watching this" from a
    -- soft-fail render, or before the rich detail payload finished caching.
    return v_current;
  end if;

  select array_agg(
           (ep ->> 'tmdbEpisodeId')::integer
           order by (season ->> 'seasonNumber')::integer, (ep ->> 'episodeNumber')::integer
         )
    into v_ordered
    from jsonb_array_elements(v_payload -> 'seasons') as season,
         jsonb_array_elements(season -> 'episodes') as ep
    where ep ->> 'tmdbEpisodeId' is not null;

  if v_ordered is null or array_length(v_ordered, 1) is null then
    -- Step 4 (part 2): cache row exists but has no usable episode-id data at
    -- all (every episode pre-dates Task 2's plumbing, or seasons/episodes are
    -- empty) — same graceful degradation as above.
    return v_current;
  end if;

  -- Step 5: this user's full watched-episode-id set (derive-from-full-watch-
  -- set, not a monotonic increment — AD-10's whole point: a user with
  -- episodes logged before ever tracking this show correctly skips past them).
  select array_agg(tmdb_episode_id)
    into v_watched
    from public.watches
    where user_id = p_user_id and tmdb_id = p_tmdb_id and tmdb_episode_id is not null;

  -- Step 6: walk the ordered list, find the first id not already watched.
  v_next := null;
  for i in 1 .. array_length(v_ordered, 1) loop
    if v_watched is null or not (v_ordered[i] = any (v_watched)) then
      v_next := v_ordered[i];
      exit;
    end if;
  end loop;

  update public.tracked_shows
    set next_episode_pointer = v_next
    where user_id = p_user_id and tmdb_id = p_tmdb_id and media_type = p_media_type;

  return v_next;
end;
$$;

-- PostgREST auto-exposes this as POST /rpc/recompute_next_episode_pointer.
-- Grant to authenticated only — never anon.
grant execute on function public.recompute_next_episode_pointer(uuid, integer, text) to authenticated;
