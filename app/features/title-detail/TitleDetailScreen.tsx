// Title detail (Story 2.2) — poster, synopsis, year, and (for shows) seasons +
// episodes. Opened by tapping a title card (AddScreen today; more surfaces
// later). Display-only per the story's scope wall: no tracking / watchlist /
// rating / notify — those are later epics. A gap is intentionally left where
// 2.3's ❤️ Add-to-Watchlist button will land.
//
// Three real states, all first-class (EXPERIENCE.md review-rubric flagged the
// loading + error triad as previously underspecified):
//   * loading  — spinner while catalog-title resolves,
//   * loaded   — poster/title/year/synopsis (+ seasons for tv),
//   * error    — AC4's two cases: (a) cached basics available → render them with
//                a "showing saved info" note; (b) nothing cached → the verbatim
//                "We couldn't load this right now." + retry.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../../components/Screen';
import { Poster } from '../../components/TitleCard';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';
import {
  CatalogError,
  fetchTitleDetail,
  type SeasonDetail,
  type TitleDetail,
} from '../../data/catalog';
import { getWatchlistKeys, watchlistKey, writeWatchlist } from '../../data/watchlist';
import { getTrackedKeys, trackShow } from '../../data/trackedShows';
import type { TitleDetailParams } from '../../navigation/titleDetailParams';
import BulkLogSheet from './BulkLogSheet';

const COPY_ERROR = "We couldn't load this right now.";
const COPY_SOFT_FALLBACK = 'Showing saved info — we couldn’t refresh just now.';
// AC4: warm add-confirmation (one emoji max — none here; UX-DR20). Remove and
// failure stay minimal; the detail screen has no toast infra, so this is a small
// inline live-region note that auto-hides.
const COPY_WATCHLISTED = "We'll tell you when it's time.";
const COPY_WATCHLIST_REMOVED = 'Removed from watchlist.';
// Shared generic save-failure copy — reused by both the watchlist and
// tracking actions below (identical wording, so one constant, not two).
const COPY_SAVE_FAILED = "Couldn't save that — try again.";
// Story 3.1's "I'm watching this" confirmation — one emoji max (NFR10), warm,
// no guilt/streak language. Reuses the same inline live-region note as the
// watchlist confirmation (no second confirmation mechanism, per Dev Notes).
const COPY_TRACKED = 'Added to Up Next.';
// Story 3.4's AC4/UX-DR20/Flow 2 bulk-log confirmation, verbatim.
const COPY_SEASON_LOGGED = "That's a whole season in one sitting. Respect.";
const CONFIRMATION_DISMISS_MS = 3000;

const DETAIL_POSTER_W = 140;
const DETAIL_POSTER_H = 210;

type Phase = 'loading' | 'loaded' | 'error';

// Stack-agnostic on purpose (Story 2.4): this screen is pushed from two
// independent native-stacks (AddStack, HomeStack) with identical params — only
// `route.params` and `navigation.goBack()` are used here, so there is no need
// to couple this screen's typing to either stack's full param list.
type Props = {
  route: { params: TitleDetailParams };
  navigation: { goBack: () => void };
};

