import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { checkSupabaseHealth } from './data/supabaseClient';
import { useSession } from './data/auth';
import { triggerSync } from './data/watchSync';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { useAppFonts } from './theme/fonts';
import AuthScreen from './features/auth/AuthScreen';
import AppShell from './navigation/AppShell';

type HealthState =
  | { phase: 'checking' }
  | { phase: 'ok' }
  | { phase: 'error'; message: string };

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const theme = useTheme();

  // Gate first render on the bundled brand fonts so the UI never flashes a
  // system-font fallback or renders Fraunces as the wrong glyphs (Story 1.3
  // Task 3). Fonts + the Supabase health probe (1.1 AC2) both resolve before
  // any real UI shows.
  const { loaded: fontsLoaded, error: fontError } = useAppFonts();
  const [health, setHealth] = useState<HealthState>({ phase: 'checking' });

  useEffect(() => {
    let cancelled = false;
    checkSupabaseHealth()
      .then(() => {
        if (!cancelled) setHealth({ phase: 'ok' });
      })
      .catch((e: Error) => {
        if (!cancelled) setHealth({ phase: 'error', message: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync triggers (Story 1.5, AC3): cold-start/foreground, and a one-time
  // reconnect listener at the app root. The third trigger (opportunistic,
  // right after a local logWatch write) lives in watchLog.ts itself.
  useEffect(() => {
    void triggerSync().catch(() => {});
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void triggerSync().catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (fontError) {
      // Fail open: proceed with the system font rather than hang forever.
      console.warn('Brand fonts failed to load; falling back to system font.', fontError);
    }
  }, [fontError]);

  // One status-bar declaration, derived from the active theme (dark → light
  // content). Declared once here so every branch below inherits it; when Story
  // 4.3 wires Paper White this flips automatically.
  const statusBar = <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;

  // Fonts still loading with no error yet — a bare spinner (no text, so no font
  // fallback shows). `fontError` unblocks the gate (system-font fallback).
  if (!fontsLoaded && !fontError) {
    return (
      <>
        {statusBar}
        <Loading />
      </>
    );
  }

  return (
    <>
      {statusBar}
      {health.phase === 'checking' && <Loading label="Checking Supabase connectivity…" />}
      {health.phase === 'error' && <ErrorState message={health.message} />}
      {health.phase === 'ok' && <AuthGate />}
    </>
  );
}

function AuthGate() {
  const { session, loading } = useSession();

  if (loading) {
    return <Loading />;
  }
  return session ? <AppShell session={session} /> : <AuthScreen />;
}

function Loading({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.centered, { backgroundColor: theme.colors.surfaceBase }]}>
      <ActivityIndicator color={theme.colors.primary} />
      {label ? (
        <Text style={[theme.type.body, { color: theme.colors.inkSecondary, marginTop: 12 }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function ErrorState({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.centered, { backgroundColor: theme.colors.surfaceBase }]}>
      <Text style={[theme.type.body, styles.error, { color: theme.colors.primary }]}>
        ✗ {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  error: { textAlign: 'center' },
});
