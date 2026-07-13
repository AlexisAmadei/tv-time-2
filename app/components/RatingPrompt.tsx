import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import MoodChipRow from './MoodChipRow';
import StarRating from './StarRating';
import { setWatchReaction, MAX_MOODS, MAX_NOTE_LENGTH } from '../data/watchLog';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';

// Debounced (not per-keystroke) to avoid a SQLite transaction, and eventually a
// network PATCH, on every character typed.
const NOTE_DEBOUNCE_MS = 400;

type Props = {
  watchId: string | null;
  visible: boolean;
  onDismiss: () => void;
};

export default function RatingPrompt({ watchId, visible, onDismiss }: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);

  const [rating, setRating] = useState<number | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [note, setNote] = useState('');

  // `watchId` goes null in the same render `visible` goes false, so rendering
  // from it directly would unmount the sheet before it can animate closed.
  const [displayWatchId, setDisplayWatchId] = useState<string | null>(null);

  const [reduceMotion, setReduceMotion] = useState(false);
  const reduceMotionRef = useRef(false);
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
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  useEffect(() => {
    if (watchId) {
      setDisplayWatchId(watchId);
      setRating(null);
      setMoods([]);
      setNote('');
    }
  }, [watchId]);

  // Chain writes after the previous settles so a rapid star→chip→star sequence
  // never interleaves two SQLite transactions on the one connection.
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const persist = (nextRating: number | null, nextMoods: string[], nextNote: string) => {
    const id = watchId;
    if (id == null) return;
    writeChainRef.current = writeChainRef.current
      .catch(() => {})
      .then(() =>
        setWatchReaction(id, {
          rating: nextRating,
          moods: nextMoods,
          note: nextNote.trim().length > 0 ? nextNote : null,
        }),
      )
      .catch((err) => {
        console.warn('RatingPrompt: setWatchReaction failed (reaction is optional)', err);
      });
  };

  const handleRating = (next: number | null) => {
    setRating(next);
    persist(next, moods, note);
  };
  const handleMoods = (next: string[]) => {
    setMoods(next);
    persist(rating, next, note);
  };

  // Debounce the WRITE, not the state update, so the UI stays responsive.
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clamp defensively even though TextInput also sets `maxLength` — some
  // Android IME/autofill paste paths can bypass a native maxLength, and an
  // over-cap note would make every subsequent persist() throw inside
  // assertValidReaction and silently stop saving reactions altogether.
  const handleNoteChange = (next: string) => {
    const clamped = next.length > MAX_NOTE_LENGTH ? next.slice(0, MAX_NOTE_LENGTH) : next;
    setNote(clamped);
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    noteDebounceRef.current = setTimeout(() => {
      noteDebounceRef.current = null;
      persist(rating, moods, clamped);
    }, NOTE_DEBOUNCE_MS);
  };

  // If the host screen unmounts by some path other than handleDismiss (e.g.
  // navigating away mid-debounce), don't let the pending timer fire later
  // against an unmounted screen's stale closure.
  useEffect(() => {
    return () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    };
  }, []);

  // Flush a pending note-debounce timer synchronously first so a note typed
  // just before dismiss isn't dropped.
  const handleDismiss = () => {
    if (noteDebounceRef.current) {
      clearTimeout(noteDebounceRef.current);
      noteDebounceRef.current = null;
      persist(rating, moods, note);
    }
    onDismiss();
  };

  if (!displayWatchId) return null;

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
              How was it?
            </Text>

            <StarRating value={rating} onChange={handleRating} />

            <View style={styles.moodSpacer}>
              <MoodChipRow value={moods} onChange={handleMoods} max={MAX_MOODS} />
            </View>

            <TextInput
              style={styles.noteField}
              value={note}
              onChangeText={handleNoteChange}
              maxLength={MAX_NOTE_LENGTH}
              multiline
              placeholder="Add a note (optional)"
              placeholderTextColor={theme.colors.inkSecondary}
              accessibilityLabel="Note"
            />
            <Text style={styles.noteCounter}>
              {note.length}/{MAX_NOTE_LENGTH}
            </Text>

            <Pressable
              onPress={handleDismiss}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip"
            >
              <Text style={styles.skipText}>Skip</Text>
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
      gap: spacing.md,
    },
    title: { ...type.title, color: colors.inkPrimary },
    moodSpacer: { marginTop: spacing.xs },
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
    skipButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.sm,
    },
    skipText: { ...type.label, color: colors.inkSecondary },
  });
}
