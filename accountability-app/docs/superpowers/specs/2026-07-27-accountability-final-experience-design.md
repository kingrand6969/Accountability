# AccountAbility Final Experience Design

Date: 2026-07-27  
Status: Approved design, pending implementation plan

## Product Direction

AccountAbility remains a social accountability application, but its identity is no longer centered on a generic social feed. The experience combines:

- Social connection through Feed, Discover, buddies, groups, messages, and sharing.
- Daily direction through Momentum and Today’s Promises.
- Long-term progress through Path, ranks, medals, challenges, and prestige.
- Personal history through Journal, verified proof, reflections, and Memories.
- Meaningful social reinforcement through Encourage.

The existing application features and user data must be preserved. The redesign is an evolution of navigation, terminology, visual hierarchy, and feature organization.

## Brand Identity

### Approved logo direction

The approved mark is logo concept 4: two abstract people leaning together to form an uppercase “A.”

The production logo must be recreated as precise vector artwork rather than extracted from the concept mockup. It must support:

- Full-color cobalt version.
- One-color dark and light versions.
- App icon.
- Header wordmark.
- Small notification-size use.
- Share-card watermark.
- Light and dark backgrounds.

The wordmark remains **AccountAbility**, with the internal capital “A” preserved.

### Visual language

- Primary cobalt: `#155EEF`
- Deep navy: `#081A3A`
- Warm cream: `#F7F4EC`
- White surfaces
- Success green only for verified success states
- Modern sans-serif typography for controls, body copy, and data
- Editorial serif typography for personal, journey, and achievement headlines
- Tabular numerals for timers, money, and performance data
- Strong photography for proof and milestone moments
- Minimal shadow and restrained rounding
- Glass effects only when they communicate layering, such as a modal or bottom sheet
- Minimum 44-point touch targets and accessible contrast

Navigation selection uses quiet ink, weight, and a thin indicator. It does not use a raised solid-blue center holder. Functional buttons, verified proof, routes, and progress may continue to use cobalt.

## Primary Navigation

The permanent bottom navigation is:

1. Feed
2. Finance
3. Journey
4. Run
5. Messages

Journey replaces Exercise as the center destination. The approved connected-people A is its icon and is slightly larger than adjacent icons, but it remains on the same navigation surface without a filled or elevated blue container.

The existing global creation control remains separate. The Journey icon must not behave like a Create button.

Existing Exercise routes, notifications, and deep links must resolve to their corresponding Journey/Body destinations without losing back-stack behavior.

## Encourage

Cheer and Encourage are the same product action. The visible product terminology becomes:

- Encourage
- Encouraged
- Send encouragement
- People are cheering you on

“Cheering you on” may remain conversational copy, but buttons, menus, accessibility labels, counters, notifications, and feature names use **Encourage**.

Existing Cheer reaction records and counts must be preserved. The implementation should map or migrate terminology without deleting or duplicating reaction data.

### Encouragement interaction

A proof or post displays a collapsed bar:

- Up to three overlapping buddy portraits.
- Copy such as “Jordan, Maya and 15 others are cheering you on.”
- A short waveform indicator when voice encouragement exists.
- A chevron and accessible expanded-state description.

Tapping the bar opens a bottom sheet containing:

- Every participating buddy.
- Preset encouragement.
- Short written messages.
- Voice messages.
- Time sent.
- Individual Reply actions.
- A **Thank everyone** action.

The sheet is supportive rather than competitive. It must not rank buddies or turn encouragement into a popularity leaderboard.

### Voice encouragement

Encourage supports a short voice message in addition to presets and written messages.

The recommended recording flow is:

1. Tap the microphone action.
2. Grant microphone permission when required.
3. Record up to 10 seconds with a visible timer.
4. Stop and preview the recording.
5. Re-record, delete, or send.

Voice encouragement requirements:

- Never send immediately when recording stops; preview-before-send is required.
- Display a waveform, duration, play/pause state, and playback progress.
- Allow the sender to delete their message.
- Allow the recipient to report an abusive message and block its sender.
- Do not autoplay audio.
- Make microphone, recording, playback, and sent states accessible to screen readers.
- Pause cleanly when the application backgrounds or an interruption occurs.
- Upload only after the sender chooses Send.
- Show retry and discard choices after a failed upload.
- Follow the same privacy and retention rules as buddy messages unless the recipient explicitly saves the encouragement to Memories.
- External Daily Proof Cards may display a decorative waveform and supporter count, but they must not embed playable private voice audio.

