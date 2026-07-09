// FR18's locked 8-mood set — the single client-side source of truth. Must
// stay in sync with supabase/migrations/0008_watches_mood_check.sql's CHECK
// (ARCHITECTURE-SPINE's Consistency Conventions: the DB is the ultimate
// source of truth for the locked set; this list is the client's copy of it,
// used both for the mood-chip UI and to reject a bad value before it ever
// reaches the local outbox).
export const MOODS: readonly { emoji: string; name: string }[] = [
  { emoji: '😭', name: 'Moved' },
  { emoji: '😂', name: 'Funny' },
  { emoji: '😱', name: 'Shocked' },
  { emoji: '🥰', name: 'Loved it' },
  { emoji: '🤯', name: 'Mind-blown' },
  { emoji: '😴', name: 'Boring' },
  { emoji: '😬', name: 'Cringe' },
  { emoji: '🔥', name: 'Thrilling' },
];

const MOOD_EMOJI_SET = new Set(MOODS.map((m) => m.emoji));

/** Null/undefined (no mood) is always valid — only a non-locked-set value is not. */
export function isValidMood(mood: string | null | undefined): boolean {
  return mood == null || MOOD_EMOJI_SET.has(mood);
}
