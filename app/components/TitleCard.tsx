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

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';
import { posterUrl, type CatalogResult } from '../data/catalog';

const CARD_POSTER_W = 60;
const CARD_POSTER_H = 90;

// ✓ tick particle burst (see `watchedParticle` below) — 8 dots evenly spaced
// around the button, flying out to this radius on tap.
const PARTICLE_ANGLES = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
const PARTICLE_DISTANCE = 22;

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
  watchedAlready = false,
  subtitle,
}: {
  item: CatalogResult;
  onPress?: (item: CatalogResult) => void;
  onLog?: (item: CatalogResult) => void;
  logged?: boolean;
  onToggleWatchlist?: (item: CatalogResult) => void;
  watchlisted?: boolean;
  onMarkWatched?: (item: CatalogResult) => void;
  watchedPending?: boolean;
  // Up Next / Watched shelf (HomeScreen): swap the text pill for a round green
  // tick icon button — a smooth pulse-ring animation plays around it on tap
  // (see `pulseAnim` below) so the tap reads as a satisfying confirmation
  // rather than a plain state flip.
  watchedIcon?: boolean;
  // Watched shelf only (HomeScreen): the item is already known-watched, so
  // tapping the tick logs a rewatch (AD-3) rather than a first watch — swaps
  // the icon button's accessibility label accordingly. Up Next omits this
  // (defaults false): its tick always marks a first watch.
  watchedAlready?: boolean;
  // Up Next shelf (tv only): "S{season}E{episode} · {episode name}" for the
  // show's next unwatched episode, so the card reads as "what you're partway
  // through" rather than the show in the abstract. Omitted (undefined) by
  // every other surface — Search/Watchlist/Recommendations cards are unchanged.
  subtitle?: string | null;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const typeLabel = item.mediaType === 'tv' ? 'TV' : 'Film';
  const meta = [item.year, typeLabel].filter(Boolean).join(' · ');

  // ✓ tick tap animation — a ring pulses outward and a handful of particles
  // burst out around the button (mirrors RatingPrompt/EditWatchSheet/
  // AddScreen's existing Reduce Motion pattern: skip the animation entirely,
  // the tap still marks watched — the icon still flips gray→green instantly).
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  // Gray at rest, green once this card's tick has been confirmed — either
  // because it tapped "watched" this session, or (Watched shelf) it already
  // was watched when the card mounted.
  const [confirmed, setConfirmed] = useState(watchedAlready);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  function handleMarkWatchedPress() {
    if (!onMarkWatched) return;
    onMarkWatched(item);
    setConfirmed(true);
    if (reduceMotion) return;
    pulseAnim.setValue(0);
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && onPress && styles.cardPressed]}
      onPress={onPress ? () => onPress(item) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessible
      accessibilityLabel={`${item.title}${subtitle ? `, ${subtitle}` : ''}, ${item.year ?? 'year unknown'}, ${typeLabel}${logged ? ', already watched' : ''}`}
    >
      <Poster posterPath={item.posterPath} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {subtitle && (
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
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
        <View style={styles.watchedIconWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.watchedPulseRing,
              {
                opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
                transform: [
                  { scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] }) },
                ],
              },
            ]}
          />
          {/* Particle burst — a small ring of dots flies outward and fades as
              the tick flips gray→green (see `confirmed`), so the switch reads
              as a little celebration rather than a plain color swap. Purely
              decorative (pointerEvents none) and skipped under Reduce Motion
              since `pulseAnim` never advances there. */}
          {PARTICLE_ANGLES.map((angle) => (
            <Animated.View
              key={angle}
              pointerEvents="none"
              style={[
                styles.watchedParticle,
                {
                  opacity: pulseAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                  transform: [
                    {
                      translateX: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.cos(angle) * PARTICLE_DISTANCE],
                      }),
                    },
                    {
                      translateY: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.sin(angle) * PARTICLE_DISTANCE],
                      }),
                    },
                    {
                      scale: pulseAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1, 0.2] }),
                    },
                  ],
                },
              ]}
            />
          ))}
          <Pressable
            onPress={handleMarkWatchedPress}
            disabled={watchedPending}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled: watchedPending }}
            accessibilityLabel={
              watchedPending
                ? `${item.title} marked watched`
                : watchedAlready
                  ? `Log another watch of ${item.title}`
                  : `Mark ${item.title} watched`
            }
          >
            <Ionicons
              name="checkmark-circle"
              size={28}
              color={confirmed ? theme.colors.success : theme.colors.inkSecondary}
            />
          </Pressable>
        </View>
      )}
      {onMarkWatched && !watchedIcon && (
        <Pressable
          onPress={handleMarkWatchedPress}
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

/**
 * Grid/card view of a title — poster-forward, 3-per-row layout (HomeScreen's
 * list⇄grid toggle). Unlike TitleCard's horizontal row, the poster IS the
 * card; title/meta sit below it. `posterWidth` is measured by the caller
 * (grid columns are computed from the available row width, not fixed), with
 * height derived from the same 2:3 poster aspect ratio Poster's defaults use
 * (CARD_POSTER_W:CARD_POSTER_H). Carries the same onPress/onMarkWatched
 * affordances as TitleCard so grid view has no functional gap vs list view —
 * the watched control becomes a small corner badge instead of the pill/icon
 * row (there's no room for a second row of controls at this card size).
 */
export function GridPosterCard({
  item,
  posterWidth,
  onPress,
  onMarkWatched,
  watchedPending = false,
  watchedAlready = false,
  episodesWatched = null,
  episodesTotal = null,
}: {
  item: CatalogResult;
  posterWidth: number;
  onPress?: (item: CatalogResult) => void;
  onMarkWatched?: (item: CatalogResult) => void;
  watchedPending?: boolean;
  watchedAlready?: boolean;
  // Series only (tv) — real episodes watched / total real episodes, specials
  // excluded (computed by the caller, HomeScreen's countRealEpisodes /
  // countWatchedRealEpisodes). Either null ⇒ no bar rendered: null total means
  // "not tv" or "not resolved yet", and a 0-episode show has nothing to show
  // progress against.
  episodesWatched?: number | null;
  episodesTotal?: number | null;
}) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const posterHeight = posterWidth * (CARD_POSTER_H / CARD_POSTER_W);

  const typeLabel = item.mediaType === 'tv' ? 'TV' : 'Film';
  const meta = [item.year, typeLabel].filter(Boolean).join(' · ');
  const [confirmed, setConfirmed] = useState(watchedAlready);

  function handleMarkWatchedPress() {
    if (!onMarkWatched) return;
    onMarkWatched(item);
    setConfirmed(true);
  }

  // Bar renders only once there's a real denominator to show — a 0-episode
  // total (not-yet-aired show, or metadata gap) has no meaningful fraction.
  const showProgress = item.mediaType === 'tv' && !!episodesTotal && episodesTotal > 0;
  const progressPct = showProgress
    ? Math.max(0, Math.min(100, ((episodesWatched ?? 0) / episodesTotal!) * 100))
    : 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.gridCard, { width: posterWidth }, pressed && onPress && styles.cardPressed]}
      onPress={onPress ? () => onPress(item) : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessible
      accessibilityLabel={`${item.title}, ${item.year ?? 'year unknown'}, ${typeLabel}${
        showProgress ? `, ${episodesWatched ?? 0} of ${episodesTotal} episodes watched` : ''
      }`}
    >
      <View>
        <Poster posterPath={item.posterPath} width={posterWidth} height={posterHeight} glyphSize={28} />
        {showProgress && (
          <View style={styles.gridProgressTrack} pointerEvents="none">
            <View style={[styles.gridProgressFill, { width: `${progressPct}%` }]} />
          </View>
        )}
        {onMarkWatched && (
          <Pressable
            onPress={handleMarkWatchedPress}
            disabled={watchedPending}
            style={({ pressed }) => [styles.gridWatchedBadge, pressed && styles.iconButtonPressed]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityState={{ disabled: watchedPending }}
            accessibilityLabel={
              watchedPending
                ? `${item.title} marked watched`
                : watchedAlready
                  ? `Log another watch of ${item.title}`
                  : `Mark ${item.title} watched`
            }
          >
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={confirmed ? theme.colors.success : theme.colors.surfaceRaised}
            />
          </Pressable>
        )}
      </View>
      <Text style={styles.gridCardTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.cardMeta}>{meta}</Text>
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
    // Wraps the ✓ tick button so `watchedPulseRing` can be absolutely
    // positioned centered behind/around it at the same 44pt size.
    watchedIconWrap: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    // The tap-confirmation ring (see `pulseAnim`) — a bare circle outline that
    // scales up and fades out around the tick button, never color-only signal
    // (the icon itself already fills solid green on tap).
    watchedPulseRing: {
      position: 'absolute',
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      borderColor: colors.success,
    },
    // One dot of the tap particle-burst (see `PARTICLE_ANGLES`) — centered on
    // the 44pt button, animated outward via translateX/Y + opacity + scale.
    watchedParticle: {
      position: 'absolute',
      top: 19,
      left: 19,
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.success,
    },
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
    cardSubtitle: { ...type.meta, color: colors.primary },
    cardMeta: { ...type.meta, color: colors.inkSecondary },
    gridCard: { gap: spacing.xs },
    gridCardTitle: { ...type.label, color: colors.inkPrimary },
    // Bottom-edge progress bar (grid view, tv only) — sits flush against the
    // poster's bottom edge/corners so it reads as part of the poster (mirrors
    // the streaming-app "continue watching" bar convention) rather than a
    // separate element floating below it.
    gridProgressTrack: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderBottomLeftRadius: radius.sm,
      borderBottomRightRadius: radius.sm,
      overflow: 'hidden',
    },
    gridProgressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    // Small overlay badge (grid view only) — sits at the poster's corner since
    // there's no room for a second control row at this card size (see
    // GridPosterCard doc comment). backgroundColor is a translucent scrim so
    // the checkmark reads against any poster art.
    gridWatchedBadge: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.xs,
      width: 28,
      height: 28,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
  });
}
