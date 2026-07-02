# Voice & Microcopy Review — tv-time-2

**Lens:** Voice & Microcopy. **Intended voice:** warm & personal — cozy, encouraging, lightly sentimental; gentle emoji, one max; not cheeky-witty, not coldly minimal. **Governing feeling:** *logging is faster than forgetting.*

Overall the voice is strong and internally consistent. The Voice & Tone table sets a clear standard and most State Patterns and Notifications strings live up to it. There are no nagging, guilt, or over-cheerful violations — the anti-streak / anti-nag principle is well protected in copy. The gaps are of two kinds: (1) a few empty/error strings drift toward the "cold minimal" pattern the doc itself bans, and (2) several *key emotional moments* — the rating prompt header, the watched confirmation, and the binge reward — are described behaviorally but ship no actual microcopy, which is where the warmth is supposed to land.

Severity note: voice issues are rarely "critical," so findings are split SHOULD-FIX (a real tone miss or a missing string at a warmth-critical moment) vs NICE-TO-HAVE (already-fine copy that could land warmer).

---

## SHOULD-FIX

**1. Search empty state drifts cold**
- Current: `"No matches. Try another title."` (State Patterns → Search empty)
- Concern: "No matches." is the exact clipped register the Voice table bans ("No entries yet." is listed as a Don't). It reads like a system error, not a person. This is a routine moment (typos, partial titles) and deserves a softer landing.
- Proposed: `"Hmm, nothing by that name. Try another spelling or title?"` — keeps it short and human, owns the miss gently, no exclamation.

**2. Rating prompt has no specified microcopy (gap at a core moment)**
- Current: none. Flow 1 step 4 says only "A rating prompt slides up — 5 gold stars + mood chips." The "react" half of log→rate→react is the emotional payload of the app, and it ships with no header line.
- Concern: This is the single most important warmth moment per watch, and it's blank. Without a line it risks reading as a bare, form-like control row.
- Proposed header (optional, dismissable): `"How was it?"` — short, inviting, never demanding. Alternatively for shows: `"How'd that one land?"` Keep it a soft invitation above the stars/chips, never a gate.

**3. Watched confirmation has no specified microcopy (gap)**
- Current: none. State Patterns → Watched confirmed says "Soft confirmation; episode pointer advances." Flow 1 says "Soft confirmation."
- Concern: The moment the core action commits is unnamed. A silent checkmark is fine visually, but a tiny warm acknowledgement here reinforces "logging is faster than forgetting." Leaving it fully unspecified risks a flat toast like "Logged." at build time.
- Proposed: specify a gentle confirmation such as `"Logged — nice one."` or the quieter `"Got it. ✓"` (one emoji max). Note it should be a soft, auto-dismissing confirmation, not a blocking toast.

---

## NICE-TO-HAVE

**4. Empty Feed is functional, not warm**
- Current: `"Add a friend to see what they're watching."`
- Concern: Accurate but utilitarian — reads like a settings label, missing the "word-of-mouth from people you trust" feeling the Feed is meant to evoke (Flow 4).
- Proposed: `"It's cozier with friends. Add someone to see what they're watching."`

**5. Empty Watchlist opener is slightly utilitarian**
- Current: `"Save something for later — tap ❤️ on any title."`
- Concern: "Save something for later" is instructional; the clause after the dash already carries the mechanic, so the opener could do warmth instead.
- Proposed: `"Your someday list is empty — tap ❤️ on any title to keep it for later."`

**6. Flow 3 climax line is warm but a touch cryptic**
- Current: `"We'll tell you when it's time"` (added an unreleased/future title to watchlist)
- Concern: Lovely and trusting in tone, but "when it's time" is vague out of context — could read as when it releases, when to watch, or nothing specific. Small clarity gain without losing the cozy trust.
- Proposed: `"We'll remember it for you — and let you know when it lands."`

**7. Flow 2 (binge) climax ships no reward line**
- Current: none. Flow 2 step 5 describes the payoff ("Diary fills with a satisfying stack and his year-count jumps") but, unlike Flow 1, gives no actual sentence. Bulk-log is a warmth moment too.
- Concern: The binge path is left without the "feels seen, not nagged" line that makes Flow 1 sing. Risk of it shipping copy-less.
- Proposed: mirror the Flow 1 pattern, e.g. `"That's a whole season down — 9 episodes in your diary."` (state, celebrate, don't count-shame).

**8. Empty Diary opener assumes an episode is queued**
- Current: `"Nothing logged yet — tonight's episode is your first entry."`
- Concern: Warm and on-voice, but "tonight's episode" presumes the user has a show in progress; a brand-new user with nothing tracked may have no episode tonight, and it also excludes films. Minor.
- Proposed: `"Nothing logged yet — whatever you watch tonight can be your first entry."`

---

## Already excellent (keep as-is)

- **Voice & Tone table** — the Do/Don't pairs are a genuinely strong voice spec; the "Nice — that's 47 episodes this year" vs streak-counter contrast nails the anti-nag principle.
- **Empty Home:** `"Your story starts here. What did you watch tonight?"` — warm, inviting, on-voice.
- **Caught up + notify nudge:** `"You're all caught up on {show} — want a nudge when new episodes drop?"` — earns the one retention lever without any pushiness; textbook consent framing.
- **New-episode push:** `"The Bear has a new episode waiting for you 🐻"` — gentle emoji, addressed to the person, not "new content available."
- **Flow 1 climax:** `"Nice — that's 47 episodes of The Bear this year"` + `"Add S3E6 to Up Next?"` — the emotional high point, "seen not nagged," exactly right.
- **Notifications section prose** ("earned, never spammy"; "No digest spam, no 'we miss you' re-engagement") — the anti-nag stance is explicit and well-guarded.
