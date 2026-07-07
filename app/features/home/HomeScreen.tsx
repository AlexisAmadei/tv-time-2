// Home — Up Next (Story 3.1) above Watchlist (Story 2.4).
//
// Up Next is new: tracked shows/films (3.1's "I'm watching this") surfaced
// here so what a user is watching is waiting for them the moment the app
// opens. It renders FIRST per the IA table (EXPERIENCE.md — "Home / Up Next
// ... Current shows to continue + Watchlist shelf + Recommendations shelf").
// The Watchlist shelf below is otherwise unchanged from 2.4 — same
// getWatchlist() call, same per-item enrichment.
//
// Each shelf loads independently — its own phase, hasLoadedRef, requestSeq —
// reusing 2.4's shelf pattern verbatim (copied, not re-derived: that pattern
// was hardened by 2.4's code review against false-empty-on-all-enrichment-
// fail, focus-refetch races, and spinner flicker). A slow/failed shelf must
// never block or blank the other, so the two loads run independently rather
// than behind one combined phase.
//
// This story also owns the whole-page empty-state reconciliation 2.4's Dev
// Notes explicitly deferred here: once BOTH shelves have resolved to loaded
// and empty, Home shows EXPERIENCE.md's "Empty Home (new user)" copy instead
// of the two separate per-shelf empty rows. A shelf still loading/erroring is
// "not yet decided" and keeps showing its own state.

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
import { getTrackedShows } from '../../data/trackedShows';
import { logWatch, watchKey } from '../../data/watchLog';
import { triggerSync } from '../../data/watchSync';
import type { HomeStackParamList } from '../../navigation/HomeStack';

// One tap ✓ Watched (Story 3.2) — reuses AddScreen's exact confirmation
// copy (COPY_LOGGED/COPY_LOG_FAILED) and TitleDetailScreen's COPY_SAVE_FAILED
// wording; defined per-file per this codebase's established convention (3.1's
// code review left cross-file copy duplication alone).
const COPY_WATCHED = 'Logged — nice one.';
const COPY_WATCHED_FAILED = "Couldn't save that — try again.";
const CONFIRMATION_DISMISS_MS = 3000;

/** Up Next item — CatalogResult plus the pointer that gates the Watched pill. */
interface UpNextItem extends CatalogResult {
  nextEpisodePointer: number | null;
}

// AC2's (2.4) verbatim warm empty-watchlist copy (EXPERIENCE.md#Empty Watchlist).
const COPY_WATCHLIST_EMPTY = 'Save something for later — tap ❤️ on any title.';
// Up Next's own empty-shelf copy (Story 3.1) — no AC/EXPERIENCE.md row
// mandates literal text for this specific shelf; same warm, no-CTA style as
// the Watchlist empty row (copy-only, no button).
const COPY_UP_NEXT_EMPTY = 'Nothing tracked yet — tap "I\'m watching this" on any title.';
// Whole-page "brand-new user" copy (EXPERIENCE.md — "Empty Home (new user)"),
// shown only once BOTH shelves have resolved to genuinely empty (the
// reconciliation 2.4's Dev Notes deferred to this story). No CTA mandated.
const COPY_HOME_EMPTY = 'Your story starts here. What did you watch tonight?';
// Inferred "never a blank screen" requirement (UX-DR16 doctrine), not one of
// the literal ACs — a failed fetch must show a retry, not a false-empty shelf.
const COPY_ERROR = "We couldn't load this right now.";

const SHELF_CARD_WIDTH = 280;

type Phase = 'loading' | 'loaded' | 'error';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

