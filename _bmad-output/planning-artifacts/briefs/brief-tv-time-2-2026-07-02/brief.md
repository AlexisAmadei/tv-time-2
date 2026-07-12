---
title: "Product Brief: Popcorn Time (working name)"
status: final
created: 2026-07-02
updated: 2026-07-02
status_note: finalized after structure + prose editorial passes
---

# Product Brief: Popcorn Time (working name)

## Executive Summary

TV Time — a beloved app for tracking shows and films and remembering how you felt about them — shuts down on **July 15, 2026**, taking every user's viewing history with it. **Popcorn Time** is an open-source, community-driven successor built for people who watch a lot and want to *remember* it: what they watched, when they watched it, and — crucially — **how they felt about it at the moment they watched it**, captured as a fast, expressive emoji reaction rather than a flattened star rating.

It is a personal watch-memory first and a small social network second. You log what you watch, react in a tap, and over time build a private, honest timeline of your viewing life. Because it's multi-user and community-minded, you can also follow friends, see their reactions, and share lists — the part of TV Time that a solo journaling app like Letterboxd never quite replaces.

This is a **passion project, not a business**. There is no monetization plan and none is wanted. Success is measured in one thing: that the creator (and people like him) never again lose their watch history to a company's balance sheet, and enjoy using the tool daily. Open-sourcing it — including F-Droid distribution — is an explicit goal.

## The Problem

People who watch a lot of TV and film accumulate a rich personal history — and almost nowhere good to keep it. Two failures compound:

- **The memory is fragile and vendor-owned.** TV Time held years of viewing history for its users and is now deleting all of it on July 15, 2026 because the business wasn't sustainable. Anyone who invested in tracking their life through it loses that record. This is the trigger for this project.
- **Existing alternatives flatten the feeling.** Letterboxd and similar tools capture a *rating* — a single current judgment of a title. They don't capture the **temporal truth**: that you loved a show *while you were watching it in that chapter of your life*, even if you'd rate it differently now. The "how did this feel, then" signal — the thing that makes a watch-history a *memory* rather than a database — is lost.

The cost of the status quo: an active watcher either accepts that their history is disposable, or migrates to a tool that records what they watched but not who they were when they watched it.

## The Solution

A cross-platform app (native iOS + Android, plus web) that is fast to fit into your daily routine and honest about how you felt:

- **Track what you watch** — shows and films, with progress (episodes/seasons). [ASSUMPTION] Title/episode metadata comes from a public source such as TMDB.
- **React in a tap** — an **emoji rating** captures your reaction the moment you finish something. Fast, visual, expressive, and — because it's timestamped — a record of how you felt *then*, not a retroactive score.
- **Build a timeline** — the accumulated log becomes a personal watch-memory: what, when, and the feeling attached.
- **Import your TV Time history** — bring the export of your existing TV Time data into the app so your years of history survive the shutdown.
- **Community** — multi-user by design: follow friends, see their reactions, and share lists.

## What Makes This Different

- **Timestamped feeling, not a static rating.** The emoji reaction is bound to *when* you watched. This is the core differentiator versus Letterboxd/IMDb, which record a single evolving judgment.
- **Your history is portable.** Open-source, import-friendly, [ASSUMPTION] export-friendly — no vendor can silently delete it.
- **Open source, F-Droid-friendly.** No proprietary lock-in; runnable and inspectable by the community.
- **Built by a heavy user, for heavy users.** Not a monetization funnel — the incentives are aligned with the people who actually watch a lot.

Honest caveat: the "moat" here is intent and openness, not technology. Anyone could build this; the point is that *someone who cares* does, and keeps it alive.

## Who This Serves

- **Primary: the heavy, reflective watcher.** Someone who watches a lot, tracked it in TV Time, and wants a durable, feeling-aware record of their viewing life. Success for them = logging is effortless and their history feels *theirs* and safe. (The creator is the archetype.)
- **Secondary: their friends / small communities.** People who want to see what friends are watching and how they reacted, and to share lists — the social layer that makes tracking more fun than a spreadsheet.
- [ASSUMPTION] **Tertiary: the open-source / privacy-minded crowd** who want an F-Droid, non-commercial alternative to closed tracking apps.

## Success Criteria

- The creator uses it **daily** to log watches and never defects to Letterboxd (or a spreadsheet) for this purpose. TV Time itself is gone — this is the replacement.
- **No history is lost**: TV Time data import works and preserves everything accurately. [ASSUMPTION]
- Logging a watch + reaction takes **seconds**, not a form.
- At least a **handful of real friends** actively use it with their own accounts (validates the community bet). [ASSUMPTION — a rough target; adjust to what "worth it" means to you.]
- It's **open source and installable** (stores + F-Droid) so it can outlive any single maintainer's attention.

## Scope

**In (v1):**
- Accounts (multi-user, centrally hosted).
- Track shows & films with progress.
- Emoji reaction capture (timestamped).
- Personal watch-memory / timeline view.
- **Import from TV Time export.**
- **Community v1:** follow friends, see their reactions, shared lists. [ASSUMPTION on the exact social feature set — confirm the minimum that counts as "community."]
- Native iOS + Android + web from one codebase (Expo / React Native).

**Out (v1):**
- **LLM recommendations** — deferred to v2.
- Monetization / paid tiers — permanently out.
- Self-hosting — deliberately out (community requires a shared central instance).
- [ASSUMPTION] Proprietary/Google-only dependencies (Firebase, Play Services) — avoided to stay F-Droid-eligible; shapes push, auth, and analytics choices from day one.

**Hard external deadline:** TV Time deletes all user data after **July 15, 2026**. The urgent action is *exporting your TV Time data before then* — independent of, and prior to, building the app. The build timeline itself is relaxed (passion project).

## Vision

If it works, Popcorn Time becomes the **durable, open home for watch-memories**. Near-term (v2): **LLM-powered recommendations** that read your own history and emoji sentiment to suggest what to watch next, mood-aware. Longer term: a small, healthy, non-commercial community of watchers sharing honest, in-the-moment reactions — the good part of TV Time, kept alive by the people who loved it.

## Open Questions

- Exact **v1 community feature set** — what's the minimum that makes it feel like a community (follows + reactions? shared lists? comments)?
- **Metadata source** — TMDB vs alternatives (licensing, F-Droid compatibility). [ASSUMPTION: TMDB]
- **Auth & push without Google** — how to do accounts and notifications while staying F-Droid-eligible.
- **Emoji reaction model** — a fixed set? free emoji? one per title or per episode? Optional note alongside?
- **TV Time import format** — what the export actually contains, and how completely it maps.
