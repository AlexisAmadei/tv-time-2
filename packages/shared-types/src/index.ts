// @tv-time-2/shared-types
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
 * The one error shape every boundary returns.
 *
 * This is the shape PostgREST and GoTrue already return by default; every Edge
 * Function (starting with `catalog-search` in Story 1.4) must conform to it
 * exactly rather than inventing its own error format.
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
