# Deferred Work

Items surfaced during reviews and deferred for later, with the reason each was deferred.

## Deferred from: code review of story-1.1 (2026-07-03)

- **Edge Functions may never report healthy → fails the AC1 "six healthy" gate.** Two intertwined causes: (a) the `functions` healthcheck uses `bash` + `/dev/tcp` which the Deno-based `edge-runtime` image may not contain [`supabase/docker-compose.yml` ~L1838]; (b) `main/index.ts` imports `jose` from a live `deno.land/x` URL with no lock/vendor, so a cold/offline first bring-up leaves `main` unable to load [`supabase/functions/main/index.ts` L1929]. Both keep `functions` unhealthy, failing AC1 and `pnpm run verify`. Options if revisited: vendor/pin `jose` + make the healthcheck `sh`-compatible; document a network prereq for first boot; or drop `functions` from the smoke-check `EXPECTED` set. — **Deferred:** app home screen already gets a Supabase 200, so the stack connects fine in practice; the functions-healthy gate isn't an active blocker.

## Deferred from: code review of story-1.4 (2026-07-04)

- **`catalog_cache` has no eviction — unbounded growth.** The TTL (`CACHE_TTL_MS`) only decides whether a row is re-written; nothing ever DELETEs stale rows [`supabase/migrations/0002_catalog_cache.sql`; `supabase/functions/catalog-search/index.ts` L192-226]. — **Deferred:** the cache is by-design "freely evictable"; a TTL sweep (pg_cron) is a separate maintenance concern, out of 1.4 scope. Revisit alongside the poller work (6.4).
- **Both TMDB keys empty is masked as a connectivity 502.** With neither `TMDB_ACCESS_TOKEN` nor `TMDB_API_KEY` set, the v3 path sends `api_key=''`, TMDB 401s, and the caller sees the generic "check your connection" copy — an operator misconfiguration is indistinguishable from a user outage [`supabase/functions/catalog-search/index.ts` L64-90, L670]. — **Deferred:** hardening only; a real deploy sets the key. Could add a startup config guard returning a distinct 5xx.
- **`auth.getUser()` transport failure is reported as 401, not 5xx.** A GoTrue outage inside the container sets `userErr` and returns the `unauthorized` 401, telling a signed-in user their auth failed [`supabase/functions/catalog-search/index.ts` L137-144]. — **Deferred:** low-frequency infra case; distinguishing it requires inspecting the error type. Non-blocking.
