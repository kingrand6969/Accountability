# Mantle Dashboard Editorial Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Editorial Motion visual system to the real Mantle dashboard while preserving every existing Feed behavior, route, and data flow.

**Architecture:** Keep `src/app/(app)/index.tsx` as the Feed orchestrator and retain the current component boundaries. Restyle the existing brand header, story rail, post canvas, run proof overlay, suggestion/state rows, and bottom dock with the existing semantic theme tokens; add narrow component and source-contract tests before each visual change so no interaction or accessibility contract drifts.

**Tech Stack:** Expo 56, React Native 0.85, Expo Router, TypeScript, React Native SVG, Expo Linear Gradient, Jest 29, React Test Renderer, existing Mantle semantic theme and typography tokens.

---

## Scope lock

This is a presentation-only dashboard change. Do not modify Feed API calls, ranking, pagination, caching, post permissions, database policies, routes, create flows, run recording, sharing behavior, or screen content outside the Feed shell. Do not add a package, font, backend field, migration, or production deployment.

## File map

**Create**

- `src/feed/editorialMotionContract.test.ts` — source-level contract for hierarchy, post ordering, semantic color usage, and compact state treatment.
- `src/ui/CrownDockRunAction.test.tsx` — focused geometry and semantic-color contract for the refined Run control.

**Modify**

- `src/feed/SocialBrandHeader.tsx` — quiet Search/Notifications and chartreuse Create hierarchy.
- `src/feed/SocialBrandHeader.test.tsx` — render-level color and target assertions.
- `src/stories/StoryRail.tsx` — editorial spacing, one divider, and quiet labels.
- `src/stories/StoryRail.test.ts` — visual-source contract for the rail.
- `src/feed/FeedProofCard.tsx` — media-first ordering, post typography, action rail, and stable test identifiers.
- `src/feed/PostImage.tsx` — intentional unresolved-media placeholder.
- `src/feed/PostImage.test.tsx` — placeholder and media behavior tests.
- `src/feed/RunRouteMetricOverlay.tsx` — hero distance hierarchy, neutral scrim, and compact secondary metrics.
- `src/feed/RunRouteMetricOverlay.test.tsx` — hierarchy and large-text tests.
- `src/feed/FeedBuddyRail.tsx` — slimmer editorial suggestion insert.
- `src/feed/FeedBuddyRail.test.tsx` — target size and unboxed-insert assertions.
- `src/app/(app)/index.tsx` — compact skeleton, offline, error, empty, ad, and row-divider styling only.
- `src/feed/feedThemeContract.test.ts` — semantic surface/state assertions.
- `src/ui/CrownDockRunAction.tsx` — reduce the current Run control's dominance while preserving its soft hexagon.
- `src/ui/GlassTabBar.tsx` — quieter inactive navigation typography and icon color.
- `src/ui/GlassTabBar.test.ts` — navigation appearance and behavior contract.

**Do not modify**

- `src/feed/api.ts`, `src/feed/types.ts`, `src/feed/quietFeedRows.ts`, or `src/feed/feedLoadCoordinator.ts`
- `src/app/(app)/_layout.tsx` route definitions
- Supabase migrations or policies
- EAS production profile or production channel

---

### Task 0: Confirm the supported Expo surface and clean baseline

**Files:**

- Read: `AGENTS.md`
- Read: `package.json`
- Read: `https://docs.expo.dev/versions/v56.0.0/`

- [ ] **Step 1: Read the exact Expo 56 documentation before editing code**

Confirm the current component APIs for React Native views, `expo-linear-gradient`, `@expo/vector-icons`, safe areas, and Expo Router. Use only Expo 56 documentation and the versions already present in `package.json`.

- [ ] **Step 2: Run the focused baseline**

Run:

```powershell
npx jest src/feed/SocialBrandHeader.test.tsx src/stories/StoryRail.test.ts src/stories/StoryRail.touchTarget.test.tsx src/feed/FeedProofCard.runOverlayLayout.test.tsx src/feed/PostImage.test.tsx src/feed/RunRouteMetricOverlay.test.tsx src/feed/FeedBuddyRail.test.tsx src/ui/GlassTabBar.test.ts --runInBand
```

Expected: PASS with no snapshot updates.

- [ ] **Step 3: Record the starting device image**

Run:

