---
name: tv-time-2
description: Cozy, vintage-flavored mobile tracker for films & TV. Spiritual successor to TV Time. "Retro Technicolor" — dark-first (VHS Dusk) with a Paper White day mode. Log-rate-react in under 15 seconds.
status: final
updated: 2026-07-02
colors:
  # ---- Light (Paper White / Faded Technicolor) ----
  surface-base: '#FAF9F7'
  surface-raised: '#FFFFFF'
  surface-sunken: '#F4F5F6'
  ink-primary: '#262B2A'
  ink-secondary: '#7E857F'
  border-hairline: '#ECE9E4'
  primary: '#E0654F'          # coral — CTA / active nav / logo
  primary-press: '#C24F3B'
  cool: '#2F8F88'             # teal — secondary accent / avatars
  gold: '#DCA82E'             # rating stars
  # ---- Dark (VHS Dusk — HERO mode / default) ----
  surface-base-dark: '#16131E'
  surface-raised-dark: '#211C2C'
  surface-sunken-dark: '#2A2438'
  ink-primary-dark: '#ECE7F2'
  ink-secondary-dark: '#8A82A0'
  border-hairline-dark: '#2E2A3A'
  primary-dark: '#EC5A92'     # magenta — CTA / active nav / logo
  primary-press-dark: '#D43F7B'
  cool-dark: '#45C2CF'        # cyan — secondary accent / avatars
  gold-dark: '#F2C14E'        # rating stars
typography:
  display:
    family: 'Fraunces'
    note: 'Soft characterful vintage serif. Logo, big titles, section headings. Optical sizing on; weights 700–800.'
  body:
    family: 'DM Sans'
    note: 'Clean, legible. Meta, buttons, labels, long text. 400 / 600.'
  scale:
    hero: '27px / 700 (Fraunces)'
    title: '20px / 700 (Fraunces)'
    card-title: '15px / 700 (Fraunces)'
    body: '15px / 400 (DM Sans)'
    label: '12px / 600 (DM Sans)'
    meta: '11px / 400 (DM Sans)'
    kicker: '10px / 700 uppercase, 0.1em tracking (DM Sans)'
rounded:
  sm: 8px
  md: 13px
  lg: 18px
  pill: 999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
components:
  poster: 'Rounded-md thumbnail. Real art from TMDB; gradient placeholder (cool→dark) while loading or when art is missing.'
  title-card: 'Horizontal card — poster left, title/meta/stars/mood right. surface-raised.'
  star-rating: '5 stars, ½-step. gold. Empty stars at 28% opacity of gold.'
  mood-chip: 'pill, single emoji. Small curated set. Selected = filled surface-sunken.'
  fast-add-fab: 'Center bottom-nav slot. primary fill, rounded-md, "+", lifted -16px above the bar.'
  watched-badge: 'rounded-sm, primary fill, uppercase label.'
  notify-bell: 'Title-detail toggle. Outline (off) → gold fill (on). Also the affordance in the caught-up dialog.'
  bottom-nav: '5 slots: Home · Diary · (+) · Feed · Profile (labeled "You" in UI). surface-raised, hairline top border.'
---

## Brand & Style

tv-time-2 is a love letter to a discontinued app. When TV Time went away it left a hole — a cozy place to remember what you watched and how it made you feel. This is the spiritual successor: a personal diary for films and TV, warm and unhurried, that rewards showing up without ever nagging.

The wordmark is **tv-time** (lowercase, Fraunces) — the "-2" is versioning, never shown in UI.

The aesthetic is **Retro Technicolor** — vintage soul, modern legibility. Not a costume: no fake grain, no skeuomorphic VHS chrome. Instead, the nostalgia lives in the palette (dusty-saturated poster colors), a soft characterful serif (Fraunces), and small moments of delight. The app is **dark by default** — most watching happens at night, and the deep VHS-plum surface with magenta/cyan glow is the hero. A **Paper White** day mode carries the same soul into daylight. Posters do the heavy chromatic lifting; the UI stays warm and calm around them.

Governing feeling: **logging is faster than forgetting.** Every screen protects a sub-15-second core loop and hands back a small hit of cozy reward.

→ Rendered reference: [`mockups/key-screens.html`](mockups/key-screens.html) · [`mockups/color-system-light-dark.html`](mockups/color-system-light-dark.html) · [`mockups/type-exploration.html`](mockups/type-exploration.html). This spine wins on conflict with any mock.

## Colors

Two modes, one soul. Dark (VHS Dusk) is the default and the hero; Light (Paper White) is the day alternate. Role mapping is consistent across modes so behavior never depends on theme.

