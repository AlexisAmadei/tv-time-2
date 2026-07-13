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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import RatingPrompt from '../../components/RatingPrompt';
import { Screen } from '../../components/Screen';
import { GridPosterCard, TitleCard } from '../../components/TitleCard';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';
import { fetchTitleDetail, type CatalogResult, type TitleDetail } from '../../data/catalog';
import { getWatchlist } from '../../data/watchlist';
import { getTrackedShows } from '../../data/trackedShows';
import { getLoggedKeys, getWatchedEpisodeIds, logWatch, watchKey } from '../../data/watchLog';
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
  // "S{season}E{episode} · {episode name}" for the show's next unwatched
  // episode (tv only) — resolved from the same fetchTitleDetail() response
  // already fetched to enrich this card, by matching nextEpisodePointer
  // against each season's episode list. Null for films (no pointer concept)
  // and for a tv show whose pointer is null (brand-new/caught-up) or whose
  // matching episode isn't present in the fetched seasons.
  nextEpisodeLabel: string | null;
  // Grid-view-only progress bar (real episodes watched / total real episodes,
  // specials excluded — see countRealEpisodes/countWatchedRealEpisodes). Null
  // for films and for a tv item whose progress hasn't resolved yet.
  episodesWatched: number | null;
  episodesTotal: number | null;
}

/** Watchlist shelf items also carry the same tv-only progress fields as
 *  {@link UpNextItem} (added by this story) — the grid progress bar isn't
 *  Up-Next-exclusive, it renders on every tv card in grid view. */
interface WatchlistCardItem extends CatalogResult {
  episodesWatched: number | null;
  episodesTotal: number | null;
}

/** Find the season/episode-number label for a TMDB episode id inside a
 *  title's season list — the same "S{n}E{n}" shorthand EXPERIENCE.md's Flow 1
 *  uses ("S3E5 is pre-selected"). Returns null if the pointer isn't found
 *  (e.g. a stale pointer past a season list the enrichment fetch omitted). */
function findNextEpisodeLabel(
  seasons: TitleDetail['seasons'],
  tmdbEpisodeId: number | null,
): string | null {
  if (tmdbEpisodeId == null || !seasons) return null;
  for (const season of seasons) {
    const episode = season.episodes.find((e) => e.tmdbEpisodeId === tmdbEpisodeId);
    if (episode) {
      return `S${season.seasonNumber}E${episode.episodeNumber} · ${episode.name}`;
    }
  }
  return null;
}

// Season 0 is TMDB's "Specials" bucket (no explicit flag on season/episode —
// see catalog-title's passthrough) and must never count toward the grid-view
// progress bar's denominator or numerator (per this story's requirement:
// "real episodes only, not specials").
function countRealEpisodes(seasons: TitleDetail['seasons']): number {
  if (!seasons) return 0;
  return seasons
    .filter((s) => s.seasonNumber !== 0)
    .reduce((sum, s) => sum + s.episodes.length, 0);
}

