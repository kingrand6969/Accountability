# AccountAbility Fitness and Social Focus Design

**Date:** 2026-08-10  
**Status:** Approved design, pending final specification review  
**Scope:** Improve the existing application without redesigning its identity or navigation

## 1. Product decision

AccountAbility will focus on fitness accountability, challenges, and voluntary social sharing. Finance and business tracking will be removed completely.

This is an improvement to the existing app, not a redesign. The current visual language, social model, navigation patterns, and major fitness experiences remain in place.

The app combines three complementary strengths:

1. A Meta-like social Feed where people can post, flex achievements, and interact.
2. Challenges, rankings, streaks, and buddy competition.
3. Fitness tools for runs, workouts, nutrition, body progress, habits, and the Journey.

## 2. Main navigation

The bottom navigation remains the existing structure, minus Finance:

- Feed
- Journey
- Run
- Messages

There will be no replacement Finance tab and no newly invented My Day, Challenge, Train, or Create tab. Challenges, workouts, nutrition, body progress, creation tools, profile, discovery, and settings remain reachable through the app's existing Feed, create, and menu flows.

## 3. Feed

The Feed remains a general social feed similar to Meta. People can share fitness flexes, ordinary posts, photos, videos, thoughts, milestones, and other appropriate content.

### Publishing rules

- Nothing is posted automatically.
- Users create ordinary posts manually.
- After completing a run, workout, streak, or challenge, the app may prepare a shareable achievement card.
- The user must explicitly choose **Share to Feed**, **Add to My Day**, or **Keep private**.
- Publishing still requires the user's confirmation.
- A failed share must not remove or corrupt the completed fitness activity.
- A failed or cancelled share must not create a partial public post.

### Achievement presentation

- Activity-backed share cards may show the recorded workout, run, streak, or challenge result.
- Activity-backed cards may carry a restrained “Activity verified” indicator.
- Manual flex posts remain fully supported but must not be represented as verified activity.
- Verification describes the source of the activity data, not the truth of every claim in the post.

### Audience and interaction

- The Feed prioritizes recent content from accepted buddies and followed users.
- Relevant public fitness content can appear after relationship-based content.
- Existing reactions, comments, reports, mute, follow, and unfollow behavior remain available.
- Existing privacy and audience controls remain authoritative.

## 4. My Day stories

My Day is the existing Meta-style, 24-hour story feature. It must not be replaced with a daily timeline, dashboard, or new navigation destination.

### Story rail behavior

- My Day remains inside the Feed.
- The user's own story appears first.
- Unseen stories from accepted buddies and followed users appear next.
- Viewed stories from those audiences appear last.
- Existing story rings, photo/caption creation, tap-through viewer, progress indicators, auto-advance, deletion, and reporting remain.
- “Add to My Day” continues to create the user's own story.
- Achievement cards can be added to My Day only after the user explicitly chooses and confirms that action.

## 5. Existing fitness experiences

### Journey

- Keep the existing Journey experience and visual design.
- Remove the Money pillar and all money-related history, metrics, prompts, examples, and filters.
- Preserve fitness, nutrition, habits, progress, proof, and other non-financial Journey content.

### Run

- Keep the existing Run experience.
- Preserve completed runs regardless of whether the user shares them.
- Improve the existing completion flow so the user can deliberately share to Feed, add to My Day, or keep the result private.

### Workouts, nutrition, body progress, and challenges

- Retain the existing screens and access paths.
- Retain challenge creation, joining, rankings, leaderboards, streaks, and buddy competition.
- Let completed activities generate optional, user-triggered share cards.
- Do not create new bottom-navigation destinations for these tools.

### Messages

- Keep Messages and private buddy conversations unchanged.
- Private buddy messages remain outside automated content moderation, matching the previously approved policy.

## 6. Moderation and safety

- Existing AI safety checks continue for public posts, public-feed content, comments, and stories.
- Content is hidden only when the AI confirms a safety violation.
- If AI is unavailable or cannot determine a violation, content remains visible because no violation was confirmed.
- A manual user report triggers AI review but does not automatically hide the content.
- Every manual report remains available for admin review because AI may miss context such as bullying or misinformation.
- Admins make contextual decisions on reported content.
- Private buddy messages are not included in automated moderation.