**Dark — VHS Dusk (default)**
- **Ink Plum (`#16131E`)** — base canvas. Deep, warm-cool night.
- **Raised Plum (`#211C2C`)** — cards, nav bar, sheets.
- **Magenta (`#EC5A92`)** — primary action, active nav, logo. The neon pulse.
- **Cyan (`#45C2CF`)** — secondary accent: avatars, kickers, poster placeholders.
- **Gold (`#F2C14E`)** — the memory/identity color. Rating stars, and the "we'll remember for you" affordance (notify bell on, caught-up kicker). Never buttons, nav, or decorative poster washes. Carries across both modes as the identity constant.
- **Text `#ECE7F2` / Muted `#8A82A0`** — primary and secondary type.

**Light — Paper White (day)**
- **Paper White (`#FAF9F7`)** — base canvas. Cozy without the brown.
- **White (`#FFFFFF`)** — cards, nav, sheets.
- **Coral (`#E0654F`)** — primary action, active nav, logo.
- **Teal (`#2F8F88`)** — secondary accent.
- **Gold (`#DCA82E`)** — rating stars + notify/caught-up affordance (same memory/identity role as dark mode).
- **Ink `#262B2A` / Muted `#7E857F`** — primary and secondary type.

Avoid: mixing more than the two accents + gold on one surface; pure `#000` or pure saturated brights; warm cream/brown backgrounds in light mode (explicitly rejected). Error/success states use functional red/green sparingly, never the brand accents.

## Typography

**Fraunces** (display) and **DM Sans** (body/UI) — loaded as web fonts.

- **Fraunces** carries all personality: the logo, hero title (Now Watching), and section headings. Use optical sizing and weights 700–800. It is *never* used for long body text or dense meta.
- **DM Sans** carries everything functional: card meta, buttons, labels, list text, notification copy. Weights 400 (body) and 600 (labels/buttons).

Scale (see frontmatter `typography.scale`): hero 27 · title 20 · card-title 15 (Fraunces) · body 15 · label 12 · meta 11 · kicker 10 uppercase (DM Sans). Honor OS dynamic-type scaling; controls must stay legible and untruncated at the largest setting.

## Layout & Spacing

Scale: 4 / 8 / 12 / 16 / 24 / 32. Screen margins 16px. Single column, mobile-first, one thumb. Bottom nav is fixed; the center **(+)** is always reachable. Largest gaps separate shelves (Up Next, Watchlist, Recommendations); smallest sit inside a card. Horizontal shelves scroll; the vertical page does not fight them.

## Elevation & Depth

Elevation is quiet. In **light**, cards lift off Paper White with a soft low shadow (`0 2px 8px rgba(38,43,42,0.06)`). In **dark**, cards separate by *tone* (raised-plum on ink-plum), not shadow — shadows read poorly on dark and would fight the neon. The fast-add **(+)** is the one element allowed a real lift (raised above the nav). Hierarchy comes from layout, type, and the poster art — not stacked shadows.

## Shapes

Soft, poster-like corners. `rounded/sm` (8px) for chips, inputs, badges; `rounded/md` (13px) for cards and posters; `rounded/lg` (18px) for bottom sheets and modal surfaces; `rounded/pill` for mood chips and the avatar. Poster imagery clips exactly to its container corners. No hard 90° corners anywhere; no fully-circular surfaces except the avatar.

## Components

- **Poster** — `rounded/md` thumbnail from TMDB. While loading or when art is missing, a cool→dark gradient placeholder with a small glyph. Never a broken-image state.
- **Title card** — poster left; title (`card-title`, Fraunces), meta (`meta`), star row, mood chips right. `surface-raised`. Tap → title detail.
- **Star rating** — 5 stars, half-step, `gold`. Empty portion at 28% opacity. The one place gold appears.
- **Mood chip** — `pill`, a single emoji from the curated set (😭 cried · 😱 shook · 🤣 laughed · 🥹 touched · 😌 satisfied). Selected chips fill `surface-sunken`.
- **Fast-add (+)** — center nav slot, `primary` fill, `rounded/md`, lifted −16px. The one-tap entry to log/search.
- **Watched badge / Continue pill** — `rounded/sm`, `primary` fill, uppercase `label`.
- **Bottom nav** — 5 slots (Home · Diary · (+) · Feed · Profile), `surface-raised`, hairline top. Active icon in `primary`; inactive in ink at ~55% opacity.
- **Notify bell** (`{components.notify-bell}`) — title-detail toggle; outline (off) → `gold` fill (on). The gold ties it to the "we'll remember for you" promise. Also the affordance inside the caught-up dialog.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Let poster art carry the color; keep UI warm and calm | Flood a screen with coral + teal + magenta at once |
| Default to dark (VHS Dusk); offer Paper White as day mode | Ship a warm cream/brown light background (rejected) |
| Gold for the memory moments — stars + notify/caught-up — as the cross-mode identity constant | Reuse gold for buttons, nav, or decorative poster washes |
| Fraunces for titles & logo, DM Sans for everything functional | Set body/meta text in Fraunces |
| Separate dark surfaces by tone; reserve lift for the (+) | Stack shadows on dark surfaces |
| Soft poster-corners (8/13/18px) throughout | Hard 90° corners or fully-circular surfaces (except avatar) |