```powershell
$adb = 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe'
New-Item -ItemType Directory -Force -Path '.release-evidence\editorial-motion-dashboard' | Out-Null
& $adb -s FY24068108E6 shell screencap -p /sdcard/editorial-motion-before.png
& $adb -s FY24068108E6 pull /sdcard/editorial-motion-before.png '.release-evidence\editorial-motion-dashboard\before.png'
```

Expected: `.release-evidence/editorial-motion-dashboard/before.png` exists and shows the current Feed.

---

### Task 1: Make the brand header use neon as a signal

**Files:**

- Modify: `src/feed/SocialBrandHeader.test.tsx`
- Modify: `src/feed/SocialBrandHeader.tsx`

- [ ] **Step 1: Write the failing header hierarchy test**

Replace the Ionicons mock with a testable vector stub and add this test:

```tsx
jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return ({ name, color }: { name: string; color: string }) => (
    <View testID={`header-icon-${name}`} style={{ color }} />
  );
});

test('reserves chartreuse for Create while Search and Notifications stay quiet', () => {
  const theme = jest.requireActual<typeof import('../ui/theme')>('../ui/theme').themeColors('dark');
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <SocialBrandHeader
        unread={0}
        onSearch={jest.fn()}
        onCreate={jest.fn()}
        onNotifications={jest.fn()}
      />,
    );
  });

  expect(StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'header-icon-search-outline' }).props.style,
  ).color).toBe(theme.ink.secondary);
  expect(StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'header-icon-add-circle-outline' }).props.style,
  ).color).toBe(theme.ink.action);
  expect(StyleSheet.flatten(
    renderer.root.findByProps({ testID: 'header-icon-notifications-outline' }).props.style,
  ).color).toBe(theme.ink.secondary);
});
```

Also add `StyleSheet` to the existing React Native test import.

- [ ] **Step 2: Run the header test and verify the signal hierarchy fails**

Run:

```powershell
npx jest src/feed/SocialBrandHeader.test.tsx --runInBand
```

Expected: FAIL because all three icons currently use `theme.ink.action`.

- [ ] **Step 3: Apply the approved header colors and spacing**

Use this exact action mapping in `SocialBrandHeader`:

```tsx
<IconButton
  icon="search-outline"
  accessibilityLabel="Search"
  onPress={onSearch}
  styles={styles}
  color={theme.ink.secondary}
/>
<IconButton
  icon="add-circle-outline"
  accessibilityLabel="Create"
  onPress={onCreate}
  styles={styles}
  color={theme.ink.action}
/>
<View>
  <IconButton
    icon="notifications-outline"
    accessibilityLabel="Notifications"
    onPress={onNotifications}
    styles={styles}
    color={theme.ink.secondary}
  />
  {unread > 0 ? <View style={styles.dot} accessibilityElementsHidden /> : null}
</View>
```

Replace the corresponding style entries with:

```tsx
header: {
  minHeight: 60,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: spacing.lg,
  backgroundColor: theme.surface.canvas,
},
actions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.xs,
},
iconButton: {
  width: spacing.touch,
  height: spacing.touch,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: spacing.touch / 2,
},
pressed: { opacity: 0.68 },
```

- [ ] **Step 4: Run the header tests**

Run:

```powershell
npx jest src/feed/SocialBrandHeader.test.tsx src/feed/feedFirstImpressionDesignContract.test.ts --runInBand
```

Expected: PASS; the canonical Mantle lockup remains unchanged.

- [ ] **Step 5: Commit the header signal hierarchy**

```powershell
git add src/feed/SocialBrandHeader.tsx src/feed/SocialBrandHeader.test.tsx
git commit -m "style(feed): refine dashboard header hierarchy"
```

---

### Task 2: Give My Day an editorial rail rhythm

**Files:**

- Modify: `src/stories/StoryRail.test.ts`
- Modify: `src/stories/StoryRail.tsx`

- [ ] **Step 1: Write the failing rail contract**

Add this helper and test to `StoryRail.test.ts`:

```ts
function styleBlock(name: string): string {
  return source.match(new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? '';
}

test('uses one quiet divider and preserves the 52dp story image', () => {
  expect(source).toContain('const STORY_BUBBLE = 52');
  expect(styleBlock('rail')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  expect(styleBlock('rail')).toContain('borderBottomColor: theme.border.subtle');
  expect(styleBlock('createLabel')).toContain('color: theme.ink.secondary');
  expect(styleBlock('storyName')).toContain('color: theme.ink.muted');
});
```

