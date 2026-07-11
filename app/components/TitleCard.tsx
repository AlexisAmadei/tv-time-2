// Shared title-card + poster (Story 2.2, extracted from AddScreen).
//
// The title-card pattern (UX-DR6, DESIGN.md#Components): horizontal card —
// poster left, title/meta/stars/mood right, on surface-raised. Used by search
// results today and by the watchlist shelf / diary / feed in later stories, so
// it lives here (app/components/) as one implementation instead of re-forking
// per feature — this is 2.1's flagged "candidate for 2.2" extraction.
//
// Scope wall (2.2): the star-row / mood-chip slots are rendered conditionally
// and stay EMPTY — no rating/mood data exists until Epic 3, so there is nothing
// to show and we do not fabricate placeholder stars. The ❤️ Add-to-Watchlist
// affordance (2.3) also lands here later; a TODO marks where.

import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';
import { posterUrl, type CatalogResult } from '../data/catalog';

const CARD_POSTER_W = 60;
const CARD_POSTER_H = 90;

const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/**
 * Poster with a cool→dark placeholder fallback. Shows the placeholder while the
 * image loads, when there is no poster path, and if the load fails — never a
 * broken image (FR9). The placeholder layers a translucent `cool` wash over the
 * sunken surface to evoke the design's cool→dark gradient.
 *
 * `width`/`height` default to the title-card poster size; the detail screen
 * passes a larger size for its hero poster.
 */
