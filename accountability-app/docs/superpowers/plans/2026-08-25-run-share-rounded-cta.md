# Run Share Rounded CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Run Share “Continue to Feed” action with the approved near-black capsule and neon-green label in both Light and Dark presentation contexts.

**Architecture:** Keep the change isolated to `RunMediaActions`; do not modify Run publishing, navigation, Share Studio, privacy controls, or the surrounding editor layout. Extend the existing rendered appearance test so the approved geometry, colors, arrow, accessibility state, and interaction states cannot drift.

**Tech Stack:** React Native, TypeScript, Jest, react-test-renderer, Expo Ionicons

---

### Task 1: Lock the primary action appearance in a failing rendered test

**Files:**
- Modify: `src/activity/RunMediaActions.appearance.test.tsx`
- Test: `src/activity/RunMediaActions.appearance.test.tsx`

- [ ] **Step 1: Add a rendered style assertion for the Feed action**

Render `RunMediaActions`, resolve the `Pressable` style callback for its idle state, and assert a 56-point minimum target, pill radius `999`, near-black `#111411` fill, quiet `#30372F` border, neon `#B9FF3D` text, and a neon arrow. Preserve the existing accessibility and action-order assertions.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --runInBand src/activity/RunMediaActions.appearance.test.tsx`

Expected: FAIL because the current action uses a neon fill, dark text, and radius `18`.

### Task 2: Apply the approved capsule style

**Files:**
- Modify: `src/activity/RunMediaActions.tsx`
- Test: `src/activity/RunMediaActions.appearance.test.tsx`

- [ ] **Step 1: Implement the approved visual tokens**

Set the Feed action to a full capsule with `borderRadius: 999`, `backgroundColor: '#111411'`, `borderWidth: 1`, and `borderColor: '#30372F'`. Use a restrained black shadow for Light-mode separation, neon `#B9FF3D` for the uppercase label and arrow, and keep the existing width, order, callback, availability logic, and 56-point minimum target.

- [ ] **Step 2: Preserve interaction truthfulness**

Keep disabled state exposure and feed-disabled reason unchanged. Preserve the current pressed feedback and ensure the action remains unavailable while another destination is working.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `npm test -- --runInBand src/activity/RunMediaActions.appearance.test.tsx`

Expected: PASS.

### Task 3: Verify the isolated production change

**Files:**
- Verify: `src/activity/RunMediaActions.tsx`
- Verify: `src/activity/RunMediaActions.appearance.test.tsx`

- [ ] **Step 1: Run related Run sharing regressions**

Run: `npm test -- --runInBand src/activity/RunMediaActions.appearance.test.tsx src/activity/saveRunMedia.test.ts`

Expected: all suites PASS.

- [ ] **Step 2: Run static checks**

Run: `npx tsc --noEmit --pretty false`

Run: `npx eslint src/activity/RunMediaActions.tsx src/activity/RunMediaActions.appearance.test.tsx`

Run: `git diff --check`

Expected: all commands exit successfully.

- [ ] **Step 3: Review and commit only scoped files**

Confirm the production diff changes only the CTA appearance and does not alter labels, callbacks, visibility rules, upload logic, or navigation. Commit the plan, component, and test using an explicit path list.