- [ ] **Step 2: Run the StoryRail contract and verify it fails**

Run:

```powershell
npx jest src/stories/StoryRail.test.ts --runInBand
```

Expected: FAIL because the rail has no divider and My Day uses muted ink.

- [ ] **Step 3: Apply the editorial rail styles**

Replace the affected styles with:

```tsx
rail: {
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xs,
  paddingBottom: spacing.md,
  gap: spacing.md,
  backgroundColor: theme.surface.canvas,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: theme.border.subtle,
},
storyName: {
  marginTop: 4,
  width: '100%',
  color: theme.ink.muted,
  fontFamily: font.medium,
  fontSize: 10,
  lineHeight: 14,
  textAlign: 'center',
},
createLabel: {
  marginTop: 4,
  width: '100%',
  color: theme.ink.secondary,
  fontFamily: font.semibold,
  fontSize: 10,
  lineHeight: 14,
  textAlign: 'center',
},
```

Keep `storyBubbleRingViewed` neutral and use `spacing.touch` (48dp) for the add target around its unchanged 22dp visual.

- [ ] **Step 4: Run the story behavior, scale, and target tests**

Run:

```powershell
npx jest src/stories/StoryRail.test.ts src/stories/StoryRail.touchTarget.test.tsx src/stories/StoryRail.navigation.test.tsx --runInBand
```

Expected: PASS with the picker, navigation, viewed state, retry, large text, and 48dp/`spacing.touch` target contracts intact.

- [ ] **Step 5: Commit the rail**

```powershell
git add src/stories/StoryRail.tsx src/stories/StoryRail.test.ts
git commit -m "style(feed): compose editorial story rail"
```

---

### Task 3: Build the media-first post canvas and intentional media fallback

**Files:**

- Create: `src/feed/editorialMotionContract.test.ts`
- Modify: `src/feed/FeedProofCard.tsx`
- Modify: `src/feed/PostImage.tsx`
- Modify: `src/feed/PostImage.test.tsx`

- [ ] **Step 1: Write the failing Editorial Motion source contract**

Create `src/feed/editorialMotionContract.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const proof = readFileSync(require.resolve('./FeedProofCard'), 'utf8');
const postImage = readFileSync(require.resolve('./PostImage'), 'utf8');

function styleBlock(source: string, name: string): string {
  return source.match(new RegExp(`${name}:\\s*\\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? '';
}

