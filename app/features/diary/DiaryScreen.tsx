import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../../components/Screen';
import { Poster } from '../../components/TitleCard';
import StarRating from '../../components/StarRating';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';
import { fetchTitleDetail, type TitleDetail } from '../../data/catalog';
import { getDiaryPage, type DiaryCursor, type DiaryWatch } from '../../data/watchEdit';
import EditWatchSheet from '../title-detail/EditWatchSheet';
import type { ProfileStackParamList } from '../../navigation/ProfileStack';

const COPY_EMPTY = "Nothing logged yet — tonight's episode is your first entry.";
const COPY_EMPTY_CTA = 'Log a watch';
const COPY_WATCH_UPDATED = 'Watch updated.';
const COPY_WATCH_REMOVED = 'Watch removed.';
const CONFIRMATION_DISMISS_MS = 3000;

type Phase = 'loading' | 'loaded';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Diary'>;

function enrichmentKey(tmdbId: number, mediaType: 'movie' | 'tv'): string {
  return `${mediaType}:${tmdbId}`;
}

export default function DiaryScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [rows, setRows] = useState<DiaryWatch[]>([]);
  const [nextCursor, setNextCursor] = useState<DiaryCursor | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  // Synchronous mirror of `loadingMore` — see loadMore's own comment for why
  // a ref guard is needed alongside the state flag.
  const loadingMoreRef = useRef(false);
  const [loadError, setLoadError] = useState(false);

  const [editingWatch, setEditingWatch] = useState<DiaryWatch | null>(null);
  // EditWatchSheet keeps rendering its last content while it slides closed
  // (its own `displayWatch` trick), but the tmdbId/mediaType props we pass it
  // are cross-title here (unlike TitleDetailScreen's screen-level constants),
  // so they need the same "remember the last one" treatment — otherwise a
  // Remove tapped mid-close-animation would use a stale-reset 0/'movie'.
  const lastEditingWatchRef = useRef<DiaryWatch | null>(null);
  if (editingWatch) lastEditingWatchRef.current = editingWatch;
  const sheetWatch = editingWatch ?? lastEditingWatchRef.current;
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Title-detail cache, keyed by "mediaType:tmdbId" — persists across pages so
  // a rewatched title or a bulk-logged season only ever fetches its detail
  // once, not once per Diary row (see file header).
  const enrichmentRef = useRef<Map<string, TitleDetail>>(new Map());
  // Bumps whenever enrichmentRef gains an entry, to force a re-render (the map
  // itself is a ref, not state, so mutating it alone wouldn't repaint rows).
  const [enrichmentVersion, setEnrichmentVersion] = useState(0);

  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);
  const hasLoadedRef = useRef(false);

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

  // Fetches title detail for any not-yet-cached tmdbId/mediaType pairs among
  // `pageRows`, as one batch (mirrors the existing shelf fan-out pattern for a
  // *set* of distinct titles) rather than per-row. A failed/never-resolved
  // enrichment just leaves that title out of the cache — rows fall back
  // gracefully (see renderRow), never blocking the list.
  const enrichPage = useCallback(async (pageRows: DiaryWatch[]) => {
    const cache = enrichmentRef.current;
    const seen = new Set<string>();
    const toFetch: { tmdbId: number; mediaType: 'movie' | 'tv' }[] = [];
    for (const row of pageRows) {
      const key = enrichmentKey(row.tmdbId, row.mediaType);
      if (cache.has(key) || seen.has(key)) continue;
      seen.add(key);
      toFetch.push({ tmdbId: row.tmdbId, mediaType: row.mediaType });
    }
    if (toFetch.length === 0) return;

    const settled = await Promise.allSettled(
      toFetch.map((t) => fetchTitleDetail(t.tmdbId, t.mediaType)),
    );
    if (!mountedRef.current) return;

    let gained = false;
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        cache.set(enrichmentKey(toFetch[i].tmdbId, toFetch[i].mediaType), result.value.detail);
        gained = true;
      }
    });
    if (gained) setEnrichmentVersion((v) => v + 1);
  }, []);

  // Loads (or reloads) page 1, replacing the list — used on mount/focus and
  // after a successful edit/remove (simplest correct approach; Diary's
  // pagination makes an in-place patch materially harder to get right for no
  // AC-mandated benefit, same "re-fetch rather than optimistically patch"
  // precedent Story 3.7 already established).
  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    if (!hasLoadedRef.current) setPhase('loading');
    setLoadError(false);
    // A fresh page-1 load supersedes any in-flight loadMore for the old list
    // — clear its flag/spinner here rather than leaving it to that loadMore's
    // own (seq-guarded, and therefore skippable) finally block, so a refocus
    // racing a pending loadMore can never leave loadingMore stuck true.
    loadingMoreRef.current = false;
    setLoadingMore(false);
    try {
      const page = await getDiaryPage();
      if (!mountedRef.current || seq !== requestSeqRef.current) return; // superseded
      setRows(page.rows);
      setNextCursor(page.nextCursor);
      setPhase('loaded');
      hasLoadedRef.current = true;
      enrichPage(page.rows);
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return; // superseded
      console.warn('diary: load failed', err);
      setRows([]);
      setNextCursor(null);
      setPhase('loaded');
      setLoadError(true);
      hasLoadedRef.current = true;
    }
  }, [enrichPage]);

  const loadMore = useCallback(async () => {
    // Synchronous ref guard, not just the `loadingMore` state check below —
    // FlatList's onEndReached is known to double-fire within the same
    // synchronous window, before a setLoadingMore(true) state update commits;
    // a ref set immediately (before any await) is immune to that race in a
    // way state alone isn't. Mirrors this codebase's established savingRef/
    // removingRef double-tap guard convention (BulkLogSheet, EditWatchSheet).
    if (loadingMoreRef.current || nextCursor === null || phase !== 'loaded') return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    // Increments requestSeqRef (previously only read here) so a concurrent
    // load() unambiguously supersedes this loadMore, and vice versa.
    const seq = ++requestSeqRef.current;
    try {
      const page = await getDiaryPage(nextCursor);
      if (!mountedRef.current || seq !== requestSeqRef.current) return; // superseded by a reload
      setRows((prev) => [...prev, ...page.rows]);
      setNextCursor(page.nextCursor);
      enrichPage(page.rows);
    } catch (err) {
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      console.warn('diary: loadMore failed', err);
      // A failed page-2+ fetch just stops pagination silently — the already-
      // loaded rows stay visible, matching Recommendations' own posture for a
      // mid-scroll failure.
      setNextCursor(null);
    } finally {
      // Unconditional (not seq-guarded): this loadMore's own fetch is done
      // either way, so its spinner/lock must always clear — a superseded
      // response should still stop pretending to be in flight. (A fresh
      // load() also clears both eagerly, above, as a second line of defense.)
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [nextCursor, phase, enrichPage]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleSaved = useCallback(() => {
    setEditingWatch(null);
    showConfirmation(COPY_WATCH_UPDATED);
    load();
  }, [load, showConfirmation]);

  const handleRemoved = useCallback(() => {
    setEditingWatch(null);
    showConfirmation(COPY_WATCH_REMOVED);
    load();
  }, [load, showConfirmation]);

  // The empty-state CTA needs the root tab navigator (Add is a sibling tab,
  // not a route in this stack) — DiaryScreen sits two levels deep
  // (ProfileStack inside the root Tab.Navigator), so one getParent() call
  // reaches it.
  const handleGoToAdd = useCallback(() => {
    navigation.getParent()?.navigate('Add');
  }, [navigation]);

  const wholeListEmpty = phase === 'loaded' && rows.length === 0 && !loadError;

  if (phase === 'loading' && !hasLoadedRef.current) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  if (wholeListEmpty) {
    return (
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          Diary
        </Text>
        <View style={styles.centerState}>
          <Text style={styles.stateText}>{COPY_EMPTY}</Text>
          <Pressable
            onPress={handleGoToAdd}
            style={styles.ctaButton}
            accessibilityRole="button"
            accessibilityLabel={COPY_EMPTY_CTA}
          >
            <Text style={styles.ctaText}>{COPY_EMPTY_CTA}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        Diary
      </Text>

      {loadError && rows.length === 0 && (
        <View style={styles.errorState}>
          <Text style={styles.stateText}>Couldn't load your Diary.</Text>
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

      {confirmation && (
        <Text style={styles.confirmation} accessibilityLiveRegion="polite">
          {confirmation}
        </Text>
      )}

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => (
          <DiaryRow
            watch={item}
            detail={enrichmentRef.current.get(enrichmentKey(item.tmdbId, item.mediaType)) ?? null}
            onPress={() => setEditingWatch(item)}
            styles={styles}
          />
        )}
        // enrichmentVersion isn't read directly by FlatList, but including it
        // as an extraData dependency forces rows to re-render once a batch's
        // title/poster resolves (the cache itself is a ref, invisible to
        // React's own change detection).
        extraData={enrichmentVersion}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.5}
        onEndReached={loadMore}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : null
        }
      />

      <EditWatchSheet
        watch={editingWatch}
        visible={editingWatch != null}
        tmdbId={sheetWatch?.tmdbId ?? 0}
        mediaType={sheetWatch?.mediaType ?? 'movie'}
        onDismiss={() => setEditingWatch(null)}
        onSaved={handleSaved}
        onRemoved={handleRemoved}
      />
    </Screen>
  );
}

/** One Diary row: poster + title/episode + date + rating + moods + note
 *  preview. Mirrors TitleDetailScreen.tsx's WatchRow with a poster/title
 *  prepended — WatchRow's single-title context didn't need them, Diary's
 *  cross-title context does. Tap-to-act only, no long-press (FR44). */
function DiaryRow({
  watch,
  detail,
  onPress,
  styles,
}: {
  watch: DiaryWatch;
  detail: TitleDetail | null;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const date = new Date(watch.watchedAt).toLocaleDateString();
  const title = detail?.title ?? '—';

  const episodeLabel = useMemo(() => {
    if (watch.tmdbEpisodeId == null || !detail?.seasons) return null;
    for (const season of detail.seasons) {
      const ep = season.episodes.find((e) => e.tmdbEpisodeId === watch.tmdbEpisodeId);
      if (ep) return `S${season.seasonNumber}E${ep.episodeNumber}`;
    }
    return null;
  }, [watch.tmdbEpisodeId, detail]);

  const metaParts = [episodeLabel, date].filter((part): part is string => !!part);

  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`Edit watch of ${title} from ${date}`}
    >
      <Poster posterPath={detail?.posterPath ?? null} width={48} height={72} glyphSize={18} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowMeta}>{metaParts.join(' · ')}</Text>
        <StarRating value={watch.rating} onChange={() => {}} disabled />
        {watch.moods.length > 0 && <Text style={styles.rowMoods}>{watch.moods.join(' ')}</Text>}
        {watch.note && (
          <Text style={styles.rowNote} numberOfLines={1}>
            {watch.note}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing, radius } = theme;
  return StyleSheet.create({
    title: { ...type.title, color: colors.inkPrimary, marginBottom: spacing.md },
    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    stateText: { ...type.body, color: colors.inkSecondary, textAlign: 'center' },
    // Retry affordance for a failed load — mirrors TitleDetailScreen's error
    // state (Pressable "Try again", not a nonexistent pull-to-refresh).
    errorState: { alignItems: 'flex-start', gap: spacing.md },
    retryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      justifyContent: 'center',
    },
    retryText: { ...type.label, color: colors.inkPrimary },
    confirmation: { ...type.meta, color: colors.inkSecondary, marginBottom: spacing.sm },
    ctaButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 48,
      justifyContent: 'center',
    },
    ctaText: { ...type.label, color: colors.inkPrimary },
    listContent: { paddingBottom: spacing.xl, gap: spacing.sm },
    footer: { paddingVertical: spacing.md, alignItems: 'center' },
    row: {
      flexDirection: 'row',
      gap: spacing.md,
      minHeight: 48,
      padding: spacing.md,
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
    },
    rowText: { flex: 1, gap: spacing.xs, justifyContent: 'center' },
    rowTitle: { ...type.cardTitle, color: colors.inkPrimary },
    rowMeta: { ...type.label, color: colors.inkSecondary },
    rowMoods: { ...type.body, color: colors.inkPrimary },
    rowNote: { ...type.body, color: colors.inkSecondary, fontStyle: 'italic' },
  });
}
