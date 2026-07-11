// Custom 5-slot bottom tab bar (Story 1.3, Task 4).
//
// A custom `tabBar` renderer (not the default bar) because the layout needs
// things the default bar can't express: the lifted center (+) FAB, an
// always-visible label beside/under the active icon, and the tone-based dark
// styling (surface-raised bar, hairline top border). [UX-DR9, UX-DR13, UX-DR25]
//
// Accessibility floor (NFR7): every slot is tap-to-act (no long-press), tap
// targets are ≥ 44pt / 48dp, active state carries icon + label + color (never
// color alone), and each control exposes role + selected state to the screen
// reader.

import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

/** The route rendered as the lifted center (+) fast-add FAB, not a normal tab. */
const FAB_ROUTE = 'Add';

/** Feather icon per tab route (the FAB route is handled separately). */
const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Home: 'home',
  Recommendations: 'compass',
  Feed: 'rss',
  Profile: 'user',
};

/** Minimum tap target — 44pt iOS floor; Android 48dp is covered by the row height. */
const MIN_TAP = 48;

export default function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surfaceRaised,
          borderTopColor: theme.colors.borderHairline,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const isFocused = state.index === index;
        const label =
          typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Center (+) — the fast-add FAB. Present + tappable this story; the real
        // search-first log flow is Story 1.4/1.5. It routes to the `add` stub.
        if (route.name === FAB_ROUTE) {
          return (
            <View key={route.key} style={styles.slot}>
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel="Log a watch"
                // Reflect current-destination state: when the Add screen is
                // focused, the (+) is the active route (AC4 — expose role +
                // state, not position/lift alone).
                accessibilityState={{ selected: isFocused }}
                hitSlop={8}
                style={[
                  styles.fab,
                  {
                    backgroundColor: theme.colors.primary,
                    borderRadius: theme.radius.md,
                    top: -theme.elevation.fabLift,
                    borderColor: theme.colors.surfaceRaised,
                  },
                ]}
              >
                <Feather name="plus" size={28} color={theme.colors.surfaceRaised} />
              </Pressable>
            </View>
          );
        }

        const color = isFocused ? theme.colors.primary : theme.colors.inkSecondary;

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={label}
            style={[styles.slot, styles.tab, !isFocused && styles.inactive]}
          >
            <Feather name={TAB_ICONS[route.name] ?? 'circle'} size={22} color={color} />
            <Text
              // Active state is icon + label + color — never color alone (UX-DR25).
              numberOfLines={1}
              style={[theme.type.label, { color, marginTop: 2 }]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    // Let the lifted (+) overflow the top edge of the bar.
    overflow: 'visible',
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    minHeight: MIN_TAP,
    paddingVertical: 8,
  },
  inactive: {
    // Muted inactive tabs (~55%) so the active magenta reads clearly.
    opacity: 0.55,
  },
  fab: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    // The one element with a real lift on dark; a thin ring in the bar color
    // seats it visually against the raised surface.
    borderWidth: 4,
  },
});