export function Poster({
  posterPath,
  width = CARD_POSTER_W,
  height = CARD_POSTER_H,
  glyphSize = 22,
}: {
  posterPath: string | null;
  width?: number;
  height?: number;
  glyphSize?: number;
}) {
  const theme = useTheme();
  const uri = posterUrl(posterPath);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showPlaceholder = !uri || failed || !loaded;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: theme.radius.sm,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceSunken,
      }}
    >
      {showPlaceholder && (
        <LinearGradient
          colors={[theme.colors.cool, theme.colors.surfaceBase]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[absoluteFill, styles.placeholderCenter]}
        >
          <Ionicons
            name="film-outline"
            size={glyphSize}
            color={theme.colors.inkSecondary}
            style={styles.posterGlyph}
          />
        </LinearGradient>
      )}
      {uri && !failed && (
        <Image
          source={{ uri }}
          style={[absoluteFill, { width, height }]}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

/**
 * A single result — the title-card pattern. The whole card is tappable and
 * navigates to title detail (Story 2.2, `onPress`); the log action lives on its
 * own icon button so it never collides with that navigation (nested Pressable —
 * the inner button captures its own taps). `onLog`/`logged` are optional so
 * surfaces without a log affordance (e.g. a future watchlist shelf) can omit it.
 */
export function TitleCard({
  item,
  onPress,
  onLog,
  logged = false,
  onToggleWatchlist,
  watchlisted = false,
  onMarkWatched,
  watchedPending = false,
  watchedIcon = false,
}: {
  item: CatalogResult;
  onPress?: (item: CatalogResult) => void;
  onLog?: (item: CatalogResult) => void;
  logged?: boolean;
  onToggleWatchlist?: (item: CatalogResult) => void;
  watchlisted?: boolean;
  onMarkWatched?: (item: CatalogResult) => void;
  watchedPending?: boolean;
  // Watched shelf (HomeScreen): swap the text pill for a round green tick —
  // the item is already known-watched there, so "Watched" as a label is
  // redundant; tapping still logs a rewatch via onMarkWatched (AD-3).
  watchedIcon?: boolean;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const typeLabel = item.mediaType === 'tv' ? 'TV' : 'Film';
  const meta = [item.year, typeLabel].filter(Boolean).join(' · ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && onPress && styles.cardPressed]}
      onPress={onPress ? () => onPress(item) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessible
      accessibilityLabel={`${item.title}, ${item.year ?? 'year unknown'}, ${typeLabel}${logged ? ', already watched' : ''}`}
    >
      <Poster posterPath={item.posterPath} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>{meta}</Text>
        {/* Star row / mood chips slot (UX-DR6). Empty until Epic 3 adds
            rating/mood data — no placeholder stars (see scope wall). */}
      </View>
      {/* ❤️ Add-to-Watchlist (Story 2.3) — its own hit target, left of the log
          button, only when a handler is provided (read-only surfaces omit it,
          matching onLog/onPress). Nested Pressable captures its own taps so it
          never also triggers the card's onPress (navigate-to-detail). Uses
          theme.colors.primary — NOT gold (UX-DR1 reserves gold for memory/
          identity moments; a watchlist heart is neither). The heart lives inside
          the outer `accessible` card (2.2 deferred a11y-grouping finding, still
          open) but carries a distinct state-carrying label of its own. */}
      {onToggleWatchlist && (
        <Pressable
          onPress={() => onToggleWatchlist(item)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            watchlisted
              ? `Remove ${item.title} from watchlist`
              : `Add ${item.title} to watchlist`
          }
        >
          <Ionicons
            name={watchlisted ? 'heart' : 'heart-outline'}
            size={26}
            color={theme.colors.primary}
          />
        </Pressable>
      )}
      {onLog && (
        // Filled + "already watched" don't disable the button — logging a
        // rewatch is legitimate (AD-3: each watch is its own atomic row).
        <Pressable
          onPress={() => onLog(item)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={logged ? `Log another watch of ${item.title}` : `Log ${item.title} as watched`}
        >
          <Ionicons
            name={logged ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={28}
            color={theme.colors.primary}
          />
        </Pressable>
      )}
      {/* ✓ Watched pill (Story 3.2, DESIGN.md `watched-badge`: "rounded-sm,
          primary fill, uppercase label") — a visually distinct control from
          the checkmark-icon onLog button above (Search's Story-1.5 log
          affordance; the two coexist on different surfaces). Only rendered
          when a handler is provided — HomeScreen decides which shelves/items
          get one: tracked films unconditionally, tracked tv shows once their
          pointer is non-null (Story 3.3 widened this from tv-only), and (as
          of this story's review) the Watchlist's own "Watched" shelf too, so
          a rewatch can be logged from there (AD-3). */}
      {onMarkWatched && watchedIcon && (
        <Pressable
          onPress={() => onMarkWatched(item)}
          disabled={watchedPending}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: watchedPending }}
          accessibilityLabel={
            watchedPending ? `${item.title} marked watched` : `Log another watch of ${item.title}`
          }
        >
          <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />
        </Pressable>
      )}
      {onMarkWatched && !watchedIcon && (
        <Pressable
          onPress={() => onMarkWatched(item)}
          disabled={watchedPending}
          style={({ pressed }) => [
            styles.watchedPill,
            watchedPending && styles.watchedPillDisabled,
            pressed && styles.watchedPillPressed,
          ]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: watchedPending }}
          accessibilityLabel={
            watchedPending ? `${item.title} marked watched` : `Mark ${item.title} watched`
          }
        >
          <Text style={styles.watchedPillText}>{watchedPending ? 'Saved' : 'Watched'}</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  placeholderCenter: { alignItems: 'center', justifyContent: 'center' },
  // A small, muted glyph centered in the placeholder — never color-only signal.
  posterGlyph: { opacity: 0.7 },
});

function makeStyles(theme: Theme) {
  const { colors, type, spacing, radius } = theme;
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
      minHeight: CARD_POSTER_H + spacing.md * 2,
    },
    cardPressed: { backgroundColor: colors.surfaceSunken },
    // Dedicated icon-action hit target — 44pt minimum touch size. Shared by the
    // ❤️ watchlist button and the ✓ log button (both sit at the card's right edge).
    iconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      alignSelf: 'center',
    },
    iconButtonPressed: { backgroundColor: colors.surfaceSunken },
    // The `watched-badge` component (DESIGN.md) — mirrors the retryButton/
    // retryText pair's colors (primary fill, inkPrimary text), rounded-sm,
    // uppercase label.
    watchedPill: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      alignSelf: 'center',
      alignItems: 'center',
      justifyContent: 'center',
    },
    watchedPillPressed: { opacity: 0.7 },
    watchedPillDisabled: { opacity: 0.5 },
    watchedPillText: { ...type.label, color: colors.inkPrimary, textTransform: 'uppercase' },
    cardText: { flex: 1, justifyContent: 'center', gap: spacing.xs },
    cardTitle: { ...type.cardTitle, color: colors.inkPrimary },
    cardMeta: { ...type.meta, color: colors.inkSecondary },
  });
}
