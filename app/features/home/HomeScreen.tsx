// Home — the warm new-user empty state (Story 1.3, Task 5, AC3).
//
// A brand-new user with no data never sees cold zeroes or fabricated shelves:
// they land on the exact warm invitation and a single CTA that routes into the
// (+) fast-add slot. The real Home shelves (Up Next / Watchlist /
// Recommendations) need `watches`/catalog data and arrive in Epics 2–3.
//
// Copy is a requirement, not decoration (UX-DR20). Exact string, no banned
// patterns (no streaks/guilt/nags), zero-to-one emoji.

import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/ThemeProvider';
import type { RootTabParamList } from '../../navigation/AppShell';

type Props = BottomTabScreenProps<RootTabParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const theme = useTheme();

  return (
    <Screen center>
      <View style={styles.block}>
        <Text
          style={[theme.type.hero, styles.centerText, { color: theme.colors.inkPrimary }]}
        >
          Your story starts here.
        </Text>
        <Text
          style={[
            theme.type.body,
            styles.centerText,
            { color: theme.colors.inkSecondary, marginTop: theme.spacing.md },
          ]}
        >
          What did you watch tonight?
        </Text>

        <Pressable
          onPress={() => navigation.navigate('Add')}
          accessibilityRole="button"
          accessibilityLabel="Log a watch"
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: pressed ? theme.colors.primaryPress : theme.colors.primary,
              borderRadius: theme.radius.pill,
              marginTop: theme.spacing.xl,
            },
          ]}
        >
          <Text style={[theme.type.label, { color: theme.colors.inkPrimary }]}>
            Log a watch
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { alignItems: 'center', maxWidth: 320 },
  centerText: { textAlign: 'center' },
  cta: {
    minHeight: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
