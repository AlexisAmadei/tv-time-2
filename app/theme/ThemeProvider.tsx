import { createContext, useContext, useMemo, useState } from 'react';

import { themeForMode, type Theme, type ThemeMode } from './tokens';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
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
