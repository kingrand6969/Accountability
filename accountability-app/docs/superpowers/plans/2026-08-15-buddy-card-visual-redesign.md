# Buddy Card Visual Redesign Implementation Plan

## Goal

Implement the approved collectible Buddy Card hierarchy and repair every Buddy Card link without changing existing audience authorization.

## Task 1: Lock navigation and viewer-role behavior with tests

**Files:**
- Update `src/buddy/buddyCardAudienceContract.test.ts`
- Update or add focused viewer/navigation tests under `src/buddy/`
- Inspect `src/app/menu.tsx`, `src/app/(app)/profile.tsx`, `src/app/(app)/index.tsx`, and `src/app/buddy-card/[id].tsx`

1. Add failing assertions that Menu and other owner entry points open `/buddy-card/[id]` with the authenticated owner ID.
2. Assert the owner never receives a Connect action and retains Edit Buddy Card.
3. Assert Medals and Challenges routes to the viewed account's collection.
4. Assert focus expansion and post links preserve a usable back path.
5. Run the focused tests and confirm the intended failures.

## Task 2: Repair Buddy Card entry links

**Files:**
- Update `src/app/menu.tsx`
- Update `src/app/(app)/profile.tsx`
- Update other confirmed incorrect owner entry points only as needed

1. Resolve the authenticated owner before constructing My Buddy Card navigation.
2. Route to `/buddy-card/[id]`, not directly to `/buddy-card-edit`.
3. Preserve owner/account generation guards so stale identity cannot open another account's card.
4. Keep Edit Buddy Card as an owner-only action inside the card.
5. Run focused navigation and TypeScript checks.

## Task 3: Implement the approved card information hierarchy

**Files:**
- Update `src/buddy/BuddyCardFace.tsx`
- Update `src/buddy/PublicBuddyCardFace.tsx` only if it remains an active rendering path
- Update `src/app/buddy-card/[id].tsx`
- Add or update focused Buddy Card presentation tests

1. Add failing presentation tests for Challenges won placement, Rankings wording, Medals and Challenges wording, and removal of duplicate distance.
2. Restructure the card while preserving every existing data field.
3. Keep the four bottom metrics balanced: Consistency, Points, Average distance per day, and Distance.
4. Apply 48-point minimum interaction targets and accessible labels.
5. Verify both narrow and wide layouts and increased text-size safety.

## Task 4: Add selected medal previews and the complete collection link

**Files:**
- Update Buddy Card data/API types and editor files discovered during implementation
- Update `src/app/buddy-card-edit.tsx`
- Update `src/app/buddy-medals/[id].tsx` or the existing combined collection destination
- Add focused selection/order and routing tests

1. Confirm the existing medal persistence shape before changing storage.
2. Add a backward-compatible owner selection/order model capped at four medals.
3. Render only the available owner-selected medals in saved order.
4. Make Medals and Challenges open all earned medals and completed challenges for the viewed account.
5. Preserve legacy accounts without a saved selection using a deterministic fallback.

## Task 5: Implement Focus and viewer-aware social context

**Files:**
- Update Buddy Card view/model files found during implementation
- Add focused display-rule tests

1. Enforce the approved 90-character Focus entry boundary and three-line card presentation.
2. Provide a full-text view when the displayed Focus is truncated.
3. Always show Cheers and Buddies.
4. For another viewer, show Mutual Buddies only when greater than zero.
5. For the owner, show Groups instead of Mutual Buddies.
6. Guard all viewer-specific results against account switches and stale completion.

## Task 6: Cumulative verification

1. Run focused Buddy Card, navigation, profile, medals, groups, and privacy tests.
2. Run the full Jest suite.
3. Run TypeScript and lint checks.
4. Check the diff for whitespace and unintended files.
5. Inspect the app on the connected phone in light and dark modes, including owner, buddy, and non-buddy states.
6. Verify back navigation from the card, medal collection, full Focus, editor, and recent posts.

## Constraints

- Do not weaken database row-level security or broaden public profile data.
- Do not remove existing Buddy Card information.
- Do not commit unrelated working-tree files or generated screenshots.
- Preserve the user's current uncommitted work and build on it carefully.
