// Home — the Watchlist shelf (Story 2.4).
//
// Replaces the 1.3 static "Your story starts here" placeholder: this is the
// first story to give Home real data. Until Epic 3's Up Next shelf lands, the
// Watchlist shelf (with its own empty-state row) IS the Home content — see the
// story Dev Notes for why reconciling a whole-page "brand-new user" empty state
// against multiple shelves is explicitly Story 3.1's job, not this one's.
//
// Home is now a stack (HomeStack) so a tapped shelf card can push TitleDetail,
// mirroring AddStack (2.2) — a move both AddStack.tsx and 2.3's story file
// forward-referenced to this exact story.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
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
import { getWatchlist } from '../../data/watchlist';
import type { HomeStackParamList } from '../../navigation/HomeStack';

// AC2's verbatim warm empty-watchlist copy (EXPERIENCE.md#Empty Watchlist). No
// CTA — unlike Diary/Feed/Profile's empty states, this row specifies copy only.
const COPY_EMPTY = 'Save something for later — tap ❤️ on any title.';
// Inferred "never a blank screen" requirement (UX-DR16 doctrine), not one of
// the four literal ACs — a failed fetch must show a retry, not a false-empty
// shelf. Reuses the same generic retry copy the rest of the app uses.
const COPY_ERROR = "We couldn't load this right now.";

const SHELF_CARD_WIDTH = 280;

type Phase = 'loading' | 'loaded' | 'error';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

export default function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [phase, setPhase] = useState<Phase>('loading');
  const [items, setItems] = useState<CatalogResult[]>([]);

  // Guards against setState after unmount from an in-flight fetch (mirrors
  // TitleDetailScreen.load's mountedRef pattern).
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Monotonic request token: useFocusEffect re-fires load() on every focus and
  // the Home tab is never unmounted, so two rapid focus cycles can leave two
  // load()s in flight at once. mountedRef only catches unmount, not supersession
  // — without a seq guard a slower earlier load can resolve last and clobber the
  // newer, correct result. Mirrors AddScreen.requestSeq.
  const requestSeq = useRef(0);
  // Once we've painted real content, a focus-triggered refetch runs in the
  // background (keeps the shelf on screen) instead of blanking to a spinner.
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    // Full-screen spinner only on the first load; a focus refetch keeps the
    // current shelf (and its scroll position) visible and swaps in fresh data.
    if (!hasLoadedRef.current) setPhase('loading');
    try {
      const rows = await getWatchlist();
      const settled = await Promise.allSettled(
        rows.map((row) => fetchTitleDetail(row.tmdbId, row.mediaType)),
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
          // One title's metadata is unavailable — drop that card, don't block
          // or error the whole shelf (mirrors getWatchlistKeys/Poster's
          // per-item degradation elsewhere in the app).
          console.warn('watchlist shelf: failed to resolve title', rows[i], result.reason);
        }
      });
      // A non-empty watchlist whose enrichment ALL failed is not an empty shelf
      // — showing the AC2 "empty" copy here would be the exact false-empty
      // getWatchlist() throws to avoid (DB up, catalog proxy down). Surface the
      // retry state instead, but never nuke an already-painted shelf over a
      // transient background-refresh failure.
      if (rows.length > 0 && resolved.length === 0) {
        if (!hasLoadedRef.current) setPhase('error');
        return;
      }
      setItems(resolved);
      hasLoadedRef.current = true;
      setPhase('loaded');
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeq.current) return; // superseded
      console.warn('watchlist shelf: getWatchlist failed', err);
      // Keep an already-loaded shelf visible on a background-refresh failure;
      // only surface the error state when there's nothing on screen yet.
      if (!hasLoadedRef.current) setPhase('error');
    }
  }, []);

  // Load on mount AND every time Home regains focus (e.g. after ❤️-ing/un-❤️-ing
  // a title from Add or title detail) — Home is a tab, not remounted on tab
  // switch, so without this the shelf would show stale data until an app
  // relaunch. useFocusEffect (not a manual addListener) is the correct idiom
  // here: it runs on initial focus too, so there is no separate mount-effect
  // and no double-fetch race.
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

  return (
    <Screen>
      <Text style={styles.heading} accessibilityRole="header">
        Watchlist
      </Text>

      {phase === 'loading' && (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.errorState}>
          <Text style={styles.stateText}>{COPY_ERROR}</Text>
          <Pressable
            onPress={load}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {phase === 'loaded' && items.length === 0 && (
        <Text style={styles.stateText}>{COPY_EMPTY}</Text>
      )}

      {phase === 'loaded' && items.length > 0 && (
        <FlatList
          data={items}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => `${item.mediaType}:${item.tmdbId}`}
          renderItem={({ item }) => (
            <View style={styles.shelfCard}>
              <TitleCard item={item} onPress={handleOpenDetail} />
            </View>
          )}
          contentContainerStyle={styles.shelfContent}
        />
      )}
    </Screen>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing } = theme;
  return StyleSheet.create({
    heading: {
      ...type.title,
      color: colors.inkPrimary,
      marginBottom: spacing.md,
    },
    centerState: { paddingTop: spacing.xl, alignItems: 'center' },
    stateText: {
      ...type.body,
      color: colors.inkSecondary,
      paddingTop: spacing.sm,
    },
    errorState: { paddingTop: spacing.lg, gap: spacing.md, alignItems: 'flex-start' },
    retryButton: {
      backgroundColor: colors.primary,
      borderRadius: theme.radius.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      justifyContent: 'center',
    },
    retryText: { ...type.label, color: colors.inkPrimary },
    shelfContent: { paddingBottom: spacing.xl },
    shelfCard: { width: SHELF_CARD_WIDTH, marginRight: spacing.md },
  });
}
