# Dark-Only Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every AccountAbility-owned screen and overlay to the approved charcoal/black and neon-green visual system, permanently ignoring the phone's light appearance while preserving feature behavior and user data.

**Architecture:** Make the theme provider and legacy color compatibility layer dark-only first, then remove the appearance selector and migrate feature palettes in bounded screen groups. Shared semantic tokens remain the only source of app chrome colors; media, maps, route art, avatars, and user-selected backgrounds retain natural colors. Each group is protected by focused theme or appearance tests before the next group begins.

**Tech Stack:** Expo SDK 56, React Native 0.85, Expo Router, TypeScript, Jest with `jest-expo`, React Test Renderer, EAS preview builds, Android `adb` device verification.

---

## File responsibility map

- `src/ui/theme.ts`: authoritative dark semantic tokens plus dark-compatible legacy aliases.
- `src/ui/AppThemeProvider.tsx`: permanent dark context and native appearance synchronization.
- `src/app/_layout.tsx` and `app.json`: system bars, splash, navigation canvas, and native dark declaration.
- `src/app/menu.tsx`: menu content after the appearance selector is removed.
- `src/ui/*`: shared controls, authentication shell, launch state, dialogs, sheets, and tab surfaces.
- `src/app/**`, `src/feed/**`, `src/journey/**`, `src/activity/**`, and feature folders: feature-specific palettes and light-only islands.
- Existing `*AppearanceContract.test.ts`, `*appearance.test.tsx`, and provider tests: focused regression protection for each migration batch.
- `.release-evidence/dark-only-visual-system/`: final phone screenshots and accessibility trees; APKs remain build artifacts and are not committed.

### Task 1: Lock the theme foundation to dark

**Files:**
- Modify: `src/ui/AppThemeProvider.tsx`
- Modify: `src/ui/AppThemeProvider.test.tsx`
- Modify: `src/ui/theme.ts`
- Modify: `src/ui/theme.test.ts`

- [ ] **Step 1: Replace manual-theme tests with failing dark-only behavior tests**

Use a real provider consumer and assert that a light request cannot change the observable context:

```tsx
function Probe() {
  const { colors, mode, setMode } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel="Request light"
      onPress={() => setMode('light')}
    >
      <Text>{`${mode}:${colors.surface.canvas}:${colors.ink.action}`}</Text>
    </Pressable>
  );
}

test('always exposes the approved dark system and ignores light requests', () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <AppThemeProvider><Probe /></AppThemeProvider>,
    );
  });
  const control = renderer.root.findByProps({ accessibilityLabel: 'Request light' });
  expect(renderer.root.findByType(Text).props.children).toBe('dark:#0B0D0B:#B9FF3D');
  act(() => control.props.onPress());
  expect(renderer.root.findByType(Text).props.children).toBe('dark:#0B0D0B:#B9FF3D');
  expect(mockedStorage.getItem).not.toHaveBeenCalled();
  expect(mockedStorage.setItem).not.toHaveBeenCalled();
});
```

Update `src/ui/theme.test.ts` to assert `resolveAppThemeMode('light') === 'dark'`, `resolveAppThemeMode(null) === 'dark'`, and `themeColors('light') === themeColors('dark')`.

- [ ] **Step 2: Run the focused tests and confirm the current manual theme fails**

Run:

```powershell
npm test -- --runInBand src/ui/AppThemeProvider.test.tsx src/ui/theme.test.ts
```

Expected: FAIL because the provider initially renders light, hydrates storage, and accepts `setMode('light')`.

- [ ] **Step 3: Implement the permanent dark provider and compatibility aliases**

Replace provider state and storage hydration with a stable context:

```tsx
const DARK_MODE: AppThemeMode = 'dark';
const DARK_COLORS = themeColors(DARK_MODE);
const keepDark = (_mode: AppThemeMode) => undefined;

export function AppThemeProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    syncNativeColorScheme(DARK_MODE);
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({ mode: DARK_MODE, colors: DARK_COLORS, setMode: keepDark }),
    [],
  );
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}
```