This project must preserve the existing moderation implementation and policy except where finance-specific text is removed.

## 7. Complete finance and business removal

The sole current user has approved permanent deletion; no finance-data migration or archive is required.

Removal includes:

- Finance bottom tab and menu entries.
- Finance, transaction, account, bill, debt, saving, shared-goal money, receipt, and business-tracker screens.
- Finance and business routes and deep links.
- Money and business client modules, types, helpers, voice intents, notifications, insights, and home summaries.
- Finance examples and promises in onboarding.
- Money references in invitations, profile/account deletion text, help text, paywall copy, and legal documents.
- Finance-specific tests, fixtures, assets, and dependencies that are no longer used.
- Finance and business database data, tables, policies, functions, triggers, indexes, storage artifacts, and scheduled jobs, after dependency inspection.

The destructive database migration must target only confirmed finance/business objects. Account, profile, fitness, social, story, challenge, moderation, and message data must remain untouched.

## 8. Performance improvements

The fitness focus must also address the observed lag and instability in the staging app.

- Feed videos play only when their post is sufficiently visible.
- Off-screen videos pause and release expensive playback resources.
- Media resources release when the Feed loses focus or unmounts.
- Feed list rendering uses bounded initial rendering, windowing, batching, and clipping settings appropriate for the existing card layout.
- Story media and viewers release timers and media resources when closed.
- Share-card generation and media preparation must not block Feed scrolling.
- Loading additional Feed content must not remount already visible media unnecessarily.
- Development-only native modules must not be included in the release build unless required at runtime.

## 9. Failure behavior

- Feed or story loading failures show a retry state without blocking Journey, Run, or Messages.
- Story ordering failure falls back to a stable relationship-and-time ordering.
- Share preparation or upload failures keep the source activity saved and private.
- Database removal runs as a reviewed migration and fails as a unit rather than partially deleting unrelated objects.
- Removed finance deep links resolve safely to an unavailable/not-found experience rather than crashing.

## 10. Verification and acceptance criteria

### Navigation and removal

- Bottom navigation contains Feed, Journey, Run, and Messages only.
- No visible finance or business entry point, wording, notification, onboarding option, or legal description remains.
- Removed finance routes cannot be opened.
- Repository search finds no live finance/business feature references outside historical migration documentation where retention is necessary.
- The reviewed database migration removes only the confirmed finance/business objects.

### Social behavior

- A user can manually publish an ordinary Feed post.
- No run, workout, streak, or challenge completion posts without explicit user action and confirmation.
- Completion flows offer Feed, My Day, and private outcomes.
- Cancelling or failing a share leaves the activity saved and produces no public content.
- Reactions, comments, reports, mute, follow, and unfollow continue to work.

### My Day

- The user's own story is first.
- Unseen buddy/followed stories precede viewed buddy/followed stories.
- Story creation, viewing, advancing, deletion, expiration, and reporting continue to work.
- Users outside the accepted-buddy/followed audience do not enter the relationship story rail unless existing privacy rules explicitly allow it.

### Performance and stability

- Only visible Feed video is eligible for playback.
- Off-screen and backgrounded media is paused and released.
- Feed scrolling is tested with image and video-heavy fixtures.
- Android device testing covers cold launch, Feed scrolling, story viewing, run completion sharing, background/foreground transitions, and repeated navigation.
- No reproducible crash remains in the tested flows, and any captured native or JavaScript crash has a recorded cause and fix.

### Release process

- Automated tests, type checking, and targeted performance tests pass.
- The updated app is installed and exercised on the connected Android phone.
- A new staging build is produced only after local/device verification.
- Production remains unchanged until staging is accepted.

## 11. Explicit non-goals

- Redesigning the app's visual identity.
- Replacing the existing bottom navigation beyond removing Finance.
- Creating a new My Day timeline or dashboard.
- Automatically publishing achievements.
- Moderating private buddy messages with AI.
- Preserving or exporting the sole user's existing finance data.

