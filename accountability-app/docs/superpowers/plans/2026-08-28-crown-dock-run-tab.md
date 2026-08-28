# Crown Dock Run Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ordinary Run tab presentation with the approved enlarged neon soft-hex Crown Dock action.

**Architecture:** Keep routing and press handling inside `GlassTabBar`. Isolate the new vector shape in a small presentational component so the tab-bar mapping remains readable and testable. Use existing theme roles and `react-native-svg`; do not add dependencies.

**Tech Stack:** Expo Router, React Native, TypeScript, `react-native-svg`, Jest, `react-test-renderer`.

---

### Task 1: Lock the Run-tab contract

**Files:**
- Modify: `src/ui/GlassTabBar.test.ts`

- [ ] **Step 1: Write a failing test**

Assert that Run renders `crown-dock-run`, has no `tab-label-Run`, remains an accessible selected tab when focused, and still navigates to `run` when pressed.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --runInBand src/ui/GlassTabBar.test.ts`

Expected: FAIL because `crown-dock-run` does not exist and the Run label is still rendered.

### Task 2: Add the Crown Dock presentation

**Files:**
- Create: `src/ui/CrownDockRunAction.tsx`
- Modify: `src/ui/GlassTabBar.tsx`

- [ ] **Step 1: Build the isolated vector action**

Create an 84 dp soft-hex SVG with a graphite cradle, neon face, subtle lime underglow, and centered `walk-outline` glyph. Expose a `focused` prop and `testID="crown-dock-run"`.

- [ ] **Step 2: Special-case the Run destination**

Render the Crown Dock component inside the existing Run `Pressable`, omit its visual label and ordinary indicator, and preserve the current handler and accessibility props.

- [ ] **Step 3: Run the focused test**

Run: `npm test -- --runInBand src/ui/GlassTabBar.test.ts`

Expected: PASS.

### Task 3: Validate and stage

**Files:**
- Modify only if verification exposes an issue: `src/ui/CrownDockRunAction.tsx`, `src/ui/GlassTabBar.tsx`, `src/ui/GlassTabBar.test.ts`

- [ ] **Step 1: Run static checks**

Run: `npx tsc --noEmit` and `npm run lint`.

Expected: both exit successfully.

- [ ] **Step 2: Publish a staging-only preview update**

Run the existing EAS preview update command for Android. Never publish production.

- [ ] **Step 3: Open and verify on the connected device**

Confirm the new elevated Crown Dock is visible, Run opens the tracker, and the other four destinations still work.