## Journey

Journey is the user’s overall direction and is divided into three top-level views:

1. Momentum
2. Path
3. Journal

The section selector uses text weight and a subtle ink indicator rather than bright blue filled states.

### Momentum

Momentum is the default Journey view. It answers:

- How am I doing today?
- Which part of life needs attention?
- What should I do next?
- Who is supporting me?

It contains four pillars:

- Body
- Money
- Focus
- People

Momentum includes:

- A daily momentum score.
- Individual pillar scores.
- Today’s Promises.
- The next recommended action.
- A compact daily sequence.
- Recent encouragement.

Tapping a pillar opens its dedicated functional area.

### Path

Path is the visual long-term progression experience. It contains:

- Current consistency position.
- Streak milestones.
- Ranks.
- Medals.
- Challenges.
- Prestige tiers.
- Long-term and multi-year milestones.
- Filters for Body, Money, Focus, and People.

High tiers must require sustained participation. The system should support milestones such as 7 days, 30 days, 100 days, one year, 500 days, 1,000 days, and later legacy tiers where appropriate.

### Journal

Journal is the automatic evidence and history of the user’s Journey. It works whether or not the user has formal goals.

Journal records:

- Today’s Promises.
- Verified proof.
- Completed activities.
- Run and workout data.
- Finance or savings proof.
- Photos and video.
- Written reflections.
- Encouragement.
- Shareable Daily Proof Cards.
- Items saved to Memories.

Journal provides filters:

- All
- Body
- Money
- Focus
- People

## Goals, Promises, Proof, and Journal

The product model is:

**Optional goal → daily promise → completed proof → Journal record → Path progress**

### Goals

Goals are longer-term destinations, for example:

- Run 100 km.
- Exercise three times each week.
- Save $5,000.
- Read 20 books.
- Maintain consistency for one year.
- Spend more intentional time with family.

Goals are encouraged but never required. Users must be able to use Feed, Journal, Exercise, Run, Finance, and promises without first creating a formal goal.

After observing a repeated pattern, AccountAbility may gently suggest turning it into a goal. The user may accept, modify, or dismiss the suggestion.

### Today’s Promises

Promises are small daily actions. They may be linked to a formal goal or stand alone.

Examples:

- Morning run.
- Save $50.
- Complete an upper-body workout.
- Read for 20 minutes.
- Call a friend.

Daily promise setup is optional and must not block entry into the application.

### Proof

Proof may include:

- Verified Run statistics.
- Completed workout.
- Recorded savings action.
- Completed task.
- Photo or video.
- Written reflection.

Verified and user-entered proof must be visually distinguishable without implying that unverified personal reflection is invalid.

## Body and Exercise

Exercise is not removed. It becomes part of the Body pillar:

**Journey → Momentum → Body**

The Body area contains actions:

- Today’s workout.
- My plan.
- Exercise library.
- Start workout.
- Recent activity.
- Share proof after completion.

Detailed Body Progress moves into:

**Journey → Journal → Body**

The Body-filtered Journal contains:

- Daily workout records.
- Run and exercise proof.
- Strength and performance trends.
- Weekly and monthly consistency.
- Photos and reflections.
- Body-related goals.
- Progress toward milestones.
- Encouragement received.

The Body action page must not duplicate a second analytics dashboard. Existing Body Progress links should resolve to the Body-filtered Journal.

## Feed and Discover

Feed remains the initial screen after sign-in.

Feed preserves:

- Buddies and Discover switch.
- Unified Post, Photo/Video, and Flex composer.
- My Day.
- Text, photo, video, Flex, milestone, and Run posts.
- Comments.
- Sharing.
- Saving.
- Ownership-aware post menus.

The primary social action becomes Encourage.

Posts should emphasize the user’s proof, media, achievement, or story instead of relying on repetitive generic white-card framing.

Discover contains:

- Recommended public Buddy Cards.
- Groups.
- Challenges.
- Nearby recommendations when permission allows.
- Explanations for recommendations.

Only explicitly public information may be displayed.

## Daily Proof Card

The Daily Proof Card is a shareable summary focused on the user.

It may contain:

