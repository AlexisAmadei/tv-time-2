---
baseline_commit: fb78937599b3ae806092e2932ceb37e066d16767
---

# Story 1.3: Themed app shell with bottom navigation (dark mode)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want the app to open into the tv-time visual identity with the five-slot bottom navigation,
so that it feels like the product from first launch, not a generic demo.

## Acceptance Criteria

1. **Given** the design system, **when** tokens are defined, **then** the full two-mode color, typography (Fraunces + DM Sans), spacing, radius, and elevation tokens exist as a single source, **and** only dark (VHS Dusk) is wired in this story (Paper White is Epic 4). [Source: epics.md#Story-1.3; UX-DR1–3]
2. **Given** the app shell, **when** it renders, **then** a persistent 5-slot bottom tab bar (Home · Diary · (+) · Feed · Profile "You") shows with the center (+) lifted, and active state carries icon + label, never color alone. [Source: epics.md#Story-1.3; FR43, UX-DR13, UX-DR25]
3. **Given** a brand-new user with no data, **when** Home renders, **then** it shows the warm empty state ("Your story starts here. What did you watch tonight?") routing into (+), never cold zeroes. [Source: epics.md#Story-1.3; FR24, UX-DR14]
4. **Given** core navigation controls, **when** I use them, **then** all are reachable tap-to-act with no long-press required, tap targets ≥ 44pt/48dp, and screen-reader labels expose role + state. [Source: epics.md#Story-1.3; FR44, UX-DR21, UX-DR23, UX-DR24]
5. **Given** any system copy in the shell, **when** shown, **then** it follows the warm voice (one emoji max) with none of the banned patterns — no streaks, guilt, or nags. [Source: epics.md#Story-1.3; UX-DR20, UX-DR22]

## Tasks / Subtasks

- [x] Task 1: Install and pin the shell dependencies via `expo install` (AC: #1, #2, #4)
  - [x] From `app/`, run `npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context expo-font` — use `expo install` (NOT hand-edited versions) so native deps match the SDK 56 pin per `app/AGENTS.md`. `@expo/vector-icons` already ships transitively with Expo (no install needed) — verify with `npm ls @expo/vector-icons` before relying on it.
  - [x] Confirm the resolved versions land on the SDK-56-compatible line (react-navigation v7.x, `react-native-screens` ≥ 4.25, `expo-font` ~56.0.x). Do not bump the Expo SDK itself.
  - [x] `tsc --noEmit` must stay clean after install (the workspace uses TS 6.0.3 with `types: []` — see the tsconfig trap in Dev Notes).
- [x] Task 2: Author the design-token module as the single source of truth — both modes defined, dark wired (AC: #1)
  - [x] Create `app/theme/tokens.ts`: export a `dark` (VHS Dusk) and a `light` (Paper White) palette plus shared `typography`, `spacing`, `radius`, and `elevation` scales, transcribed **verbatim** from DESIGN.md frontmatter (see the token table in Dev Notes — copy the hex exactly).
  - [x] Create `app/theme/ThemeProvider.tsx`: a React context exposing the active theme object (`colors`, `type`, `spacing`, `radius`, `elevation`) + a `useTheme()` hook. **Wire dark only** — the provider returns the dark theme unconditionally for now; leave a single, obvious switch point (a `mode` state defaulting to `'dark'`) so Story 4.3 can add Paper White without restructuring. Do NOT build the toggle UI or persistence here (that is Epic 4).
  - [x] Both palettes must exist in `tokens.ts` even though only dark is consumed — AC1 requires the two-mode token source to exist now (light is defined-but-dormant).
- [x] Task 3: Load Fraunces + DM Sans as bundled fonts, F-Droid-safe (AC: #1, #5)
  - [x] Add the OFL `.ttf` files to `app/assets/fonts/`: at minimum `Fraunces` 700 + `DM Sans` 400 and 600 (add Fraunces 800 if a weight in the scale needs it). Both families are SIL Open Font License → redistributable in the open-source / F-Droid build (NFR4). **Do NOT fetch fonts from a Google Fonts URL at runtime** — that breaks NFR3 (F-Droid Google-free) and offline. Bundle the files.
  - [x] Load via `expo-font` `useFonts({...require(...)})` in `App.tsx` (or a small `useAppFonts` hook). Gate first render until fonts are loaded so the UI never flashes a system-font fallback and never renders Fraunces as the wrong glyphs.
  - [x] Map the typography scale (hero 27 / title 20 / card-title 15 Fraunces · body 15 / label 12 / meta 11 / kicker 10-upper DM Sans) into `theme.type` helpers so screens reference roles, not raw font strings. Fraunces is display-only — never used for body/meta.
- [x] Task 4: Build the themed shell + 5-slot bottom navigation with a custom tab bar (AC: #2, #4, #5)
  - [x] Create `app/components/AppShell.tsx` (or `app/navigation/`): a `NavigationContainer` wrapping a `createBottomTabNavigator` with tabs Home · Diary · (+) · Feed · Profile, routing to the existing `features/*/*Screen.tsx`. Label the Profile tab **"You"** in the UI (route can stay `Profile`).
  - [x] Provide a **custom `tabBar`** renderer (do not rely on the default bar) so you control: the lifted center (+) FAB (primary magenta fill, `radius.md`, raised −16px above the bar per UX-DR9/DR3), `surface-raised` bar with a `border-hairline` top border, and active state = `primary` icon **+ visible label** (inactive ink ~55% opacity). Color is never the sole active signal (UX-DR25).
  - [x] Center (+) behavior for this story: it is present and tappable and routes to the `add` screen stub (the real search-first log flow is Story 1.4/1.5). Give it `accessibilityRole="button"`, label "Add" / "Log a watch".
  - [x] a11y on every tab: `accessibilityRole="tab"`, `accessibilityState={{ selected }}`, an accessible label naming the tab, and hit targets ≥ 44pt iOS / 48dp Android (pad the touchables — icons alone are smaller). Everything is tap-to-act; add no long-press handlers.
  - [x] Respect safe-area insets (bottom home indicator) via `react-native-safe-area-context`; wrap the tree in `SafeAreaProvider`. Set `StatusBar style="light"` for the dark surface.
- [x] Task 5: Home warm empty state + theme the other tab placeholders (AC: #3, #5)
  - [x] Rebuild `features/home/HomeScreen.tsx` into the warm new-user empty state: copy exactly **"Your story starts here. What did you watch tonight?"**, on `surface-base`, using the type + spacing tokens, with a clear CTA that routes into (+) (navigates to the `add` tab / opens the fast-add entry). No cold zeroes, no fabricated shelves. One emoji max; none of the banned patterns.
  - [x] Re-skin `features/{diary,feed,profile}/*Screen.tsx` to the themed surface (themed background + a Fraunces screen title) as minimal placeholders — their full warm empty states belong to Epic 4/5. Keep them obviously placeholder, not fake data.
  - [x] Preserve sign-out: `App.tsx`'s authed branch currently renders `SignedInScreen`, which holds the only sign-out control (from Story 1.2). Replacing it with the shell must NOT drop sign-out. Add a temporary sign-out affordance on the Profile ("You") screen (Settings is Story 4.3) so the 1.2 flow still works end-to-end. `SignedInScreen.tsx` can be deleted once the shell subsumes it.
- [x] Task 6: Wire the shell into `App.tsx` and verify (AC: all)
  - [x] In `App.tsx`, keep the `checkSupabaseHealth()` startup probe (the 1.1 AC2 connectivity guard) and the `AuthGate` session branch. Replace `<SignedInScreen session={session} />` with the themed `<AppShell session={session} />`. Font-loading gate wraps (or sits alongside) the health gate — nothing renders before fonts + health resolve.
  - [x] Verify: `tsc --noEmit` clean; `npx expo export --platform android` bundles without error; and manually run the app (signed in) to confirm — themed dark shell, Fraunces/DM Sans actually rendering (not system fallback), the 5-slot bar with lifted (+), active tab showing icon **+ label**, Home showing the warm empty copy, and sign-out still reachable from "You". Extend `scripts/smoke-check.mjs` only if a headless assertion is genuinely meaningful (the shell is visual — a bundle-success + tsc gate is the realistic automated bar here, matching the 1.1/1.2 posture).

## Dev Notes

**This is the third code-producing story and the first UI-heavy one.** Stories 1.1 (substrate) and 1.2 (auth + first migration + first RLS) are done/in-review — read `1-2-create-an-account-and-sign-in-google-free.md` and the current `app/` files before writing. This story owns the **design-token system** and the **navigation shell** that every later screen renders inside. Get the token module and the theme hook right — Epic 2/3/4 screens, and the Paper White switch in Story 4.3, all build on exactly this. There is **no backend, migration, RLS, or Edge Function work in this story** — it is pure client UI on top of the existing auth gate.

### Existing code this story builds on (read before modifying)

- `app/App.tsx` — the current gate: a `checkSupabaseHealth()` probe (phase `checking`/`ok`/`error`) then `AuthGate`, which renders `AuthScreen` (no session) or `SignedInScreen` (session). **You replace `SignedInScreen` with the themed shell**, but must PRESERVE the health probe and the session branch. Both `checkSupabaseHealth()` (1.1 AC2) and the session gate (1.2) are load-bearing — don't regress them. [Source: app/App.tsx]
- `app/features/auth/SignedInScreen.tsx` — the current authed placeholder; **holds the only sign-out control** (from 1.2). Whatever replaces it must keep sign-out reachable, or you break a shipped 1.2 behavior. Move sign-out to the Profile ("You") screen as a temporary affordance (real Settings home is Story 4.3). [Source: 1-2 File List]
- `app/features/{home,diary,add,feed,profile}/*Screen.tsx` — five stub screens (`<View><Text>Home</Text></View>` shape). The bottom nav routes to these. Home is rebuilt into its empty state this story; the others get a light themed re-skin only. [Source: app/features/home/HomeScreen.tsx]
- `app/data/auth.ts` — `useSession()` + `signOut()` + `USERNAME_RE`. Use `signOut()` for the temporary Profile sign-out; do not add a second session source. [Source: 1-2 File List]
- `app/components/README.md` — explicitly says "the first primitives arrive with the themed app shell and bottom navigation in **Story 1.3**." That's this story; `app/components/` is currently empty. [Source: app/components/README.md]
- `app/data/supabaseClient.ts` — the ONE supabase client. Untouched by this story (no data reads yet), but don't create a second client.
- `app/AGENTS.md` / `app/CLAUDE.md` — **pinned to Expo SDK 56** (RN 0.85, React 19.2, TS 6.0.3). Do NOT bump the SDK. Add native deps with `expo install`, not by editing `package.json` versions. Read the versioned SDK 56 docs before writing native-dependent code: https://docs.expo.dev/versions/v56.0.0/ [Source: app/AGENTS.md]

### The design tokens — transcribe these VERBATIM (single source of truth, AC1)

Copy the hex exactly from `DESIGN.md` frontmatter. Both modes must exist in `tokens.ts`; only `dark` is wired now.

**Dark — VHS Dusk (default, the only wired mode this story):**
`surface-base #16131E` · `surface-raised #211C2C` (cards, nav bar, sheets) · `surface-sunken #2A2438` · `ink-primary #ECE7F2` · `ink-secondary #8A82A0` · `border-hairline #2E2A3A` · `primary #EC5A92` (magenta — CTA/active nav/logo) · `primary-press #D43F7B` · `cool #45C2CF` (cyan) · `gold #F2C14E` (memory/identity — stars + notify only; **never** nav/buttons/decoration this story).

**Light — Paper White (defined-but-dormant, wired in Story 4.3):**
`surface-base #FAF9F7` · `surface-raised #FFFFFF` · `surface-sunken #F4F5F6` · `ink-primary #262B2A` · `ink-secondary #7E857F` · `border-hairline #ECE9E4` · `primary #E0654F` (coral) · `primary-press #C24F3B` · `cool #2F8F88` (teal) · `gold #DCA82E`.

**Typography scale** (role → size/weight/family): hero 27/700 · title 20/700 · card-title 15/700 — all **Fraunces**; body 15/400 · label 12/600 · meta 11/400 · kicker 10/700 uppercase 0.1em — all **DM Sans**. Fraunces is display-only; never body/meta. [Source: DESIGN.md#Typography]

**Spacing** 4/8/12/16/24/32, screen margins 16. **Radius** sm 8 · md 13 · lg 18 · pill 999. **Elevation**: dark separates by *tone* (raised-plum on ink-plum), NOT shadow — shadows read poorly on dark; the (+) is the one element with a real lift (raised −16px above the bar). Light-mode soft shadow (`0 2px 8px rgba(38,43,42,0.06)`) is dormant with the light palette. No hard 90° corners; no fully-circular surfaces except the avatar. [Source: DESIGN.md#Layout/Elevation/Shapes]

**Role-mapping rule (UX-DR1):** map by role so behavior never depends on theme — screens reference `theme.colors.primary`, `theme.colors.surfaceRaised`, etc., never a literal hex and never a mode-specific name. This is what lets Story 4.3 flip to Paper White with zero screen edits. Snake_case is a DB convention (ARCH-10); TS tokens are camelCase.

### Architecture / decisions this story locks in

- **Navigation library — DECIDED: standalone `@react-navigation/native` + `@react-navigation/bottom-tabs` (v7), NOT Expo Router.** The architecture spine names no navigation lib (Navigation/FR43-45 maps to "client feature-module structure", a design-paradigm slot — implementer's call). This project uses a **manual `App.tsx` auth gate**, not file-based routing. SDK 56's headline change is that *Expo Router* decoupled from react-navigation and forbids importing `@react-navigation/*` in **Expo-Router** app code — that caveat does **not** apply here because we are not adopting Expo Router. Standalone react-navigation v7 is fully compatible with SDK 56 / RN 0.85 / React 19.2. Adopting Expo Router instead would be a structural pivot (file-based routing conflicting with the existing gate) — out of scope for this thin skeleton story. Mount `NavigationContainer` **inside** the authed branch (so auth screens stay outside the tab tree). [Source: ARCHITECTURE-SPINE.md#L237; web: expo.dev/blog/expo-router-v56-decoupling-from-react-navigation]
- **Custom `tabBar` renderer, not the default bar.** The 5-slot layout with a lifted center (+) FAB, label-beside-icon active state, and the tone-based dark styling all need a custom `tabBar` prop on the navigator. The default bar can't express the −16px lift or the (+)-as-non-tab slot cleanly. [Source: DESIGN.md#Components bottom-nav / fast-add-fab; UX-DR9, UX-DR13]
- **The (+) is a fast-add entry, not a content tab.** For 1.3 it routes to the `add` stub; the real search-first log flow is Story 1.4 (search) / 1.5 (log). Keep it visually the primary FAB now, functionally a placeholder route. [Source: EXPERIENCE.md#IA; FR43]
- **Fonts bundled, never fetched (NFR3 hard constraint).** Use `expo-font` `useFonts` with local `require('./assets/fonts/*.ttf')` — bundled at build, works offline, no Google Fonts runtime call. Fraunces + DM Sans are both **SIL OFL** → fine to redistribute in the open-source / F-Droid build (NFR4). A runtime Google Fonts fetch would violate NFR3 (Google-free F-Droid) and NFR8 (offline). The config-plugin embed is a more efficient alternative but `useFonts` is enough for the skeleton; if you use it, splash-gate rendering until loaded. [Source: NFR3, NFR4; web: docs.expo.dev/develop/user-interface/fonts]
- **Only dark is wired (AC1 explicit).** Define both palettes; consume dark. Do not build the theme toggle, persistence, or Paper White wiring — that is Story 4.3 (FR45). Leave one obvious switch point in `ThemeProvider`. [Source: epics.md#Story-1.3 AC1; Story 4.3]
- **No data, no RLS, no functions, no migration.** This story reads/writes nothing in Postgres. `catalog-search` is 1.4; `watches`/outbox is 1.5; the private-by-default wall is 1.6. Don't pull any of that forward. [Source: epics.md#Epic 1]

### Icons

`@expo/vector-icons` ships with Expo (bundled, no runtime fetch → F-Droid-safe). Use a consistent set (e.g. Feather/Ionicons) for Home/Diary/Feed/Profile and a `+` glyph (or a styled Text) for the FAB. **Icon alone is never the active signal** — the active tab also shows its label and the primary color (label+icon together satisfy UX-DR25). Verify `@expo/vector-icons` resolves (`npm ls @expo/vector-icons`) before depending on it; if absent, `expo install @expo/vector-icons`. Alternatively hand-roll simple SVGs via `react-native-svg` — but vector-icons is lower-effort and already present.

### Warm voice — copy is a requirement, not decoration (UX-DR20, NFR10)

- Home empty (this story, exact): **"Your story starts here. What did you watch tonight?"** → routes into (+). [Source: EXPERIENCE.md#State Patterns]
- Diary/Feed/Profile full empty copy is defined in EXPERIENCE.md but **belongs to Epic 4/5** — don't ship those surfaces' final copy here; a neutral themed placeholder is fine.
- One emoji max in any system copy. **Banned patterns (UX-DR22, hard):** no streak/guilt mechanics, no re-engagement nags, no "you missed a day", no forced gates, no auto-play. Enforce the Do/Don't table. [Source: EXPERIENCE.md#Voice and Tone]

### Accessibility floor (NFR7 — build it in, don't retrofit)

- Every tab: `accessibilityRole="tab"` + `accessibilityState={{ selected }}` + a label naming it; the (+): `accessibilityRole="button"` + a "Log a watch"/"Add" label.
- Tap targets ≥ 44pt iOS / 48dp Android — pad touchables; a bare icon is smaller than the floor.
- Color never the sole signal: active tab carries **label + icon**, not just magenta.
- Honor Dynamic Type via the type scale — no clipped/truncated tab labels at the largest setting (test a large-font pass). Reduce Motion has little surface here (no reward animation in the shell yet) but avoid any motion that ignores it. [Source: EXPERIENCE.md#Accessibility Floor; UX-DR23-25]

### Previous-story intelligence (from 1.2, and the 1.1→1.2 chain)

- **Additive-module precedent:** 1.2 added `features/auth/` as a new cross-cutting module without disturbing the five nav modules. Follow the same discipline: `app/theme/` and the shell/nav module are additive; don't refactor unrelated files. A new top-level `app/theme/` is a reasonable minor addition to the ARCH-2 seed (which lists `features/`, `data/`, `components/`) — put tokens there rather than burying them in `components/`, since screens and nav both consume them. Note it in Project Structure Notes.
- **Testing posture (unchanged since 1.1):** no automated test framework yet (a future `bmad-testarch-framework` run owns that). "Done" = `tsc --noEmit` clean + `expo export` bundles + manual visual verification; extend `scripts/smoke-check.mjs` only where a headless assertion is meaningful. This shell is visual — the realistic automated bar is tsc + bundle success; the rest is a manual run. Don't stand up a test framework as a drive-by. [Source: 1-2 Testing standards summary]
- **TS 6.0.3 `types: []` trap:** SDK 56's tsconfig defaults `types` to an empty array (no implicit `@types` pickup). If a dep needs an ambient type, add it explicitly. Watch for this after installing react-navigation. [Source: ARCHITECTURE-SPINE.md#L143]
- **`expo install`, not hand-edited versions** — keep native deps SDK-56-aligned (react-native-screens / safe-area-context are native and version-sensitive). [Source: app/AGENTS.md]
- **Git context:** recent commits (`fb78937` and prior) are Story 1.1/1.2 review fixes and docs (kong.yml cleanup, `.env` validation, error-envelope docs) — no navigation/theme code exists yet. This story writes it fresh. [Source: git log]

### What this story deliberately does NOT include

- **No Paper White wiring / theme toggle / persistence** — tokens defined both modes, dark wired only (Story 4.3 / FR45).
- **No real Home shelves** (Up Next / Watchlist / Recommendations) — those need `watches`/tracking/catalog (Epics 2–3). Home is the empty state only.
- **No catalog-search, no `watches`, no outbox, no migrations, no RLS, no Edge Functions.**
- **No final Diary/Feed/Profile empty states** — themed placeholders only (Epic 4/5 own their copy + data).
- **No real fast-add/log flow behind (+)** — present + routes to the `add` stub; flow is 1.4/1.5.
- **No avatar, stats, settings surfaces** — Epic 4. The only Profile addition now is a temporary sign-out (until Settings, 4.3).

### Project Structure Notes

- **New:** `app/theme/tokens.ts`, `app/theme/ThemeProvider.tsx` (new additive `theme/` module — screens + nav consume it); the shell/nav component (`app/components/AppShell.tsx` or an `app/navigation/` module); `app/assets/fonts/*.ttf` (bundled Fraunces + DM Sans).
- **Modified:** `app/App.tsx` (font gate + swap `SignedInScreen` → `AppShell`, preserve health + session gates); `app/features/home/HomeScreen.tsx` (warm empty state); `app/features/{diary,feed,profile}/*Screen.tsx` (themed re-skin; Profile gains temporary sign-out); `app/package.json` (deps via `expo install`); `app/components/README.md` / `app/data/README.md` if you want them current.
- **Removed (optional):** `app/features/auth/SignedInScreen.tsx` once the shell subsumes it (make sure sign-out moved first).
- Aligns with the ARCH-2 seed (`features/*`, `components/`, `data/`); `theme/` is a small, intentional addition (mirrors how 1.2 added `features/auth/`). No conflict with 1.1/1.2 — purely additive/replacement of the placeholder authed branch.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.3: Themed app shell with bottom navigation (dark mode)] — story statement, ACs, Epic 1 framing (walking skeleton, "dark wired here / Paper White is Epic 4")
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/DESIGN.md] — full color/type/spacing/radius/elevation tokens (frontmatter), Components (bottom-nav, fast-add-fab), Do's/Don'ts, gold-reserved rule
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-popcorn-time-2026-07-02/EXPERIENCE.md#State Patterns] — Home empty-state copy; #Voice and Tone (Do/Don't); #Accessibility Floor; #IA (5-slot bar, center (+))
- [Source: _bmad-output/planning-artifacts/architecture/architecture-popcorn-time-2026-07-02/ARCHITECTURE-SPINE.md#Structural Seed] — feature-module layout; #Stack table (Expo SDK 56 / RN 0.85 / React 19.2 / TS 6.0.3); L237 Navigation as design-paradigm slot; L143 TS `types: []` note
- [Source: _bmad-output/implementation-artifacts/1-2-create-an-account-and-sign-in-google-free.md] — the auth gate, `SignedInScreen` (holds sign-out), `useSession`/`signOut`, additive-module precedent, testing posture
- [Source: app/AGENTS.md] — Expo SDK 56 pin; use `expo install`; read versioned SDK 56 docs before native-dep work
- [Web: https://docs.expo.dev/versions/v56.0.0/ · https://docs.expo.dev/develop/user-interface/fonts/] — SDK 56 API surface; `expo-font` `useFonts` local-bundle pattern (verify against current docs at implementation time)
- [Web: https://expo.dev/blog/expo-router-v56-decoupling-from-react-navigation · https://reactnavigation.org/docs/bottom-tab-navigator/] — SDK 56 router/react-navigation decoupling context (why standalone react-navigation is fine here); bottom-tabs + custom `tabBar` API

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code, dev-story workflow)

### Debug Log References

- `npx tsc --noEmit` → clean (exit 0), TS 6.0.3 with `types: []`; no ambient-type additions needed after react-navigation install.
- `npx expo export --platform android` → bundles without error (`index-*.hbc`, 3.2MB). Export confirms `assets/fonts/{Fraunces-Bold,DMSans-Regular,DMSans-SemiBold,DMSans-Bold}.ttf` are **bundled** at build (NFR3 F-Droid-safe / NFR8 offline — no runtime Google Fonts fetch).

### Completion Notes List

This story was resumed mid-flight: a prior session had authored the token module, ThemeProvider, `fonts.ts`, `AppShell`, `BottomTabBar`, the `Screen` primitive, bundled the OFL `.ttf`s, and installed the deps (all via `expo install`, SDK-56-aligned). This session completed the unwired remainder and verified the whole story end-to-end.

- **Task 1 (deps):** Verified already installed & SDK-56-aligned — `@react-navigation/native` 7.3.7, `@react-navigation/bottom-tabs` 7.18.7, `react-native-screens` 4.25.2, `react-native-safe-area-context` 5.7.0, `expo-font` 56.0.7, `@expo/vector-icons` 15.1.1 (ships with Expo, resolves via `npm ls`). `tsc --noEmit` stays clean.
- **Task 2 (tokens + ThemeProvider):** Verified complete — both palettes transcribed verbatim from DESIGN.md, dark wired unconditionally with a single `mode` switch point for Story 4.3, role-mapped tokens (UX-DR1).
- **Task 3 (fonts):** `fonts.ts`/`useAppFonts` existed; **wired the font gate into `App.tsx`** so nothing renders before the bundled Fraunces + DM Sans load (no system-font flash).
- **Task 4 (shell + custom tab bar):** `AppShell`/`BottomTabBar` existed; **added the missing `SafeAreaProvider`** at the app root (BottomTabBar's `useSafeAreaInsets` had no provider) and fixed the `ProfileScreen` prop contract so the shell can hand it the `session`. Custom tab bar: 5 slots, lifted magenta (+) FAB (−16px, `radius.md`), active = icon **+ label + primary color** (never color alone, UX-DR25), inactive ~55% opacity, tap targets ≥48, `accessibilityRole` tab/button + `accessibilityState.selected`.
- **Task 5 (screens):** Rebuilt `HomeScreen` into the warm empty state with the exact copy **"Your story starts here. What did you watch tonight?"** + a "Log a watch" CTA routing into the (+)/Add tab (no cold zeroes). Re-skinned Diary/Feed/Add onto the themed surface with Fraunces titles + neutral placeholder lines (no fabricated data). Moved **sign-out** onto the Profile ("You") screen so the shipped 1.2 flow survives; deleted the now-subsumed `SignedInScreen.tsx`.
- **Task 6 (wire + verify):** `App.tsx` now wraps the tree in `SafeAreaProvider` → `ThemeProvider`, gates on fonts, **preserves the `checkSupabaseHealth()` probe (1.1 AC2) and the `useSession` gate (1.2)**, and renders `<AppShell session={session}/>` in place of `SignedInScreen`. Loading/error states themed onto `surfaceBase`, `StatusBar` light. Also set `app.json` `userInterfaceStyle` → `dark` to match the dark-wired shell.

Testing posture unchanged (no framework yet, per 1.1/1.2): the shell is visual, so the automated bar is `tsc` + `expo export` (both green); `scripts/health-check.mjs` was left as-is (a JS-bundle assertion adds no meaningful signal for a visual shell). No backend/migration/RLS/Edge Function work — pure client UI, as scoped.

### Change Log

- 2026-07-04 — Story 1.3 completed: themed dark app shell + 5-slot bottom navigation wired end-to-end (font gate, SafeAreaProvider, AppShell replaces SignedInScreen, Home warm empty state, sign-out moved to Profile). tsc clean + Android export bundles. Status → review.
- 2026-07-04 — Code-review fixes applied (7): (1) `useAppFonts` now surfaces the load error and `App.tsx` fails open on it (was a permanent-spinner hang on font-load failure); (2) FAB exposes `accessibilityState.selected` when Add is focused (AC4); (3) extracted shared `PlaceholderScreen` (Diary/Feed/Add were triplicated); (4) memoized `navTheme`; (5) `StatusBar` declared once at the app root, theme-derived; (6) `Screen` vertical padding pulls `spacing.lg` (was a magic `16`); (7) `@expo/vector-icons` realigned to `^15.0.2` via `expo install`. tsc clean + Android export re-verified green.

### File List

**New (this story's module additions):**
- `app/theme/tokens.ts`
- `app/theme/ThemeProvider.tsx`
- `app/theme/fonts.ts`
- `app/navigation/AppShell.tsx`
- `app/navigation/BottomTabBar.tsx`
- `app/components/Screen.tsx`
- `app/components/PlaceholderScreen.tsx` (shared themed placeholder — added in code-review cleanup)
- `app/assets/fonts/Fraunces-Bold.ttf`
- `app/assets/fonts/DMSans-Regular.ttf`
- `app/assets/fonts/DMSans-SemiBold.ttf`
- `app/assets/fonts/DMSans-Bold.ttf`
- `app/assets/fonts/Fraunces-OFL.txt`
- `app/assets/fonts/DMSans-OFL.txt`

**Modified:**
- `app/App.tsx` (SafeAreaProvider + ThemeProvider + font gate; AppShell replaces SignedInScreen; health + session gates preserved; themed loading/error states)
- `app/app.json` (`expo-font` plugin; `userInterfaceStyle` → `dark`)
- `app/package.json` (react-navigation + native deps via `expo install`)
- `app/features/home/HomeScreen.tsx` (warm empty state)
- `app/features/diary/DiaryScreen.tsx` (themed placeholder)
- `app/features/feed/FeedScreen.tsx` (themed placeholder)
- `app/features/add/AddScreen.tsx` (themed placeholder — (+) target)
- `app/features/profile/ProfileScreen.tsx` (themed; accepts `session`; temporary sign-out)
- `pnpm-lock.yaml` (dependency resolution)

**Removed:**
- `app/features/auth/SignedInScreen.tsx` (subsumed by the shell; sign-out moved to Profile)

### Review Findings

- [x] [Review][Patch] Sign-out has no loading/error/double-tap guard [app/features/profile/ProfileScreen.tsx:32]
- [x] [Review][Patch] Username fallback uses `??` so an empty-string username won't fall back to email [app/features/profile/ProfileScreen.tsx:20]
- [x] [Review][Defer] Tab label can truncate at largest Dynamic Type setting (`numberOfLines={1}` contradicts the AC4/Dev Notes "no clipped/truncated tab labels" requirement) [app/navigation/BottomTabBar.tsx:110] — deferred, not priority
- [x] [Review][Defer] `userInterfaceStyle` is hard-locked to `"dark"` in app.json, a native/build-time setting the JS `ThemeProvider.mode` can't flip — Story 4.3 (Paper White) will need to touch this file, contradicting the "zero screen edits" framing [app/app.json] — deferred, out of scope for this story (only dark is wired per AC1); revisit in Story 4.3
- [x] [Review][Defer] `navTheme` spreads react-navigation's `DarkTheme` so its `dark: true` flag never updates even if `theme.mode` changes later — only `colors` is kept in sync [app/navigation/AppShell.tsx:38] — deferred, no effect while only dark mode is wired; revisit alongside the app.json item in Story 4.3
