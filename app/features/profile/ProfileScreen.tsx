// Profile ("You") — themed placeholder + the temporary sign-out (Story 1.3,
// Task 5).
//
// The full profile (stats, favorites, avatar) is Epic 4 (Story 4.2) and the
// real Settings home — where sign-out ultimately lives — is Story 4.3. This
// story replaces the old SignedInScreen, which held the only sign-out control
// from Story 1.2, so sign-out MUST stay reachable: it moves here as a temporary
// affordance until Settings exists. Do not drop it.

import type { Session } from '@supabase/supabase-js';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/ThemeProvider';
import { signOut } from '../../data/auth';

export default function ProfileScreen({ session }: { session: Session }) {
  const theme = useTheme();
  const username =
    (session.user.user_metadata?.username as string | undefined) ?? session.user.email;

  return (
    <Screen>
      <Text style={[theme.type.title, { color: theme.colors.inkPrimary }]}>You</Text>
      <Text
        style={[theme.type.body, { color: theme.colors.inkSecondary, marginTop: theme.spacing.sm }]}
      >
        Signed in as {username}
      </Text>

      <Pressable
        onPress={signOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        style={({ pressed }) => [
          styles.button,
          {
            marginTop: theme.spacing.xl,
            borderColor: theme.colors.borderHairline,
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surfaceRaised,
          },
        ]}
      >
        <Text style={[theme.type.label, { color: theme.colors.inkPrimary }]}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
