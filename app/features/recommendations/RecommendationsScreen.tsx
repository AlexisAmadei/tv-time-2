import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { TitleCard } from '../../components/TitleCard';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';
import type { CatalogResult } from '../../data/catalog';
import { getWatchlistKeys, writeWatchlist } from '../../data/watchlist';
import { fetchRecommendations } from '../../data/recommendations';
import { getLoggedKeys, watchKey } from '../../data/watchLog';
import type { RecommendationsStackParamList } from '../../navigation/RecommendationsStack';

const COPY_EMPTY = 'No recommendations right now — check back later.';
const COPY_WATCHLISTED = 'Saved to your watchlist.';
const COPY_WATCHLIST_REMOVED = 'Removed from watchlist.';
const COPY_WATCHLIST_FAILED = "Couldn't update your watchlist — try again.";
const CONFIRMATION_DISMISS_MS = 3000;

// Series/Movies tabs — same swipeable pattern as Home (no pager library on
// this SDK 56 pin — see app/AGENTS.md — so a plain paging ScrollView).
const MEDIA_TABS: { key: 'tv' | 'movie'; label: string }[] = [
  { key: 'tv', label: 'Series' },
  { key: 'movie', label: 'Movies' },
];

type TabKey = 'tv' | 'movie';

// No 'error' phase: recommendations are pure garnish (AC2) — a hard failure
// silently degrades to an empty 'loaded' state (or, for a page-2+ failure,
// just stops pagination), never an error/retry UI.
type Phase = 'loading' | 'loaded';

const REMOVE_ANIM_MS = 280;

interface TabState {
  items: CatalogResult[];
  nextPage: number | null;
  phase: Phase;
  loadingMore: boolean;
}

function makeInitialTabState(): TabState {
  return { items: [], nextPage: 1, phase: 'loading', loadingMore: false };
}

// Wraps a card so adding it to the watchlist can slide/fade it out of the
// recommendations list instead of just snapping away — `removing` flips true
// the moment the ❤️ is tapped, and `onRemoved` fires once the animation ends
// (or immediately under Reduce Motion) so the caller can actually drop the
// item from state.
function RecommendationCard({
  item,
  removing,
  onRemoved,
  onPress,
  onToggleWatchlist,
  watchlisted,
}: {
  item: CatalogResult;
  removing: boolean;
  onRemoved: (item: CatalogResult) => void;
  onPress: (item: CatalogResult) => void;
  onToggleWatchlist: (item: CatalogResult) => void;
  watchlisted: boolean;
}) {
  const anim = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!removing) return;
    if (reduceMotion) {
      onRemoved(item);
      return;
    }
    Animated.timing(anim, {
      toValue: 0,
      duration: REMOVE_ANIM_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onRemoved(item);
    });
    // Only re-run when `removing` flips — `item`/`onRemoved` identity churn
    // shouldn't restart an animation already in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removing, reduceMotion]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) },
        ],
      }}
    >
      <TitleCard
        item={item}
        onPress={onPress}
        onToggleWatchlist={onToggleWatchlist}
        watchlisted={watchlisted}
      />
    </Animated.View>
  );
}

type Props = NativeStackScreenProps<RecommendationsStackParamList, 'RecommendationsMain'>;