Remove `AsyncStorage`, `APP_THEME_STORAGE_KEY`, hydration revisions, and appearance state. Keep the `setMode` property temporarily for test and component compatibility, but make it a no-op.

In `src/ui/theme.ts`, make both compatibility entry points resolve to dark:

```ts
export function resolveAppThemeMode(_value: unknown): AppThemeMode {
  return 'dark';
}

export function themeColors(_mode: AppThemeMode): AppThemeColors {
  return darkSemanticColors;
}
```

Remap legacy `colors.background`, `card`, `surface`, `surfaceAlt`, `text`, `textSecondary`, `textMuted`, `textFaint`, `border`, `primaryDark`, `primarySoft`, `cream`, `navy`, and `onPrimary` to the approved dark roles so direct legacy imports cannot create white islands.

- [ ] **Step 4: Re-run foundation tests**

Run:

```powershell
npm test -- --runInBand src/ui/AppThemeProvider.test.tsx src/ui/theme.test.ts
npx tsc --noEmit
```

Expected: all selected tests PASS and TypeScript reports no errors.

- [ ] **Step 5: Commit the foundation**

```powershell
git add src/ui/AppThemeProvider.tsx src/ui/AppThemeProvider.test.tsx src/ui/theme.ts src/ui/theme.test.ts
git commit -m "feat(theme): lock app to dark visual system"
```

### Task 2: Darken native chrome and remove the appearance control

**Files:**
- Modify: `app.json`
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(app)/_layout.tsx`
- Modify: `src/app/menu.tsx`
- Modify: `src/navigation/authOnboardingAppearanceContract.test.ts`
- Modify: `src/navigation/menuAppearanceContract.test.ts`
- Modify: `src/navigation/routeAccessContract.test.ts`

- [ ] **Step 1: Write failing shell and menu contract tests**

Update the contracts to require:

```ts
expect(rootLayout).toContain('<StatusBar style="light"');
expect(rootLayout).toContain('backgroundColor: theme.surface.canvas');
expect(menu).not.toContain('APPEARANCE_OPTIONS');
expect(menu).not.toContain('setMode');
expect(menu).not.toContain('Light appearance');
expect(menu).not.toContain('Dark appearance');
expect(appConfig.expo.userInterfaceStyle).toBe('dark');
expect(appConfig.expo.splash?.backgroundColor ?? appConfig.expo.plugins).toBeDefined();
```

Preserve all existing route and primary-tab assertions.

- [ ] **Step 2: Run the shell tests and verify failure**

```powershell
npm test -- --runInBand src/navigation/authOnboardingAppearanceContract.test.ts src/navigation/menuAppearanceContract.test.ts src/navigation/routeAccessContract.test.ts
```

Expected: FAIL because the root status bar is conditional and Menu still exposes Light/Dark choices.

- [ ] **Step 3: Apply the native and route-shell dark configuration**

In `app.json` set:

```json
{
  "expo": {
    "userInterfaceStyle": "dark",
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#0B0D0B"
      }
    }
  }
}
```

Update the splash plugin background to `#0B0D0B`. In `src/app/_layout.tsx`, stop destructuring `mode` and render `<StatusBar style="light" />`. In the primary tab layout, use `theme.surface.canvas`, `theme.surface.raised`, `theme.ink.primary`, `theme.ink.muted`, and `theme.ink.action` for all tab and safe-area chrome.

Delete `AppearanceOption`, `APPEARANCE_OPTIONS`, the `setMode` destructure, the Appearance section JSX, and its unused styles from `src/app/menu.tsx`. Do not remove Buddy Card appearance editing; that controls shareable card art, not app light mode.

- [ ] **Step 4: Re-run shell tests and route access tests**

```powershell
npm test -- --runInBand src/navigation/authOnboardingAppearanceContract.test.ts src/navigation/menuAppearanceContract.test.ts src/navigation/routeAccessContract.test.ts
npx tsc --noEmit
```

Expected: PASS with all route registrations unchanged.

- [ ] **Step 5: Commit native chrome and Menu**

```powershell
git add app.json src/app/_layout.tsx 'src/app/(app)/_layout.tsx' src/app/menu.tsx src/navigation/authOnboardingAppearanceContract.test.ts src/navigation/menuAppearanceContract.test.ts src/navigation/routeAccessContract.test.ts
git commit -m "feat(theme): darken app shell and remove appearance switch"
```

