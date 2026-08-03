# AccountAbility Product Audit and Upgrade Recommendations

Date: 2026-07-26  
Scope: Full app structure, core controls, external sharing, challenges, achievements, and long-term progression  
Implementation status: Recommendations only, except the already approved Feed selector refinement

## Executive verdict

AccountAbility has a strong foundation: the five-part navigation is understandable, the Run screen has a distinctive identity, the Feed composer is now compact, and the run/win share-card generators are the right visual direction.

Three things should be handled before release:

1. Fix the unread-messages live-update crash.
2. Replace raw/custom-scheme external shares with trusted branded HTTPS previews.
3. Complete interaction semantics and form feedback across the app.

The achievement system is more long-term than it first appears, but some medals can be accelerated by volume or spam. The best answer is not simply adding enormous numbers. Keep quick early wins, then make higher tiers depend on time, distinct active days, verified events, and sustained relationships.

## What was verified

- 58 Expo Router screen files were inventoried.
- 89 static navigation calls were checked. The apparent unmatched targets were valid dynamic routes such as group, page, and legal document routes.
- All 17 test suites and all 103 tests pass.
- Type checking passes.
- Buddies/Discover changes state and loads its correct empty state.
- All five bottom navigation buttons worked in the live walkthrough.
- Finance opens Add Transaction.
- Exercise opens Trophy Case.
- Trophy Case opens medal details.
- Compete opens Challenges.
- Feed opens the composer.
- Flex opens Run.
- Messages and Menu load.

## Feed selector

The Buddies/Discover selector was too tall and visually heavier than the approved mockup. Its visible height, border, and text size have been reduced while preserving a 44-pixel effective touch area.

Evidence: [feed-loaded-mobile.png](../.gstack/qa-reports/screenshots/feed-loaded-mobile.png)

## External sharing audit

### Current output

Invite sharing currently sends:

```text
I'm using AccountAbility to stay on track...

Join me so we can keep each other accountable!

accountabilityapp-staging:///?ref=<user-id>
```

This is a custom app link containing a UUID. Outside the app it looks unfamiliar, cannot produce a rich preview, and may appear unsafe.

A normal Feed post currently sends:

```text
<post text>
<raw image storage URL>

— shared from AccountAbility
```

This is the specific path that can look like a suspicious bundle of letters and links. It exposes the storage address rather than a human-readable AccountAbility page.

A challenge share currently sends plain text with no clickable challenge link. The recipient is told to install the app, add the sender as a buddy, and find the challenge manually.

Run and Win shares are much better:

- They generate branded image cards.
- Run supports Original, Story 9:16, Feed 4:5, Square 1:1, and Wide 16:9.
- Exports are social-ready sizes such as 1080 × 1920, 1080 × 1350, 1080 × 1080, and 1920 × 1080.
- Run routes hide the true start and finish by default.

One limitation remains: image sharing uses the system file-share path, so some destination apps may receive the image without the caption.

### Recommended sharing system

Build one trusted public share path:

`https://kingrand.io/s/<opaque-share-id>`

Every shared item should open a branded landing page with:

- AccountAbility logo and verified HTTPS address
- Sender display name, never an internal user UUID
- Branded preview image
- Plain-English title and description
- Open in AccountAbility button
- App Store / Play Store fallback
- Open Graph metadata so Messenger, WhatsApp, Facebook, and other apps show a rich preview

For each share type:

| Share type | Recommended payload |
|---|---|
| Feed post | Branded post image + short caption + HTTPS share link |
| Text-only post | Automatically render a quote-style image card |
| Run | Existing run card + short HTTPS activity link |
| Achievement | Medal/rank card + HTTPS achievement link |
| Challenge | Challenge card + direct join link |
| Invite | Buddy-card preview + referral link on `kingrand.io` |

Safety rules:

- Never share raw Supabase storage URLs.
- Never expose user IDs in the visible URL.
- Use opaque, revocable share IDs.
- Do not place private post content on a public landing page without a separate public-share choice.
- Add an in-app preview showing exactly what will leave the app.

## Challenge audit

The present challenge engine supports joining, leaving, standings, multiple metrics, and Pro-created challenges. The new-member experience is weak because there are no official challenges and custom creation is locked behind Pro.

Recommended structure:

