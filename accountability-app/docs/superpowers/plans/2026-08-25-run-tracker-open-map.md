# Run Tracker Open Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the real Run tracker’s card-heavy chrome with the approved Open Map interface while preserving the existing owner-safe GPS, recovery, offline-save, and sharing state machines.

**Architecture:** Add a pure responsive layout model and an isolated presentational `RunTrackerOpenMap` component. `src/app/(app)/run.tsx` remains the stateful owner of permissions, recording, recovery, persistence, map updates, and sharing; it supplies truthful display props and existing callbacks to the new chrome.

**Tech Stack:** Expo Router, React Native, TypeScript, Jest, `react-test-renderer`, existing OSM/Leaflet wrapper, existing theme/typography tokens.

---

## File structure

- Create `src/activity/runTrackerLayout.ts` for pure responsive geometry.
- Create `src/activity/runTrackerLayout.test.ts` for compact/reference/large-phone boundaries.
- Create `src/activity/RunTrackerOpenMap.tsx` for the presentation-only tracker chrome.
- Create `src/activity/RunTrackerOpenMap.test.tsx` for semantics, interactions, states, and targets.
- Modify `src/app/(app)/run.tsx` to connect existing tracker state and callbacks.
- Create `src/activity/RunTrackerScreenIntegration.test.tsx` for focused route wiring.

### Task 1: Responsive Open Map geometry

**Files:**
- Create: `src/activity/runTrackerLayout.ts`
- Test: `src/activity/runTrackerLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Create table-driven tests for 320×568, 390×844, and 430×932 at font scales 1, 1.3, and 2. Use this wished-for API:

```ts
const layout = openMapRunLayout({
  width: 390,
  height: 844,
  fontScale: 1,
  safeTop: 24,
  safeBottom: 20,
});

expect(layout.gutter).toBe(24);
expect(layout.controlSize).toBeGreaterThanOrEqual(48);
expect(layout.metricFontSize).toBe(54);
expect(layout.ctaHeight).toBeGreaterThanOrEqual(56);
expect(layout.metricBandTop).toBeGreaterThan(layout.statusTop + layout.statusHeight);
expect(layout.ctaTop).toBeGreaterThan(layout.secondaryRailBottom);
expect(layout.ctaTop + layout.ctaHeight + layout.bottomDockBottom)
  .toBeLessThanOrEqual(844);
```

Every case must assert positive widths, safe-area containment, 48-point controls, and ordered non-overlapping anchors.

- [ ] **Step 2: Run the test and verify RED**

Run `npm test -- --runInBand src/activity/runTrackerLayout.test.ts`.

Expected: FAIL because `runTrackerLayout` does not exist.

- [ ] **Step 3: Implement the minimal layout model**

Export `OpenMapRunLayoutInput`, `OpenMapRunLayout`, and `openMapRunLayout`. Use the approved 390×844 baseline: 24-point gutter, 48-point controls, 54/60 primary metrics, 48-point status region, 58-point CTA, and `max(safeBottom, 12) + 16` bottom clearance. Compact widths use 16-point gutters and 48/54 metrics. Cap content width at 560 points. Large text may reduce decorative numeric size but must never shrink targets.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Step 2 command. Expected: all table cases pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/activity/runTrackerLayout.ts src/activity/runTrackerLayout.test.ts
git commit -m "test: define Run tracker Open Map geometry"
```

### Task 2: Accessible Open Map presentation

**Files:**
- Create: `src/activity/RunTrackerOpenMap.tsx`
- Test: `src/activity/RunTrackerOpenMap.test.tsx`

- [ ] **Step 1: Write the failing rendered contract**

Render the component with idle values and callbacks. Assert the selected Run tab, Walk/Ride tab roles, grouped labels `Distance 0.00 kilometres`, `Elapsed time 00:00`, `Pace unavailable`, `Estimated calories 0`, map controls `Center map on my location` and `Show complete route`, and `Start Run`. Press Walk, both map controls, and Start, then verify only the matching callbacks fire. Add cases for Starting, Tracking (`Stop & Save`), Pending (`Retry save`), disabled route overview, and 200% text. Flatten every direct control style and assert an effective 48×48-point target.

- [ ] **Step 2: Run the test and verify RED**

Run `npm test -- --runInBand src/activity/RunTrackerOpenMap.test.tsx`.

Expected: FAIL because `RunTrackerOpenMap` does not exist.

- [ ] **Step 3: Implement the component**