### Task 3: Convert shared controls and entry screens

**Files:**
- Modify: `src/ui/AppLaunchState.tsx`
- Modify: `src/ui/AuthShell.tsx`
- Modify: `src/ui/AuthField.tsx`
- Modify: `src/ui/Button.tsx`
- Modify: `src/ui/Checkbox.tsx`
- Modify: `src/ui/ConfirmDialog.tsx`
- Modify: `src/ui/EmptyState.tsx`
- Modify: `src/ui/Glass.tsx`
- Modify: `src/ui/GlassTabBar.tsx`
- Modify: `src/ui/MonthCalendar.tsx`
- Modify: `src/ui/TimePicker.tsx`
- Modify: `src/ui/navigation.tsx`
- Modify: `src/ui/surfaces.tsx`
- Modify: `src/app/sign-in.tsx`
- Modify: `src/app/sign-up.tsx`
- Modify: `src/app/forgot-password.tsx`
- Modify: `src/app/verify-email.tsx`
- Modify: `src/app/onboarding.tsx`
- Modify: `src/app/paywall.tsx`
- Modify: `src/ui/Button.appearance.test.ts`
- Modify: `src/ui/sharedControlThemeContract.test.ts`
- Modify: `src/ui/primitives.test.ts`
- Modify: `src/navigation/authOnboardingAppearanceContract.test.ts`
- Modify: `src/entry/sharingUpgradeAppearanceContract.test.ts`

- [ ] **Step 1: Make shared-control tests assert observable dark roles**

For `buttonAppearance`, assert the returned visual contract directly:

```ts
const theme = themeColors('dark');
expect(buttonAppearance(theme, 'primary', false)).toEqual(expect.objectContaining({
  backgroundColor: '#B9FF3D',
  borderColor: '#B9FF3D',
  textColor: '#0B0D0B',
}));
expect(buttonAppearance(theme, 'outline', false)).toEqual(expect.objectContaining({
  backgroundColor: 'transparent',
  borderColor: '#465046',
  textColor: '#F7F8F4',
}));
```

Render `AuthShell`, `EmptyState`, and the navigation controls under the real provider and assert their flattened root backgrounds and label/icon colors use dark semantic values. Preserve existing accessibility and 44/48-point target assertions.

- [ ] **Step 2: Run shared and entry appearance tests to observe failures**

```powershell
npm test -- --runInBand src/ui/Button.appearance.test.ts src/ui/sharedControlThemeContract.test.ts src/ui/primitives.test.ts src/navigation/authOnboardingAppearanceContract.test.ts src/entry/sharingUpgradeAppearanceContract.test.ts
```

Expected: FAIL on light-specific button, auth, field, glass, or entry surfaces.

- [ ] **Step 3: Migrate shared controls to semantic dark roles**

Use this mapping consistently:

```ts
const sharedDarkRoles = {
  canvas: theme.surface.canvas,
  card: theme.surface.card,
  field: theme.surface.raised,
  border: theme.border.subtle,
  borderStrong: theme.border.strong,
  text: theme.ink.primary,
  secondary: theme.ink.secondary,
  muted: theme.ink.muted,
  action: theme.ink.action,
  onAction: theme.ink.inverse,
  scrim: theme.interaction.scrim,
};
```

Replace white/light backgrounds, `colors.primaryDark`, and light glass tints in the listed shared controls. Keep border radii and layout unchanged unless the approved pill CTA requires `radius.pill`. Set app-owned `BlurView` tint to `dark`.

- [ ] **Step 4: Migrate authentication, onboarding, and paywall chrome**

Make every screen root use `theme.surface.canvas`; cards and fields use `theme.surface.card` or `theme.surface.raised`; primary text uses `theme.ink.primary`; primary CTA uses neon with dark ink. Keep validation, navigation, permission, and purchase behavior unchanged.

- [ ] **Step 5: Run the shared and entry test batch**

