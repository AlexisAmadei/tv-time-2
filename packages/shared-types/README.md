# @tv-time-2/shared-types

Types shared between the Expo client (`app/`) and the Supabase Edge Functions
(`supabase/functions/*`).

## What lives here

- **`ErrorEnvelope`** (`{ message, code, details }`) — the one error shape every
  boundary returns (ARCH-10). PostgREST's default errors are already close to
  this shape; GoTrue's are not (it uses `msg`, no `details`), so upstream errors
  are normalized to this envelope. Every Edge Function must return it exactly.

## Build-free by design

This package ships plain `.ts` source with **no build step**. `main`/`types`
point straight at `src/index.ts`.

- **The Expo client** consumes it through the pnpm workspace symlink. Metro is
  configured (in `app/metro.config.js`) to watch the repo root and follow
  symlinks, so it transpiles this source directly.
- **Edge Functions run on Deno**, which cannot use pnpm workspace resolution.
  When the first function needs these types (Story 1.4+), it will import the
  source directly (relative path or `npm:`/import-map) or via a small build
  step. Keeping the package build-free now avoids committing to either path
  prematurely — there is exactly one stub package, so there is nothing yet for
  a task runner (Turborepo, etc.) to orchestrate.

## Coming later (not in Story 1.1)

Once the first migration exists (Story 1.5+):

- Supabase-generated DB types: `supabase gen types typescript`
- Zod schemas: mood enum, note length cap, rating half-steps

There are no tables yet, so there is nothing to generate for Story 1.1.
