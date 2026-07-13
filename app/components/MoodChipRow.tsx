// Each chip announces its NAME to screen readers, never the bare emoji (UX-DR23, AC6).

import { StyleSheet, Pressable, Text, View } from 'react-native';

import { MOODS } from '../data/moods';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

type Props = {
  /** Currently selected emoji, in selection order (oldest first). */
  value: string[];
  onChange: (value: string[]) => void;
  max: number;
  disabled?: boolean;
};

export default function MoodChipRow({ value, onChange, max, disabled = false }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const toggle = (emoji: string) => {
    if (disabled) return;
    if (value.includes(emoji)) {
      onChange(value.filter((e) => e !== emoji));
      return;
    }
    if (value.length < max) {
      onChange([...value, emoji]);
      return;
    }
    // At capacity — drop the oldest selection and append the new one so the tap
    // is never a no-op (max={1} = replace; max={2} = rolling window of 2).
    onChange([...value.slice(1), emoji]);
  };

  return (
    <View style={styles.moodRow}>
      {MOODS.map(({ emoji, name }) => {
        const selected = value.includes(emoji);
        return (
          <Pressable
            key={emoji}
            onPress={() => toggle(emoji)}
            disabled={disabled}
            style={[styles.moodChip, selected && styles.moodChipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={name}
          >
            <Text style={styles.moodEmoji}>{emoji}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, spacing, radius } = theme;
  return StyleSheet.create({
    moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    moodChip: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceBase,
    },
    moodChipSelected: { backgroundColor: colors.surfaceSunken },
    moodEmoji: { fontSize: 20 },
  });
}