```powershell
npm test -- --runInBand src/ui/Button.appearance.test.ts src/ui/sharedControlThemeContract.test.ts src/ui/primitives.test.ts src/navigation/authOnboardingAppearanceContract.test.ts src/entry/sharingUpgradeAppearanceContract.test.ts
npx tsc --noEmit
```

Expected: PASS with no accessibility target regressions.

- [ ] **Step 6: Commit shared controls and entry flows**

```powershell
git add src/ui src/app/sign-in.tsx src/app/sign-up.tsx src/app/forgot-password.tsx src/app/verify-email.tsx src/app/onboarding.tsx src/app/paywall.tsx src/navigation/authOnboardingAppearanceContract.test.ts src/entry/sharingUpgradeAppearanceContract.test.ts
git commit -m "feat(theme): convert shared controls and entry flows"
```

### Task 4: Convert Feed, communication, and discovery surfaces

**Files:**
- Modify: `src/app/(app)/index.tsx`
- Modify: `src/app/(app)/messages.tsx`
- Modify: `src/app/(app)/notifications.tsx`
- Modify: `src/app/(app)/post/[id].tsx`
- Modify: `src/app/(app)/profile.tsx`
- Modify: `src/app/compose.tsx`
- Modify: `src/app/search.tsx`
- Modify: `src/app/discover.tsx`
- Modify: `src/app/buddy.tsx`
- Modify: `src/app/buddy-chat/[id].tsx`
- Modify: `src/app/buddy-card/[id].tsx`
- Modify: `src/app/buddy-card-edit.tsx`
- Modify: `src/discover/DiscoverHub.tsx`
- Modify: `src/discover/DiscoverExperience.tsx`
- Modify: `src/feed/BroadcastSheet.tsx`
- Modify: `src/feed/EncouragementSheet.tsx`
- Modify: `src/feed/FeedProofCard.tsx`
- Modify: `src/feed/ImmersivePost.tsx`
- Modify: `src/feed/PostMenu.tsx`
- Modify: `src/feed/SocialBrandHeader.tsx`
- Modify: `src/feed/VoiceEncouragementRecorder.tsx`
- Modify: `src/stories/StoryRail.tsx`
- Modify: `src/feed/feedThemeContract.test.ts`
- Modify: `src/feed/feedInteractionAppearanceContract.test.ts`
- Modify: `src/feed/postDetailAppearanceContract.test.ts`
- Modify: `src/navigation/communicationAppearanceContract.test.ts`
- Modify: `src/navigation/profileAppearanceContract.test.ts`
- Modify: `src/discover/discoverAppearanceContract.test.ts`
- Modify: `src/buddy/BuddyChatAppearanceContract.test.ts`
- Modify: `src/buddy/BuddyCardShellAppearanceContract.test.ts`

- [ ] **Step 1: Rewrite the social appearance assertions around one dark contract**

The tests must require dark canvas/card/raised/border/ink/action roles and reject live light branches on rendered app chrome:

```ts
const theme = themeColors('dark');
expect(theme.surface.canvas).toBe('#0B0D0B');
expect(theme.surface.card).toBe('#121512');
expect(theme.ink.action).toBe('#B9FF3D');
expect(feedSource).not.toContain("mode === 'light'");
expect(discoverSource).not.toContain("mode === 'light'");
expect(messagesSource).not.toContain("mode === 'light'");
```

Keep functional assertions for Feed rows, buddy discovery, privacy labels, post ownership, comments, requests, and message navigation.

- [ ] **Step 2: Run the social test batch and verify failures**

```powershell
npm test -- --runInBand src/feed/feedThemeContract.test.ts src/feed/feedInteractionAppearanceContract.test.ts src/feed/postDetailAppearanceContract.test.ts src/navigation/communicationAppearanceContract.test.ts src/navigation/profileAppearanceContract.test.ts src/discover/discoverAppearanceContract.test.ts src/buddy/BuddyChatAppearanceContract.test.ts src/buddy/BuddyCardShellAppearanceContract.test.ts
```

Expected: FAIL where feature palettes still contain light branches or white surfaces.

- [ ] **Step 3: Remove light branches from social palette factories**

