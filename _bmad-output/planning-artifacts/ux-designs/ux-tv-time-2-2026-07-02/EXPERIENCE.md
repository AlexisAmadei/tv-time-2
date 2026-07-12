---
name: popcorn-time
description: Experience spine for popcorn-time — cozy mobile films & TV tracker. Owns how it works; DESIGN.md owns how it looks.
status: final
updated: 2026-07-02
---

# popcorn-time — Experience Spine

> Single-surface mobile, consumer posture, dark-by-default. Paired with `DESIGN.md` (visual identity). Core promise: **logging is faster than forgetting** — the log→rate→react loop runs in under 15 seconds, and rating never blocks.

## Foundation

Single-surface **mobile app** (iOS + Android, parity). No named UI system — inherits platform conventions for navigation, gestures, dynamic type, and system permission prompts (notifications). `{DESIGN.md}` is the visual identity reference; this spine is the behavior. **Dark mode is the default surface; light (Paper White) is a setting.** Title, poster, and episode data come from a **TMDB-style external catalog**.

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| **Home / Up Next** | App open (cold), Home tab | Current shows to continue + Watchlist shelf + Recommendations shelf |
| **Search / Add** | Center **(+)** | Find any film or show (TMDB); add to watchlist or start tracking |
| **Title detail** | Any poster/card tap | Film or show; for shows: seasons + episodes; log · rate · react · notify |
| **Diary** | Diary tab | Personal history of watched titles, ratings, mood reactions, over time |
| **Feed** | Feed tab | Friends' recent activity (light social) |
| **Profile** | Profile tab | Your stats, favorites, watchlist, friends, settings (incl. theme) |

Bottom tab bar, 5 slots: **Home · Diary · (+) · Feed · Profile**. The center **(+)** is the fast-add / log entry point, always one tap away. Bottom sheets stack one level deep.

→ Composition reference: [`mockups/key-screens.html`](mockups/key-screens.html) (Home · Title detail · bedtime-log sheet). Palette/type provenance: [`mockups/color-system-light-dark.html`](mockups/color-system-light-dark.html), [`mockups/type-exploration.html`](mockups/type-exploration.html). Spine wins on conflict.

## Voice and Tone

Warm & personal — cozy, encouraging, lightly sentimental. Emoji allowed but gentle. Brand voice/aesthetic posture lives in `{DESIGN.md}` Brand & Style.

| Do | Don't |
|---|---|
| "Your story starts here. What did you watch tonight?" | "No entries yet." (cold) or "Time to log! 🔥" (pushy) |
| "The Bear has a new episode waiting for you 🐻" | "New content available. Open app." |
| "You're all caught up on Severance — want a nudge when new episodes drop?" | "Enable notifications?" |
| "Nice — that's 47 episodes this year." | Streak counters, guilt, red "you missed a day" |
| Short, human sentences. One emoji max. | Exclamation pileups, corporate cheer. |

## Component Patterns

Behavioral. Visual specs live in `{DESIGN.md}` Components.

| Component | Use | Behavioral rules |
|---|---|---|
| **Title card** | Home shelves, search, feed | Tap → title detail. Shows current-episode state for tracked shows. |
| **Star rating** (`{components.star-rating}`) | Post-watch prompt, title detail | ½-step taps. Optional — never required to commit a watch. Re-tappable to change. |
| **Mood chip** (`{components.mood-chip}`) | Post-watch prompt, feed | Curated set only. Multi-select allowed (0–2 typical). Applies to episode (shows) or title (films). |
| **Fast-add (+)** (`{components.fast-add-fab}`) | Bottom nav | Opens search-first log flow. Center slot, always present. |
| **Watched / Continue control** | Title detail, Up Next | Single tap commits "watched" and advances the show's next-episode pointer. |
| **Bulk-log sheet** | Season row on title detail | All episodes pre-checked; user deselects any, confirms once. Optional season-level rating. |
| **Notify bell** (`{components.notify-bell}`) | Title detail | Toggle new-episode notifications for this title, independent of tracking. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold open | Home | Show cached Up Next instantly; skeleton posters for uncached shelves. |
| Empty Home (new user) | Home | "Your story starts here. What did you watch tonight?" → CTA into **(+)**. |
| Empty Diary | Diary | "Nothing logged yet — tonight's episode is your first entry." Link to **(+)**. |
| Empty Watchlist | Home shelf | "Save something for later — tap ❤️ on any title." |
| Empty Feed | Feed | "It's quiet in here. Find a friend and see what they're loving." → add-friend. |
| Empty Profile (new user) | Profile | "Your shelf is empty for now — everything you watch lands here." Surfaces first-log CTA. |
| Populated Profile | Profile | Year stats, favorites, watchlist, friends, and Settings (theme toggle, global notifications). |
| Search empty | Search | "Hmm, nothing by that name. Try another spelling or title?" No auto-suggestions. |
| Search error | Search | "Couldn't reach the catalog — check your connection and try again." Retry affordance; keeps typed query. |
| Poster missing/loading | Any | Gradient placeholder (`{components.poster}`), never broken-image. |
| Title-detail fetch error | Title detail | Show cached basics if any; else "We couldn't load this right now." Retry. Never a blank screen. |
| Caught up | Title detail | "You're all caught up on {show}." + notify-me dialog (see Notifications). |
| Watched confirmed | Up Next / detail | Soft confirmation ("Logged — nice one."); episode pointer advances; rating prompt slides up. |
| Rating prompt | Post-watch sheet | Header "How was it?"; 5 gold stars + mood chips; one-tap **Skip** always present. Never blocks the watch. |
| Offline | Any | Not optimized for v1. Show last cached data; queue a logged watch and sync on reconnect; no blocking banner. |