export default function TitleDetailScreen({ route, navigation }: Props) {
  const { tmdbId, mediaType } = route.params;
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [phase, setPhase] = useState<Phase>('loading');
  const [detail, setDetail] = useState<TitleDetail | null>(null);
  // True when the shown detail is the AC4 soft-fail fallback (cached basics
  // rendered because TMDB was unreachable) — drives the "showing saved info" note.
  const [soft, setSoft] = useState(false);
  const [errorMsg, setErrorMsg] = useState(COPY_ERROR);
  // Watchlist heart (Story 2.3). Optimistic local state; seeded by a best-effort
  // server lookup on load. `confirmation` is a transient inline live-region note
  // (the detail screen has no toast infra — kept lightweight and self-contained;
  // a shared Toast extraction is flagged as a later-story candidate, not built here).
  const [watchlisted, setWatchlisted] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // Tracked state (Story 3.1) — sibling to the watchlist block above, same
  // shape, same confirmation machinery (no second mechanism).
  const [tracked, setTracked] = useState(false);
  // Which season (if any) has its bulk-log sheet open (Story 3.4). Rendered
  // once at the screen level (not nested per-SeasonRow) — see JSX below.
  const [bulkLogSeason, setBulkLogSeason] = useState<SeasonDetail | null>(null);

  // Guards against a state update after the screen is popped mid-fetch (the
  // invoke isn't cancelable and can run up to DETAIL_INVOKE_TIMEOUT_MS).
  const mountedRef = useRef(true);
  // Synchronous mirror of `watchlisted` so a same-frame double-tap reads the
  // true current value (state would be stale until the next render).
  const watchlistedRef = useRef(false);
  // Set once the user taps the heart — after that, the best-effort seed lookup
  // must NOT overwrite their optimistic action with a (possibly stale) snapshot.
  const watchlistInteractedRef = useRef(false);
  // Synchronous mirror of `tracked`, same reasoning as watchlistedRef.
  const trackedRef = useRef(false);
  // Set once the user taps "I'm watching this" — same guard as
  // watchlistInteractedRef, so a slow best-effort seed lookup can't clobber it.
  const trackInteractedRef = useRef(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  // Show a transient inline confirmation that auto-hides. Guarded against
  // setState-after-unmount via mountedRef.
  const showConfirmation = useCallback((message: string) => {
    setConfirmation(message);
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => {
      if (mountedRef.current) setConfirmation(null);
    }, CONFIRMATION_DISMISS_MS);
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const result = await fetchTitleDetail(tmdbId, mediaType);
      if (!mountedRef.current) return;
      setDetail(result.detail);
      setSoft(result.soft);
      setPhase('loaded');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof CatalogError ? err.message : COPY_ERROR);
      setPhase('error');
    }
  }, [tmdbId, mediaType]);

  useEffect(() => {
    load();
  }, [load]);

  // Best-effort initial heart state — guarded by mountedRef so a pop mid-fetch
  // doesn't setState. A failed lookup leaves the heart empty (acceptable
  // degradation). Keyed by the route params, which are always present (even in
  // the soft-fail render), so the heart works there too.
  useEffect(() => {
    getWatchlistKeys([{ tmdbId, mediaType }])
      .then((keys) => {
        // Skip if unmounted, or if the user has already toggled — their
        // optimistic action wins over this best-effort seed (a slow lookup must
        // never revert a heart the user just tapped).
        if (!mountedRef.current || watchlistInteractedRef.current) return;
        const next = keys.has(watchlistKey(tmdbId, mediaType));
        watchlistedRef.current = next;
        setWatchlisted(next);
      })
      .catch(() => {});
  }, [tmdbId, mediaType]);

  // Best-effort initial tracked state (Story 3.1) — sibling effect to the
  // watchlist seed lookup above, same guard shape (skip if unmounted or if
  // the user has already tapped "I'm watching this").
  useEffect(() => {
    getTrackedKeys([{ tmdbId, mediaType }])
      .then((keys) => {
        if (!mountedRef.current || trackInteractedRef.current) return;
        const next = keys.has(watchlistKey(tmdbId, mediaType));
        trackedRef.current = next;
        setTracked(next);
      })
      .catch(() => {});
  }, [tmdbId, mediaType]);

  // Tap "I'm watching this": optimistic flip + persist, roll back on failure.
  // No untrack path (AC4) — once tracked, this is a no-op on further taps,
  // both as a UI guard here and a DB-level guarantee (0006's unique index).
  const handleTrackShow = useCallback(() => {
    if (trackedRef.current) return;
    trackInteractedRef.current = true;
    trackedRef.current = true;
    setTracked(true);
    trackShow(tmdbId, mediaType)
      .then(() => {
        if (!mountedRef.current) return;
        showConfirmation(COPY_TRACKED);
      })
      .catch((err) => {
        console.warn('track show failed', err);
        if (!mountedRef.current) return;
        // Roll back only if not already superseded by a newer action.
        if (trackedRef.current) {
          trackedRef.current = false;
          setTracked(false);
        }
        showConfirmation(COPY_SAVE_FAILED);
      });
  }, [tmdbId, mediaType, showConfirmation]);

  // Tap ❤️: optimistic flip + persist, roll back on failure (mirrors AddScreen).
  // `desired` is read from the ref (synchronous truth) so a same-frame double-tap
  // toggles correctly; `writeWatchlist` serializes add-vs-remove per title.
  const handleToggleWatchlist = useCallback(() => {
    watchlistInteractedRef.current = true;
    const desired = !watchlistedRef.current;
    watchlistedRef.current = desired;
    setWatchlisted(desired);
    writeWatchlist(tmdbId, mediaType, desired)
      .then(() => {
        if (!mountedRef.current) return;
        showConfirmation(desired ? COPY_WATCHLISTED : COPY_WATCHLIST_REMOVED);
      })
      .catch((err) => {
        console.warn('watchlist toggle failed', err);
        if (!mountedRef.current) return;
        // Roll back only if not already superseded by a newer toggle.
        if (watchlistedRef.current === desired) {
          watchlistedRef.current = !desired;
          setWatchlisted(!desired);
        }
        showConfirmation(COPY_SAVE_FAILED);
      });
  }, [tmdbId, mediaType, showConfirmation]);

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={8}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={theme.colors.inkPrimary} />
        </Pressable>
      </View>

      {phase === 'loading' && (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      )}

      {phase === 'error' && (
        <View style={styles.errorState}>
          <Text style={styles.stateText}>{errorMsg}</Text>
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

      {phase === 'loaded' && detail && (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {soft && (
            <View style={styles.softBanner} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={16} color={theme.colors.inkSecondary} />
              <Text style={styles.softBannerText}>{COPY_SOFT_FALLBACK}</Text>
            </View>
          )}

          <View style={styles.hero}>
            <Poster
              posterPath={detail.posterPath}
              width={DETAIL_POSTER_W}
              height={DETAIL_POSTER_H}
              glyphSize={36}
            />
            <View style={styles.heroText}>
              <Text style={styles.title} accessibilityRole="header">
                {detail.title}
              </Text>
              <Text style={styles.meta}>
                {[detail.year, detail.mediaType === 'tv' ? 'TV' : 'Film']
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {/* Star row / mood chips slot (UX-DR6) — empty until Epic 3. */}
              {/* ❤️ Add-to-Watchlist (Story 2.3). primary color, NOT gold
                  (UX-DR1). Reachable even in the soft-fail cached-basics render
                  (detail carries tmdbId/mediaType); never in the hard-error
                  state (no detail there). */}
              <Pressable
                onPress={handleToggleWatchlist}
                style={({ pressed }) => [styles.watchlistButton, pressed && styles.watchlistButtonPressed]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  watchlisted
                    ? `Remove ${detail.title} from watchlist`
                    : `Add ${detail.title} to watchlist`
                }
              >
                <Ionicons
                  name={watchlisted ? 'heart' : 'heart-outline'}
                  size={24}
                  color={theme.colors.primary}
                />
                <Text style={styles.watchlistLabel}>
                  {watchlisted ? 'On your watchlist' : 'Add to watchlist'}
                </Text>
              </Pressable>
              {/* "I'm watching this" (Story 3.1) — second action row below the
                  ❤️ button. No untrack path (AC4): once tracked, a further tap
                  is a no-op (handleTrackShow's own guard, plus 0006's DB-level
                  guarantee). Reachable in the same states as the watchlist
                  heart (loaded + soft-fallback, never hard-error). No episode-
                  state badge here (scope wall) — this story only tracks. */}
              <Pressable
                onPress={handleTrackShow}
                disabled={tracked}
                style={({ pressed }) => [styles.watchlistButton, pressed && !tracked && styles.watchlistButtonPressed]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ disabled: tracked }}
                accessibilityLabel={
                  tracked ? `${detail.title} is being tracked` : `Start tracking ${detail.title}`
                }
              >
                <Ionicons
                  name={tracked ? 'checkmark-circle' : 'add-circle-outline'}
                  size={24}
                  color={theme.colors.primary}
                />
                <Text style={styles.watchlistLabel}>
                  {tracked ? 'Tracking' : "I'm watching this"}
                </Text>
              </Pressable>
              {confirmation && (
                <Text
                  style={styles.watchlistConfirmation}
                  accessibilityLiveRegion="polite"
                >
                  {confirmation}
                </Text>
              )}
            </View>
          </View>

          {detail.synopsis ? (
            <Text style={styles.synopsis}>{detail.synopsis}</Text>
          ) : (
            <Text style={styles.synopsisMuted}>No synopsis yet.</Text>
          )}

          {/* TV only: seasons + episodes. Films render no seasons section (AC2).
              A soft-fail cached-basics payload may be a film-shaped thin row with
              no `seasons` — omitting the section then is correct, not an error. */}
          {detail.mediaType === 'tv' && detail.seasons && detail.seasons.length > 0 && (
            <View style={styles.seasons}>
              <Text style={styles.sectionHeading} accessibilityRole="header">
                Seasons
              </Text>
              {detail.seasons.map((season) => (
                <SeasonRow
                  key={season.seasonNumber}
                  season={season}
                  styles={styles}
                  theme={theme}
                  onMarkSeasonWatched={setBulkLogSeason}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {detail && (
        <BulkLogSheet
          season={bulkLogSeason}
          visible={bulkLogSeason != null}
          tmdbId={tmdbId}
          mediaType={mediaType}
          onDismiss={() => setBulkLogSeason(null)}
          onLogged={() => {
            setBulkLogSeason(null);
            showConfirmation(COPY_SEASON_LOGGED);
          }}
        />
      )}
    </Screen>
  );
}

/** One collapsible season: a tappable header that expands its episode list. */
function SeasonRow({
  season,
  styles,
  theme,
  onMarkSeasonWatched,
}: {
  season: SeasonDetail;
  styles: ReturnType<typeof makeStyles>;
  theme: Theme;
  onMarkSeasonWatched: (season: SeasonDetail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = season.episodes.length;
  return (
    <View style={styles.seasonCard}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.seasonHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${season.name}, ${count} episode${count === 1 ? '' : 's'}`}
      >
        <View style={styles.seasonHeaderText}>
          <Text style={styles.seasonName}>{season.name}</Text>
          <Text style={styles.seasonMeta}>
            {count} episode{count === 1 ? '' : 's'}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.inkSecondary}
        />
      </Pressable>
      {expanded &&
        season.episodes.map((ep) => (
          <View key={ep.episodeNumber} style={styles.episodeRow}>
            <Text style={styles.episodeNumber}>{ep.episodeNumber}</Text>
            <View style={styles.episodeText}>
              <Text style={styles.episodeName} numberOfLines={2}>
                {ep.name}
              </Text>
              {ep.airDate && <Text style={styles.episodeMeta}>{ep.airDate}</Text>}
            </View>
          </View>
        ))}
      {/* Separate control from the header Pressable above — expand/collapse is
          unrelated, unchanged 2.2 behavior (Story 3.4, AC1). */}
      <Pressable
        onPress={() => onMarkSeasonWatched(season)}
        style={styles.markSeasonButton}
        accessibilityRole="button"
        accessibilityLabel={`Mark all of ${season.name} watched`}
      >
        <Ionicons name="checkmark-done-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.markSeasonText}>Mark whole season watched</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing, radius } = theme;
  return StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
    backButton: {
      width: 44,
      height: 44,
      marginLeft: -spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    errorState: { flex: 1, justifyContent: 'center', gap: spacing.md, alignItems: 'flex-start' },
    stateText: { ...type.body, color: colors.inkSecondary },
    retryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
      minHeight: 44,
      justifyContent: 'center',
    },
    retryText: { ...type.label, color: colors.inkPrimary },
    scrollContent: { paddingBottom: spacing.xl, gap: spacing.lg },
    softBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    softBannerText: { ...type.meta, color: colors.inkSecondary, flex: 1 },
    hero: { flexDirection: 'row', gap: spacing.lg },
    heroText: { flex: 1, justifyContent: 'center', gap: spacing.sm },
    title: { ...type.hero, color: colors.inkPrimary },
    meta: { ...type.body, color: colors.inkSecondary },
    // ❤️ watchlist toggle — a labelled row (icon + text), tap-to-act, 44pt min
    // height. primary color (UX-DR1: gold is reserved, not for a heart).
    watchlistButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      alignSelf: 'flex-start',
      minHeight: 44,
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
    },
    watchlistButtonPressed: { opacity: 0.6 },
    watchlistLabel: { ...type.label, color: colors.primary },
    watchlistConfirmation: { ...type.meta, color: colors.inkSecondary },
    synopsis: { ...type.body, color: colors.inkPrimary, lineHeight: 22 },
    synopsisMuted: { ...type.body, color: colors.inkSecondary, fontStyle: 'italic' },
    seasons: { gap: spacing.sm },
    sectionHeading: { ...type.title, color: colors.inkPrimary, marginBottom: spacing.xs },
    seasonCard: {
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    seasonHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.md,
      minHeight: 48,
    },
    seasonHeaderText: { flex: 1, gap: spacing.xs },
    seasonName: { ...type.cardTitle, color: colors.inkPrimary },
    seasonMeta: { ...type.meta, color: colors.inkSecondary },
    episodeRow: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
    },
    episodeNumber: {
      ...type.label,
      color: colors.inkSecondary,
      minWidth: 20,
      textAlign: 'right',
    },
    episodeText: { flex: 1, gap: 2 },
    episodeName: { ...type.body, color: colors.inkPrimary },
    episodeMeta: { ...type.meta, color: colors.inkSecondary },
    // "Mark whole season watched" (Story 3.4) — 44/48pt min tap target
    // (Accessibility Floor), full-width row inside the season card.
    markSeasonButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderHairline,
    },
    markSeasonText: { ...type.label, color: colors.primary },
  });
}