export default function RecommendationsScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [activeTab, setActiveTab] = useState<TabKey>('tv');
  const tabScrollRef = useRef<ScrollView>(null);
  const [pagerWidth, setPagerWidth] = useState(0);
  const isProgrammaticScroll = useRef(false);

  const handleTabPress = useCallback(
    (key: TabKey) => {
      if (pagerWidth) {
        const index = MEDIA_TABS.findIndex((t) => t.key === key);
        isProgrammaticScroll.current = true;
        tabScrollRef.current?.scrollTo({ x: index * pagerWidth, animated: true });
      }
      setActiveTab(key);
    },
    [pagerWidth],
  );

  const handleTabScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isProgrammaticScroll.current) {
        isProgrammaticScroll.current = false;
        return;
      }
      if (!pagerWidth) return;
      const index = Math.round(e.nativeEvent.contentOffset.x / pagerWidth);
      const tab = MEDIA_TABS[index];
      if (tab) setActiveTab(tab.key);
    },
    [pagerWidth],
  );

  const [tabs, setTabs] = useState<Record<TabKey, TabState>>({
    tv: makeInitialTabState(),
    movie: makeInitialTabState(),
  });
  // Mirrors `tabs` synchronously so loadMore can read current paging state
  // (nextPage/loadingMore) without waiting on a render.
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);
  const updateTab = useCallback((tab: TabKey, patch: Partial<TabState>) => {
    setTabs((prev) => ({ ...prev, [tab]: { ...prev[tab], ...patch } }));
  }, []);

  const [pendingRemoval, setPendingRemoval] = useState<Set<string>>(new Set());
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set());
  const watchlistKeysRef = useRef<Set<string>>(new Set());
  const watchlistDirtyRef = useRef<Set<string>>(new Set());
  const applyWatchlist = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    const next = updater(watchlistKeysRef.current);
    watchlistKeysRef.current = next;
    setWatchlistKeys(next);
  }, []);

  // Transient bottom toast — same slide-up-and-fade pattern as AddScreen's
  // showToast (Reduce Motion snaps it in/out instead of animating).
  const [toastMounted, setToastMounted] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  // Mirror of `reduceMotion` so the deferred dismiss closure reads the
  // *current* value (the user may toggle Reduce Motion during the 3s up).
  const reduceMotionRef = useRef(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
      toastAnim.stopAnimation();
    };
  }, [toastAnim]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  const showConfirmation = useCallback(
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

  // Per-tab request sequence numbers so a superseded first-page load (e.g. a
  // refocus firing mid-flight) never clobbers a newer one's result.
  const requestSeqRef = useRef<Record<TabKey, number>>({ tv: 0, movie: 0 });
  const hasLoadedRef = useRef<Record<TabKey, boolean>>({ tv: false, movie: false });

  // Loads (or reloads) page 1 for a tab, replacing its item list.
  const load = useCallback(
    async (tab: TabKey) => {
      const seq = ++requestSeqRef.current[tab];
      if (!hasLoadedRef.current[tab]) updateTab(tab, { phase: 'loading' });
      try {
        const page = await fetchRecommendations(tab, 1);
        if (!mountedRef.current || seq !== requestSeqRef.current[tab]) return; // superseded

        const [wlKeys, loggedKeys] = await Promise.all([
          getWatchlistKeys(page.items),
          getLoggedKeys(page.items),
        ]);
        if (!mountedRef.current || seq !== requestSeqRef.current[tab]) return; // superseded

        const filtered = page.items.filter((item) => {
          const key = watchKey(item.tmdbId, item.mediaType);
          return !wlKeys.has(key) && !loggedKeys.has(key);
        });
        updateTab(tab, { items: filtered, nextPage: page.nextPage, phase: 'loaded' });
        hasLoadedRef.current[tab] = true;
        applyWatchlist((prev) => {
          const next = new Set(prev);
          for (const k of wlKeys) if (!watchlistDirtyRef.current.has(k)) next.add(k);
          return next;
        });
      } catch (err) {
        if (!mountedRef.current || seq !== requestSeqRef.current[tab]) return; // superseded
        console.warn('recommendations: load failed', tab, err);
        updateTab(tab, { items: [], nextPage: null, phase: 'loaded' });
        hasLoadedRef.current[tab] = true;
      }
    },
    [applyWatchlist, updateTab],
  );

  // Loads the next page for a tab and appends it — recommendations are pure
  // garnish, so a failed page-2+ fetch just stops pagination silently rather
  // than surfacing an error/retry UI.
  const loadMore = useCallback(
    async (tab: TabKey) => {
      const state = tabsRef.current[tab];
      if (state.loadingMore || state.nextPage === null || state.phase !== 'loaded') return;
      const targetPage = state.nextPage;
      updateTab(tab, { loadingMore: true });

      try {
        const page = await fetchRecommendations(tab, targetPage);
        if (!mountedRef.current) return;

        const [wlKeys, loggedKeys] = await Promise.all([
          getWatchlistKeys(page.items),
          getLoggedKeys(page.items),
        ]);
        if (!mountedRef.current) return;

        setTabs((prev) => {
          const state = prev[tab];
          const existingKeys = new Set(
            state.items.map((i) => watchKey(i.tmdbId, i.mediaType)),
          );
          const fresh = page.items.filter((item) => {
            const key = watchKey(item.tmdbId, item.mediaType);
            if (existingKeys.has(key)) return false;
            return !wlKeys.has(key) && !loggedKeys.has(key);
          });
          return {
            ...prev,
            [tab]: {
              ...state,
              items: [...state.items, ...fresh],
              nextPage: page.nextPage,
              loadingMore: false,
            },
          };
        });
        applyWatchlist((prev) => {
          const next = new Set(prev);
          for (const k of wlKeys) if (!watchlistDirtyRef.current.has(k)) next.add(k);
          return next;
        });
      } catch (err) {
        if (!mountedRef.current) return;
        console.warn('recommendations: loadMore failed', tab, err);
        updateTab(tab, { loadingMore: false, nextPage: null });
      }
    },
    [applyWatchlist, updateTab],
  );

  useFocusEffect(
    useCallback(() => {
      load('tv');
      load('movie');
    }, [load]),
  );

  const handleOpenDetail = useCallback(
    (item: CatalogResult) => {
      navigation.navigate('TitleDetail', {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
      });
    },
    [navigation],
  );

  // Fires once a card's fade/slide-out animation finishes — actually drops
  // the item from its tab's list, letting LayoutAnimation smooth the gap
  // closing for the cards below it.
  const handleRemoved = useCallback((item: CatalogResult) => {
    const key = watchKey(item.tmdbId, item.mediaType);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTabs((prev) => ({
      ...prev,
      [item.mediaType]: {
        ...prev[item.mediaType],
        items: prev[item.mediaType].items.filter(
          (i) => watchKey(i.tmdbId, i.mediaType) !== key,
        ),
      },
    }));
    setPendingRemoval((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

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
      if (desired) {
        // Adding to the watchlist hides the card here — start the animation;
        // handleRemoved drops it from the tab's items once it finishes.
        setPendingRemoval((prev) => new Set(prev).add(key));
      }

      writeWatchlist(item.tmdbId, item.mediaType, desired)
        .then(() => {
          if (!mountedRef.current) return;
          showConfirmation(desired ? COPY_WATCHLISTED : COPY_WATCHLIST_REMOVED);
        })
        .catch((err) => {
          console.warn('recommendations watchlist toggle failed', err);
          if (!mountedRef.current) return;
          applyWatchlist((prev) => {
            if (prev.has(key) !== desired) return prev;
            const next = new Set(prev);
            if (desired) next.delete(key);
            else next.add(key);
            return next;
          });
          if (desired) {
            // Roll back the hide — restore the card if it's still (or
            // already) gone from its tab's list.
            setPendingRemoval((prev) => {
              if (!prev.has(key)) return prev;
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
            setTabs((prev) => {
              const state = prev[item.mediaType];
              if (state.items.some((i) => watchKey(i.tmdbId, i.mediaType) === key)) return prev;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              return {
                ...prev,
                [item.mediaType]: { ...state, items: [...state.items, item] },
              };
            });
          }
          showConfirmation(COPY_WATCHLIST_FAILED);
        });
    },
    [applyWatchlist, showConfirmation],
  );

  return (
    <Screen>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {MEDIA_TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabPress(tab.key)}
              style={styles.tabButton}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
              <View style={[styles.tabIndicator, isActive && styles.tabIndicatorActive]} />
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={tabScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleTabScrollEnd}
        onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}
        style={styles.tabPager}
      >
        {MEDIA_TABS.map((tab) => {
          const state = tabs[tab.key];
          return (
            <View key={tab.key} style={[styles.page, pagerWidth ? { width: pagerWidth } : null]}>
              {state.phase === 'loading' && (
                <View style={styles.centerState}>
                  <ActivityIndicator color={theme.colors.primary} />
                </View>
              )}

              {state.phase === 'loaded' && state.items.length === 0 && (
                <Text style={styles.stateText}>{COPY_EMPTY}</Text>
              )}

              {state.phase === 'loaded' && state.items.length > 0 && (
                <FlatList
                  data={state.items}
                  keyExtractor={(item) => `${item.mediaType}:${item.tmdbId}`}
                  renderItem={({ item }) => (
                    <View style={styles.card}>
                      <RecommendationCard
                        item={item}
                        removing={pendingRemoval.has(watchKey(item.tmdbId, item.mediaType))}
                        onRemoved={handleRemoved}
                        onPress={handleOpenDetail}
                        onToggleWatchlist={handleToggleWatchlist}
                        watchlisted={watchlistKeys.has(watchKey(item.tmdbId, item.mediaType))}
                      />
                    </View>
                  )}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  onEndReachedThreshold={0.5}
                  onEndReached={() => loadMore(tab.key)}
                  ListFooterComponent={
                    state.loadingMore ? (
                      <View style={styles.footer}>
                        <ActivityIndicator color={theme.colors.primary} />
                      </View>
                    ) : null
                  }
                />
              )}
            </View>
          );
        })}
      </ScrollView>

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
    // Transient, non-blocking confirmation — a bottom toast overlay, not a
    // modal, so it never gates the tab pager (`pointerEvents: 'none'`,
    // absolute, out of layout flow). Slides up + fades in on tap, reverses on
    // auto-dismiss; Reduce Motion skips the animation and shows/hides it
    // directly. Mirrors AddScreen's toast.
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
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    tabButton: {
      flex: 1,
      alignItems: 'center',
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.xs,
    },
    tabLabel: {
      ...type.label,
      color: colors.inkSecondary,
    },
    tabLabelActive: {
      color: colors.inkPrimary,
    },
    tabIndicator: {
      height: 2,
      width: '60%',
      borderRadius: 1,
      backgroundColor: 'transparent',
    },
    tabIndicatorActive: {
      backgroundColor: colors.primary,
    },
    tabPager: { flex: 1 },
    page: { flex: 1 },
    centerState: { paddingTop: spacing.xl, alignItems: 'center' },
    stateText: {
      ...type.body,
      color: colors.inkSecondary,
      paddingTop: spacing.md,
    },
    listContent: { paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    card: { width: '100%' },
    footer: { paddingVertical: spacing.md, alignItems: 'center' },
  });
}
