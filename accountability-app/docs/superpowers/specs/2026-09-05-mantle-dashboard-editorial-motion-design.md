# Mantle Dashboard — Editorial Motion Design

**Status:** Approved visual direction
**Date:** 2026-09-05
**Scope:** Dashboard/Feed appearance only

## Objective

Turn the current Mantle dashboard into a premium, content-first social activity feed without simplifying the product or changing its behavior. Photos, route proof, and meaningful activity information become the visual center. Mantle's chrome becomes quieter, more precise, and consistent with the approved linked-motion logo, permanent dark palette, and elevated Run control.

## Approved Direction

The approved direction is **A — Editorial Motion**.

Its defining qualities are:

- activity media and proof dominate the composition;
- neon chartreuse is used only as a meaningful signal;
- warm white typography and tabular metrics provide hierarchy;
- subtle charcoal depth replaces heavy outlines and stacked glass cards;
- utility controls use one consistent outline icon language;
- the soft hexagon remains exclusive to the Run action;
- every existing dashboard feature remains available.

## Scope Boundaries

### Included

- Feed header and utility controls
- My Day/story rail
- Feed post presentation
- Run/activity proof presentation inside Feed posts
- Generic photo, video, text-only, and event post presentation
- Suggested buddies rail
- Loading, offline, empty, error, and pagination states
- Feed-facing bottom navigation styling and proportions
- Responsive spacing, accessibility, press feedback, and reduced motion

### Excluded

- Feed ranking, database queries, pagination rules, and cache behavior
- Posting, reaction, sharing, saving, attendance, or story business logic
- Navigation destinations, route names, or deep links
- Backend security policies or the existing post-permission error
- Run tracker and Run completion/share-studio screens
- Global redesign of screens outside the dashboard
- New fonts, packages, APIs, or data fields

## Visual System

### Color

Use existing semantic theme tokens from `src/ui/theme.ts`. Do not introduce screen-local color constants for ordinary dashboard surfaces.

- Canvas: `theme.surface.canvas` (`#0B0D0B`)
- Card/sunken surface: `theme.surface.card` (`#121512`)
- Raised surface: `theme.surface.raised` (`#181C18`)
- Primary text: `theme.ink.primary` (`#F7F8F4`)
- Secondary text: `theme.ink.secondary` (`#CED4CB`)
- Muted text: `theme.ink.muted` (`#9DA59D`)
- Brand signal: `theme.ink.action` (`#B9FF3D`)
- Subtle divider: `theme.border.subtle` (`#272D27`)

Chartreuse is reserved for active or meaningful states: unseen stories, Create, verified activity, selected reactions, selected navigation, and Run. It must not be used as decorative filler or on every header icon.

### Typography

Use the existing Mantle font tokens. This pass changes scale, weight, spacing, and hierarchy rather than adding another font family.

- Brand wordmark remains unchanged.
- Author names and important labels use semibold or bold weights.
- Supporting metadata remains compact but must retain accessible contrast.
- Activity values use the existing metric typography and tabular figures.
- Body copy stays readable at user-selected text sizes and is not forced into fixed-height containers.
- Uppercase annotation text is reserved for short verified/status labels.

### Spacing and Geometry

- Base rhythm follows the existing 4/8 spacing scale.
- Standard phone gutter is `spacing.lg` (16dp).
- Hairline dividers separate major content regions; bordered containers are used only when the boundary carries meaning.
- Utility icon visuals are approximately 22–24dp inside at least 48dp touch targets.
- Story imagery stays circular; the Run action stays a soft hexagon; other dashboard controls do not imitate the Run shape.
- Post media may use a subtle top-level radius only when it does not create inconsistent gaps at the screen edge.
- Shadows are restrained. Depth comes primarily from surface tone and media scrims.

## Screen Composition

### 1. Brand Header

- Keep the approved linked-motion mark and Mantle wordmark on the left.
- Keep Search, Create, and Notifications on the right.
- Search and Notifications use the quiet primary/secondary icon color.
- Create is the only always-chartreuse header action.
- All actions keep at least 48dp touch targets, clear accessibility labels, and visible press feedback.
- The header remains visually separate from the OS status bar and respects safe-area insets.

### 2. My Day Rail

- Preserve horizontal scrolling, My Day creation, story opening, retry, and discovery behavior.
- Use 48–52dp visual story circles with compact labels.
- Unseen stories use the chartreuse ring; viewed stories use a quiet neutral ring.
- The add indicator remains chartreuse but is visually smaller than the story image.
- Empty/discovery hints remain useful but do not become a large card that competes with the feed.
- The rail ends with a single subtle divider.

### 3. Feed Post Header

- Keep avatar, author, relative time/date, audience, activity type, and overflow menu.
- Give the author name first priority, then time/activity context, then audience.
- Use one concise metadata line when space permits and natural wrapping at larger text sizes.
- Overflow remains a quiet 48dp target with no decorative container.

### 4. Media-Led Activity Post

- Media is the largest uninterrupted visual field on the screen.
- Run/activity proof may add a restrained bottom scrim, verified label, title/caption, distance, route trace, and compact metrics.
- Route and metrics appear only when the post includes corresponding activity data.
- The route trace uses chartreuse; remaining overlay text uses warm white and muted neutral text.
- Scrims must preserve image visibility while meeting text contrast requirements.
- Start and finish privacy behavior remains unchanged.

### 5. Generic Media, Video, Text, and Event Posts

- Generic photo posts use the same media-first frame but omit route and activity metrics.
- Videos preserve active-playback and lifecycle behavior; visual treatment matches image posts.
- Text-only posts size naturally to their content and never reserve an empty media block.
- Event posts retain attendance behavior and use a compact inline event module below the post body.
- Captions and descriptions remain below media unless the post has verified activity overlay data designed for the media frame.

