import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import DateTimePicker from '@react-native-community/datetimepicker';

import MoodChipRow from '../../components/MoodChipRow';
import StarRating from '../../components/StarRating';
import { editWatch, removeWatch, type LoggedWatch } from '../../data/watchEdit';
import { MAX_MOODS, MAX_NOTE_LENGTH } from '../../data/watchLog';
import { useTheme } from '../../theme/ThemeProvider';
import type { Theme } from '../../theme/tokens';

const COPY_SAVE_FAILED = "Couldn't save that — try again.";

type Props = {
  watch: LoggedWatch | null;
  visible: boolean;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  onDismiss: () => void;
  onSaved: () => void;
  onRemoved: () => void;
};

export default function EditWatchSheet({
  watch,
  visible,
  tmdbId,
  mediaType,
  onDismiss,
  onSaved,
  onRemoved,
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous mirrors of saving/removing — same same-frame-double-tap fix
  // BulkLogSheet's savingRef already established.
  const savingRef = useRef(false);
  const removingRef = useRef(false);

  // The last non-null `watch` this sheet was opened with — same
  // mount-through-close-animation trick as RatingPrompt's `displayWatchId`.
  const [displayWatch, setDisplayWatch] = useState<LoggedWatch | null>(null);

  // Reduce Motion (mirrors RatingPrompt's existing pattern verbatim).
  const [reduceMotion, setReduceMotion] = useState(false);
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

  // Seed local editable state from `watch` on open (AC1) — reset keyed on
  // `watch?.id`, same shape as RatingPrompt's reset effect.
  useEffect(() => {
    if (watch) {
      setDisplayWatch(watch);
      setDate(new Date(watch.watchedAt));
      setRating(watch.rating);
      setMoods(watch.moods);
      setNote(watch.note ?? '');
      setError(null);
      setShowDatePicker(false);
      setSaving(false);
      setRemoving(false);
      savingRef.current = false;
      removingRef.current = false;
    }
  }, [watch]);

  const shownWatch = watch ?? displayWatch;
  if (!shownWatch) return null;

  const busy = saving || removing;

  const handleDismiss = () => {
    if (savingRef.current || removingRef.current) return;
    onDismiss();
  };

  const handleDateChange = (_event: unknown, selected?: Date) => {
    // Android's native dialog is modal and self-dismissing — its onChange
    // fires once with a final 'set'/'dismissed' event, so closing on every
    // change is correct there. iOS's default/spinner display has no such
    // dismiss step: it fires onChange continuously as the wheel scrolls, so
    // auto-closing on the first tick would unmount the picker before the user
    // can land on their intended date. Keep it open on iOS until the user
    // taps "Done" (below) or dismisses the sheet.
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (!selected) return;
    // Date-only edit (AC1 says "its date," not date+time) — keep the
    // original hours/minutes/seconds from the watch, only replace the
    // calendar date.
    const next = new Date(selected);
    next.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    setDate(next);
  };

  const handleSave = async () => {
    if (savingRef.current || removingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await editWatch(shownWatch.id, {
        watchedAt: date.toISOString(),
        rating,
        moods,
        note: note.trim().length > 0 ? note : null,
      });
      onSaved();
    } catch (err) {
      console.warn('edit watch failed', err);
      setError(COPY_SAVE_FAILED);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (savingRef.current || removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    setError(null);
    try {
      await removeWatch(shownWatch.id, tmdbId, mediaType, shownWatch.tmdbEpisodeId);
      onRemoved();
    } catch (err) {
      console.warn('remove watch failed', err);
      setError(COPY_SAVE_FAILED);
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  };

  const handleRemovePress = () => {
    if (savingRef.current || removingRef.current) return;
    Alert.alert("Remove this watch?", "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: confirmRemove },
    ]);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoider}
        >
          <View style={styles.sheet}>
            <Text style={styles.title} accessibilityRole="header">
              Edit watch
            </Text>

            <Text style={styles.sectionLabel}>Date</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              disabled={busy}
              style={styles.dateField}
              accessibilityRole="button"
              accessibilityLabel={`Edit date, currently ${date.toLocaleDateString()}`}
            >
              <Text style={styles.dateText}>{date.toLocaleDateString()}</Text>
            </Pressable>
            {showDatePicker && (
              <>
                <DateTimePicker value={date} mode="date" onChange={handleDateChange} />
                {Platform.OS === 'ios' && (
                  <Pressable
                    onPress={() => setShowDatePicker(false)}
                    style={styles.datePickerDoneButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.datePickerDoneText}>Done</Text>
                  </Pressable>
                )}
              </>
            )}

            <Text style={styles.sectionLabel}>Rating</Text>
            <StarRating value={rating} onChange={setRating} disabled={busy} />

            <Text style={styles.sectionLabel}>Mood</Text>
            <MoodChipRow value={moods} onChange={setMoods} max={MAX_MOODS} disabled={busy} />

            <Text style={styles.sectionLabel}>Note</Text>
            <TextInput
              style={styles.noteField}
              value={note}
              onChangeText={setNote}
              maxLength={MAX_NOTE_LENGTH}
              multiline
              editable={!busy}
              placeholder="Add a note (optional)"
              placeholderTextColor={theme.colors.inkSecondary}
              accessibilityLabel="Note"
            />
            <Text style={styles.noteCounter}>
              {note.length}/{MAX_NOTE_LENGTH}
            </Text>

            {error && (
              <Text style={styles.errorText} accessibilityLiveRegion="polite">
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleSave}
              disabled={busy}
              style={[styles.saveButton, busy && styles.saveButtonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
            >
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
            </Pressable>

            <Pressable
              onPress={handleRemovePress}
              disabled={busy}
              style={[styles.removeButton, busy && styles.removeButtonDisabled]}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              accessibilityLabel="Remove this watch"
            >
              <Text style={styles.removeText}>
                {removing ? 'Removing…' : 'Remove this watch'}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function makeStyles(theme: Theme) {
  const { colors, type, spacing, radius } = theme;
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    keyboardAvoider: { width: '100%' },
    sheet: {
      backgroundColor: colors.surfaceRaised,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.sm,
    },
    title: { ...type.title, color: colors.inkPrimary },
    sectionLabel: { ...type.label, color: colors.inkSecondary, marginTop: spacing.md },
    dateField: {
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    dateText: { ...type.body, color: colors.inkPrimary },
    datePickerDoneButton: {
      alignSelf: 'flex-end',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      minHeight: 44,
      justifyContent: 'center',
    },
    datePickerDoneText: { ...type.label, color: colors.primary },
    // Note field — mirrors RatingPrompt's note field (Story 3.6): sunken
    // surface, radius.sm, taller minHeight for multiline. No shared
    // extraction exists (RatingPrompt has no exported subcomponent) — the
    // styling constants are copied, same as BulkLogSheet/RatingPrompt each
    // independently mirror AddScreen's searchField look.
    noteField: {
      ...type.body,
      color: colors.inkPrimary,
      backgroundColor: colors.surfaceSunken,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    noteCounter: { ...type.meta, color: colors.inkSecondary, textAlign: 'right' },
    errorText: { ...type.meta, color: colors.primary, marginTop: spacing.sm },
    saveButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.sm,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.lg,
    },
    saveButtonDisabled: { opacity: 0.5 },
    saveText: { ...type.label, color: colors.inkPrimary },
    // Remove — destructive, not gold/primary (not a memory/identity or CTA
    // moment). No new color token exists in theme/tokens.ts for this (checked
    // before writing this style) — a plain outlined button using existing
    // ink/border tokens keeps it visually distinct from Save without
    // inventing one.
    removeButton: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderHairline,
      borderRadius: radius.sm,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    removeButtonDisabled: { opacity: 0.5 },
    removeText: { ...type.label, color: colors.inkSecondary },
  });
}