Change factories from `(theme, mode)` to `(theme)` where mode only selects colors. Use semantic roles for app chrome. Preserve natural media and Buddy Card artwork. For example:

```ts
function discoverPalette(theme: AppThemeColors) {
  return {
    canvas: theme.surface.canvas,
    card: theme.surface.card,
    mutedSurface: theme.surface.muted,
    border: theme.border.subtle,
    text: theme.ink.primary,
    textSecondary: theme.ink.secondary,
    textMuted: theme.ink.muted,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
    disabledOpacity: theme.interaction.disabledOpacity,
  };
}
```

Apply the same structure to Feed overlays, messages, notifications, post details, search, buddy management, and profile support chrome. Do not alter feed ordering, sharing behavior, privacy controls, or navigation.

- [ ] **Step 4: Run social functional and appearance tests**

```powershell
npm test -- --runInBand src/feed src/discover src/buddy src/navigation/communicationAppearanceContract.test.ts src/navigation/profileAppearanceContract.test.ts src/stories/StoryRail.navigation.test.tsx
npx tsc --noEmit
```

Expected: PASS, including the unified Find Buddies route.

- [ ] **Step 5: Commit the social conversion**

```powershell
git add 'src/app/(app)' src/app/compose.tsx src/app/search.tsx src/app/discover.tsx src/app/buddy.tsx 'src/app/buddy-chat/[id].tsx' 'src/app/buddy-card/[id].tsx' src/app/buddy-card-edit.tsx src/discover src/feed src/stories src/buddy src/navigation/communicationAppearanceContract.test.ts src/navigation/profileAppearanceContract.test.ts
git commit -m "feat(theme): convert social and discovery surfaces"
```

### Task 5: Convert Journey, planning, profile, and progress surfaces

**Files:**
- Modify: `src/app/(app)/activity.tsx`
- Modify: `src/app/(app)/today.tsx`
- Modify: `src/app/add.tsx`
- Modify: `src/app/item/[id].tsx`
- Modify: `src/app/journey-path.tsx`
- Modify: `src/app/journey-progress.tsx`
- Modify: `src/app/insights.tsx`
- Modify: `src/app/edit-profile.tsx`
- Modify: `src/journey/EditorialBackdrop.tsx`
- Modify: `src/journey/JournalScreen.tsx`
- Modify: `src/journey/JourneyEncouragementBar.tsx`
- Modify: `src/journey/JourneyPathScreen.tsx`
- Modify: `src/journey/JourneyTabs.tsx`
- Modify: `src/journey/MomentumScreen.tsx`
- Modify: `src/progress/ProgressPhotoVault.tsx`
- Modify: `src/timeline/HourGrid.tsx`
- Modify: `src/timeline/TimelineCard.tsx`
- Modify: `src/journey/JournalAppearanceContract.test.ts`
- Modify: `src/journey/JourneyPathAppearanceContract.test.ts`
- Modify: `src/journey/momentumAppearanceContract.test.ts`
- Modify: `src/insights/progressAppearanceContract.test.ts`
- Modify: `src/navigation/plannerAppearanceContract.test.ts`
- Modify: `src/navigation/accountSupportAppearanceContract.test.ts`
- Modify: `src/timeline/timelineAppearanceContract.test.ts`

- [ ] **Step 1: Replace dual-theme assertions with dark-only Journey contracts**

Require the Journey canvas, summary panels, tabs, timeline, planner, and profile form to use semantic dark roles. Preserve editorial typography, progress calculations, calendar semantics, and safe-area behavior.

```ts
expect(journeyPath).not.toContain("mode === 'light'");
expect(momentum).not.toContain("mode === 'light'");
expect(activity).not.toContain("mode === 'light'");
expect(today).not.toContain("mode === 'light'");
expect(add).not.toContain("mode === 'light'");
```

- [ ] **Step 2: Run Journey/planning tests and confirm failure**

```powershell
npm test -- --runInBand src/journey/JournalAppearanceContract.test.ts src/journey/JourneyPathAppearanceContract.test.ts src/journey/momentumAppearanceContract.test.ts src/insights/progressAppearanceContract.test.ts src/navigation/plannerAppearanceContract.test.ts src/navigation/accountSupportAppearanceContract.test.ts src/timeline/timelineAppearanceContract.test.ts
```