- Free members can always join official AccountAbility challenges.
- Pro members can create custom challenges.
- Publish recurring official challenges:
  - Daily: one small action
  - Weekly: consistency or three-session goal
  - Monthly: distance, workout, or active-day goal
  - 90-day: foundation challenge
  - Annual: 1,000 km, 250 active days, or 200 workouts
- Offer beginner, intermediate, and advanced versions.
- Count only verified, server-recorded events.
- Lock challenge timezone and dates when a member joins.
- Include rest-day tokens for streak-style health challenges.
- Do not reward unsafe overtraining.

## Achievement and rank audit

### Existing pacing

| Medal | Highest current target | Pacing verdict |
|---|---:|---|
| Streak Flame | 365-day streak | Strong one-year target |
| Distance Club | 500 km | Too short for regular runners |
| Iron | 500 workouts | Strong two-to-three-year target |
| Competitor | 25 challenges | Can be reached in months |
| Squad | 20 buddies | Measures quantity, not durable accountability |
| Trailblazer | 500 activities | Strong one-to-two-year target |
| Long Haul | 100 km in one activity | Extremely hard, but one-event based |
| Devotion | 365 active days | Strong one-to-two-year target |
| Champion | 30 wins | Depends on challenge supply and can be gamed |
| Archivist | 500 memories | Can be spammed without distinct-day limits |
| Goal Crusher | 25 savings goals | Can be gamed with tiny short-lived goals |
| Endurance | 500 hours | Strong one-to-two-year target |
| Explorer | 15 places | Short-term target |
| Ambassador | 50 accepted invites | Appropriately difficult |

The theoretical Flex Point ceiling is about 4,185. Mythical begins at 3,750, roughly 90% of the total. That makes the final rank difficult, but several mid-level ranks can be accelerated by spam-friendly medals.

### Recommended long-term model

Keep the current first three tiers so new users feel progress. Extend the endgame with verified mastery requirements:

| Area | Recommended long-term targets |
|---|---|
| Streak | 365 days, then 730 and 1,825-day prestige |
| Distance | 500 km, 1,000 km, 2,500 km, 5,000 km |
| Workouts | 500, 750, 1,000 verified workouts |
| Active days | 365, 730, 1,095 distinct active days |
| Activities | 500, 1,000, 2,000 verified activities |
| Endurance | 500, 1,000, 2,000 hours |
| Challenges | 25, 50, 100 completions across at least 12 distinct months |
| Challenge wins | 30, 50, 100 verified wins with minimum field sizes |
| Memories | 500 and 1,000, with progress capped by distinct days |
| Buddy accountability | Replace very high buddy counts with 90, 365, and 730 shared check-in days |

Use two complementary systems:

1. **Lifetime medals** never reset and represent years of verified effort.
2. **Seasonal challenges** reset monthly or quarterly and keep the app fresh.

Add a prestige ring after Diamond instead of inventing endless metals. A Diamond medal can gain one, two, then three prestige rings at 2×, 5×, and 10× its highest threshold. This preserves the value of Diamond while supporting five-year users.

### Anti-gaming rules

- Count distinct active days and weeks, not only totals.
- Apply daily credit caps to memories, posts, cheers, and similar actions.
- Require goals to exist for a minimum period before completion counts.
- Make activity, workout, and challenge awards server-authoritative.
- Use idempotent event records so retries cannot double-award progress.
- Never reduce medals already earned when thresholds change. Grandfather them and apply new prestige rules going forward.

## UI and function priorities

### P0: Before release

- Resolve the unread-messages live-update crash.
- Replace raw/custom share links with trusted HTTPS share pages.
- Add a share-preview step so the user sees the exact outgoing content.

### P1: First release-quality pass

- Add button/role semantics, accessible names, and selected/disabled states to all controls.
- Add inline form validation and recovery instructions.
- Ensure inactive tab screens are hidden from screen readers.
- Add official free challenges.
- Add loading, empty, error, and retry states consistently.

### P2: Retention and polish

- Add seasonal challenge collections and annual goals.
- Add post-Diamond prestige rings.
- Add share analytics: opened, installed, joined, and challenge accepted.
- Normalize page headers, back buttons, segmented controls, and card elevation.
- Review dynamic text size and reduced-motion behavior on Android.

## Release recommendation

Do not move this build to production until the live-update crash is fixed and retested. The Feed selector refinement is safe for staging. The sharing system and progression changes should be approved as separate release items because they affect links, privacy, rewards, and existing users.

