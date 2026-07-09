// Bulk-log sheet (Story 3.4) — "Mark whole season watched" on a season row
// opens this, with every episode pre-checked (AC1 — "deselect, don't
// select"). Confirm commits the whole selection as one atomic local-outbox
// transaction via `logWatchBatch()` (one session lookup, one
// `withTransactionAsync`, one `triggerSync()` — not N of each), so a failure
// partway through never leaves a partial batch to half-retry.
//
// First bottom-sheet/modal in the codebase: React Native's built-in `Modal`
// (transparent + slide animation), no new dependency.
//
// Season-level rating/mood (AC3) is a SEPARATE, minimal, self-contained
// control — NOT Story 3.5's post-watch prompt (still backlog, a 0–2
// multi-select mood sheet that slides up after a single watch). This is one
// optional 0–5 half-star rating and at most one optional mood chip, applied
// identically to every episode this bulk action logs. Read the story's scope
// wall before touching this file: no shared StarRating/MoodChip extraction,
// no multi-mood selector, no "already watched" indicator on the episode list.

import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { logWatchBatch } from '../../data/watchLog';
import { MOODS } from '../../data/moods';
import type { SeasonDetail } from '../../data/catalog';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';

// 5 stars, half-step, mapped onto `watches.rating`'s existing 0–10 smallint
// scale (0003_watches.sql) — no schema change needed for rating.
const STAR_COUNT = 5;

const COPY_SAVE_FAILED = "Couldn't save that — try again.";

type Props = {
  season: SeasonDetail | null;
  visible: boolean;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  onDismiss: () => void;
  onLogged: () => void;
};

