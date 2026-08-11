# Fitness Community Feed Design

Date: 2026-08-12
Status: Approved product direction

## Product goal

Make AccountAbility feel like the social home for fitness: the community usefulness of Facebook, the visual polish of Instagram, and the energy of TikTok, without copying any one product. The Feed must help people record progress, receive support, find relevant people, and join activities that genuinely apply to them.

## Design principles

1. Personal progress comes before discovery.
2. Fitness media and results should feel energetic without turning every screen into a video feed.
3. Every recommendation must explain why it is shown.
4. Community content must be relevant, not promotional filler.
5. Privacy is controlled by the account owner at both category and individual-post levels.
6. Light and Dark Modes have identical structure and behavior.

## Feed structure

The Feed uses one vertically scrolling mixed-content stream. Its opening order is:

1. Header with AccountAbility identity, Search, Create, and Notifications.
2. Compact progress composer.
3. Horizontal My Day rail using portrait cards.
4. Personal and buddy fitness posts.
5. Relevant community and discovery modules inserted deeper in the stream.

The Feed does not use Buddies/Discover mode selectors. Broad discovery remains available through Discover in the Menu.

### Composer

The composer is a single compact row with the user's avatar, “Share today’s progress…” prompt, and media shortcut. It replaces the current large multi-row creation card. The existing Create flow remains accessible through both the composer and header Create action.

### My Day

Every My Day item is a vertical portrait card. The current user's card appears first and includes a clear “Add to My Day” action. Buddy cards show a media preview, profile identity, name, and viewed/unseen treatment. All users use the same card dimensions so the rail reads as one coherent story system.

## Post presentation

Posts use a polished mixed-media layout rather than forcing every content type into an identical generic card.

- Header: avatar, owner name, timestamp, audience, and overflow menu.
- Caption: concise text above the media when present.
- Fitness media: photo or video with relevant workout data integrated into the lower media region.
- Metrics: Cheer and Comment summaries below media.
- Actions: Cheer, Comment, Share, and Save in four equal touch areas.

Workout posts may show duration, distance, pace, calories, exercises, personal bests, or other relevant metrics. Ordinary text/photo posts omit irrelevant fitness fields.

Tall screenshots and unusually shaped media use a bounded preview rather than uncontrolled cropping or zoom. Users can open media to view it at its natural aspect ratio.

## Post actions and icons

The action bar uses one professional, optically consistent icon family.

- Default actions use outline icons.
- Cheer becomes a filled blue clapping-hands icon after selection.
- Save becomes a filled blue bookmark after selection.
- Comment and Share remain outlined because they are momentary actions.
- Cheer and Comment counts render only when greater than zero.
- Every action has a minimum 48 by 48 point touch target.
- Screen-reader labels communicate action, state, and positive counts.
- Failed mutations restore the prior state and provide a retry path.

Light and Dark Modes use the same icon geometry with theme-appropriate colors.

## Relevant community content

Community content appears in the Feed only when it has a direct reason to matter to the viewer.

### Challenges

A challenge may appear when at least one condition is true:

- The viewer created the challenge.
- The viewer received a direct invitation.
- The viewer is specifically eligible because of a meaningful relationship, group, goal, location, or declared fitness interest.

The card must state why it appears, such as “Invited by Jamie” or “For members of Perth Runners.” Generic challenge promotion stays in Discover.

### Suggested people, groups, and pages

Suggestions appear sparingly after personal content and always include a reason, such as mutual buddies, shared groups, shared interests, or relevant activity. Suggestions must obey blocks, moderation, privacy, and current account identity boundaries.

## Navigation

The bottom navigation has five permanent destinations in this order:

1. Feed
2. Journey
3. Run
4. Messages
5. Menu

Menu uses a hamburger/list icon and sits immediately after Messages. Moving Menu to the bottom removes the need for a top-left hamburger button and keeps the Feed header focused.

## Appearance

The product offers two manually selected themes:

- Light Mode, the default for new users.
- Dark Mode, an optional energetic treatment.

There is no System theme option and no Light/Dark badge displayed in the Feed. Theme selection lives at Menu → Options → Appearance. The app persists the user's selection. Both modes must style every Feed surface, overlay, menu, comment view, post detail, loading state, and error state consistently.

## Buddy Card profile

Buddy Card is AccountAbility's primary profile view. Opening a person from the Feed, comments, Messages, Discover, rankings, groups, pages, or challenges leads to that person's Buddy Card.

The Buddy Card may display:

- Profile identity and biography.
- Rank and badges.
- Achievements.
- Fitness and accountability summaries.
- Owner-approved posts.
- Other information explicitly permitted by the account owner.

### Post visibility controls

Owners control Buddy Card content through both category defaults and per-post overrides.

- Category defaults can automatically include approved content types such as runs or achievements.
- Each post retains an explicit “Show on Buddy Card” control.
- The per-post override wins over the category default.
- The owner's own Buddy Card includes preview and editing controls.
- Visitors receive only the final owner-approved projection, never raw private data filtered solely in the client.

## Loading, empty, and error states

- Returning from a post preserves the existing Feed instead of replacing it with a blocking refresh.
- Initial loading uses lightweight skeletons matching the final layout.
- Pagination retains visible content while loading more.
- An empty Feed explains the state and offers relevant actions without inserting unrelated recommendations.
- Network failures keep successfully loaded content visible and provide retry.
- Account changes invalidate stale Feed, My Day, recommendation, and mutation results.
- Theme changes do not reset scroll position or reload Feed data.

## Accessibility

- Interactive targets are at least 48 by 48 points.
- Text and icons meet contrast requirements in both themes.
- My Day cards communicate owner and viewed status without relying only on color.
- Selected Cheer and Save states are announced.
- Community cards expose their relevance reason to assistive technology.
- Dynamic loading and error messages are announced without stealing focus.

## Testing and acceptance criteria

The implementation requires behavioral and presentation coverage for:

- Vertical My Day cards for the current user and buddies.
- Stable Feed order and preserved scroll state.
- Relevant-only challenge insertion and visible relevance explanations.
- Explained people/group/page suggestions.
- Outline-to-filled Cheer and Save states.
- Positive-only visible and spoken counts.
- Five-item bottom navigation with Menu after Messages.
- Light default and persisted manual Dark selection.
- Absence of theme badges and System theme selection.
- Buddy Card category defaults and per-post override precedence.
- Privacy enforcement before data reaches unauthorized viewers.
- Account-switch, stale request, loading, empty, retry, and offline behavior.
- Keyboard-safe comments and correct media aspect-ratio handling.

Physical Android verification must cover Feed scrolling, My Day interaction, post opening/back navigation, comments with the keyboard open, theme switching, Menu access, and Buddy Card privacy outcomes.

## Non-goals

- Copying Facebook, Instagram, or TikTok layouts or branding.
- Turning the main Feed into a full-screen video-only experience.
- Showing generic challenges merely to fill space.
- Replacing current moderation, blocking, reporting, subscriptions, or messaging behavior.
- Exposing private Buddy Card information and relying on client-side filtering for safety.

