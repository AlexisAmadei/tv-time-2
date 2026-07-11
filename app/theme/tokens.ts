// Design tokens — the single source of truth for the tv-time visual identity
// (Story 1.3, AC1). Transcribed VERBATIM from the UX DESIGN.md frontmatter
// (planning-artifacts/ux-designs/.../DESIGN.md). Both modes are defined here;
// only `dark` (VHS Dusk) is wired this story — `light` (Paper White) is
// defined-but-dormant until Story 4.3 (FR45).
//
// Role-mapping rule (UX-DR1): screens reference roles — theme.colors.primary,
// theme.colors.surfaceRaised, theme.type.hero — never a literal hex and never a
// mode-specific name. That is what lets Story 4.3 flip to Paper White with zero
// screen edits. Snake_case is a DB convention (ARCH-10); these TS tokens are
// camelCase.

import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Color roles. Both palettes expose the identical key set so behavior never
 * depends on the active mode.
 */
export interface ColorPalette {
  /** Base canvas. */
  surfaceBase: string;
  /** Cards, nav bar, sheets. */
  surfaceRaised: string;
  /** Recessed surfaces (selected chips, wells). */
  surfaceSunken: string;
  /** Primary type. */
  inkPrimary: string;
  /** Secondary / muted type. */
  inkSecondary: string;
  /** 1px separators. */
  borderHairline: string;
  /** Primary action, active nav, logo. */
  primary: string;
  /** Pressed state of `primary`. */
  primaryPress: string;
  /** Secondary accent: avatars, kickers, poster placeholders. */
  cool: string;
  /** Memory/identity color — rating stars + notify/caught-up only. Never nav/buttons/decoration. */
  gold: string;
  /** Functional success state (DESIGN.md:99) — used sparingly, never for brand/decoration. */
  success: string;
}

/** Dark — VHS Dusk. The default and the only wired mode this story. */
export const darkColors: ColorPalette = {
  surfaceBase: '#16131E',
  surfaceRaised: '#211C2C',
  surfaceSunken: '#2A2438',
  inkPrimary: '#ECE7F2',
  inkSecondary: '#8A82A0',
  borderHairline: '#2E2A3A',
  primary: '#EC5A92',
  primaryPress: '#D43F7B',
  cool: '#45C2CF',
  gold: '#F2C14E',
  success: '#4CAF6D',
};

/** Light — Paper White. Defined-but-dormant; wired in Story 4.3 (FR45). */
export const lightColors: ColorPalette = {
  surfaceBase: '#FAF9F7',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#F4F5F6',
  inkPrimary: '#262B2A',
  inkSecondary: '#7E857F',
  borderHairline: '#ECE9E4',
  primary: '#E0654F',
  primaryPress: '#C24F3B',
  cool: '#2F8F88',
  gold: '#DCA82E',
  success: '#3D8B5F',
};

/**
 * fontFamily keys must match the names registered with `useFonts` (see
 * theme/fonts.ts). Fraunces is display-only — never used for body/meta.
 */
export const fontFamily = {
  /** Fraunces 700 — display: logo, hero, titles, card titles. */
  display: 'Fraunces-Bold',
  /** DM Sans 400 — body, meta. */
  body: 'DMSans-Regular',
  /** DM Sans 600 — labels, buttons. */
  bodyMedium: 'DMSans-SemiBold',
  /** DM Sans 700 — kicker. */
  bodyBold: 'DMSans-Bold',
} as const;

/**
 * Typography scale (role → TextStyle). Sizes/weights/families copied verbatim
 * from DESIGN.md#Typography. Custom fonts carry their weight in the file, so we
 * select weight via `fontFamily`, not `fontWeight`.
 */
export const typography = {
  /** 27 / Fraunces 700 — Now Watching, big titles. */
  hero: { fontFamily: fontFamily.display, fontSize: 27 },
  /** 20 / Fraunces 700 — section / screen headings. */
  title: { fontFamily: fontFamily.display, fontSize: 20 },
  /** 15 / Fraunces 700 — title-card headings. */
  cardTitle: { fontFamily: fontFamily.display, fontSize: 15 },
  /** 15 / DM Sans 400 — long text. */
  body: { fontFamily: fontFamily.body, fontSize: 15 },
  /** 12 / DM Sans 600 — labels, buttons, active tab labels. */
  label: { fontFamily: fontFamily.bodyMedium, fontSize: 12 },
  /** 11 / DM Sans 400 — dense meta. */
  meta: { fontFamily: fontFamily.body, fontSize: 11 },
  /** 10 / DM Sans 700 uppercase, 0.1em tracking (= 1px at 10px). */
  kicker: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
} satisfies Record<string, TextStyle>;

/** Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 (DESIGN.md#Layout). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Standard screen margin. */
export const screenMargin = 16;

/** Corner radii. No hard 90° corners; only the avatar is fully circular. */
export const radius = {
  sm: 8,
  md: 13,
  lg: 18,
  pill: 999,
} as const;

/**
 * Elevation. Dark separates surfaces by *tone* (raised-plum on ink-plum), NOT
 * shadow — shadows read poorly on dark. The fast-add (+) is the one element
 * with a real lift, raised `fabLift` px above the nav bar. The light-mode soft
 * shadow is dormant until the Paper White palette is wired (Story 4.3).
 */
export const elevation = {
  /** px the center (+) FAB is raised above the bottom bar. */
  fabLift: 16,
  /** Dormant light-mode card shadow: 0 2px 8px rgba(38,43,42,0.06). */
  lightCardShadow: {
    shadowColor: '#262B2A',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.06,
    elevation: 2,
  } satisfies ViewStyle,
} as const;

export type ThemeMode = 'dark' | 'light';

/** The resolved theme object handed to screens via `useTheme()`. */
export interface Theme {
  mode: ThemeMode;
  colors: ColorPalette;
  type: typeof typography;
  fontFamily: typeof fontFamily;
  spacing: typeof spacing;
  screenMargin: number;
  radius: typeof radius;
  elevation: typeof elevation;
}

const shared = { type: typography, fontFamily, spacing, screenMargin, radius, elevation };

export const darkTheme: Theme = { mode: 'dark', colors: darkColors, ...shared };
export const lightTheme: Theme = { mode: 'light', colors: lightColors, ...shared };

/** Resolve a theme object for a mode. */
export function themeForMode(mode: ThemeMode): Theme {
  return mode === 'light' ? lightTheme : darkTheme;
}
