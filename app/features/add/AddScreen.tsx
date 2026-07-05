// Add — the (+) target, now the search-first entry to logging (Story 1.4).
//
// Search a real title through the proxied catalog. This screen owns the debounce
// that keeps TMDB from being hammered per keystroke (FR6 "results appear as you
// type" without the anti-goal). Results are DISPLAY-ONLY in 1.4 (scope wall,
// AC5): tapping a row navigates nowhere and logs nothing — title-detail is Epic
// 2, logging is Story 1.5. Rows are honest inert cards, not stubbed links.
//
// Errors preserve the typed query (AC6/FR8) and show the warm retry copy; a
// missing/failed poster shows the cool→dark placeholder, never a broken image
// (FR9). All color/typography comes from theme roles — no literal hex (UX-DR1).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

const DEBOUNCE_MS = 300;

// The warm-voice copy, verbatim from EXPERIENCE.md#State Patterns.
const COPY_EMPTY = 'Hmm, nothing by that name. Try another spelling or title?';
const COPY_ERROR = "Couldn't reach the catalog — check your connection and try again.";

type Phase = 'idle' | 'loading' | 'results' | 'empty' | 'error';

export default function AddScreen() {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [errorMsg, setErrorMsg] = useState(COPY_ERROR);

  // Monotonic request id: only the latest in-flight search may commit its result,
  // so a slow earlier response can't overwrite a newer one (debounce race).
  const requestSeq = useRef(0);

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
            renderItem={({ item }) => <TitleCard item={item} theme={theme} styles={styles} />}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </Screen>
  );
}

/** A single result — the title-card pattern. Inert in 1.4 (AC5): no navigation. */
function TitleCard({
  item,
  theme,
  styles,
}: {
  item: CatalogResult;
  theme: Theme;
  styles: ReturnType<typeof makeStyles>;
}) {
  const typeLabel = item.mediaType === 'tv' ? 'TV' : 'Film';
  const meta = [item.year, typeLabel].filter(Boolean).join(' · ');
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${item.title}, ${item.year ?? 'year unknown'}, ${typeLabel}`}
    >
      <Poster posterPath={item.posterPath} theme={theme} styles={styles} />
      <View style={styles.cardText}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.cardMeta}>{meta}</Text>
      </View>
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
    listContent: { paddingBottom: spacing.xl, gap: spacing.md },
    card: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceRaised,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
      minHeight: POSTER_H + spacing.md * 2,
    },
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
