# supabase/functions

Deployable Supabase Edge Functions (Deno runtime).

## `main/` — runtime bootstrap (infra, not a feature)

The self-hosted edge runtime boots with a single "main" service that routes
incoming requests to the individual function directories. `main/index.ts` is
that router, vendored from the official self-hosted setup. It must exist for the
`functions` container to be healthy — it is infrastructure, not application code.

## Feature functions (later stories)

No feature functions exist yet for the Story 1.1 scaffold. They land here as
their stories arrive:

- `catalog-search` — Story 1.4
- `catalog-title` — Story 2.2
- `poll-new-episodes` — Story 6.4
- `export-my-data` — Story 7.1
- `delete-my-account` — Story 7.2

Each must return the shared `ErrorEnvelope` (`{ message, code, details }`) from
`@tv-time-2/shared-types` — see ARCH-10.