export default function BulkLogSheet({
  season,
  visible,
  tmdbId,
  mediaType,
  onDismiss,
  onLogged,
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rating, setRating] = useState<number | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous mirror of `saving` — state doesn't take effect until the next
  // render, so a same-frame double-tap on Confirm would otherwise pass the
  // `saving` check twice and log the batch twice. Same fix TitleDetailScreen
  // already uses for this exact race (trackedRef/watchlistedRef).
  const savingRef = useRef(false);
  // The last non-null `season` this sheet was opened with. TitleDetailScreen
  // drives `visible` and `season` from the same state variable, so on every
  // dismiss `season` goes straight to null in the same render `visible` goes
  // to false — rendering from `season` directly would unmount this component
  // (and RN's <Modal> with it) before it ever gets a `visible={false}` render
  // to animate its close against. `displaySeason` below keeps the sheet's
  // content in place through that close animation.
  const [lastSeason, setLastSeason] = useState<SeasonDetail | null>(null);

  // Reset to "all pre-checked, no rating/mood" every time a new season is
  // handed to the sheet (AC1) — keyed on the season itself, not just
  // `visible`, so re-opening the same season after a dismiss resets cleanly.
  useEffect(() => {
    if (season) {
      setLastSeason(season);
      setSelected(new Set(season.episodes.map((ep) => ep.tmdbEpisodeId)));
      setRating(null);
      setMood(null);
      setError(null);
      setSaving(false);
      savingRef.current = false;
    }
  }, [season]);

  const displaySeason = season ?? lastSeason;
  if (!displaySeason) return null;

  const toggleEpisode = (tmdbEpisodeId: number) => {
    if (saving) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tmdbEpisodeId)) next.delete(tmdbEpisodeId);
      else next.add(tmdbEpisodeId);
      return next;
    });
  };

  // Radio behavior: selecting a new star value replaces the old one;
  // tapping the already-selected value deselects (null = unset, representable).
  const handleStarPress = (value: number) => {
    if (saving) return;
    setRating((prev) => (prev === value ? null : value));
  };

  // Radio behavior: selecting a new chip deselects the previous one; tapping
  // the already-selected chip deselects it (0 or 1 selected, never more).
  const toggleMood = (emoji: string) => {
    if (saving) return;
    setMood((prev) => (prev === emoji ? null : emoji));
  };

  // Dismissing (backdrop tap or close) must never log anything — a no-op
  // while a confirm is already in flight avoids closing out from under it.
  const handleDismiss = () => {
    if (savingRef.current) return;
    onDismiss();
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      // Natural episode order (displaySeason.episodes), not the Set's
      // insertion order, so the resulting `watches` rows land in episode order.
      const episodes = displaySeason.episodes.filter((ep) => selected.has(ep.tmdbEpisodeId));
      // One atomic transaction for the whole batch (logWatchBatch) — a
      // failure partway through rolls back everything instead of leaving a
      // partial commit that a retry would re-log on top of.
      await logWatchBatch(
        episodes.map((ep) => ({
          tmdbId,
          mediaType,
          tmdbEpisodeId: ep.tmdbEpisodeId,
          rating,
          mood,
        })),
      );
      onLogged();
    } catch (err) {
      // Rare, auth-gated-screen case (logWatchBatch only throws on a missing
      // session, or an invalid mood — both checked before any row is
      // written). Nothing is committed on failure since the whole batch is
      // one transaction, so retrying just resubmits the same selection with
      // no risk of double-logging.
      console.warn('bulk log failed', err);
      setError(COPY_SAVE_FAILED);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmDisabled = selected.size === 0 || saving;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.title} accessibilityRole="header">
              Mark {displaySeason.name} watched
            </Text>

            {displaySeason.episodes.map((ep) => {
              const checked = selected.has(ep.tmdbEpisodeId);
              return (
                <Pressable
                  key={ep.tmdbEpisodeId}
                  onPress={() => toggleEpisode(ep.tmdbEpisodeId)}
                  disabled={saving}
                  style={styles.episodeRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: saving }}
                  accessibilityLabel={`Episode ${ep.episodeNumber}, ${ep.name}`}
                >
                  <Ionicons
                    name={checked ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={checked ? theme.colors.primary : theme.colors.inkSecondary}
                  />
                  <Text style={styles.episodeNumber}>{ep.episodeNumber}</Text>
                  <Text style={styles.episodeName} numberOfLines={2}>
                    {ep.name}
                  </Text>
                </Pressable>
              );
            })}

            <Text style={styles.sectionLabel}>Rate the season (optional)</Text>
            <View style={styles.starRow}>
              {Array.from({ length: STAR_COUNT }, (_, i) => {
                const halfValue = i * 2 + 1;
                const fullValue = i * 2 + 2;
                const current = rating ?? 0;
                const filled = current >= fullValue;
                const half = !filled && current >= halfValue;
                const iconName = half ? 'star-half' : 'star';
                return (
                  <View key={i} style={styles.starTarget}>
                    <Pressable
                      onPress={() => handleStarPress(halfValue)}
                      disabled={saving}
                      style={styles.starHalfTap}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${i + 0.5} stars`}
                      accessibilityState={{ selected: half, disabled: saving }}
                    />
                    <Pressable
                      onPress={() => handleStarPress(fullValue)}
                      disabled={saving}
                      style={styles.starHalfTap}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${i + 1} stars`}
                      accessibilityState={{ selected: filled, disabled: saving }}
                    />
                    <Ionicons
                      name={iconName}
                      size={28}
                      color={theme.colors.gold}
                      style={[styles.starIcon, !filled && !half && styles.starEmpty]}
                      pointerEvents="none"
                    />
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>Mood (optional)</Text>
            <View style={styles.moodRow}>
              {MOODS.map(({ emoji, name }) => {
                const selectedMood = mood === emoji;
                return (
                  <Pressable
                    key={emoji}
                    onPress={() => toggleMood(emoji)}
                    disabled={saving}
                    style={[styles.moodChip, selectedMood && styles.moodChipSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedMood, disabled: saving }}
                    accessibilityLabel={name}
                  >
                    <Text style={styles.moodEmoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>

            {error && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleConfirm}
              disabled={confirmDisabled}
              style={[styles.confirmButton, confirmDisabled && styles.confirmButtonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: confirmDisabled }}
            >
              <Text style={styles.confirmText}>
                {saving
                  ? 'Logging…'
                  : `Log ${selected.size} episode${selected.size === 1 ? '' : 's'}`}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing, radius } = theme;
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      backgroundColor: colors.surfaceRaised,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      maxHeight: '85%',
    },
    sheetContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
    title: { ...type.title, color: colors.inkPrimary, marginBottom: spacing.sm },
    episodeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
    },
    episodeNumber: { ...type.label, color: colors.inkSecondary, minWidth: 20, textAlign: 'right' },
    episodeName: { ...type.body, color: colors.inkPrimary, flex: 1 },
    sectionLabel: { ...type.label, color: colors.inkSecondary, marginTop: spacing.md },
    starRow: { flexDirection: 'row', gap: spacing.xs },
    starTarget: { width: 28, height: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    starHalfTap: { width: 14, height: 44 },
    starIcon: { position: 'absolute', left: 0, top: 8 },
    // DESIGN.md#Components: empty portion of the star at 28% opacity.
    starEmpty: { opacity: 0.28 },
    moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    moodChip: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceBase,
    },
    moodChipSelected: { backgroundColor: colors.surfaceSunken },
    moodEmoji: { fontSize: 20 },
    errorText: { ...type.meta, color: colors.primary, marginTop: spacing.sm },
    confirmButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
    },
    confirmButtonDisabled: { opacity: 0.5 },
    confirmText: { ...type.label, color: colors.inkPrimary },
  });
}
