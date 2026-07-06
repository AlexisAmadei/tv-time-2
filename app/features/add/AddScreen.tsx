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
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { TitleCard } from '../../components/TitleCard';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';
import { CatalogError, searchCatalog, type CatalogResult } from '../../data/catalog';
import { getLoggedKeys, logWatch, watchKey } from '../../data/watchLog';
import { getWatchlistKeys, writeWatchlist } from '../../data/watchlist';
import type { AddStackParamList } from '../../navigation/AddStack';

const DEBOUNCE_MS = 300;
const CONFIRMATION_DISMISS_MS = 3000;

// The warm-voice copy, verbatim from EXPERIENCE.md#State Patterns.
const COPY_EMPTY = 'Hmm, nothing by that name. Try another spelling or title?';
const COPY_ERROR = "Couldn't reach the catalog — check your connection and try again.";
const COPY_LOGGED = 'Logged — nice one.';
const COPY_LOG_FAILED = "Couldn't save that — try again.";
// AC4: warm add-confirmation (one emoji max — none here; UX-DR20). "Remove" stays
// quiet (AC4 only specifies the add confirmation). Failure reuses the log tone.
const COPY_WATCHLISTED = "We'll tell you when it's time.";
const COPY_WATCHLIST_REMOVED = 'Removed from watchlist.';
const COPY_WATCHLIST_FAILED = "Couldn't save that — try again.";

type Phase = 'idle' | 'loading' | 'results' | 'empty' | 'error';

export default function AddScreen() {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const navigation =
    useNavigation<NativeStackNavigationProp<AddStackParamList, 'AddSearch'>>();

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
  // `${mediaType}:${tmdbId}` keys already on the watchlist — looked up against
  // the server after each search resolves (non-blocking), plus flipped
  // optimistically the instant a ❤️ tap toggles one.
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set());
  const [reduceMotion, setReduceMotion] = useState(false);

  // Synchronous mirror of `watchlistKeys` so a tap reads the true current
  // membership even for a second tap that lands in the same render frame (state
  // reads would be stale until the next render). All membership writes go
  // through `applyWatchlist`, which keeps ref and state in lockstep.
  const watchlistKeysRef = useRef<Set<string>>(new Set());
  // Keys the user has explicitly toggled this session. A still-in-flight
  // post-search lookup must NOT overwrite these — the user's optimistic action
  // (and its serialized server write) is the source of truth for them.
  const watchlistDirtyRef = useRef<Set<string>>(new Set());
  const applyWatchlist = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    const next = updater(watchlistKeysRef.current);
    watchlistKeysRef.current = next;
    setWatchlistKeys(next);
  }, []);

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

  // Tap ❤️: optimistic toggle (Story 2.3). Flip the key immediately, then
  // persist via a per-title serialized write; on failure, roll back and show the
  // failure copy. This mirrors handleLog's optimism — the honest tradeoff: a
  // failed write flips the heart back rather than lying that it saved.
  //
  // `desired` is derived from the *ref* (synchronous truth), so a same-frame
  // double-tap toggles correctly instead of both reading the same stale render
  // snapshot. `writeWatchlist` serializes add-vs-remove per title so rapid
  // toggles land server-side in tap order. Marking the key dirty stops a
  // still-in-flight post-search lookup from resurrecting it.
  const handleToggleWatchlist = useCallback(
    (item: CatalogResult) => {
      const key = watchKey(item.tmdbId, item.mediaType);
      const desired = !watchlistKeysRef.current.has(key);
      watchlistDirtyRef.current.add(key);
      applyWatchlist((prev) => {
        const next = new Set(prev);
        if (desired) next.add(key);
        else next.delete(key);
        return next;
      });

      writeWatchlist(item.tmdbId, item.mediaType, desired)
        .then(() => {
          if (!mountedRef.current) return;
          showToast(desired ? COPY_WATCHLISTED : COPY_WATCHLIST_REMOVED);
        })
        .catch((err) => {
          console.warn('watchlist toggle failed', err);
          if (!mountedRef.current) return;
          // Roll back only if the current state still reflects THIS write's
          // intent — a newer toggle may have already superseded it.
          applyWatchlist((prev) => {
            if (prev.has(key) !== desired) return prev;
            const next = new Set(prev);
            if (desired) next.delete(key);
            else next.add(key);
            return next;
          });
          showToast(COPY_WATCHLIST_FAILED);
        });
    },
    [applyWatchlist, showToast],
  );

  // Tap the card body (not the log button) → open title detail (Story 2.2).
  // This is the one behavior change to this screen: the row was left inert in
  // 1.5 "reserved for Epic 2's title-detail navigation" — this cashes it in.
  const handleOpenDetail = useCallback(
    (item: CatalogResult) => {
      navigation.navigate('TitleDetail', {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
      });
    },
    [navigation],
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
      // Same non-blocking, superseded-guarded, best-effort pattern for the
      // watchlist hearts (Story 2.3) — never gate the results list on it (FR14).
      // Reconcile (not blind-union) over exactly the searched items: set each to
      // what the server reports, but SKIP any key the user has toggled — the
      // `seq` guard only covers a superseded *search*, not a toggle that lands
      // while this lookup is in flight, and a union would resurrect a key the
      // user just removed (unlike add-only `loggedKeys`).
      getWatchlistKeys(found)
        .then((serverKeys) => {
          if (seq !== requestSeq.current) return; // superseded
          applyWatchlist((prev) => {
            const next = new Set(prev);
            for (const it of found) {
              const k = watchKey(it.tmdbId, it.mediaType);
              if (watchlistDirtyRef.current.has(k)) continue; // user-controlled
              if (serverKeys.has(k)) next.add(k);
              else next.delete(k);
            }
            return next;
          });
        })
        .catch(() => {});
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
                onPress={handleOpenDetail}
                onLog={handleLog}
                logged={loggedKeys.has(watchKey(item.tmdbId, item.mediaType))}
                onToggleWatchlist={handleToggleWatchlist}
                watchlisted={watchlistKeys.has(watchKey(item.tmdbId, item.mediaType))}
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
  });
}
