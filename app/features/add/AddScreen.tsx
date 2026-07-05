// Add — the (+) target, the search-first entry to logging (Story 1.4 search,
// Story 1.5 logging).
//
// Search a real title through the proxied catalog. This screen owns the debounce
// that keeps TMDB from being hammered per keystroke (FR6 "results appear as you
// type" without the anti-goal). Each result carries a dedicated log icon button
// (checkmark) that commits a watch immediately — the walking-skeleton log
// action (Story 1.5, AC2/AC6) that lifts 1.4's "results are inert" scope wall.
// The row itself stays inert (reserved for Epic 2's title-detail navigation).
// No episode/season picker, no rating/mood/note prompt — those are Epic 3.
//
// The soft confirmation is a bottom toast (slide up + fade, RN's built-in
// Animated — Reduce Motion shows/hides it directly instead).
//
// Errors preserve the typed query (AC6/FR8) and show the warm retry copy; a
// missing/failed poster shows the cool→dark placeholder, never a broken image
// (FR9). All color/typography comes from theme roles — no literal hex (UX-DR1).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { Screen } from '../../components/Screen';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';
import {
  CatalogError,
  posterUrl,
  searchCatalog,
  type CatalogResult,
} from '../../data/catalog';
import { getLoggedKeys, logWatch, watchKey } from '../../data/watchLog';

const DEBOUNCE_MS = 300;
const CONFIRMATION_DISMISS_MS = 3000;

// The warm-voice copy, verbatim from EXPERIENCE.md#State Patterns.
const COPY_EMPTY = 'Hmm, nothing by that name. Try another spelling or title?';
const COPY_ERROR = "Couldn't reach the catalog — check your connection and try again.";
const COPY_LOGGED = 'Logged — nice one.';
const COPY_LOG_FAILED = "Couldn't save that — try again.";

type Phase = 'idle' | 'loading' | 'results' | 'empty' | 'error';