export default function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [trackedPhase, setTrackedPhase] = useState<Phase>('loading');
  const [trackedItems, setTrackedItems] = useState<UpNextItem[]>([]);
  const [watchlistPhase, setWatchlistPhase] = useState<Phase>('loading');
  const [watchlistItems, setWatchlistItems] = useState<CatalogResult[]>([]);

  // ✓ Watched (Story 3.2) local UI state — per-key pending set (cleared once
  // loadTracked's next run completes, not persisted beyond this mount) and a
  // transient inline confirmation, mirroring TitleDetailScreen's simpler
  // pattern (Home has no existing toast/banner infra).
  const [watchedPendingKeys, setWatchedPendingKeys] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guards against setState after unmount from an in-flight fetch (mirrors
  // TitleDetailScreen.load's mountedRef pattern). Shared by both shelves.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  // Transient inline confirmation, auto-hides — mirrors
  // TitleDetailScreen.showConfirmation exactly (no third mechanism invented).
  const showConfirmation = useCallback((message: string) => {
    setConfirmation(message);
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => {
      if (mountedRef.current) setConfirmation(null);
    }, CONFIRMATION_DISMISS_MS);
  }, []);

  // Independent monotonic request tokens + first-paint gates per shelf.
  // useFocusEffect re-fires both loads on every focus and Home (a tab) is
  // never unmounted, so two rapid focus cycles can leave two loads in flight
  // per shelf — kept separate per shelf so Up Next and Watchlist never couple
  // their races (mirrors AddScreen.requestSeq / 2.4's HomeScreen).
  const trackedRequestSeq = useRef(0);
  const trackedHasLoadedRef = useRef(false);
  const watchlistRequestSeq = useRef(0);
  const watchlistHasLoadedRef = useRef(false);

  const loadTracked = useCallback(async () => {
    const seq = ++trackedRequestSeq.current;
    // Full-screen-shelf spinner only on the first load; a focus refetch keeps
    // the current shelf (and its scroll position) visible.
    if (!trackedHasLoadedRef.current) setTrackedPhase('loading');
    try {
      const rows = await getTrackedShows();
      const settled = await Promise.allSettled(
        rows.map((row) => fetchTitleDetail(row.tmdbId, row.mediaType)),
      );
      if (!mountedRef.current || seq !== trackedRequestSeq.current) return; // superseded
      const resolved: UpNextItem[] = [];
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { detail } = result.value;
          resolved.push({
            tmdbId: detail.tmdbId,
            mediaType: detail.mediaType,
            title: detail.title,
            year: detail.year,
            posterPath: detail.posterPath,
            // Carried through the same zip that already pairs each
            // fetchTitleDetail result back to its source row by index — no
            // separate fetch (Story 3.2, Task 4).
            nextEpisodePointer: rows[i].nextEpisodePointer,
          });
        } else {
          // One title's metadata is unavailable — drop that card, don't block
          // or error the whole shelf.
          console.warn('up next shelf: failed to resolve title', rows[i], result.reason);
        }
      });
      // A non-empty Up Next whose enrichment ALL failed is not an empty shelf
      // — the same false-empty getTrackedShows() throws to avoid (DB up,
      // catalog proxy down). Surface the retry state, never nuke an
      // already-painted shelf over a transient background-refresh failure.
      if (rows.length > 0 && resolved.length === 0) {
        if (!trackedHasLoadedRef.current) setTrackedPhase('error');
        return;
      }
      setTrackedItems(resolved);
      trackedHasLoadedRef.current = true;
      setTrackedPhase('loaded');
      // This load run has settled — clear any watchedPending markers so a
      // stale-forever pending pill can't survive past the data that resolved it.
      setWatchedPendingKeys(new Set());
    } catch (err) {
      if (!mountedRef.current || seq !== trackedRequestSeq.current) return; // superseded
      console.warn('up next shelf: getTrackedShows failed', err);
      if (!trackedHasLoadedRef.current) setTrackedPhase('error');
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    const seq = ++watchlistRequestSeq.current;
    if (!watchlistHasLoadedRef.current) setWatchlistPhase('loading');
    try {
      const rows = await getWatchlist();
      const settled = await Promise.allSettled(
        rows.map((row) => fetchTitleDetail(row.tmdbId, row.mediaType)),
      );
      if (!mountedRef.current || seq !== watchlistRequestSeq.current) return; // superseded
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
          console.warn('watchlist shelf: failed to resolve title', rows[i], result.reason);
        }
      });
      if (rows.length > 0 && resolved.length === 0) {
        if (!watchlistHasLoadedRef.current) setWatchlistPhase('error');
        return;
      }
      setWatchlistItems(resolved);
      watchlistHasLoadedRef.current = true;
      setWatchlistPhase('loaded');
    } catch (err) {
      if (!mountedRef.current || seq !== watchlistRequestSeq.current) return; // superseded
      console.warn('watchlist shelf: getWatchlist failed', err);
      if (!watchlistHasLoadedRef.current) setWatchlistPhase('error');
    }
  }, []);

  // Load both shelves on mount AND every time Home regains focus (e.g. after
  // tracking/❤️-ing a title from Add or title detail). Two independent calls,
  // not Promise.all — a slow/failed Up Next fetch must not block or blank an
  // already-working Watchlist shelf, and vice versa.
  useFocusEffect(
    useCallback(() => {
      loadTracked();
      loadWatchlist();
    }, [loadTracked, loadWatchlist]),
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

  // Whole-page empty reconciliation (Story 3.1, see file header): collapse to
  // the single whole-page copy only once BOTH shelves are loaded AND empty.
  // Either shelf still loading/erroring means "not yet decided" — keep
  // showing that shelf's own state instead.
  const wholePageEmpty =
    trackedPhase === 'loaded' &&
    watchlistPhase === 'loaded' &&
    trackedItems.length === 0 &&
    watchlistItems.length === 0;

  if (wholePageEmpty) {
    return (
      <Screen>
        <Text style={styles.stateText}>{COPY_HOME_EMPTY}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Shelf
        heading="Up Next"
        phase={trackedPhase}
        items={trackedItems}
        emptyCopy={COPY_UP_NEXT_EMPTY}
        horizontal
        onRetry={loadTracked}
        onOpenDetail={handleOpenDetail}
        theme={theme}
        styles={styles}
      />
      <Shelf
        heading="Watchlist"
        phase={watchlistPhase}
        items={watchlistItems}
        emptyCopy={COPY_WATCHLIST_EMPTY}
        horizontal={false}
        onRetry={loadWatchlist}
        onOpenDetail={handleOpenDetail}
        theme={theme}
        styles={styles}
      />
    </Screen>
  );
}

/** One shelf: heading + loading/error/empty/loaded states. Shared by Up Next
 *  and Watchlist — identical rendering shape, only the data source differs. */
function Shelf({
  heading,
  phase,
  items,
  emptyCopy,
  horizontal,
  onRetry,
  onOpenDetail,
  theme,
  styles,
}: {
  heading: string;
  phase: Phase;
  items: CatalogResult[];
  emptyCopy: string;
  horizontal: boolean;
  onRetry: () => void;
  onOpenDetail: (item: CatalogResult) => void;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.shelfSection}>
      <Text style={styles.heading} accessibilityRole="header">
        {heading}
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
            onPress={onRetry}
            style={styles.retryButton}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {phase === 'loaded' && items.length === 0 && (
        <Text style={styles.stateText}>{emptyCopy}</Text>
      )}

      {phase === 'loaded' && items.length > 0 && (
        <FlatList
          data={items}
          horizontal={horizontal}
          showsHorizontalScrollIndicator={horizontal}
          showsVerticalScrollIndicator={!horizontal}
          keyExtractor={(item) => `${item.mediaType}:${item.tmdbId}`}
          renderItem={({ item }) => (
            <View style={horizontal ? styles.shelfCardHorizontal : styles.shelfCardVertical}>
              <TitleCard item={item} onPress={onOpenDetail} />
            </View>
          )}
          contentContainerStyle={horizontal ? styles.shelfContentHorizontal : styles.shelfContentVertical}
        />
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing } = theme;
  return StyleSheet.create({
    shelfSection: { marginBottom: spacing.lg },
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
    shelfContentHorizontal: { paddingBottom: spacing.xl },
    shelfContentVertical: { paddingBottom: spacing.xl, gap: spacing.md },
    shelfCardHorizontal: { width: SHELF_CARD_WIDTH, marginRight: spacing.md },
    shelfCardVertical: { width: '100%' },
  });
}