### 6. Post Actions and Social Proof

- Keep Cheer, Comment, Share, encouragement, and Save behavior and counts.
- Use consistent outline icons; the selected Cheer uses a filled/active version in chartreuse.
- Do not place every action inside its own pill or outlined button.
- Keep at least 48dp tap areas with 8dp separation between adjacent targets.
- Supporter avatars/text remain a compact secondary row and do not overpower the post.

### 7. Suggested Buddies

- Preserve discovery, profile opening, request submission, busy state, and See all navigation.
- Present suggestions as a slim editorial insert between posts rather than a separate heavy dashboard card.
- Keep four visible candidates on standard phones.
- Avatars remain the main visual; names and location/context stay subordinate.
- Add buttons use chartreuse, include a busy indicator, and remain at least 48dp tappable.

### 8. Bottom Navigation

- Preserve five destinations: Feed, Journey, Run, Messages, and Menu.
- Feed, Journey, Messages, and Menu become visually quieter than the current implementation.
- Selected destination uses chartreuse plus an existing indicator; inactive destinations use muted neutral color.
- Run remains elevated in the approved soft hexagon and retains the current route and behavior.
- Reduce the Run control's dominance enough that it no longer competes with the active post while keeping it unmistakably primary.
- Respect bottom safe-area insets and ensure the feed reserves enough bottom space that content is not obscured.

## Loading and Recovery States

### Loading

- Skeletons match the final post geometry: author row, media area when appropriate, and action row.
- Skeleton colors use existing interaction tokens.
- Loading must not introduce layout jumps when content resolves.

### Offline

- Cached posts remain visible.
- Show a single compact offline notice above the feed rather than a large blocking panel.
- Explain whether saved posts are being shown.

### Inline Error

- Keep feed refresh errors inline and non-blocking.
- State what failed and provide one clear Retry action.
- Do not replace the full feed when cached/current posts can still render.
- This visual pass does not change backend error causes or security policies.

### Empty Feed

- Keep both existing actions: Share a win and Find buddies.
- Use a concise message and quiet icon; avoid a large empty card that creates another dead area.

## Component Boundaries

The implementation must preserve the current responsibilities of the existing components:

- `SocialBrandHeader`: brand and top-level feed utilities
- `StoryRail`: My Day and buddy story presentation
- `FeedProofCard`: all post presentation and post actions
- `FeedBuddyRail`: suggested buddies
- `GlassTabBar` and `CrownDockRunAction`: primary navigation and Run emphasis
- Feed screen `src/app/(app)/index.tsx`: orchestration, list state, routing, and data ownership

Shared visual values should be added to or derived from existing theme/type/icon/motion tokens where repetition appears. Business logic must not move into presentation components as part of this work.

## Data Flow

The data flow remains unchanged:

1. The Feed screen loads, restores, ranks, and paginates posts.
2. The Feed screen determines loading/offline/error/empty state.
3. Existing row builders insert posts, ads, and buddy suggestions.
4. Each presentation component receives its current props and invokes its current callbacks.
5. Existing routes handle post detail, discovery, profiles, create flows, notifications, and sharing.

No new persistence, network requests, server fields, or route transitions are introduced by the visual redesign.

## Interaction and Motion

- Tap feedback begins within 100ms and does not change layout bounds.
- Standard visual transitions use the existing `motion.duration.standard` timing.
- Use opacity or small scale changes only when they communicate press or selection.
- Do not animate list geometry, media height, or navigation bounds.
- Respect reduced-motion settings; no critical information depends on animation.

## Accessibility

- All interactive controls remain at least 48dp in their tappable area.
- Icon-only buttons keep descriptive accessibility labels.
- Reading/focus order follows visual order.
- Primary text meets WCAG AA contrast; secondary/muted text remains legible on every surface.
- State is never conveyed by color alone: labels, icon fill, indicators, or counts accompany chartreuse.
- Dynamic text must not clip author names, metadata, post text, or navigation labels.
- The approved linked-motion logo remains a single accessible brand element without duplicate announcements.

## Validation Plan

### Automated

- Preserve existing Feed, story, buddy suggestion, post action, tab bar, and brand contract tests.
- Add focused visual-contract tests for chartreuse restraint, text-only post sizing, post media hierarchy, story viewed/unseen styling, and Run-control proportions.
- Add accessibility assertions for roles, labels, minimum targets, and selected/busy states where not already covered.
- Run full unit tests, TypeScript checks, and lint.

### Real-device

Validate the staging app on connected device `FY24068108E6` using actual data and screenshots:

- normal media activity post;
- generic photo or video post;
- text-only post;
- suggested buddies row;
- initial loading and pull-to-refresh;
- offline cached state;
- inline refresh error;
- empty feed;
- increased system font size;
- bottom gesture/safe-area behavior.

The final comparison must use connected-phone captures against the approved Editorial Motion target rather than relying on a browser mockup alone.

## Acceptance Criteria

- The dashboard clearly reads as Editorial Motion and matches the approved hierarchy.
- Media/activity proof is the dominant visual element when present.
- No ordinary dashboard surface uses orange or blue brand styling.
- Neon chartreuse appears only in the defined signal states.
- The approved Mantle logo and wordmark remain unchanged.
- All existing dashboard features, links, callbacks, and routes behave as before.
- Text-only posts do not produce blank media areas.
- Feed states are compact, useful, and visually consistent.
- The bottom navigation remains reachable, safe-area aware, and does not obscure feed content.
- The Run action remains elevated and prominent without dominating the entire dashboard.
- No accessibility regression is introduced.
- Automated checks pass and the result is verified on the connected staging phone.