- Motivational headline.
- Chosen photo, video frame, or generated background.
- Today’s Promises.
- Verified proof.
- Progress toward goals or milestones.
- A collapsed supporter count.
- AccountAbility branding.

Encouragement remains visually secondary. The external card may state “17 buddies cheered me on” with privacy-approved portraits or only the count.

Supported formats:

- Portrait
- Square
- Landscape

Destinations:

- Post to AccountAbility Feed.
- Share outside the application.
- Save to phone.
- Save to Memories.

Privacy controls must allow hiding:

- Location.
- Route.
- Amounts.
- Buddy names.
- Buddy portraits.
- Other sensitive proof fields.

External sharing must produce a visual preview or attachment rather than raw links and text. When store listings are available, the attachment’s destination should open the application through a deep link or fall back to the correct app-store listing.

## Finance

Finance remains a private functional destination containing:

- Accounts and available balance.
- Income and spending.
- Category breakdown.
- Bills.
- Savings and debt.
- Shared goals.
- On-device smart insights.

Finance information is private by default. Only a user-approved completed goal or proof item may become shareable, and amounts are hidden by default on external cards.

## Run

Run preserves:

- Walk, Run, and Cycle.
- GPS route.
- Distance, time, pace, and calories.
- Offline recording.
- Visible **Saved on phone** status.
- Ordered automatic upload when connectivity returns.
- Clear Pause and Finish controls.
- Post, share, save-to-phone, and Memories choices.

Run proof feeds Journal and can optionally be posted to Feed.

## Messages

Messages contains:

- Buddy conversations.
- Search.
- Active buddies.
- Unread state.
- Retention notice.
- An Encouragement filter.

Encouragement messages may be opened from the Journal support bar or the Messages filter while preserving a predictable return path.

## Profile

Profile is an overview, not a long editing form. It contains:

- Identity, bio, and area.
- Streak, rank, and buddies.
- Trophy Case.
- Journey.
- Memories.
- Buddy Card.
- Account and privacy.
- Notifications.
- Help and support.

Private fields are edited on separate protected screens. Sign out and destructive account actions remain visually separated.

## Entry and Creation Flow

The entry flow is:

1. Welcome / sign in.
2. Optional onboarding or Today’s Promise selection.
3. Feed.

The unified Create experience offers:

- Post.
- Photo or video.
- Flex achievement.
- Share a run.
- Add to My Day.

It includes audience selection, preview, and one primary continuation action.

## Compatibility and Data Safety

- No existing user posts, media, messages, reactions, runs, finance data, workouts, achievements, or profile data may be deleted.
- Cheer data must be preserved when relabeled as Encourage.
- Existing Exercise routes and deep links must redirect safely to Journey/Body destinations.
- Navigation changes must preserve back behavior and restore prior state where possible.
- Release through staging first.
- Database changes must be additive and reversible.
- Rollback must restore the previous application code without rolling back user-generated data.
- Any release proposal must include required tests, database impact, privacy impact, screenshots, risks, and rollback instructions in the Release Control Center.

## Accessibility and Quality Requirements

- Minimum 44-point touch targets.
- Descriptive accessibility labels and states.
- Dynamic text support without clipped controls.
- Contrast-compliant text and icons.
- Color is never the only state indicator.
- Reduced-motion support.
- Safe-area compliance.
- Loading, offline, empty, error, and retry states for every affected flow.
- Small-phone and large-phone validation.
- Android and iOS validation before production release.

## Approved Implementation Order

1. Produce and approve production vector logo assets.
2. Introduce shared visual tokens and quiet navigation selection.
3. Rename Cheer to Encourage while preserving data.
4. Replace Exercise tab with Journey and add safe route compatibility.
5. Implement Momentum and Body action area using existing features.
6. Implement Journal and move Body Progress into its Body filter.
7. Implement Path using existing achievements, ranks, and challenges.
8. Add expandable encouragement bottom sheet.
9. Add Daily Proof Card generation and privacy controls.
10. Apply the shared visual language to remaining screens.
11. Complete accessibility, data-safety, staging, and release-control verification.

## Explicit Non-Goals

- Removing social media features.
- Replacing Feed as the initial screen.
- Requiring formal goals before using Journal.
- Deleting Exercise functionality.
- Creating a separate Cheer action alongside Encourage.
- Turning encouragement into a public popularity ranking.
- Rolling back or deleting user-generated data during application rollback.
