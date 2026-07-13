// Profile ("You") — themed placeholder + the temporary sign-out (Story 1.3,
// Task 5). Story 4.1 adds the Diary entry point.
//
// The full profile (stats, favorites, avatar) is Epic 4 (Story 4.2) and the
// real Settings home — where sign-out ultimately lives — is Story 4.3. This
// story replaces the old SignedInScreen, which held the only sign-out control
// from Story 1.2, so sign-out MUST stay reachable: it moves here as a temporary
// affordance until Settings exists. Do not drop it.
//
// The "Diary" row (Story 4.1) is deliberately minimal styling — Story 4.2
// (backlog) owns this screen's real layout/stats and may reorganize it.

import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/ThemeProvider';
import { signOut } from '../../data/auth';
import type { ProfileStackParamList } from '../../navigation/ProfileStack';

type Props = {
  session: Session;
  navigation: NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>['navigation'];
};

export default function ProfileScreen({ session, navigation }: Props) {
  const theme = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const username =
    (session.user.user_metadata?.username as string | undefined) || session.user.email;

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen>
      <Text style={[theme.type.title, { color: theme.colors.inkPrimary }]}>You</Text>
      <Text
        style={[theme.type.body, { color: theme.colors.inkSecondary, marginTop: theme.spacing.sm }]}
      >
        Signed in as {username}
      </Text>

      <Pressable
        onPress={() => navigation.navigate('Diary')}
        accessibilityRole="button"
        accessibilityLabel="Diary"
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
        <Text style={[theme.type.label, { color: theme.colors.inkPrimary }]}>Diary</Text>
      </Pressable>

      <Pressable
        onPress={handleSignOut}
        disabled={signingOut}
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        accessibilityState={{ disabled: signingOut, busy: signingOut }}
        style={({ pressed }) => [
          styles.button,
          {
            marginTop: theme.spacing.xl,
            borderColor: theme.colors.borderHairline,
            borderRadius: theme.radius.md,
            backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surfaceRaised,
            opacity: signingOut ? 0.6 : 1,
          },
        ]}
      >
        {signingOut ? (
          <ActivityIndicator color={theme.colors.inkPrimary} />
        ) : (
          <Text style={[theme.type.label, { color: theme.colors.inkPrimary }]}>Sign out</Text>
        )}
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
