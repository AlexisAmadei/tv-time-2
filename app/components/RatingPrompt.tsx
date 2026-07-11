// Post-watch rating prompt (Story 3.5) — "How was it?" slides up the moment a
// single watch commits (HomeScreen.handleMarkWatched, AddScreen.handleLog). A
// ½-step 5-star row + a 0–2 mood multi-select + a one-tap Skip. It NEVER blocks
// the watch: Skip, backdrop tap, and hardware back all dismiss and write
// nothing; there is no "you must pick something" gate (UX-DR22, AC1).
//
// Every tap persists immediately via setWatchReaction for the SAME watchId
// (AC5 — "that watch's row updates"), so there is no explicit Save/Done button
// beyond Skip: dismissing keeps whatever was last tapped. Writes are
// fire-and-forget and serialized (one in-flight promise chain) so two
// overlapping SQLite transactions never interleave on the single connection; a
// failed write logs a warn and does NOT roll the UI back — the reaction is
// optional and reaction_rev/synced_rev heal it on the next drain.
//
// Sheet chrome (transparent Modal, bottom-anchored, surfaceRaised, rounded top
// corners, backdrop dismiss, and the displayWatchId "keep content mounted
// through the close animation" trick) mirrors BulkLogSheet — no new dependency.

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

// Debounce window for the note field (Story 3.6) — typing is continuous input,
// unlike a star/chip tap; persisting per-keystroke would run a SQLite
// transaction (and, once synced, a network PATCH) per character. See Dev
// Notes in 3-6-attach-an-optional-note-to-a-watch.md.
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

  // The last non-null watchId this prompt was opened with. The mounting screens
  // drive `visible` and `watchId` from the same state, so on dismiss `watchId`
  // goes null in the same render `visible` goes false — rendering from it
  // directly would unmount the sheet before it can animate closed. Same trick,
  // same reason as BulkLogSheet's displaySeason.
  const [displayWatchId, setDisplayWatchId] = useState<string | null>(null);

  // Reduce Motion (AC6): skip the slide, show the result immediately. Same
  // pattern AddScreen uses — a live ref so a toggle mid-prompt is honored.
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

  // Reset state whenever a new watch is handed to the prompt (AC5: each prompt
  // session is scoped to the watch that was just committed).
  useEffect(() => {
    if (watchId) {
      setDisplayWatchId(watchId);
      setRating(null);
      setMoods([]);
      setNote('');
    }
  }, [watchId]);

  // Serialize reaction writes: a rapid star→chip→star sequence must not
  // interleave two withTransactionAsync blocks on the one SQLite connection.
  // Chain each write after the previous settles; a failed write is swallowed
  // (the reaction is optional — never surface an error or roll the UI back).
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

  // Debounce the note WRITE, not the state update — `note` (and the visible
  // counter) update on every keystroke so the UI stays responsive, but
  // `persist` only fires ~NOTE_DEBOUNCE_MS after typing pauses (Story 3.6).
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clamp defensively even though the TextInput below also sets `maxLength` —
  // some Android IME/autofill paste paths can bypass a native maxLength, and
  // an over-cap note would make every subsequent persist() (including a bare
  // star/mood tap, which resends the current note) throw inside
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

  // Flush safety net: if the host screen unmounts by some path other than
  // handleDismiss (e.g. navigating away mid-debounce), don't let the pending
  // timer fire later against an unmounted screen's stale closure.
  useEffect(() => {
    return () => {
      if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    };
  }, []);

  // Skip and dismiss are the same thing and always available — close, write
  // nothing new beyond whatever was already persisted or is about to be
  // flushed. Backdrop, hardware back, and Skip all route here. Flush a
  // pending note-debounce timer synchronously first (Story 3.6) so a note
  // typed just before dismiss isn't dropped — rating/mood taps never need
  // this, since they already persist immediately, before any dismiss is
  // possible.
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
    // Note field (Story 3.6) — reuses AddScreen's searchField sunken-surface
    // look, with a taller minHeight since this one is multiline.
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
