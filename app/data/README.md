# app/data

The data layer: the single `supabase-js` client, typed query hooks, and the
outbox / local-first sync worker.

For the Story 1.1 scaffold this holds only:

- **`supabaseClient.ts`** — the one `supabase` client instance (created from
  `EXPO_PUBLIC_*` env) plus `checkSupabaseHealth()`, the startup connectivity
  probe.

Typed query hooks and the outbox/sync worker land from Story 1.5 onward.