Expected: FAIL on dual-mode palette branches and light editorial surfaces.

- [ ] **Step 3: Convert feature palette factories without changing domain logic**

Remove `mode` only from color selection. Keep layout variants and explicit media-dark flags where they affect imagery rather than app theme. Standardize summary panels as raised/card dark surfaces; use neon for selected tabs, current-day progress, and primary actions; use `theme.status.*` for success, warning, and error.

- [ ] **Step 4: Run Journey, timeline, progress, and planner tests**

```powershell
npm test -- --runInBand src/journey src/progress src/timeline src/insights src/navigation/plannerAppearanceContract.test.ts src/navigation/accountSupportAppearanceContract.test.ts
npx tsc --noEmit
```

Expected: PASS with progress values, dates, privacy, and journal behavior unchanged.

- [ ] **Step 5: Commit Journey and planning**

```powershell
git add 'src/app/(app)/activity.tsx' 'src/app/(app)/today.tsx' src/app/add.tsx 'src/app/item/[id].tsx' src/app/journey-path.tsx src/app/journey-progress.tsx src/app/insights.tsx src/app/edit-profile.tsx src/journey src/progress src/timeline src/insights src/navigation/plannerAppearanceContract.test.ts src/navigation/accountSupportAppearanceContract.test.ts
git commit -m "feat(theme): convert journey and planning surfaces"
```

### Task 6: Convert Run, body, gym, diet, and tracking surfaces

**Files:**
- Modify: `src/app/(app)/run.tsx`
- Modify: `src/app/body.tsx`
- Modify: `src/app/diet.tsx`
- Modify: `src/app/food-search.tsx`
- Modify: `src/app/gym.tsx`
- Modify: `src/app/gym-plan.tsx`
- Modify: `src/app/exercise/[id].tsx`
- Modify: `src/activity/RunShareSheet.tsx`
- Modify: `src/activity/RunTrackerScreen.tsx`
- Modify: `src/activity/UploadStatus.tsx`
- Modify: `src/activity/runShareAppearance.ts`
- Modify: `src/diet/nutritionAppearanceContract.test.ts`
- Modify: `src/gym/workoutAppearanceContract.test.ts`
- Modify: `src/activity/RunCard.appearance.test.tsx`
- Modify: `src/activity/RunMediaActions.appearance.test.tsx`
- Modify: `src/activity/runShareAppearance.test.ts`
- Modify: `src/activity/RunTrackerScreenIntegration.test.tsx`

- [ ] **Step 1: Write failing dark tracking and share-editor tests**

Require ready, active, paused, completed, and editor chrome to use the dark system. The default share card theme becomes dark regardless of completion time, while maps and photos remain natural:

```ts
expect(createDefaultRunShareAppearance('2026-08-23T10:18:00.000Z', 10).theme).toBe('dark');
expect(createDefaultRunShareAppearance('2026-08-23T22:18:00.000Z', 22).theme).toBe('dark');
```

Preserve pause/resume/end behavior, location privacy, distance/pace/time calculations, and continuous background replacement before posting.

- [ ] **Step 2: Run fitness appearance and integration tests to verify failure**

```powershell
npm test -- --runInBand src/activity/RunCard.appearance.test.tsx src/activity/RunMediaActions.appearance.test.tsx src/activity/runShareAppearance.test.ts src/activity/RunTrackerScreenIntegration.test.tsx src/diet/nutritionAppearanceContract.test.ts src/gym/workoutAppearanceContract.test.ts
```

Expected: FAIL on daytime share-card theme and remaining light workout/nutrition palettes.

- [ ] **Step 3: Convert tracking and health feature palettes**

Use semantic dark roles for all app chrome. Keep OpenStreetMap/Leaflet tile colors and user media unchanged. Apply a dark scrim only where route/stats text requires contrast. Change `createDefaultRunShareAppearance` so its returned `theme` is always `dark`; retain the timestamp, layout, font, and privacy defaults.

- [ ] **Step 4: Run activity, gym, diet, body, and progress tests**

