# Deferred Work

Items surfaced during reviews and deferred for later, with the reason each was deferred.

## Deferred from: code review of story-1.1 (2026-07-03)

- **Edge Functions may never report healthy → fails the AC1 "six healthy" gate.** Two intertwined causes: (a) the `functions` healthcheck uses `bash` + `/dev/tcp` which the Deno-based `edge-runtime` image may not contain [`supabase/docker-compose.yml` ~L1838]; (b) `main/index.ts` imports `jose` from a live `deno.land/x` URL with no lock/vendor, so a cold/offline first bring-up leaves `main` unable to load [`supabase/functions/main/index.ts` L1929]. Both keep `functions` unhealthy, failing AC1 and `pnpm run verify`. Options if revisited: vendor/pin `jose` + make the healthcheck `sh`-compatible; document a network prereq for first boot; or drop `functions` from the smoke-check `EXPECTED` set. — **Deferred:** app home screen already gets a Supabase 200, so the stack connects fine in practice; the functions-healthy gate isn't an active blocker.