export default function AddScreen() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [errorMsg, setErrorMsg] = useState(COPY_ERROR);
  const [toastMounted, setToastMounted] = useState(false);
  const [toastMsg, setToastMsg] = useState(COPY_LOGGED);
  // `${mediaType}:${tmdbId}` keys already logged — checked against the local
  // outbox + synced `watches` after each search resolves (non-blocking), plus
  // optimistically as soon as a tap logs a new one.
  const [loggedKeys, setLoggedKeys] = useState<Set<string>>(new Set());
  const [reduceMotion, setReduceMotion] = useState(false);

  // Monotonic request id: only the latest in-flight search may commit its result,
  // so a slow earlier response can't overwrite a newer one (debounce race).
  const requestSeq = useRef(0);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Drives the toast's slide-up-and-fade — 0 hidden, 1 shown.
  const toastAnim = useRef(new Animated.Value(0)).current;
  // Mirror of `reduceMotion` so the deferred dismiss closure reads the *current*
  // value (the user may toggle Reduce Motion during the 3s the toast is up).
  const reduceMotionRef = useRef(false);
  // Guards against setState after unmount from an in-flight dismiss animation.
  const mountedRef = useRef(true);

  // EXPERIENCE.md accessibility note: "Reduce Motion: skip watched-confirmation
  // and reward animations; show the result immediately."
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Keep the ref in lockstep so deferred closures see the live value.
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  // Show the transient bottom toast (slide up + fade; Reduce Motion snaps it
  // in/out instead). Auto-dismisses and never blocks further search/scroll
  // (FR14). Reads Reduce Motion via the ref so a toggle mid-toast is honored.
  const showToast = useCallback(
    (message: string) => {
      setToastMsg(message);
      setToastMounted(true);
      toastAnim.stopAnimation();
      if (reduceMotionRef.current) {
        toastAnim.setValue(1);
      } else {
        toastAnim.setValue(0);
        Animated.timing(toastAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }

      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
      confirmationTimer.current = setTimeout(() => {
        if (reduceMotionRef.current) {
          if (mountedRef.current) setToastMounted(false);
          return;
        }
        Animated.timing(toastAnim, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && mountedRef.current) setToastMounted(false);
        });
      }, CONFIRMATION_DISMISS_MS);
    },
    [toastAnim],
  );

  // Tap a result: commit the watch (AC6, watched_at = now), and only mark it
  // "already watched" + show the confirmation once `logWatch` actually resolves
  // — the local outbox write IS the commit (AC1/AC2), so the confirmation must
  // attest it, never run ahead of it. A failed local write shows the failure
  // copy instead of a false success. logWatch resolves from the local write
  // alone (never the network), so this works regardless of connectivity (AC2).
  const handleLog = useCallback(
    (item: CatalogResult) => {
      logWatch({ tmdbId: item.tmdbId, mediaType: item.mediaType })
        .then(() => {
          setLoggedKeys((prev) => new Set(prev).add(watchKey(item.tmdbId, item.mediaType)));
          showToast(COPY_LOGGED);
        })
        .catch((err) => {
          console.warn('logWatch failed', err);
          showToast(COPY_LOG_FAILED);
        });
    },
    [showToast],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
      toastAnim.stopAnimation();
    };
  }, [toastAnim]);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      requestSeq.current += 1; // cancel any in-flight commit
      setPhase('idle');
      setResults([]);
      return;
    }
    const seq = ++requestSeq.current;
    setPhase('loading');
    try {
      const found = await searchCatalog(trimmed);
      if (seq !== requestSeq.current) return; // superseded
      setResults(found);
      setPhase(found.length === 0 ? 'empty' : 'results');
      // Non-blocking: results render immediately; checkmarks fill in once this
      // resolves. Never gate the results list on it (FR14 "never blocked").
      getLoggedKeys(found)
        .then((keys) => {
          if (seq !== requestSeq.current) return; // superseded
          setLoggedKeys((prev) => new Set([...prev, ...keys]));
        })
        .catch(() => {}); // best-effort — a failed lookup just shows no ticks yet
    } catch (err) {
      if (seq !== requestSeq.current) return; // superseded
      setErrorMsg(err instanceof CatalogError ? err.message : COPY_ERROR);
      setResults([]);
      setPhase('error');
    }
  }, []);

  // Debounce: run the search DEBOUNCE_MS after the last keystroke.
  useEffect(() => {
    const handle = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  return (
    <Screen>
      <Text style={styles.heading} accessibilityRole="header">
        Find a title
      </Text>

      <TextInput
        style={styles.searchField}
        value={query}
        onChangeText={setQuery}
        placeholder="Search films and shows"
        placeholderTextColor={theme.colors.inkSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search films and shows"
      />

      <View style={styles.body}>
        {phase === 'loading' && (
          <View style={styles.centerState}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        )}

        {phase === 'empty' && <Text style={styles.stateText}>{COPY_EMPTY}</Text>}

        {phase === 'error' && (
          <View style={styles.errorState}>
            <Text style={styles.stateText}>{errorMsg}</Text>
            <Pressable
              onPress={() => runSearch(query)}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Retry search"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {phase === 'results' && (
          <FlatList
            data={results}
            keyExtractor={(item) => `${item.mediaType}:${item.tmdbId}`}
            renderItem={({ item }) => (
              <TitleCard
                item={item}
                theme={theme}
                styles={styles}
                onLog={handleLog}
                logged={loggedKeys.has(watchKey(item.tmdbId, item.mediaType))}
              />
            )}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {toastMounted && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [24, 0],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.toastText}>{toastMsg}</Text>
        </Animated.View>
      )}
    </Screen>
  );
}

/**
 * A single result — the title-card pattern. The row itself stays inert (the
 * whole-card tap is reserved for title-detail navigation, Epic 2 — see
 * EXPERIENCE.md's "Any poster/card tap → Title detail" surface mapping); the
 * log action lives on its own icon button (Story 1.5, AC6) so it never
 * collides with that future navigation.
 */
function TitleCard({
  item,
  theme,
  styles,
  onLog,
  logged,
}: {
  item: CatalogResult;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
  onLog: (item: CatalogResult) => void;
  logged: boolean;
}) {
  const typeLabel = item.mediaType === 'tv' ? 'TV' : 'Film';
  const meta = [item.year, typeLabel].filter(Boolean).join(' · ');
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${item.title}, ${item.year ?? 'year unknown'}, ${typeLabel}${logged ? ', already watched' : ''}`}
    >
      <Poster posterPath={item.posterPath} theme={theme} styles={styles} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>{meta}</Text>
      </View>
      {/* Filled + "already watched" don't disable the button — logging a
          rewatch is legitimate (AD-3: each watch is its own atomic row). */}
      <Pressable
        onPress={() => onLog(item)}
        style={({ pressed }) => [styles.logButton, pressed && styles.logButtonPressed]}
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
    </View>
  );
}

/**
 * Poster with a cool→dark placeholder fallback. Shows the placeholder while the
 * image loads, when there is no poster path, and if the load fails — never a
 * broken image (FR9). The placeholder layers a translucent `cool` wash over the
 * sunken surface to evoke the design's cool→dark gradient without a native
 * gradient dependency.
 */
function Poster({
  posterPath,
  theme,
  styles,
}: {
  posterPath: string | null;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const uri = posterUrl(posterPath);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const showPlaceholder = !uri || failed || !loaded;

  return (
    <View style={styles.poster}>
      {showPlaceholder && (
        <LinearGradient
          colors={[theme.colors.cool, theme.colors.surfaceBase]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.posterPlaceholder}
        >
          <Ionicons
            name="film-outline"
            size={22}
            color={theme.colors.inkSecondary}
            style={styles.posterGlyph}
          />
        </LinearGradient>
      )}
      {uri && !failed && (
        <Image
          source={{ uri }}
          style={styles.posterImage}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      )}
    </View>
  );
}

const POSTER_W = 60;
const POSTER_H = 90;

const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

function makeStyles(theme: Theme) {
  const { colors, type, spacing, radius } = theme;
  return StyleSheet.create({
    heading: {
      ...type.title,
      color: colors.inkPrimary,
      marginBottom: spacing.md,
    },
    searchField: {
      ...type.body,
      color: colors.inkPrimary,
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      minHeight: 48,
    },
    body: { flex: 1, marginTop: spacing.lg },
    centerState: { paddingTop: spacing.xl, alignItems: 'center' },
    stateText: {
      ...type.body,
      color: colors.inkSecondary,
      paddingTop: spacing.lg,
    },
    errorState: { paddingTop: spacing.lg, gap: spacing.md, alignItems: 'flex-start' },
    retryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      justifyContent: 'center',
    },
    retryText: { ...type.label, color: colors.inkPrimary },
    // Transient, non-blocking confirmation (Story 1.5, AC2/AC6) — a bottom
    // toast overlay, not a modal, so it never gates the search field or
    // results list (`pointerEvents: 'none'`, absolute, out of layout flow).
    // Slides up + fades in on tap, reverses on auto-dismiss; Reduce Motion
    // skips the animation and shows/hides it directly (EXPERIENCE.md).
    toast: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: spacing.lg,
      marginHorizontal: spacing.lg,
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    toastText: { ...type.label, color: colors.primary },
    listContent: { paddingBottom: spacing.xl, gap: spacing.md },
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
      minHeight: POSTER_H + spacing.md * 2,
    },
    // Dedicated log-action hit target — 44pt minimum touch size (platform
    // guideline), even though the glyph itself is smaller.
    logButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
    },
    logButtonPressed: { backgroundColor: colors.surfaceSunken },
    poster: {
      width: POSTER_W,
      height: POSTER_H,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: colors.surfaceSunken,
    },
    posterImage: { ...absoluteFill, width: POSTER_W, height: POSTER_H },
    // The cool→dark gradient poster placeholder (DESIGN.md Components/title-card),
    // shown while loading, when there's no poster, and on image error (FR9).
    posterPlaceholder: {
      ...absoluteFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A small, muted glyph centered in the placeholder — never color-only signal.
    posterGlyph: { opacity: 0.7 },
    cardText: { flex: 1, justifyContent: 'center', gap: spacing.xs },
    cardTitle: { ...type.cardTitle, color: colors.inkPrimary },
    cardMeta: { ...type.meta, color: colors.inkSecondary },
  });
}