```powershell
npm test -- --runInBand src/activity src/gym src/diet src/progress src/insights
npx tsc --noEmit
```

Expected: PASS with no tracking, sync, pause, location, media, or health-data regression.

- [ ] **Step 5: Commit fitness and tracking conversion**

```powershell
git add 'src/app/(app)/run.tsx' src/app/body.tsx src/app/diet.tsx src/app/food-search.tsx src/app/gym.tsx src/app/gym-plan.tsx 'src/app/exercise/[id].tsx' src/activity src/diet src/gym
git commit -m "feat(theme): convert fitness and tracking surfaces"
```

### Task 7: Convert community, competition, memories, and utility routes

**Files:**
- Modify: `src/app/achievements.tsx`
- Modify: `src/app/books.tsx`
- Modify: `src/app/compete.tsx`
- Modify: `src/app/challenge-new.tsx`
- Modify: `src/app/challenge/[id].tsx`
- Modify: `src/app/groups.tsx`
- Modify: `src/app/group-new.tsx`
- Modify: `src/app/group/[id].tsx`
- Modify: `src/app/pages.tsx`
- Modify: `src/app/page-new.tsx`
- Modify: `src/app/page/[id].tsx`
- Modify: `src/app/memories.tsx`
- Modify: `src/app/story/[userId].tsx`
- Modify: `src/app/help.tsx`
- Modify: `src/app/legal/[doc].tsx`
- Modify: `src/app/invite-card.tsx`
- Modify: `src/app/share/[id].tsx`
- Modify: `src/app/win-card.tsx`
- Modify: `src/compete/CompeteUI.tsx`
- Modify: `src/moderation/ModerationGate.tsx`
- Modify: `src/achievements/trophyCaseAppearanceContract.test.ts`
- Modify: `src/compete/competitionAppearanceContract.test.ts`
- Modify: `src/navigation/socialCommunityAppearanceContract.test.ts`
- Modify: `src/navigation/socialCommunityCreationAppearanceContract.test.ts`
- Modify: `src/stories/memoriesStoryAppearanceContract.test.ts`
- Modify: `src/entry/residualUtilityAppearanceContract.test.ts`
- Modify: `src/entry/sharingUpgradeAppearanceContract.test.ts`

- [ ] **Step 1: Make secondary-route appearance contracts dark-only**

Require all listed route roots and overlays to inherit the dark canvas and semantic ink. Keep medal art, cover photos, story media, maps, public-share media, and achievement graphics in their source colors.

- [ ] **Step 2: Run the secondary-route test batch and verify failure**

```powershell
npm test -- --runInBand src/achievements/trophyCaseAppearanceContract.test.ts src/compete/competitionAppearanceContract.test.ts src/navigation/socialCommunityAppearanceContract.test.ts src/navigation/socialCommunityCreationAppearanceContract.test.ts src/stories/memoriesStoryAppearanceContract.test.ts src/entry/residualUtilityAppearanceContract.test.ts src/entry/sharingUpgradeAppearanceContract.test.ts
```

Expected: FAIL wherever app-owned surfaces still select light colors.

- [ ] **Step 3: Convert remaining utility palettes and overlays**

Remove live light branches, replace white card/field backgrounds with semantic card/raised roles, set app-owned modal scrims to `theme.interaction.scrim`, and preserve all existing actions and permissions. Use neon only for primary action, active, progress, and selected states.

- [ ] **Step 4: Run secondary feature tests**

```powershell
npm test -- --runInBand src/achievements src/compete src/groups src/pages src/stories src/entry src/moderation src/navigation/socialCommunityAppearanceContract.test.ts src/navigation/socialCommunityCreationAppearanceContract.test.ts
npx tsc --noEmit
```

Expected: PASS with group/page privacy, moderation, story playback, and sharing behavior unchanged.

- [ ] **Step 5: Commit the remaining route conversion**

