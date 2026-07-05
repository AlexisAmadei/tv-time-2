-- 0002_catalog_cache.sql — the disposable TMDB catalog cache (Story 1.4).
--
-- Follows the pattern 0001_profiles.sql established:
--   * snake_case DB objects (ARCH-10)
--   * explicit RLS the moment the table is created — deny-by-default (AD-1)
--   * idempotent / re-runnable (create-if-not-exists, no migration-tracking
--     table yet, so `pnpm run supabase:migrate` re-applies the whole folder).
--
-- What this table IS (AD-6): a disposable, freely-evictable TTL cache of TMDB
-- responses, keyed by the catalog identity itself. The `catalog-search` Edge
-- Function is its ONLY writer/reader — via the service-role key, which bypasses
-- RLS. It is populated on search and later read by `catalog-title` (2.2) and the
-- new-episode poller (6.4).
--
-- What this table IS NOT:
--   * NOT a system-of-record — every row is safe to drop; TMDB is re-fetchable.
--   * NOT a local `titles` table (AD-3) — there is none; a watch references a
--     title by `tmdb_id` value, never by a FK into here.
--   * NOT `known_episode_state` (6.4's durable poller baseline) — different
--     table, different lifecycle. Do not conflate them.
--   * NOT a query-result-set cache — no `query`/`search_terms` column
--     (ARCH-10 forbids synonym columns; query caching is Story 2.1's concern).

-- One row per (tmdb_id, media_type) catalog entity.
create table if not exists public.catalog_cache (
  -- TMDB's numeric id. NOT globally unique on its own: TMDB namespaces ids per
  -- type, so a movie and a show can share the same integer. The type is part of
  -- the identity — hence the composite PK below, not a surrogate uuid. (A uuid
  -- PK would imply an owned, durable entity; this is a cache keyed by the
  -- external identity it mirrors — AD-6 "freely evictable".)
  tmdb_id    integer not null,
  media_type text not null check (media_type in ('movie', 'tv')),
  -- The normalized title object (or raw TMDB payload) as returned to the client.
  payload    jsonb not null,
  -- When this row was last written from TMDB. The function applies the TTL
  -- against this (a row older than the TTL is re-fetched rather than trusted).
  fetched_at timestamptz not null default now(),
  primary key (tmdb_id, media_type)
);

-- Deny-by-default (AD-1), exactly as 0001 did. The Supabase base image sets
-- ALTER DEFAULT PRIVILEGES that auto-grant ALL on every new public table to
-- anon + authenticated — strip that back. Here the client NEVER touches this
-- table directly (it goes through the Edge Function, which uses the service-role
-- key), so anon AND authenticated get NOTHING and there are NO policies. RLS is
-- still enabled so an accidental future grant can't silently expose rows.
alter table public.catalog_cache enable row level security;
revoke all on public.catalog_cache from anon, authenticated;
-- (No grants, no policies for anon/authenticated by design. service_role is a
-- trusted server role that bypasses RLS and keeps its default access.)