describe('Editorial Motion post canvas', () => {
  test('places generic media before its caption while text-only posts remain natural height', () => {
    expect(proof.indexOf('testID="feed-post-media"'))
      .toBeLessThan(proof.indexOf('testID="feed-post-body"'));
    expect(proof).toContain('{post.image_url ? (');
    expect(proof).toContain("{post.body && post.post_type !== 'run' ? (");
    expect(styleBlock(proof, 'body')).not.toContain('minHeight');
  });

  test('keeps actions unboxed and separates them with one hairline', () => {
    expect(styleBlock(proof, 'actions')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
    expect(styleBlock(proof, 'action')).not.toContain('backgroundColor');
    expect(styleBlock(proof, 'action')).not.toContain('borderWidth');
  });

  test('uses an intentional unresolved-media placeholder instead of a dead blank block', () => {
    expect(postImage).toContain('testID="post-image-placeholder"');
    expect(postImage).toContain('name="image-outline"');
    expect(styleBlock(postImage, 'privatePlaceholder')).toContain('alignItems: \'center\'');
    expect(styleBlock(postImage, 'privatePlaceholder')).toContain('justifyContent: \'center\'');
  });
});
```

- [ ] **Step 2: Run the contract and verify it fails**

Run:

```powershell
npx jest src/feed/editorialMotionContract.test.ts --runInBand
```

Expected: FAIL because post identifiers, media-first ordering, the action divider, and the intentional placeholder do not exist yet.

- [ ] **Step 3: Move the generic caption below media and add stable identifiers**

In `FeedProofCard.tsx`, remove the current pre-media body block. Add `testID="feed-post-media"` to the existing media `Pressable`, then render this block immediately after the media conditional and before the event block:

```tsx
{post.body && post.post_type !== 'run' ? (
  <Pressable
    onPress={onOpen}
    accessibilityRole="link"
    accessibilityLabel="Open post"
  >
    <Text testID="feed-post-body" style={styles.body}>{post.body}</Text>
  </Pressable>
) : null}
```

Use these style replacements:

```tsx
authorHeader: {
  minHeight: 60,
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  backgroundColor: theme.surface.canvas,
},
author: {
  color: theme.ink.primary,
  fontFamily: font.bold,
  fontSize: 15,
},
time: {
  color: theme.ink.muted,
  fontFamily: font.medium,
  fontSize: 11,
},
body: {
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.md,
  color: theme.ink.primary,
  fontFamily: font.regular,
  fontSize: 14,
  lineHeight: 20,
},
actions: {
  minHeight: spacing.touch,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: spacing.md,
  backgroundColor: theme.surface.canvas,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: theme.border.subtle,
},
```

Do not add a fixed media height; `PostImage` continues to use the real image ratio capped at 4:5.

- [ ] **Step 4: Render an intentional unresolved-media placeholder**

Replace the unresolved branch in `PostImage.tsx` with:

```tsx
<View
  testID="post-image-placeholder"
  style={[
    styles.privatePlaceholder,
    immersive && styles.immersivePlaceholder,
    { aspectRatio: shown },
  ]}
>
  {!immersive ? (
    <Ionicons name="image-outline" size={26} color={colors.textMuted} />
  ) : null}
</View>
```

Replace `privatePlaceholder` with:

```tsx
privatePlaceholder: {
  width: '100%',
  borderRadius: radius.sm,
  backgroundColor: colors.surface,
  alignItems: 'center',
  justifyContent: 'center',
},
```

- [ ] **Step 5: Add the placeholder render test**

In `PostImage.test.tsx`, replace the hook mock with a mutable value and add the test:

```tsx
let mockResolvedImageUrl: string | null = 'photo.jpg';

jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: () => mockResolvedImageUrl,
}));

beforeEach(() => {
  mockResolvedImageUrl = 'photo.jpg';
  jest.clearAllMocks();
});

test('shows a composed placeholder while private media resolves', () => {
  mockResolvedImageUrl = null;
  let renderer!: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(<PostImage url="private:pending" capTall />);
  });

  expect(renderer.root.findByProps({ testID: 'post-image-placeholder' })).toBeTruthy();
  expect(CachedImage).not.toHaveBeenCalled();
});
```

- [ ] **Step 6: Run the post tests**

Run:

```powershell
npx jest src/feed/editorialMotionContract.test.ts src/feed/PostImage.test.tsx src/feed/FeedProofCard.runOverlayLayout.test.tsx --runInBand
```

Expected: PASS; run posts still render one image and one route overlay, generic captions follow media, and text-only posts allocate no media wrapper.

- [ ] **Step 7: Commit the post canvas**

```powershell
git add src/feed/editorialMotionContract.test.ts src/feed/FeedProofCard.tsx src/feed/PostImage.tsx src/feed/PostImage.test.tsx
git commit -m "style(feed): establish media-first post canvas"
```

---

### Task 4: Recompose verified run proof as editorial data

**Files:**

- Modify: `src/feed/RunRouteMetricOverlay.test.tsx`
- Modify: `src/feed/RunRouteMetricOverlay.tsx`

- [ ] **Step 1: Write the failing metric-hierarchy assertions**

Add these assertions to the normal-scale test in `RunRouteMetricOverlay.test.tsx`:

```tsx
const distanceStyle = StyleSheet.flatten(
  renderer.root.findByProps({ testID: 'run-route-metric-value-km' }).props.style,
);
const timeStyle = StyleSheet.flatten(
  renderer.root.findByProps({ testID: 'run-route-metric-value-time' }).props.style,
);

expect(distanceStyle.fontSize).toBe(42);
expect(distanceStyle.fontVariant).toContain('tabular-nums');
expect(timeStyle.fontSize).toBe(18);
expect(renderer.root.findByProps({ testID: 'run-overlay-gradient' }).props.colors)
  .toEqual(['transparent', 'rgba(11,13,11,.92)']);
