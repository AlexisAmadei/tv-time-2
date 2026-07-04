// Bundled font assets (Story 1.3, Task 3). Fraunces + DM Sans are both SIL Open
// Font License (see assets/fonts/*-OFL.txt) → redistributable in the
// open-source / F-Droid build (NFR4). The .ttf files are BUNDLED at build time
// and required locally — never fetched from a Google Fonts URL at runtime,
// which would violate NFR3 (Google-free F-Droid) and NFR8 (offline).
//
// The keys here are the family names screens reference through theme.fontFamily
// / theme.type — keep them in sync with theme/tokens.ts.

import { useFonts } from 'expo-font';

export const fontAssets = {
  'Fraunces-Bold': require('../assets/fonts/Fraunces-Bold.ttf'),
  'DMSans-Regular': require('../assets/fonts/DMSans-Regular.ttf'),
  'DMSans-SemiBold': require('../assets/fonts/DMSans-SemiBold.ttf'),
  'DMSans-Bold': require('../assets/fonts/DMSans-Bold.ttf'),
};

/**
 * Load the bundled brand fonts. Gate first render on `loaded` so the UI never
 * flashes a system-font fallback or renders Fraunces as the wrong glyphs.
 *
 * `error` is surfaced (not swallowed): if a bundled `.ttf` fails to decode
 * (corrupt asset, release/F-Droid resolution failure), `loaded` never flips
 * true, so the caller MUST fail open on `error` — otherwise the app hangs
 * forever on the pre-font gate with no way out. Degrading to the system font is
 * strictly better than an indistinguishable-from-a-hang spinner.
 */
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts(fontAssets);
  return { loaded, error };
}
