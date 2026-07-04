// Theme context (Story 1.3, Task 2). Exposes the active theme object and a
// useTheme() hook to every screen and nav component.
//
// WIRED DARK ONLY this story (AC1). `mode` defaults to 'dark' and there is no
// toggle UI or persistence yet — that is Story 4.3 (FR45). The `mode` state
// below is the single, obvious switch point: Story 4.3 adds a setter +
// persistence here and the whole app flips to Paper White with zero screen
// edits (thanks to the role-mapping rule, UX-DR1).

import { createContext, useContext, useMemo, useState } from 'react';

import { themeForMode, type Theme, type ThemeMode } from './tokens';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Single switch point for Story 4.3 — defaults to (and stays) dark for now.
  const [mode] = useState<ThemeMode>('dark');
  const value = useMemo<ThemeContextValue>(() => ({ mode, theme: themeForMode(mode) }), [mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the active theme. Must be called inside a <ThemeProvider>. */
export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx.theme;
}