Export an explicit `RunTrackerPrimaryAction` with `label`, `icon`, `tone`, `disabled`, and `onPress`, plus `RunTrackerOpenMapProps` carrying selected activity, selector state/callback, Back/More/map callbacks, status title/detail, formatted metric strings, calorie number, action, viewport/font/safe-area values, and side inset.

Use `themeColors('dark')`, `colors.primary`, `colors.onPrimary`, existing fonts, Ionicons, and Task 1 geometry. Render no opaque bottom card. Group each metric into one accessible node, use text-tab semantics, and make every direct target at least 48 points.

- [ ] **Step 4: Run the component test and verify GREEN**

Run the Step 2 command. Expected: all component cases pass without warnings.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- src/activity/RunTrackerOpenMap.tsx src/activity/RunTrackerOpenMap.test.tsx
git commit -m "feat: add accessible Open Map Run chrome"
```

### Task 3: Wire the approved design into the real Run route

**Files:**
- Modify: `src/app/(app)/run.tsx`
- Test: `src/activity/RunTrackerScreenIntegration.test.tsx`

- [ ] **Step 1: Write the failing integration contract**

Mock Auth, profile, location, navigation, `OsmMap`, and recording boundaries. Prove that the focused Run route hides the tab bar before recording, renders Open Map when recovery is clear, preserves Walk selection into `beginTrackRecording`, pushes live points through `mapRef.setRoute`, keeps Back on `navigateBackSafely`, and never exposes another owner’s metrics or route.

- [ ] **Step 2: Run the test and verify RED**

Run `npm test -- --runInBand src/activity/RunTrackerScreenIntegration.test.tsx`.

Expected: FAIL because the route still renders the old card HUD and keeps the idle tab bar visible.

- [ ] **Step 3: Integrate without changing tracker state machines**

In `run.tsx`, import the new view and theme tokens; hide the focused tab bar in idle/tracking/sharing; retain every existing owner/recovery/persistence handler; make the OSM map interactive; derive center and route-overview callbacks from `mapRef`, `idlePos`, and safe `shownPoints`; derive truthful status copy for idle, starting, tracking, and pending; derive one primary action from the existing pending/tracking/start ternary; and keep blocked-recovery notices, upload badge, private avatar resolution, and `RunShareSheet` intact.

- [ ] **Step 4: Run focused regressions**

```powershell
npm test -- --runInBand src/activity/RunTrackerScreenIntegration.test.tsx src/activity/RunTrackerOpenMap.test.tsx src/activity/runTrackerLayout.test.ts src/activity/runCompletion.test.ts src/activity/geo.test.ts src/navigation/safeExitContract.test.ts src/media/privateImageConsumerContract.test.ts src/navigation/routeAccessContract.test.ts src/ui/GlassTabBar.test.ts
```

Expected: every selected suite passes.

- [ ] **Step 5: Run static verification**

```powershell
npx tsc --noEmit
npx eslint 'src/app/(app)/run.tsx' src/activity/RunTrackerOpenMap.tsx src/activity/RunTrackerOpenMap.test.tsx src/activity/runTrackerLayout.ts src/activity/runTrackerLayout.test.ts src/activity/RunTrackerScreenIntegration.test.tsx
git diff --check
```

Expected: exit 0 for all commands.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- 'src/app/(app)/run.tsx' src/activity/RunTrackerOpenMap.tsx src/activity/RunTrackerOpenMap.test.tsx src/activity/runTrackerLayout.ts src/activity/runTrackerLayout.test.ts src/activity/RunTrackerScreenIntegration.test.tsx
git commit -m "feat: apply Open Map design to Run tracker"
```

### Task 4: Device proof

**Files:**
- No production file changes expected.

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: zero test failures, TypeScript errors, lint errors, or diff-check errors.

- [ ] **Step 2: Deliver to the connected Android phone**

Use the existing Expo/Android development workflow. Do not alter the remote database, migrations, production functions, or publish a production OTA.

- [ ] **Step 3: Verify visually on-device**

Capture the actual phone screen and verify the full dark map, text activity tabs, dominant distance/time, truthful GPS status, Pace/Calories rail, 48-point controls, and Start action. Start must transition to the same visual family with working Stop & Save, without publishing or discarding real user data.

- [ ] **Step 4: Record final evidence**

Report exact test counts, static results, commit hash, device screenshot path, and any remaining device-only limitation. Do not claim completion without fresh automated and device evidence.