```

- [ ] **Step 2: Run the overlay tests and verify they fail**

Run:

```powershell
npx jest src/feed/RunRouteMetricOverlay.test.tsx src/feed/FeedProofCard.runOverlayLayout.test.tsx --runInBand
```

Expected: FAIL because metric values have no identifiers, all values are 20dp, and the scrim is blue-black.

- [ ] **Step 3: Add the primary distance role and neutral Mantle scrim**

Replace the normal metric row and `Metric` function with:

```tsx
<LinearGradient
  colors={['transparent', 'rgba(11,13,11,.92)']}
  style={StyleSheet.absoluteFill}
/>
<View testID="run-route-metrics" style={[styles.stats, isLargeText && styles.statsLarge]}>
  <Metric value={formatKm(distance)} label="km" primary largeText={isLargeText} />
  <Metric value={formatDuration(duration)} label="time" largeText={isLargeText} />
  <Metric value={formatPace(distance, duration)} label="pace /km" largeText={isLargeText} />
</View>

function Metric({
  value,
  label,
  primary = false,
  largeText,
}: {
  value: string;
  label: string;
  primary?: boolean;
  largeText: boolean;
}) {
  return (
    <View
      testID={`run-route-metric-${label}`}
      style={[styles.metric, primary && styles.primaryMetric, largeText && styles.metricLarge]}
    >
      <Text
        testID={`run-route-metric-value-${label}`}
        style={[styles.value, primary && styles.primaryValue]}
      >
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}
```

Import `type` from `../ui/theme`, then use these value styles:

```tsx
primaryMetric: { minWidth: 96 },
value: {
  ...type.metric,
  color: '#FFFFFF',
  fontFamily: font.extrabold,
  fontSize: 18,
  lineHeight: 22,
},
primaryValue: {
  ...type.heroMetric,
  color: '#FFFFFF',
  fontFamily: font.display,
  fontSize: 42,
  lineHeight: 44,
  letterSpacing: -1.2,
},
```

Keep the existing large-text column layout and `RUN_ROUTE_LARGE_OVERLAY_HEIGHT` so 2× system text remains fully visible.

- [ ] **Step 4: Run the run proof tests**

Run:

```powershell
npx jest src/feed/RunRouteMetricOverlay.test.tsx src/feed/FeedProofCard.runOverlayLayout.test.tsx --runInBand
```

Expected: PASS at 320dp and 360dp widths for font scales 1 and 2.

- [ ] **Step 5: Commit the run proof hierarchy**

```powershell
git add src/feed/RunRouteMetricOverlay.tsx src/feed/RunRouteMetricOverlay.test.tsx
git commit -m "style(feed): elevate verified run proof"
```

---

### Task 5: Refine suggestions and dashboard recovery states

**Files:**

- Modify: `src/feed/FeedBuddyRail.test.tsx`
- Modify: `src/feed/FeedBuddyRail.tsx`
- Modify: `src/feed/feedThemeContract.test.ts`
- Modify: `src/app/(app)/index.tsx`

- [ ] **Step 1: Write the failing buddy-insert assertions**

Replace the existing 32×32 visual assertion inside `resolves each add action` with:

```tsx
expect(visualStyle).toEqual(expect.objectContaining({
  width: 28,
  height: 28,
  borderRadius: 14,
}));
```

Add this test:

```tsx
test('uses quiet labels and no standalone card surface', () => {
  const { renderer } = renderRail();
  const root = renderer.root.findByProps({ testID: 'feed-buddy-rail' });
  const style = StyleSheet.flatten(root.props.style);

  expect(style.backgroundColor).toBe(themeColors('dark').surface.canvas);
  expect(style.borderWidth).toBeUndefined();
  expect(style.borderRadius).toBeUndefined();
  expect(style.elevation).toBeUndefined();
});
```

Add `themeColors` to the test imports.

- [ ] **Step 2: Add failing Feed state contracts**

Add these assertions to `feedThemeContract.test.ts` using its existing `styleBlock` helper:

```ts
test('keeps dashboard recovery states compact and editorial', () => {
  expect(styleBlock(feedSource, 'offlineNotice')).toContain('minHeight: 40');
  expect(styleBlock(feedSource, 'offlineNotice')).toContain('borderBottomWidth: StyleSheet.hairlineWidth');
  expect(styleBlock(feedSource, 'inlineError')).toContain('marginHorizontal: spacing.lg');
  expect(styleBlock(feedSource, 'inlineError')).toContain('borderRadius: radius.md');
  expect(styleBlock(feedSource, 'feedDivider')).toContain('marginHorizontal: spacing.lg');
  expect(styleBlock(feedSource, 'emptyCard')).not.toContain('borderWidth');
});
```

- [ ] **Step 3: Run the tests and verify both fail**

Run:

```powershell
npx jest src/feed/FeedBuddyRail.test.tsx src/feed/feedThemeContract.test.ts --runInBand
```

Expected: FAIL because the add visual is 32dp and the Feed states do not yet use the approved compact framing.

- [ ] **Step 4: Apply the suggestion insert styles**

Replace the affected `FeedBuddyRail` styles with:

```tsx
section: {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  backgroundColor: theme.surface.canvas,
},
heading: {
  fontFamily: font.bold,
  fontSize: 13,
  color: theme.ink.primary,
},
seeAllText: {
  fontFamily: font.semibold,
  fontSize: 11,
  color: theme.ink.action,
},
addVisual: {
  width: 28,
  height: 28,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.ink.action,
},
```

Use `spacing.touch` (48dp) for the Add and See all targets while preserving the 28dp Add visual, four-person limit, callbacks, and busy/disabled semantics.

- [ ] **Step 5: Apply compact Feed-state styles**

Replace the relevant styles in `src/app/(app)/index.tsx` with:

```tsx
offlineNotice: {
  minHeight: 40,
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  backgroundColor: theme.surface.canvas,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: theme.border.subtle,
},
inlineError: {
  minHeight: 58,
  marginHorizontal: spacing.lg,
  marginVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  flexDirection: 'row',
  alignItems: 'center',
  gap: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: theme.status.dangerSoft,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: theme.border.danger,
},
feedDivider: {
  height: StyleSheet.hairlineWidth,
  marginHorizontal: spacing.lg,
  backgroundColor: theme.border.subtle,
},
skeletonCard: {
  backgroundColor: theme.surface.canvas,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: theme.border.subtle,
},
emptyCard: {
  alignItems: 'center',
  gap: spacing.sm,
  paddingHorizontal: spacing.xxl,
  paddingVertical: spacing.section,
  backgroundColor: theme.surface.canvas,
},
```

Do not change `feedHeader`, `FlatList` props, row composition, retry callback, or empty-state routes.

- [ ] **Step 6: Run Feed state and suggestion tests**

Run:

```powershell
npx jest src/feed/FeedBuddyRail.test.tsx src/feed/feedThemeContract.test.ts src/feed/quietFeedRows.test.ts src/feed/socialScreenContract.test.ts --runInBand
```

Expected: PASS; suggestions remain after the first post, ad cadence is unchanged, Retry calls the existing loader, and Find buddies still routes to `/discover`.

- [ ] **Step 7: Commit state presentation**

```powershell
git add src/feed/FeedBuddyRail.tsx src/feed/FeedBuddyRail.test.tsx src/feed/feedThemeContract.test.ts 'src/app/(app)/index.tsx'
git commit -m "style(feed): refine suggestions and recovery states"
```

---

### Task 6: Quiet the dock and refine the elevated Run hexagon

**Files:**

- Create: `src/ui/CrownDockRunAction.test.tsx`
- Modify: `src/ui/CrownDockRunAction.tsx`
- Modify: `src/ui/GlassTabBar.tsx`
- Modify: `src/ui/GlassTabBar.test.ts`

- [ ] **Step 1: Write the failing Run geometry test**

Create `src/ui/CrownDockRunAction.test.tsx`:

```tsx
import React from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, jest, test } from '@jest/globals';

