# supabase/functions

Deployable Supabase Edge Functions (Deno runtime).

## `main/` — runtime bootstrap (infra, not a feature)

The self-hosted edge runtime boots with a single "main" service that routes
incoming requests to the individual function directories. `main/index.ts` is
that router, vendored from the official self-hosted setup. It must exist for the
`functions` container to be healthy — it is infrastructure, not application code.

## Feature functions

They land here as their stories arrive:

- `catalog-search` — **landed (Story 1.4).** Proxies TMDB search: verifies the
  caller's GoTrue JWT in-function (401 envelope on unsigned requests), holds the
  TMDB key server-side as the sole caller of TMDB, and reads/writes the
  disposable `catalog_cache` (keyed by `tmdb_id` + `media_type`) with a TTL.
- `catalog-title` — Story 2.2
- `poll-new-episodes` — Story 6.4
- `export-my-data` — Story 7.1
- `delete-my-account` — Story 7.2

Each must return the shared `ErrorEnvelope` (`{ message, code, details }`) from
`@popcorn-time/shared-types` — see ARCH-10. The functions container does **not**
mount that package, so a function inlines the three-field envelope literal
(`catalog-search` does); only the client imports the shared type.

### Auth: verified in-function, not by the router

`FUNCTIONS_VERIFY_JWT` stays `false`. The `main` router's global verify emits a
`{msg}` body (not the `{message, code, details}` envelope) and would also gate
the pg_cron-invoked `poll-new-episodes` (6.4). So each feature function verifies
the JWT itself — create a supabase client with the caller's `Authorization`
header and call `auth.getUser()`; no user ⇒ 401 envelope. Handle `OPTIONS`
(CORS preflight) before the auth check.

### Secrets

Server-side secrets (e.g. `TMDB_ACCESS_TOKEN` / `TMDB_API_KEY`) are injected via
the `functions` service `environment` in `docker-compose.yml`, sourced from the
gitignored `supabase/.env`. They must **never** appear in `app/.env*` or any
`EXPO_PUBLIC_*` var — that is the whole point of the proxy (AD-6).
