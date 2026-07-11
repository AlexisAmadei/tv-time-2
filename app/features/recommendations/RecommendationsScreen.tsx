// Recommendations tab — the curated list (Story 3.8's recommendations.ts)
// shown full-screen instead of just as a Home shelf, split into Series/Movies
// tabs. Mirrors HomeScreen's swipeable MEDIA_TABS pager and its recs-shelf
// load/enrich/dedupe/❤️-toggle logic verbatim (same source, same behavior —
// just its own screen instead of buried at the bottom of Home).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
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
import { fetchTitleDetail, type CatalogResult } from '../../data/catalog';
import { getWatchlistKeys, writeWatchlist } from '../../data/watchlist';
import { getRecommendations } from '../../data/recommendations';
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

// No 'error' phase: recommendations are pure garnish (AC2) — a hard failure
// silently degrades to an empty 'loaded' state, never an error/retry UI.
type Phase = 'loading' | 'loaded';

const REMOVE_ANIM_MS = 280;

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

  const [activeTab, setActiveTab] = useState<'tv' | 'movie'>('tv');
  const tabScrollRef = useRef<ScrollView>(null);
  const [pagerWidth, setPagerWidth] = useState(0);
  const isProgrammaticScroll = useRef(false);

  const handleTabPress = useCallback(
    (key: 'tv' | 'movie') => {
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

  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<CatalogResult[]>([]);
  const [pendingRemoval, setPendingRemoval] = useState<Set<string>>(new Set());
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set());
  const watchlistKeysRef = useRef<Set<string>>(new Set());
  const watchlistDirtyRef = useRef<Set<string>>(new Set());
  const applyWatchlist = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    const next = updater(watchlistKeysRef.current);
    watchlistKeysRef.current = next;
    setWatchlistKeys(next);
  }, []);

  const [confirmation, setConfirmation] = useState<string | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  const showConfirmation = useCallback((message: string) => {
    setConfirmation(message);
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => {
      if (mountedRef.current) setConfirmation(null);
    }, CONFIRMATION_DISMISS_MS);
  }, []);

  const requestSeq = useRef(0);
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    if (!hasLoadedRef.current) setPhase('loading');
    try {
      const list = getRecommendations();
      const settled = await Promise.allSettled(
        list.map((rec) => fetchTitleDetail(rec.tmdbId, rec.mediaType)),
      );
      if (!mountedRef.current || seq !== requestSeq.current) return; // superseded
      const resolved: CatalogResult[] = [];
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { detail } = result.value;
          resolved.push({
            tmdbId: detail.tmdbId,
            mediaType: detail.mediaType,
            title: detail.title,
            year: detail.year,
            posterPath: detail.posterPath,
          });
        } else {
          console.warn('recommendations: failed to resolve title', list[i], result.reason);
        }
      });
      if (list.length > 0 && resolved.length === 0) {
        setItems([]);
        hasLoadedRef.current = true;
        setPhase('loaded');
        return;
      }
      const [wlKeys, loggedKeys] = await Promise.all([
        getWatchlistKeys(resolved),
        getLoggedKeys(resolved),
      ]);
      if (!mountedRef.current || seq !== requestSeq.current) return; // superseded
      const filtered = resolved.filter((item) => {
        const key = watchKey(item.tmdbId, item.mediaType);
        return !wlKeys.has(key) && !loggedKeys.has(key);
      });
      setItems(filtered);
      hasLoadedRef.current = true;
      setPhase('loaded');
      applyWatchlist((prev) => {
        const next = new Set(prev);
        for (const k of wlKeys) if (!watchlistDirtyRef.current.has(k)) next.add(k);
        return next;
      });
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeq.current) return; // superseded
      console.warn('recommendations: load failed', err);
      setItems([]);
      hasLoadedRef.current = true;
      setPhase('loaded');
    }
  }, [applyWatchlist]);

  useFocusEffect(
    useCallback(() => {
      load();
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
  // the item from the list, letting LayoutAnimation smooth the gap closing
  // for the cards below it.
  const handleRemoved = useCallback((item: CatalogResult) => {
    const key = watchKey(item.tmdbId, item.mediaType);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.filter((i) => watchKey(i.tmdbId, i.mediaType) !== key));
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
        // handleRemoved drops it from `items` once it finishes.
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
            // already) gone from the list.
            setPendingRemoval((prev) => {
              if (!prev.has(key)) return prev;
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
            setItems((prev) => {
              if (prev.some((i) => watchKey(i.tmdbId, i.mediaType) === key)) return prev;
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              return [...prev, item];
            });
          }
          showConfirmation(COPY_WATCHLIST_FAILED);
        });
    },
    [applyWatchlist, showConfirmation],
  );

  const itemsByTab = {
    tv: items.filter((item) => item.mediaType === 'tv'),
    movie: items.filter((item) => item.mediaType === 'movie'),
  };

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

      {confirmation && (
        <Text style={styles.confirmation} accessibilityLiveRegion="polite">
          {confirmation}
        </Text>
      )}

      <ScrollView
        ref={tabScrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleTabScrollEnd}
        onLayout={(e) => setPagerWidth(e.nativeEvent.layout.width)}
        style={styles.tabPager}
      >
        {MEDIA_TABS.map((tab) => (
          <View key={tab.key} style={[styles.page, pagerWidth ? { width: pagerWidth } : null]}>
            {phase === 'loading' && (
              <View style={styles.centerState}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            )}

            {phase === 'loaded' && itemsByTab[tab.key].length === 0 && (
              <Text style={styles.stateText}>{COPY_EMPTY}</Text>
            )}

            {phase === 'loaded' && itemsByTab[tab.key].length > 0 && (
              <FlatList
                data={itemsByTab[tab.key]}
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
              />
            )}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing } = theme;
  return StyleSheet.create({
    confirmation: {
      ...type.meta,
      color: colors.inkSecondary,
      marginBottom: spacing.sm,
    },
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
  });
}