```powershell
git add src/app/achievements.tsx src/app/books.tsx src/app/compete.tsx src/app/challenge-new.tsx 'src/app/challenge/[id].tsx' src/app/groups.tsx src/app/group-new.tsx 'src/app/group/[id].tsx' src/app/pages.tsx src/app/page-new.tsx 'src/app/page/[id].tsx' src/app/memories.tsx 'src/app/story/[userId].tsx' src/app/help.tsx 'src/app/legal/[doc].tsx' src/app/invite-card.tsx 'src/app/share/[id].tsx' src/app/win-card.tsx src/compete src/moderation src/achievements src/navigation/socialCommunityAppearanceContract.test.ts src/navigation/socialCommunityCreationAppearanceContract.test.ts src/stories/memoriesStoryAppearanceContract.test.ts src/entry/residualUtilityAppearanceContract.test.ts src/entry/sharingUpgradeAppearanceContract.test.ts
git commit -m "feat(theme): complete dark-only route conversion"
```

### Task 8: App-wide audit, visual verification, and staging installation

**Files:**
- Create: `src/ui/darkOnlyVisualSystem.test.ts`
- Modify: any exact source or test file identified by the audit
- Create: `.release-evidence/dark-only-visual-system/README.md`

- [ ] **Step 1: Add a dark-only system behavior test**

Test the public theme boundary rather than individual source strings:

```ts
test.each([undefined, null, 'light', 'dark', 'system', 'legacy']) (
  'normalizes %p to the approved dark system',
  (value) => {
    expect(resolveAppThemeMode(value)).toBe('dark');
    expect(themeColors(resolveAppThemeMode(value))).toEqual(themeColors('dark'));
  },
);
```

Add contrast assertions for primary/secondary text, neon actions, borders, success, danger, and disabled states using the existing contrast helper pattern from `src/compete/competitionAppearanceContract.test.ts`.

- [ ] **Step 2: Run static audits for remaining user-visible light assumptions**

Run:

```powershell
rg -n "mode === 'light'|mode == 'light'|themeColors\('light'\)|Light appearance|Dark appearance|#fff\b|#ffffff\b|#F4F5F1\b" src -g '*.tsx' -g '*.ts'
```

Classify every match. Remove app-chrome matches. Retain only documented media ink, natural artwork, white text over dark imagery, test fixtures, or non-theme domain wording. Record the retained categories in the evidence README.

- [ ] **Step 3: Run the complete verification suite**

```powershell
npm test -- --runInBand
npm run lint -- --quiet
npx tsc --noEmit
git diff --check
```

Expected: all tests PASS, lint reports no errors, TypeScript reports no errors, and the diff has no whitespace failures.

- [ ] **Step 4: Verify representative screens at phone breakpoints**

Capture and inspect at minimum:

```text
Sign-in → Onboarding → Feed → Post detail → Journey → Run ready →
Run active → Run paused → Run complete/share → Messages → Chat →
Discover → Buddy Card → Composer → Menu → Help → Error/empty/offline state
```

Check 360×800 and the connected 1116×2480 device; verify largest practical font scale, 44/48-point targets, safe areas, no white flash, no white app canvas, and no hidden CTA.

- [ ] **Step 5: Build and install the staging APK without production changes**

Temporarily exclude local evidence from the EAS archive, then run:

```powershell
$env:EAS_NO_VCS='1'
$revision = git rev-parse --short HEAD
npx eas-cli build --platform android --profile preview --non-interactive --message "Dark-only visual system $revision"
```

Verify the completed EAS metadata reports `com.awldesk.accountability.staging`, download its `artifacts.buildUrl`, and assign the resulting absolute file path to `$stagingApk`. Install in place:

```powershell
adb -s FY24068108E6 install -r $stagingApk
adb -s FY24068108E6 shell am force-stop com.awldesk.accountability.staging
adb -s FY24068108E6 shell am start -n com.awldesk.accountability.staging/.MainActivity
```

Expected: install reports `Success`, existing app data remains, the staging app launches, and primary routes show the approved dark system.

- [ ] **Step 6: Commit the audit and evidence index**

```powershell
git add src/ui/darkOnlyVisualSystem.test.ts .release-evidence/dark-only-visual-system/README.md
git commit -m "test(theme): verify dark-only app experience"
```

The screenshot and XML binaries remain untracked local evidence; only the evidence index is committed.