import { CrownDockRunAction } from './CrownDockRunAction';
import { themeColors } from './theme';

jest.mock('./AppThemeProvider', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual<typeof import('./theme')>('./theme').themeColors('dark'),
  }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-svg', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => <View testID="run-hex-svg" {...props} />,
    Path: (props: Record<string, unknown>) => <View {...props} />,
  };
});

test('keeps the soft hex prominent without overpowering the dashboard', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<CrownDockRunAction focused={false} />);
  });

  const root = renderer.root.findByProps({ testID: 'crown-dock-run' });
  const svg = renderer.root.findByProps({ testID: 'run-hex-svg' });
  const style = StyleSheet.flatten(root.props.style);

  expect(style).toEqual(expect.objectContaining({ width: 80, height: 88, top: -24 }));
  expect(svg.props.width).toBe(76);
  expect(svg.props.height).toBe(80);
  expect(themeColors('dark').ink.action).toBe('#B9FF3D');
});
```

- [ ] **Step 2: Add failing quiet-label assertions to GlassTabBar**

In `GlassTabBar.test.ts`, import `StyleSheet` and add:

```tsx
it('uses compact editorial labels without changing accessible tab names', () => {
  const { renderer } = renderTabBar({ focusedIndex: 0 });
  const label = renderer.root.findByProps({ testID: 'tab-label-Feed' });
  const style = StyleSheet.flatten(label.props.style);

  expect(style.fontSize).toBe(11);
  expect(style.lineHeight).toBe(14);
  expect(pressableByLabel(renderer, 'Feed').props.accessibilityLabel).toBe('Feed');
});
```

- [ ] **Step 3: Run the dock tests and verify they fail**

Run:

```powershell
npx jest src/ui/CrownDockRunAction.test.tsx src/ui/GlassTabBar.test.ts --runInBand
```

Expected: FAIL because the Run control is currently 92×100 with an 88×92 SVG and labels use the larger caption role.

- [ ] **Step 4: Reduce only the Run visual bounds**

Keep the existing SVG paths and replace the dimensions/styles in `CrownDockRunAction.tsx` with:

```tsx
<Svg
  width={76}
  height={80}
  viewBox="0 0 88 92"
  style={styles.hex}
