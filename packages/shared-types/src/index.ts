// @popcorn-time/shared-types
//
// The single source of types shared between the Expo client (`app/`) and the
// Supabase Edge Functions (`supabase/functions/*`). Kept as plain, build-free
// `.ts` so it can be consumed both by Metro (via the pnpm workspace symlink)
// and — later — by Deno-based Edge Functions (which cannot use pnpm workspace
// resolution and will import the source directly or through a build step).
//
// ARCH-10 (consistency conventions): DB objects are snake_case, TypeScript is
// camelCase, and every error crossing a boundary uses the envelope below.

/**
 * The one error shape every boundary returns (ARCH-10).
 *
 * This is the canonical envelope every Edge Function (starting with
 * `catalog-search` in Story 1.4) must return. PostgREST's default errors are
 * already close to it (`message`/`code`/`details`/`hint`), but GoTrue's are not
 * (it uses `msg` and omits `details`), so errors proxied from upstream services
 * must be normalized to this envelope rather than passed through raw.
 */
export interface ErrorEnvelope {
  /** Human-readable description of what went wrong. */
  message: string;
  /** Stable, machine-checkable error code (e.g. "not_found", "unauthorized"). */
  code: string;
  /** Optional structured context; shape is error-specific. */
  details: unknown;
}

/**
 * Narrowing helper: is `value` a well-formed {@link ErrorEnvelope}?
 */
export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).message === 'string' &&
    typeof (value as Record<string, unknown>).code === 'string' &&
    'details' in value
  );
}

// PLACEHOLDER — nothing to generate yet.
//
// Once the first migration exists (Story 1.5+), this package will also export:
//   - Supabase-generated DB types (`supabase gen types typescript`)
//   - Zod schemas (mood enum, note length cap, rating half-steps)
// There are no tables yet, so there is nothing to generate for Story 1.1.
