# App-wide Athlete UX Audit Tasks

## Task 1: Complete the route and live-experience baseline

**Description:** Build an evidence-backed map of every visible route, entry point, loading/error/empty state, and Back destination, combining source inspection with representative Android walkthroughs.

**Acceptance criteria:**
- [x] Every `src/app` route has at least one documented entry or is explicitly internal/deep-link-only.
- [x] Core journeys record expected and observed Back behavior.
- [x] Findings are ranked by user impact with exact source locations and device evidence where applicable.

**Verification:**
- [x] Navigation audit agents return grounded reports.
- [x] Android captures cover Feed, composer, Post detail, Menu, Journey, Run, and Messages.

**Dependencies:** None

**Files likely touched:**
- `tasks/plan.md`
- `tasks/todo.md`

**Estimated scope:** Small

## Task 2: Make navigation and Back behavior authoritative

**Description:** Turn the route audit into contracts and repair broken, stale, or dead-end navigation without changing valid deep-link behavior.

**Acceptance criteria:**
- [x] Visible Back and Android Back use the same history-aware exit helper for audited secondary routes.
- [x] No audited user-facing control points to a missing or unintended route.
- [x] Cold links, account changes, and root routes fail safely without blank rendering.

**Verification:**
- [x] Focused navigation contracts pass.
- [ ] Android Back matrix passes for representative nested and cold-start routes.

**Dependencies:** Task 1

**Files likely touched:**
- `src/navigation/routeAccessContract.ts`
- `src/navigation/routeAccessContract.test.ts`
- Up to three affected route files per fix slice

**Estimated scope:** Medium per slice

## Task 3: Open the primary Post composer directly

**Description:** Make the Feed avatar/blank prompt and Post action open the actual New post editor immediately; keep Photo and Flex as explicit shortcuts.

**Acceptance criteria:**
- [x] Tapping the main Feed prompt routes directly to the text editor intent.
- [x] Post no longer requires the Create chooser plus Continue.
- [x] Photo and Flex shortcuts still enter their intended contextual flows.

**Verification:**
- [x] Feed/composer route contract begins RED and passes after implementation.
- [ ] Android walkthrough confirms one tap from Feed prompt to editable Post.

**Dependencies:** Task 1

**Files likely touched:**
- `src/app/(app)/index.tsx`
- `src/app/compose.tsx`
- `src/feed/socialScreenContract.test.ts`

**Estimated scope:** Medium

## Task 4: Make composer draft, keyboard, and exit behavior smooth

**Description:** Keep text and actions visible above the keyboard, remove confusing draft warnings, dismiss the keyboard before confirmation surfaces, and preserve drafts without trapping the user.

**Acceptance criteria:**
- [x] Focused text uses one keyboard owner per platform and remains visible above the keyboard.
- [x] Draft restore/conflict behavior preserves only real drafts and keeps the submitted draft out of restore after commit.
- [x] Cancel, keep, discard, success, and error each have one predictable destination and no duplicate Back.

**Verification:**
- [x] Composer state/keyboard contracts pass.
- [ ] Android checks pass with keyboard open, confirmation open, and hardware Back.

**Dependencies:** Task 3

**Files likely touched:**
- `src/app/compose.tsx`
- Composer-specific helper/test files

**Estimated scope:** Medium

## Task 5: Make Flex creation contextual and direct

**Description:** Let achievements, completed runs, challenge wins, and manual celebrations enter Flex with their real context already selected, then finish through one share action.

**Acceptance criteria:**
- [x] Flex opened from a source carries typed source context without asking the user to choose it again.
- [x] Manual Flex has one concise selection step and one editor/share step.
- [x] Success returns to Feed or the originating context exactly once.

**Verification:**
- [x] Flex decision/state contracts pass.
- [ ] Android walkthrough covers manual and achievement/run-triggered Flex.

**Dependencies:** Tasks 1 and 3

**Files likely touched:**
- `src/app/win-card.tsx`
- One source route per vertical slice
- Flex contract tests

