// Minimal signed-in placeholder (Story 1.2).
//
// Proves the session gate works and gives a way back out (sign out). The real
// themed app shell + bottom navigation replace this in Story 1.3.

import type { Session } from '@supabase/supabase-js';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { signOut } from '../../data/auth';

export default function SignedInScreen({ session }: { session: Session }) {
  const username = (session.user.user_metadata?.username as string | undefined) ?? session.user.email;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>You’re in 👋</Text>
      <Text style={styles.muted}>Signed in as {username}</Text>
      <Pressable onPress={signOut} style={styles.button} accessibilityRole="button">
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700' },
  muted: { color: '#666' },
  button: { marginTop: 12, borderWidth: 1, borderColor: '#1a1a2e', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, minHeight: 48, justifyContent: 'center' },
  buttonText: { color: '#1a1a2e', fontWeight: '600' },
});
