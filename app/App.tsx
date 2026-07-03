import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { checkSupabaseHealth } from './data/supabaseClient';

type HealthState =
  | { phase: 'checking' }
  | { phase: 'ok'; status: number }
  | { phase: 'error'; message: string };

export default function App() {
  const [health, setHealth] = useState<HealthState>({ phase: 'checking' });

  useEffect(() => {
    let cancelled = false;
    checkSupabaseHealth()
      .then((status) => {
        if (!cancelled) setHealth({ phase: 'ok', status });
      })
      .catch((e: Error) => {
        if (!cancelled) setHealth({ phase: 'error', message: e.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TV Time 2</Text>
      {health.phase === 'checking' && (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={styles.muted}>Checking Supabase connectivity…</Text>
        </View>
      )}
      {health.phase === 'ok' && (
        <Text style={styles.ok}>✓ Connected to Supabase (HTTP {health.status})</Text>
      )}
      {health.phase === 'error' && <Text style={styles.error}>✗ {health.message}</Text>}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { color: '#666' },
  ok: { color: '#137333', fontWeight: '500', textAlign: 'center' },
  error: { color: '#b00020', textAlign: 'center' },
});
