import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { checkSupabaseHealth } from './data/supabaseClient';
import { useSession } from './data/auth';
import AuthScreen from './features/auth/AuthScreen';
import SignedInScreen from './features/auth/SignedInScreen';

type HealthState =
  | { phase: 'checking' }
  | { phase: 'ok' }
  | { phase: 'error'; message: string };

export default function App() {
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

  return (
    <>
      {health.phase === 'checking' && (
        <Centered>
          <ActivityIndicator />
          <Text style={styles.muted}>Checking Supabase connectivity…</Text>
        </Centered>
      )}
      {health.phase === 'error' && (
        <Centered>
          <Text style={styles.error}>✗ {health.message}</Text>
        </Centered>
      )}
      {health.phase === 'ok' && <AuthGate />}
      <StatusBar style="auto" />
    </>
  );
}

// Renders the auth screen or the signed-in app depending on session state.
// Story 1.3 replaces SignedInScreen with the themed shell + bottom navigation.
function AuthGate() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator />
      </Centered>
    );
  }
  return session ? <SignedInScreen session={session} /> : <AuthScreen />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  muted: { color: '#666' },
  error: { color: '#b00020', textAlign: 'center' },
});