>
```

```tsx
root: {
  position: 'absolute',
  top: -24,
  width: 80,
  height: 88,
  alignItems: 'center',
  justifyContent: 'flex-start',
  zIndex: 4,
  elevation: 12,
},
glow: {
  position: 'absolute',
  left: 16,
  right: 16,
  bottom: 2,
  height: 16,
  borderRadius: 999,
  transform: [{ scaleX: 1.18 }],
},
highlight: {
  position: 'absolute',
  top: 10,
  width: 38,
  height: 1,
  borderRadius: 999,
  backgroundColor: 'rgba(255,255,255,0.28)',
},
icon: {
  position: 'absolute',
  top: 23,
},
```

Change the Ionicon size from `38` to `31`. Preserve `pointerEvents="none"`, the focused glow difference, and the existing test ID.

- [ ] **Step 5: Use compact dock typography**

Replace the `label` style in `GlassTabBar.tsx` with:

```tsx
label: {
  fontFamily: font.medium,
  fontSize: 11,
  lineHeight: 14,
  textAlign: 'center',
  flexShrink: 1,
},
```

Import `font` from `./theme`. Keep the existing dynamic compact labels, selected indicator, route handling, tab prevention, haptics, safe-area padding, and 48dp target styles.

- [ ] **Step 6: Run dock behavior and accessibility tests**

Run:

```powershell
npx jest src/ui/CrownDockRunAction.test.tsx src/ui/GlassTabBar.test.ts --runInBand
```

Expected: PASS; Run still opens `run`, the other four destinations remain unchanged, and every target stays at least 48dp.

- [ ] **Step 7: Commit the dock**

```powershell
git add src/ui/CrownDockRunAction.tsx src/ui/CrownDockRunAction.test.tsx src/ui/GlassTabBar.tsx src/ui/GlassTabBar.test.ts
git commit -m "style(navigation): balance the editorial dock"
```

---

### Task 7: Run complete validation and put the approved dashboard on staging

**Files:**

- Modify only when a failing check identifies a dashboard regression: files listed in Tasks 1–6
- Create evidence under ignored path: `.release-evidence/editorial-motion-dashboard/`

- [ ] **Step 1: Run the complete focused dashboard suite**

Run:

```powershell
npx jest src/feed/SocialBrandHeader.test.tsx src/feed/feedFirstImpressionDesignContract.test.ts src/stories/StoryRail.test.ts src/stories/StoryRail.touchTarget.test.tsx src/stories/StoryRail.navigation.test.tsx src/feed/editorialMotionContract.test.ts src/feed/FeedProofCard.runOverlayLayout.test.tsx src/feed/PostImage.test.tsx src/feed/RunRouteMetricOverlay.test.tsx src/feed/FeedBuddyRail.test.tsx src/feed/feedThemeContract.test.ts src/feed/quietFeedRows.test.ts src/feed/socialScreenContract.test.ts src/ui/CrownDockRunAction.test.tsx src/ui/GlassTabBar.test.ts --runInBand
```

Expected: PASS with no snapshot updates.

- [ ] **Step 2: Run full static and unit validation**

Run:

```powershell
npx tsc --noEmit
npm run lint
npm test -- --runInBand
```

Expected: TypeScript exits 0; lint has 0 errors; the complete Jest suite passes.

- [ ] **Step 3: Publish only to the staging preview channel**

Run from `accountability-app`:

```powershell
$env:APP_VARIANT = 'staging'
$env:EAS_NO_VCS = '1'
$config = npx expo config --type public --json | ConvertFrom-Json
$identityMatches =
  $config.name -eq 'Mantle Staging' -and
  $config.scheme -eq 'accountabilityapp-staging' -and
  $config.android.package -eq 'com.awldesk.accountability.staging' -and
  $config.ios.bundleIdentifier -eq 'com.awldesk.accountability.staging' -and
  $config.extra.appVariant -eq 'preview'