function countWatchedRealEpisodes(
  seasons: TitleDetail['seasons'],
  watchedEpisodeIds: Set<number>,
): number {
  if (!seasons) return 0;
  let count = 0;
  for (const season of seasons) {
    if (season.seasonNumber === 0) continue;
    for (const episode of season.episodes) {
      if (watchedEpisodeIds.has(episode.tmdbEpisodeId)) count += 1;
    }
  }
  return count;
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

// List⇄grid toggle: grid view is a fixed 3-per-row layout (posters as the
// primary content, mirrors common streaming-app "card view" patterns) rather
// than list view's 1-per-row full-width rows.
const GRID_COLUMNS = 3;

type ViewMode = 'list' | 'grid';

// Series/Movies tabs — swipeable, mirrors the native tab-bar pattern (tap OR
// horizontal swipe). No pager library is installed and this app is pinned to
// Expo SDK 56 (see app/AGENTS.md — SDK bumps are a correct-course decision,
// not a drive-by), so this uses a plain paging ScrollView rather than adding
// a new native dependency.
const MEDIA_TABS: { key: 'tv' | 'movie'; label: string }[] = [
  { key: 'tv', label: 'Series' },
  { key: 'movie', label: 'Movies' },
];

type Phase = 'loading' | 'loaded' | 'error';

type Props = NativeStackScreenProps<HomeStackParamList, 'HomeMain'>;

export default function HomeScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [activeTab, setActiveTab] = useState<'tv' | 'movie'>('tv');
  // Applies to both Series and Movies tabs — one toggle, not per-tab, so
  // switching tabs doesn't surprise the user with a different layout.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const tabScrollRef = useRef<ScrollView>(null);
  // Screen (see components/Screen.tsx) applies its own horizontal margin, so
  // the pager's usable width is that inner content box, not the raw window
  // width — measured via onLayout on the pager's own container rather than
  // assumed from useWindowDimensions (which would overflow past the margin).
  const [pagerWidth, setPagerWidth] = useState(0);
  // Guards against onMomentumScrollEnd re-deriving activeTab from a
  // programmatic scrollTo (tab tap) — only swipe-driven settles should do
  // that; a tap already sets activeTab directly.
  const isProgrammaticScroll = useRef(false);

  const handleTabPress = useCallback(
    (key: 'tv' | 'movie') => {
      // A tap can land before the pager's onLayout has measured pagerWidth
      // (e.g. first paint on a slow device) — still switch the active tab so
      // the tap isn't silently swallowed, just skip the scrollTo (there's
      // nothing to scroll to yet).
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

  const [trackedPhase, setTrackedPhase] = useState<Phase>('loading');
  const [trackedItems, setTrackedItems] = useState<UpNextItem[]>([]);
  const [watchlistPhase, setWatchlistPhase] = useState<Phase>('loading');
  const [watchlistItems, setWatchlistItems] = useState<WatchlistCardItem[]>([]);
  const [watchedWatchlistItems, setWatchedWatchlistItems] = useState<WatchlistCardItem[]>([]);

  // ✓ Watched (Story 3.2) local UI state — per-key pending set, owned entirely
  // by handleMarkWatched's own call (added at the start of its flow, cleared
  // in its own `finally`, regardless of any concurrent/unrelated loadTracked()
  // run) — not persisted beyond this mount. `watchedPendingKeysRef` mirrors
  // the state synchronously so a rapid double-tap on the same pill (before
  // React re-renders with the disabled prop) is still caught. A transient
  // inline confirmation mirrors TitleDetailScreen's simpler pattern (Home has
  // no existing toast/banner infra).
  const [watchedPendingKeys, setWatchedPendingKeys] = useState<Set<string>>(new Set());
  const watchedPendingKeysRef = useRef<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Post-watch rating prompt (Story 3.5) — mounted once at the screen level,
  // opened with the id logWatch returns. Non-null id ⇒ visible.
  const [promptWatchId, setPromptWatchId] = useState<string | null>(null);

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
      // Keyed alongside `resolved` so the post-hoc watched-episode-ids pass
      // below can re-derive each tv item's denominator without re-fetching
      // detail (seasons already live here from the settled Promise.allSettled
      // above — CatalogResult itself doesn't carry them).
      const seasonsByTmdbId = new Map<number, TitleDetail['seasons']>();
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { detail } = result.value;
          if (detail.mediaType === 'tv') seasonsByTmdbId.set(detail.tmdbId, detail.seasons);
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
            // Resolved from this same detail response's `seasons` — no
            // separate fetch either; films and pointer-less/unmatched tv
            // shows fall back to null (Shelf then falls back to the plain
            // title card with no subtitle).
            nextEpisodeLabel: findNextEpisodeLabel(detail.seasons, rows[i].nextEpisodePointer),
            episodesWatched: null,
            episodesTotal: detail.mediaType === 'tv' ? countRealEpisodes(detail.seasons) : null,
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
      // Films have no untrack (see trackedShows.ts) so a watched film stays in
      // `tracked_shows` forever — filter it out of Up Next here rather than at
      // the source. TV shows are unaffected: their own watched/caught-up state
      // is already expressed through `nextEpisodePointer`, not this check.
      const loggedKeys = await getLoggedKeys(resolved);
      // Grid-view progress bar's numerator — batched over every tv title in
      // this shelf rather than one query per card.
      const watchedEpisodeIds = await getWatchedEpisodeIds(
        resolved.filter((item) => item.mediaType === 'tv').map((item) => item.tmdbId),
      );
      if (!mountedRef.current || seq !== trackedRequestSeq.current) return; // superseded
      for (const item of resolved) {
        if (item.mediaType !== 'tv') continue;
        item.episodesWatched = countWatchedRealEpisodes(
          seasonsByTmdbId.get(item.tmdbId),
          watchedEpisodeIds.get(item.tmdbId) ?? new Set(),
        );
      }
      const visible = resolved.filter(
        (item) => item.mediaType !== 'movie' || !loggedKeys.has(watchKey(item.tmdbId, item.mediaType)),
      );
      setTrackedItems(visible);
      trackedHasLoadedRef.current = true;
      setTrackedPhase('loaded');
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
      const resolved: WatchlistCardItem[] = [];
      const seasonsByTmdbId = new Map<number, TitleDetail['seasons']>();
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const { detail } = result.value;
          if (detail.mediaType === 'tv') seasonsByTmdbId.set(detail.tmdbId, detail.seasons);
          resolved.push({
            tmdbId: detail.tmdbId,
            mediaType: detail.mediaType,
            title: detail.title,
            year: detail.year,
            posterPath: detail.posterPath,
            episodesWatched: null,
            episodesTotal: detail.mediaType === 'tv' ? countRealEpisodes(detail.seasons) : null,
          });
        } else {
          console.warn('watchlist shelf: failed to resolve title', rows[i], result.reason);
        }
      });
      if (rows.length > 0 && resolved.length === 0) {
        if (!watchlistHasLoadedRef.current) setWatchlistPhase('error');
        return;
      }
      const loggedKeys = await getLoggedKeys(resolved);
      // Grid-view progress bar's numerator, batched (see loadTracked's
      // identical pattern).
      const watchedEpisodeIds = await getWatchedEpisodeIds(
        resolved.filter((item) => item.mediaType === 'tv').map((item) => item.tmdbId),
      );
      if (!mountedRef.current || seq !== watchlistRequestSeq.current) return; // superseded
      for (const item of resolved) {
        if (item.mediaType !== 'tv') continue;
        item.episodesWatched = countWatchedRealEpisodes(
          seasonsByTmdbId.get(item.tmdbId),
          watchedEpisodeIds.get(item.tmdbId) ?? new Set(),
        );
      }
      const unwatched: WatchlistCardItem[] = [];
      const watched: WatchlistCardItem[] = [];
      resolved.forEach((item) => {
        const key = watchKey(item.tmdbId, item.mediaType);
        if (loggedKeys.has(key)) {
          watched.push(item);
        } else {
          unwatched.push(item);
        }
      });
      setWatchlistItems(unwatched);
      setWatchedWatchlistItems(watched);
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
  // not Promise.all — a slow/failed shelf must not block or blank an
  // already-working one.
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

  // ✓ Watched (Story 3.2, Task 4): the local outbox write (logWatch) IS the
  // commit (AC1/AC2), regardless of connectivity — the confirmation shows the
  // instant it resolves. triggerSync() afterward both attempts the pointer
  // recompute right away for the common online case (Task 2, watchSync.ts)
  // and is a safe no-op/failure when offline; loadTracked() then redraws
  // whatever pointer is current — harmless if unchanged, self-heals on the
  // next successful sync plus a later focus/foreground trigger. Also calls
  // loadWatchlist() so a title that's both tracked and on the Watchlist moves
  // into the Watched shelf immediately, not just on the next unrelated focus.
  //
  // `key`'s pending marker is added at the start of this call and cleared in
  // its own `finally` — never by a different, possibly-concurrent
  // loadTracked()/loadWatchlist() run — so marking one item watched can never
  // prematurely re-enable (or permanently stick) another item's pill.
  const handleMarkWatched = useCallback(
    async (item: CatalogResult) => {
      const upNextItem = item as Partial<UpNextItem>;
      const key = watchKey(item.tmdbId, item.mediaType);
      if (watchedPendingKeysRef.current.has(key)) return; // already in flight — ignore the duplicate tap
      watchedPendingKeysRef.current.add(key);
      setWatchedPendingKeys((prev) => new Set(prev).add(key));
      try {
        const watchId = await logWatch({
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          tmdbEpisodeId: item.mediaType === 'tv' ? (upNextItem.nextEpisodePointer ?? null) : null,
        });
        if (!mountedRef.current) return;
        // Confirm and open the rating prompt the moment the LOCAL commit lands
        // — before triggerSync and the two refetches below (Story 3.5, AC1:
        // "when the commit lands"). Leaving the prompt behind those awaits would
        // put a network round-trip in front of it and blow NFR1's 15s budget on
        // a slow connection; the refetches still run in the background.
        showConfirmation(COPY_WATCHED);
        setPromptWatchId(watchId);
        await triggerSync().catch((err) => {
          console.warn('mark watched: background sync failed', err);
        });
        if (!mountedRef.current) return;
        loadTracked();
        loadWatchlist();
      } catch (err) {
        console.warn('mark watched failed', err);
        if (mountedRef.current) showConfirmation(COPY_WATCHED_FAILED);
      } finally {
        watchedPendingKeysRef.current.delete(key);
        if (mountedRef.current) {
          setWatchedPendingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }
    },
    [showConfirmation, loadTracked, loadWatchlist],
  );

  const trackedByTab = useMemo(
    () => ({
      tv: trackedItems.filter((item) => item.mediaType === 'tv'),
      movie: trackedItems.filter((item) => item.mediaType === 'movie'),
    }),
    [trackedItems],
  );
  const watchlistByTab = useMemo(
    () => ({
      tv: watchlistItems.filter((item) => item.mediaType === 'tv'),
      movie: watchlistItems.filter((item) => item.mediaType === 'movie'),
    }),
    [watchlistItems],
  );
  const watchedWatchlistByTab = useMemo(
    () => ({
      tv: watchedWatchlistItems.filter((item) => item.mediaType === 'tv'),
      movie: watchedWatchlistItems.filter((item) => item.mediaType === 'movie'),
    }),
    [watchedWatchlistItems],
  );

  // Whole-page empty reconciliation (Story 3.1, see file header): collapse to
  // the single whole-page copy only once BOTH shelves are loaded AND empty.
  // Either shelf still loading/erroring means "not yet decided" — keep
  // showing that shelf's own state instead.
  const wholePageEmpty =
    trackedPhase === 'loaded' &&
    watchlistPhase === 'loaded' &&
    trackedItems.length === 0 &&
    watchlistItems.length === 0 &&
    watchedWatchlistItems.length === 0;

  if (wholePageEmpty) {
    return (
      <Screen>
        <Text style={styles.stateText}>{COPY_HOME_EMPTY}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.headerRow}>
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
        <Pressable
          onPress={() => setViewMode((v) => (v === 'list' ? 'grid' : 'list'))}
          style={styles.viewToggleButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
        >
          <Ionicons
            name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
            size={22}
            color={theme.colors.inkSecondary}
          />
        </Pressable>
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
          <ScrollView
            key={tab.key}
            style={[styles.pageScroll, pagerWidth ? { width: pagerWidth } : null]}
            contentContainerStyle={styles.pageScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {tab.key !== 'movie' && (
              <Shelf
                heading="Up Next"
                phase={trackedPhase}
                items={trackedByTab[tab.key]}
                emptyCopy={COPY_UP_NEXT_EMPTY}
                horizontal={false}
                viewMode={viewMode}
                pagerWidth={pagerWidth}
                onRetry={loadTracked}
                onOpenDetail={handleOpenDetail}
                onMarkWatched={handleMarkWatched}
                watchedPendingKeys={watchedPendingKeys}
                watchedIcon
                theme={theme}
                styles={styles}
              />
            )}
            <Shelf
              heading="Watchlist"
              phase={watchlistPhase}
              items={watchlistByTab[tab.key]}
              emptyCopy={COPY_WATCHLIST_EMPTY}
              horizontal={false}
              viewMode={viewMode}
              pagerWidth={pagerWidth}
              onRetry={loadWatchlist}
              onOpenDetail={handleOpenDetail}
              onMarkWatched={tab.key === 'movie' ? handleMarkWatched : undefined}
              watchedPendingKeys={watchedPendingKeys}
              watchedIcon={tab.key === 'movie'}
              theme={theme}
              styles={styles}
            />
            {watchedWatchlistByTab[tab.key].length > 0 && (
              <Shelf
                heading="Watched"
                phase={watchlistPhase}
                items={watchedWatchlistByTab[tab.key]}
                collapsedCopy="Tap to see what's already watched."
                accordion
                defaultExpanded={false}
                horizontal={false}
                viewMode={viewMode}
                pagerWidth={pagerWidth}
                onRetry={loadWatchlist}
                onOpenDetail={handleOpenDetail}
                onMarkWatched={handleMarkWatched}
                watchedPendingKeys={watchedPendingKeys}
                watchedIcon
                watchedAlready
                theme={theme}
                styles={styles}
              />
            )}
          </ScrollView>
        ))}
      </ScrollView>
      <RatingPrompt
        watchId={promptWatchId}
        visible={promptWatchId != null}
        onDismiss={() => setPromptWatchId(null)}
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
  collapsedCopy,
  horizontal,
  viewMode,
  pagerWidth,
  accordion = false,
  defaultExpanded = true,
  onRetry,
  onOpenDetail,
  onMarkWatched,
  watchedPendingKeys,
  watchedIcon = false,
  watchedAlready = false,
  theme,
  styles,
}: {
  heading: string;
  phase: Phase;
  items: CatalogResult[];
  // Optional: the "Watched" shelf only ever mounts once it already has items
  // (see its call site), so it has no reachable empty state and passes none.
  emptyCopy?: string;
  collapsedCopy?: string;
  horizontal: boolean;
  // 'grid' switches this shelf's list to the 3-per-row poster layout
  // (HomeScreen's list⇄grid toggle) — applies to every shelf uniformly, same
  // as list view today. `pagerWidth` (the pager's measured page width — see
  // HomeScreen's onLayout) sizes each grid column, since GridPosterCard needs
  // a pixel poster width rather than a percentage (Poster only accepts
  // numeric width/height).
  viewMode: ViewMode;
  pagerWidth: number;
  accordion?: boolean;
  defaultExpanded?: boolean;
  onRetry: () => void;
  onOpenDetail: (item: CatalogResult) => void;
  // Up Next and the Watched shelf pass these (tracked items and rewatchable
  // watchlist items respectively); the plain Watchlist shelf omits them
  // entirely, so its own cards never render a Watched pill (Story 3.2 scope
  // wall — that shelf's items haven't been watched yet).
  onMarkWatched?: (item: CatalogResult) => void;
  watchedPendingKeys?: Set<string>;
  // Up Next and the Watched shelf both use the round green tick button (swaps
  // out the plain text pill); Up Next's tap always marks a first watch,
  // the Watched shelf's a rewatch — `watchedAlready` (below) tells TitleCard
  // which accessibility label applies.
  watchedIcon?: boolean;
  // See `watchedIcon` — Watched-shelf-only, tells the icon button's tap is a
  // rewatch, not a first watch (AD-3).
  watchedAlready?: boolean;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canCollapse = accordion && items.length > 0;
  const showList = !canCollapse || expanded;
  return (
    <View style={styles.shelfSection}>
      {accordion ? (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          style={styles.accordionHeader}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${heading}, ${items.length} title${items.length === 1 ? '' : 's'}`}
        >
          <View style={styles.accordionHeaderText}>
            <Text style={styles.heading}>{heading}</Text>
            <Text style={styles.accordionMeta}>
              {items.length} title{items.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.inkSecondary}
          />
        </Pressable>
      ) : (
        <Text style={styles.heading} accessibilityRole="header">
          {heading}
        </Text>
      )}

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

      {phase === 'loaded' && items.length === 0 && emptyCopy && (
        <Text style={styles.stateText}>{emptyCopy}</Text>
      )}

      {phase === 'loaded' && canCollapse && !expanded && (
        <Text style={styles.collapsedStateText}>{collapsedCopy ?? 'Tap to expand.'}</Text>
      )}

      {phase === 'loaded' && showList && items.length > 0 && viewMode === 'grid' && (
        <FlatList
          data={items}
          key="grid" // numColumns can't change on a live FlatList — force remount vs the list-mode instance
          numColumns={GRID_COLUMNS}
          // Same reasoning as the list-mode FlatList below (scrollEnabled=
          // {horizontal}, false here too): the outer pageScroll ScrollView
          // owns scrolling for this page, so this nested list must not also
          // scroll — RN's "VirtualizedLists should never be nested inside
          // plain ScrollViews with the same orientation" warning is exactly
          // this case when a nested list DOES keep its own scroll enabled.
          scrollEnabled={false}
          showsVerticalScrollIndicator={false}
          keyExtractor={(item) => `${item.mediaType}:${item.tmdbId}`}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => {
            const upNextItem = item as Partial<UpNextItem>;
            const showWatchedPill =
              !!onMarkWatched &&
              (item.mediaType === 'movie' ||
                (item.mediaType === 'tv' && upNextItem.nextEpisodePointer != null));
            const key = watchKey(item.tmdbId, item.mediaType);
            const gap = theme.spacing.sm;
            const posterWidth = pagerWidth
              ? (pagerWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS
              : 100;
            return (
              <GridPosterCard
                item={item}
                posterWidth={posterWidth}
                onPress={onOpenDetail}
                onMarkWatched={showWatchedPill ? onMarkWatched : undefined}
                watchedPending={watchedPendingKeys?.has(key) ?? false}
                watchedAlready={watchedAlready}
                episodesWatched={upNextItem.episodesWatched ?? null}
                episodesTotal={upNextItem.episodesTotal ?? null}
              />
            );
          }}
          contentContainerStyle={styles.shelfContentGrid}
        />
      )}

      {phase === 'loaded' && showList && items.length > 0 && viewMode === 'list' && (
        <FlatList
          data={items}
          key="list"
          horizontal={horizontal}
          scrollEnabled={horizontal}
          showsHorizontalScrollIndicator={horizontal}
          showsVerticalScrollIndicator={!horizontal}
          keyExtractor={(item) => `${item.mediaType}:${item.tmdbId}`}
          renderItem={({ item }) => {
            // AC1/AC2 gate (Story 3.3): the Watched pill renders for every
            // tracked film unconditionally (no pointer concept applies) and
            // for a tracked tv item only once its pointer is non-null —
            // caught-up/not-yet-computed tv shows still render with no pill.
            const upNextItem = item as Partial<UpNextItem>;
            const showWatchedPill =
              !!onMarkWatched &&
              (item.mediaType === 'movie' ||
                (item.mediaType === 'tv' && upNextItem.nextEpisodePointer != null));
            const key = watchKey(item.tmdbId, item.mediaType);
            return (
              <View style={horizontal ? styles.shelfCardHorizontal : styles.shelfCardVertical}>
                <TitleCard
                  item={item}
                  onPress={onOpenDetail}
                  onMarkWatched={showWatchedPill ? onMarkWatched : undefined}
                  watchedPending={watchedPendingKeys?.has(key) ?? false}
                  watchedIcon={watchedIcon}
                  watchedAlready={watchedAlready}
                  subtitle={upNextItem.nextEpisodeLabel}
                />
              </View>
            );
          }}
          contentContainerStyle={horizontal ? styles.shelfContentHorizontal : styles.shelfContentVertical}
        />
      )}
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing } = theme;
  return StyleSheet.create({
    // Transient ✓ Watched confirmation (Story 3.2) — mirrors
    // TitleDetailScreen's watchlistConfirmation styling.
    confirmation: {
      ...type.meta,
      color: colors.inkSecondary,
      marginBottom: spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderHairline,
    },
    tabBar: {
      flex: 1,
      flexDirection: 'row',
    },
    viewToggleButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
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
    pageScroll: { flex: 1 },
    pageScrollContent: { flexGrow: 1 },
    shelfSection: { marginBottom: spacing.lg },
    heading: {
      ...type.title,
      color: colors.inkPrimary,
    },
    accordionHeader: {
      marginBottom: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    accordionHeaderText: { flex: 1, gap: spacing.xs },
    accordionMeta: { ...type.meta, color: colors.inkSecondary },
    centerState: { paddingTop: spacing.xl, alignItems: 'center' },
    stateText: {
      ...type.body,
      color: colors.inkSecondary,
      paddingTop: spacing.sm,
    },
    collapsedStateText: {
      ...type.body,
      color: colors.inkSecondary,
      paddingTop: spacing.xs,
      paddingBottom: spacing.sm,
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
    shelfContentGrid: { paddingBottom: spacing.xl, gap: spacing.sm },
    gridRow: { gap: spacing.sm, marginBottom: spacing.sm },
    shelfCardHorizontal: { width: SHELF_CARD_WIDTH, marginRight: spacing.md },
    shelfCardVertical: { width: '100%' },
  });
}
