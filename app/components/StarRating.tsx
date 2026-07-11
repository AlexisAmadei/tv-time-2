// Shared ½-step 5-star rating row (Story 3.5, extracted from BulkLogSheet where
// it first landed in 3.4 — that story's scope wall explicitly deferred the
// extraction to here, "once 3.5's own, richer requirements are known").
//
// DESIGN.md#Components: 5 stars, ½-step, gold, empty portion at 28% opacity.
// Each star is two half-width tap targets (44pt tall) so a tap on the left half
// sets the ½ value and the right half sets the full value. Radio behavior:
// tapping the current value clears it back to null.
//
// `value` is on `watches.rating`'s 0–10 smallint scale (0 = unset via null,
// 2 = 1 star, 9 = 4½ stars, 10 = 5 stars) — no schema mapping needed.

import { StyleSheet, Pressable, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

const STAR_COUNT = 5;

type Props = {
  /** 0–10 half-star scale, or null when unrated. */
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
};

export default function StarRating({ value, onChange, disabled = false }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  // Radio behavior: selecting a new value replaces the old; tapping the
  // already-selected value clears it (null = unset, representable).
  const handlePress = (next: number) => {
    if (disabled) return;
    onChange(value === next ? null : next);
  };

  return (
    <View style={styles.starRow}>
      {Array.from({ length: STAR_COUNT }, (_, i) => {
        const halfValue = i * 2 + 1;
        const fullValue = i * 2 + 2;
        const current = value ?? 0;
        const filled = current >= fullValue;
        const half = !filled && current >= halfValue;
        const iconName = half ? 'star-half' : 'star';
        return (
          <View key={i} style={styles.starTarget}>
            <Pressable
              onPress={() => handlePress(halfValue)}
              disabled={disabled}
              style={styles.starHalfTap}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${i + 0.5} stars`}
              accessibilityState={{ selected: half, disabled }}
            />
            <Pressable
              onPress={() => handlePress(fullValue)}
              disabled={disabled}
              style={styles.starHalfTap}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${i + 1} stars`}
              accessibilityState={{ selected: filled, disabled }}
            />
            <Ionicons
              name={iconName}
              size={28}
              color={theme.colors.gold}
              style={[styles.starIcon, !filled && !half && styles.starEmpty]}
              pointerEvents="none"
            />
          </View>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { spacing } = theme;
  return StyleSheet.create({
    starRow: { flexDirection: 'row', gap: spacing.xs },
    starTarget: {
      width: 28,
      height: 44,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
    },
    starHalfTap: { width: 14, height: 44 },
    starIcon: { position: 'absolute', left: 0, top: 8 },
    // DESIGN.md#Components: empty portion of the star at 28% opacity.
    starEmpty: { opacity: 0.28 },
  });
}