if (-not $identityMatches) { throw 'Refusing preview publish: resolved Expo identity is not staging.' }
npx eas-cli@latest update --channel preview --environment preview --platform android --message "Editorial Motion dashboard"
```

Expected: the preflight resolves the complete staging identity and a successful
update is published for project `f91c0791-4a6e-4080-88fd-5cc9a4e720bf` on
channel/environment `preview`. The remote `preview` environment must also have
project-scoped plain-text `APP_VARIANT=staging`. Do not use or modify the
production environment, profile, or channel.

- [ ] **Step 4: Restart the installed staging app without clearing data**

Run:

```powershell
$adb = 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe'
& $adb -s FY24068108E6 shell am force-stop com.awldesk.accountability.staging
& $adb -s FY24068108E6 shell monkey -p com.awldesk.accountability.staging -c android.intent.category.LAUNCHER 1
```

Expected: Mantle Staging opens with the user's existing session and app data intact.

- [ ] **Step 5: Verify the real dashboard states**

On device `FY24068108E6`, confirm:

1. The approved linked-motion mark and wordmark are unchanged.
2. Search and Notifications are quiet; Create alone is chartreuse.
3. My Day uses unseen/viewed rings and one divider.
4. Media precedes generic captions and text-only posts have no media gap.
5. Verified runs show hero distance, neutral scrim, route, time, and pace.
6. Cheer, Comment, Share, Save, and overflow still respond.
7. Suggested buddy Add and See all still work; See all opens `/discover`.
8. Offline, inline error, loading, and empty states are compact.
9. Feed, Journey, Run, Messages, and Menu still navigate correctly.
10. The Run soft hexagon remains elevated but no longer dominates the post.

- [ ] **Step 6: Capture final connected-phone evidence**

Run:

```powershell
$adb = 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe'
& $adb -s FY24068108E6 shell screencap -p /sdcard/editorial-motion-after.png
& $adb -s FY24068108E6 pull /sdcard/editorial-motion-after.png '.release-evidence\editorial-motion-dashboard\after.png'
& $adb -s FY24068108E6 shell uiautomator dump /sdcard/editorial-motion-after.xml
& $adb -s FY24068108E6 pull /sdcard/editorial-motion-after.xml '.release-evidence\editorial-motion-dashboard\after.xml'
```

Expected: `after.png` visually matches the approved Editorial Motion composition, and `after.xml` exposes the existing accessible controls and labels.

- [ ] **Step 7: Commit verification-only fixes, if the device check required a correction**

When Step 5 identifies a visual regression, add only the exact corrected dashboard files and commit:

```powershell
git add src/feed/SocialBrandHeader.tsx src/feed/SocialBrandHeader.test.tsx src/stories/StoryRail.tsx src/stories/StoryRail.test.ts src/feed/editorialMotionContract.test.ts src/feed/FeedProofCard.tsx src/feed/PostImage.tsx src/feed/PostImage.test.tsx src/feed/RunRouteMetricOverlay.tsx src/feed/RunRouteMetricOverlay.test.tsx src/feed/FeedBuddyRail.tsx src/feed/FeedBuddyRail.test.tsx src/feed/feedThemeContract.test.ts src/ui/CrownDockRunAction.tsx src/ui/CrownDockRunAction.test.tsx src/ui/GlassTabBar.tsx src/ui/GlassTabBar.test.ts 'src/app/(app)/index.tsx'
git commit -m "fix(feed): match approved editorial dashboard"
```

When Step 5 requires no correction, do not create an empty commit.
