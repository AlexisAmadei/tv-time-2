// Themed screen container (Story 1.3) — the first shared primitive.
//
// Fills the themed base surface, applies the standard screen margin, and honors
// the top safe-area inset (status bar / notch). The bottom inset is owned by the
// bottom tab bar, so we only claim the top edge here.

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

export function Screen({
  children,
  center = false,
}: {
  children: ReactNode;
  /** Center content vertically + horizontally (empty states, placeholders). */
  center?: boolean;
}) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.fill, { backgroundColor: theme.colors.surfaceBase }]}
    >
      <View
        style={[
          styles.body,
          { paddingHorizontal: theme.screenMargin, paddingVertical: theme.spacing.lg },
          center && styles.center,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
