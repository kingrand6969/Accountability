# Accountability App — Master Design Spec

**Date:** 2026-06-25
**Status:** APPROVED — this is the master build map. Do not lose this.
**Owner:** qgrc04@gmail.com (vision/product + UI/UX taste)
**Builder:** Claude (dev + PM + producer). User is non-technical.

> North star: *"A social accountability app where you plan your day, track your
> workouts, money, and activities, build streaks, and connect with a real-life
> Accountability Buddy who keeps you showing up."*
> Unifying theme across all pillars: **"Did you show up today?"**

---

## 1. Product vision

Accountability App bundles five life-tracking pillars into one mobile app, tied
together by a shared **daily timeline** and a **social feed** that turns progress
into friendly social pressure. The social layer is the growth/attention engine
(streaks, shareable win-cards, friend leaderboards, accountability buddies).

The five pillars:
1. **Calendar / Scheduler** — plan the day per hour, with alarms/reminders
2. **Gym** — pick a focus, get exercises with images + sets/reps; log workouts
3. **Diet / Calorie tracker** — log meals, calories, macros (Pro)
4. **Money tracker** — income/expenses, budgets, charts
5. **Activity tracking** — GPS runs/rides/walks, pace, maps, PRs (Strava-like)

Plus a cross-cutting **Accountability Buddy** matching + chat system.

## 2. Tech stack (locked)

| Layer | Tool | Cost |
|---|---|---|
| App framework | **Expo (React Native)** — Android + iOS from one codebase | Free |
| Language | **TypeScript** | Free |
| Database | **Supabase** (hosted PostgreSQL) | Free tier |
| Auth / login | **Supabase Auth** (email + Google) | Free |
| File storage | **Supabase Storage** (profile pics, photos) | Free tier |
| Realtime (feed, chat) | **Supabase Realtime** | Free |
| Notifications / alarms | **Expo Notifications** | Free |
| GPS / maps | **expo-location** + OpenStreetMap | Free |
| Food data | **Open Food Facts** (open database, barcode scan) | Free |
| Voice → text | On-device speech-to-text (e.g. @react-native-voice) | Free |
| Date/time parsing | On-device natural-language date parser (e.g. chrono-node) | Free |
| Ads | **AdMob** (Google) | Free |
| Subscriptions | **RevenueCat** | Free until ~$2.5k/mo revenue |

**Distribution:** Android-friendly (free APK sharing) and iOS via the Apple
Developer Program (**$99/year — accepted as a known cost**).

## 3. Core architecture — "everything is a card on your day"

The spine is the **Daily Timeline** (per-day, per-hour). A calendar event, a
workout, a meal, a payment, and a run are all **time-stamped cards** of different
types. This is what makes five pillars feel like one app.

Three foundation layers every pillar plugs into:
- **Identity** — accounts, profiles, settings
- **Daily Timeline** — the day/hour spine every pillar writes to
- **Social Feed** — the sharing/attention layer (streaks, win-cards, friends)

## 4. Build roadmap (phases)

Each phase is a usable, shippable app. Ship → get feedback → build next.

| Phase | Ships | Notes |
|---|---|---|
| **0 — Foundation** | Login; **profile** (name, photo, bio, birthday w/ privacy toggle, join date, last active w/ toggle, relationship status, area); daily timeline spine; feed shell; navigation; Pro/ads scaffolding | Backbone for everything |
| **1 — Calendar / Scheduler** ⭐ | Day + hour view; events; alarms/reminders; streaks; **Pro: smart reminders** (recurring, snooze) | First daily-use pillar |
| **1.5 — Voice command** | Speak → auto-create reminders/tasks ("remind me to buy medicine tomorrow at 5pm"); always shows a confirm screen before saving | **Pro.** Needs a real device build; accuracy varies |
| **2 — Gym + Diet** | **Gym Assist:** pick focus (Arms & Chest / Legs / Back / Full Body) → exercises with demo images + sets×reps + rest, tuned to goal; log to timeline. **Diet/Calorie tracker (Pro):** meals, calories, macros, daily target, barcode scan | Free: preset routines. Pro: smart generator + programs + diet |
| **3 — Money** | Income/expenses, categories, budgets, charts | Free: 30-day history. Pro: unlimited + insights |
| **4 — Activity tracking** | GPS runs/rides/walks, distance/pace, maps, personal records | Flashiest, hardest — saved for last |
| **5 — Accountability Buddy** | Double opt-in matching (area + activity + time); messaging once linked; block/report | Depends on Activity + location |

## 5. Monetization (built in from Phase 0)

- **Free tier:** all pillars with limits — 30-day history, ~3 active goals/budgets/
  routines, small banner ads.
- **Pro — $3.99/month or $29.99/year:**
  - No ads
  - Unlimited history + advanced charts/insights
  - Smart reminders + voice commands
  - Gym Assist smart generator + premium workout programs
  - Diet / Calorie tracker
  - Accountability circles / private challenges
  - Data export (PDF/CSV)
- **Rewarded ads:** watch a 30-sec ad → earn a **streak freeze** (keeps a streak
  alive after a missed day).

## 6. Attention / growth engine (producer notes)

Built-in virality via **social accountability**:
- Streaks + shareable auto-generated **win-cards** (post a PR or 30-day streak to
  Instagram/TikTok) → free marketing
- Accountability buddies + friend leaderboards
- "Did you show up today?" friendly social pressure

## 7. Accountability Buddy — safety & privacy (non-negotiable)

Framing: **"Accountability Buddy / Workout Partner."** No dating layer — users
figure that out themselves by chatting. Our scope ends at **linking + chat once
linked.**

- **Double opt-in only** — a connection happens only if **both** people accept.
  No one is ever shown to someone who didn't agree.
- **Never share exact location** — only approximate ("~2 km away," same
  neighborhood); meetups suggested at **public spots**, never homes.
- **Opt-in & off by default** — buddy matching and location sharing are settings.
- **18+ gate** for matching (verified quietly via birthday).
- **In-app chat only after linking**; **block & report** one tap away on every
  profile.

## 8. Data model (plain language)

Core "things" stored:
- **Profiles** — name, photo, bio, birthday (+privacy), join date, last active
  (+toggle), relationship status (Single / In a relationship / Prefer not to say),
  area, settings
- **Days → TimelineItems** — each item has a type: `event` / `workout` / `meal` /
  `expense` / `activity`
- Pillar detail tables added as built: workouts/exercises, meals/foods,
  transactions/budgets, activities/GPS tracks
- **Friendships**, **BuddyLinks** (with opt-in/consent state), **Messages**
- **Subscriptions** (Pro status), **Streaks**

Clean and simple; each pillar adds its own detail table without touching the spine.

## 9. Definition of "done" for first release (Phases 0–1)

A person can: sign up, set up a profile, see their day, add events with alarms,
build a streak, share a win to the feed, and the app shows ads + has a working
(even if empty) Pro upgrade path. That's a shippable v1 we can put on a phone and
hand to friends.

## 10. Future / "add more soon"

User explicitly wants room to add features later. Parking lot (not committed):
location-aware reminders, AI coach, supplement/affiliate revenue, web companion,
challenges with stakes. Revisit after v1 ships.