## Interaction Primitives

- **Tap to act.** The core loop is all taps — no long-press required to log or rate.
- **One-tap Watched, one-tap dismiss.** Rating is offered after every watch and is always skippable in one tap.
- **Half-star drag/tap** on the star row.
- **Horizontal scroll** for shelves (Up Next / Watchlist / Recommendations); vertical scroll for the page.
- **Bulk select** via pre-checked sheet for season logging (deselect, don't select).
- **Banned:** guilt/streak mechanics, re-engagement nag pushes unrelated to real new episodes, forced rating gates, auto-playing hero video.

## Accessibility Floor

Consumer-grade floor (WCAG AA basics). Visual contrast values live in `{DESIGN.md}`.

- VoiceOver / TalkBack: every interactive element labeled with role + state. "Watched" announces state change; star rating announces value (e.g. "4 and a half stars"); mood chips announce name ("cried").
- Dynamic type honored through `{DESIGN.md}` typography scale; no truncated controls at largest setting.
- Tap targets ≥ 44pt (iOS) / 48dp (Android) — including stars and mood chips.
- Color is never the sole signal: Watched carries a label, not just a fill; active nav carries the label + icon, not only `{colors.primary}`.
- Reduce Motion: skip watched-confirmation and reward animations; show the result immediately.
- Mood emoji convey feeling but are never the only way to record a watch (rating and watched state are independent).

## Notifications

The one retention lever — earned, never spammy.

- **Explicit control:** a notify bell on each title (`{components.notify-bell}`) toggles new-episode alerts, independent of whether the show is tracked.
- **Contextual nudge:** when a user finishes the last available episode/season, a dialog offers to turn on alerts for that title ("You're all caught up on {show} — want a nudge when new episodes drop?").
- Pushes fire **only** on genuine new-episode availability (from the catalog), addressed to the person, in the warm voice. No digest spam, no "we miss you" re-engagement.
- Global notifications toggle lives in Profile → settings; per-title bells override nothing but their own title.

## Key Flows

### Flow 1 — The bedtime log (Léa, 27, 11:20pm, just finished tonight's episode)

1. Léa opens popcorn-time (dark mode — it's night). Home's **Up Next** has *The Bear* at the top.
2. She taps the card. **S3E5** is pre-selected as her next episode.
3. One tap: **✓ Watched.** Soft confirmation; the show advances to S3E6.
4. A rating prompt slides up — 5 gold stars + mood chips. She taps **4½★** and **😭**. (She could have dismissed it in one tap.)
5. **Climax:** the app quietly says *"Nice — that's 47 episodes of The Bear this year"* and offers *"Add S3E6 to Up Next?"* — she feels seen, not nagged.
6. A recommendation catches her eye — *"Because you loved The Bear…"* — she taps ❤️ to save *Boiling Point* to her watchlist. Phone down, ~15 seconds elapsed.

Failure: catalog fetch slow → card still logs from cached episode data; recommendation shelf shows skeleton, never blocks the log.

### Flow 2 — The binge catch-up (Théo, 24, Monday, after a rainy Sunday of Severance)

1. Théo opens *Severance* from search or Diary.
2. Taps the **S1** row → **"Mark whole season watched."**
3. Bulk-log sheet: all 9 episodes pre-checked. He leaves them, confirms once.
4. Optional: rates the season 5★, drops a 😱.
5. **Climax:** his Diary fills with a satisfying stack and a warm line lands — *"That's a whole season in one sitting. Respect."* — his year-count jumps. Bingeing is rewarded, not a chore of 9 taps.

### Flow 3 — Adding something new (Léa, hears about Shōgun from a friend)

1. Léa taps center **(+)**, types "sho".
2. TMDB results appear instantly; she taps *Shōgun*.
3. Title detail: she chooses **Add to Watchlist** (vs. "I'm watching this").
4. **Climax:** a quiet line — *"We'll tell you when it's time"* — and the notify bell is there if she wants alerts. She trusts the app to remember so she doesn't have to.

### Flow 4 — What are my friends into? (Théo, on his commute)

1. Théo opens the **Feed** tab.
2. He sees Léa rated *The Bear* 4½★ with a 😭; another friend watchlisted *Dune II*.
3. He taps Léa's entry, reads her note.
4. **Climax:** he taps ❤️ to add *The Bear* to his own watchlist — discovery that feels like word-of-mouth from people he trusts, not an algorithm.

### Flow 5 — Making it yours (Léa, first Sunday morning with the app)

1. Léa taps **You** (Profile) in the nav.
2. Her shelf is still thin — a couple of logged titles, her year-count starting to climb.
3. She opens **Settings** and switches from dark to **Paper White** for daytime scrolling.
4. She flips the global notifications toggle on, trusting the per-title bells to keep it from getting noisy.
5. **Climax:** she scrolls back to her stats — *"3 films, 1 show, 12 episodes — and it's only week one."* The shelf is starting to feel like *hers*, a place her taste accumulates.

Empty state: brand-new Profile routes to the first-log CTA rather than showing zeroes coldly.

## Inspiration & Anti-patterns

- **Lifted from TV Time:** the hybrid reaction model — a quality rating *and* an emotional mood reaction per episode. The mood layer is what made the feed feel human.
- **Lifted from Letterboxd:** ½-step 5-star rating as the familiar, expressive quality scale for films and titles.
- **Rejected — streaks & guilt (Duolingo-style):** the value is remembering what you watched and how it felt, not punishing missed nights. No streak counters, ever.
- **Rejected — algorithmic social feed:** the feed is chronological word-of-mouth from real friends (light social), not an engagement-ranked stream.
- **Rejected — forced rating gates:** watched commits instantly; rating is always an invitation.