**Estimated scope:** Medium per slice

## Task 6: Remove the blank Feed reload experience

**Description:** Keep same-account Feed content visible during refresh and use reserved, athlete-themed skeletons for true cold loads.

**Acceptance criteria:**
- [x] Returning to the app keeps same-account Feed rows mounted during normal refresh/failure.
- [x] Cold loading reserves composer/story/feed geometry with fixed skeleton cards.
- [x] Account changes clear prior-owner content immediately.

**Verification:**
- [x] Feed lifecycle/account-generation tests pass.
- [ ] Android relaunch, tab return, pull-to-refresh, slow-network, and account-change checks pass.

**Dependencies:** Task 1

**Files likely touched:**
- `src/app/(app)/index.tsx`
- `src/feed` loading/snapshot helper
- Feed lifecycle tests

**Estimated scope:** Medium

## Task 7: Consolidate the visual foundation

**Description:** Extend the existing theme with semantic 4/8 spacing, divider, surface, card, icon, pressed, disabled, and skeleton roles; provide small reusable primitives instead of per-screen magic values.

**Acceptance criteria:**
- [x] New/updated primary UI uses semantic tokens with light/dark parity.
- [x] Updated surfaces use consistent semantic dividers, cards, icons, interaction states, and 48dp controls.
- [x] Approved Buddy Card visuals remain unchanged.

**Verification:**
- [x] Theme/token tests pass.
- [x] Light/dark contrast and touch-target contracts pass for updated primitives.

**Dependencies:** Task 1

**Files likely touched:**
- `src/ui/theme.ts`
- `src/ui/theme.test.ts`
- Up to three focused primitive files

**Estimated scope:** Medium

## Tasks 8–11: Apply the foundation by athlete journey

**Description:** Roll the foundation through Feed/Post, Journey/Run, Messages/Menu/Discover, then the remaining social/fitness screens in small vertical batches.

**Acceptance criteria:**
- [ ] Each batch has a clear hierarchy, 4/8 spacing rhythm, consistent lines/cards/icons, stable loading states, and light/dark parity.
- [ ] Screen-specific actions remain semantically correct and accessible.
- [ ] No batch exceeds five production/test files without further decomposition.

**Verification:**
- [ ] Focused contracts and screenshots pass per batch.
- [ ] Android portrait, landscape, and largest-text checks pass for representative screens.

**Dependencies:** Tasks 2, 6, and 7 as applicable

**Files likely touched:**
- Defined separately for each vertical batch after the baseline audit

**Estimated scope:** Medium per batch

## Task 12: Accessibility and responsive acceptance

**Description:** Validate screen-reader names/order, 48dp targets, dynamic text, reduced motion, keyboard clearance, contrast, safe areas, and both themes.

**Acceptance criteria:**
- [ ] All icon controls have meaningful labels and applicable state.
- [ ] Largest text and landscape do not clip primary information or actions.
- [ ] Motion respects system reduction and all foreground/background pairs meet required contrast.

**Verification:**
- [ ] Accessibility-focused tests pass.
- [ ] Android settings-based manual checks are recorded.

**Dependencies:** Tasks 7–11

**Files likely touched:**
- Focused component/test files discovered by audit

**Estimated scope:** Medium per fix slice

## Task 13: Release verification

**Description:** Run the full quality gate and a representative end-to-end Android acceptance matrix before requesting permission to push/upload.

**Acceptance criteria:**
- [ ] Full Jest, TypeScript, lint, diff check, and Android Expo export pass.
- [ ] Core Post, Flex, navigation, Feed loading, Journey, Run, Messages, Menu, and Buddy Card paths pass on device.
- [ ] Worktree contains no unintended or generated artifacts.

**Verification:**
- [ ] Final evidence table maps every goal requirement to automated and device proof.

**Dependencies:** Tasks 1–12

**Files likely touched:** None unless a verification defect is found

**Estimated scope:** Small
