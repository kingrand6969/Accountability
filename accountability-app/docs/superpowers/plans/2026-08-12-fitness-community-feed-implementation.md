# Fitness Community Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved fitness-community Feed with vertical My Day cards, manual Light/Dark themes, five-item navigation, polished post actions, relevant-only community modules, and owner-curated Buddy Card posts.

**Architecture:** Introduce a small persisted appearance boundary and semantic theme palettes, then migrate the app shell and approved social surfaces onto it. Keep personal Feed ranking server-owned; add typed community-module rows only when the server can provide a viewer-specific reason. Extend Buddy Card privacy with server-enforced category defaults while retaining `posts.show_on_card` as the final per-post override.

**Tech Stack:** Expo Router, React Native, TypeScript, AsyncStorage, Supabase/PostgreSQL RLS and RPCs, Jest source/behavior contracts, physical Android verification.

---

## File map

### New files

- `src/ui/AppearanceProvider.tsx` — persisted `light | dark` preference and resolved semantic palette.
- `src/ui/appearance.test.ts` — preference parsing, persistence, and palette contract.
- `src/app/appearance.tsx` — Menu → Options → Appearance screen.
- `src/feed/FeedComposer.tsx` — compact progress composer.
- `src/feed/FeedCommunityCard.tsx` — explained challenge/person/group/page modules.
- `src/feed/feedCommunity.ts` — typed parsing and relevance validation for community rows.
- `src/feed/feedCommunity.test.ts` — rejects unexplained or ineligible modules.
- `src/buddy/cardPostVisibility.ts` — category-default and per-post override resolution.
- `src/buddy/cardPostVisibility.test.ts` — precedence and nonmutation coverage.
- `supabase/migrations/0102_relevant_feed_and_buddy_card_defaults.sql` — viewer-bound community RPC plus Buddy Card category/default enforcement.
- `src/feed/relevantCommunityMigration.test.ts` — closed SQL contract for the new migration.

### Modified files

- `src/app/_layout.tsx` — mount `AppearanceProvider` above protected routes.
- `src/app/(app)/_layout.tsx` — five visible tabs, Menu last, theme-aware tab colors.
- `src/ui/GlassTabBar.tsx` — allow exactly Feed/Journey/Run/Messages/Menu.
- `src/ui/GlassTabBar.test.ts` — exact five-label and navigation contract.
- `src/app/(app)/index.tsx` — compact composer, vertical My Day rail, mixed Feed rows, no header hamburger.
- `src/stories/StoryRail.tsx` — portrait cards for owner and buddies.
- `src/stories/StoryRail.test.ts` — portrait sizing, viewed semantics, owner-first behavior.
- `src/feed/FeedProofCard.tsx` — approved hierarchy and outline-to-filled actions.
- `src/feed/socialScreenContract.test.ts` — final Feed presentation contract.
- `src/app/menu.tsx` — Profile/Buddy Card identity and Options → Appearance entry.
- `src/app/buddy-card-edit.tsx` — category defaults plus per-post explanation.
- `src/app/buddy-card/[id].tsx` — final owner-approved post projection and consistent profile terminology.
- `src/buddy/card.ts` — typed category defaults and server RPC call.
- `src/feed/api.ts` — hydrate typed community rows without weakening existing Feed guards.

## Task 1: Persisted Light and Dark appearance foundation

**Files:**
- Create: `src/ui/AppearanceProvider.tsx`
- Create: `src/ui/appearance.test.ts`
- Modify: `src/ui/theme.ts`
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Write the failing appearance contract**

```ts
import { appearanceFromStorage, paletteForAppearance } from './AppearanceProvider';

test('defaults missing and malformed preferences to light', () => {
  expect(appearanceFromStorage(null)).toBe('light');
  expect(appearanceFromStorage('system')).toBe('light');
});

test('provides complete light and dark semantic palettes', () => {
  expect(paletteForAppearance('light').canvas).toBe('#F7F4EC');
  expect(paletteForAppearance('dark').canvas).toBe('#080D16');
  expect(paletteForAppearance('dark').ink).toBe('#F8FAFC');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- --runInBand src/ui/appearance.test.ts`

Expected: FAIL because `AppearanceProvider` does not exist.

- [ ] **Step 3: Implement the provider and palette**

```tsx
export type Appearance = 'light' | 'dark';
export const APPEARANCE_KEY = 'accountability:appearance';

export function appearanceFromStorage(value: string | null): Appearance {
  return value === 'dark' ? 'dark' : 'light';
}

export const palettes = {
  light: { canvas: '#F7F4EC', card: '#FFFFFF', ink: '#081A3A', muted: '#64748B', border: '#E2E8F0', action: '#155EEF' },
  dark: { canvas: '#080D16', card: '#111927', ink: '#F8FAFC', muted: '#94A3B8', border: '#273449', action: '#68A3FF' },
} as const;
```

The provider must hydrate AsyncStorage before rendering themed app content, expose `appearance`, `palette`, and `setAppearance`, and persist only `light` or `dark`. Wrap the current root providers without changing authentication order.

- [ ] **Step 4: Verify GREEN and static safety**

Run: `npm.cmd test -- --runInBand src/ui/appearance.test.ts src/ui/theme.test.ts`

Expected: PASS.

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/ui/AppearanceProvider.tsx src/ui/appearance.test.ts src/ui/theme.ts src/app/_layout.tsx
git commit -m "feat: add persisted light and dark appearance"
```

## Task 2: Appearance screen and five-item bottom navigation

**Files:**
- Create: `src/app/appearance.tsx`
- Modify: `src/app/menu.tsx`
- Modify: `src/app/(app)/_layout.tsx`
- Modify: `src/ui/GlassTabBar.tsx`
- Test: `src/ui/GlassTabBar.test.ts`
- Test: `src/feed/socialScreenContract.test.ts`

- [ ] **Step 1: Write failing navigation and appearance assertions**

Assert the complete visible route list is exactly:

```ts
expect(visibleTabNames).toEqual(['index', 'activity', 'run', 'messages', 'menu']);
expect(visibleLabels).toEqual(['Feed', 'Journey', 'Run', 'Messages', 'Menu']);
```

Assert `menu.tsx` contains an Options entry routing to `/appearance`, and `appearance.tsx` exposes only Light and Dark choices with Light selected for missing storage.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --runInBand src/ui/GlassTabBar.test.ts src/feed/socialScreenContract.test.ts`

Expected: FAIL because Menu is not a visible tab and Appearance is absent.

- [ ] **Step 3: Implement Menu as the fifth tab**

Add a tab screen named `menu` after `messages`:

```tsx
<Tabs.Screen
  name="menu"
  options={{
    title: 'Menu',
    tabBarIcon: tabIcon('menu', 'menu-outline'),
    headerShown: true,
  }}
/>
```

Move or bridge the existing root Menu screen into `src/app/(app)/menu.tsx` without duplicating Menu state. Remove the Feed header's hamburger action. Keep Search, Create, and Notifications.

- [ ] **Step 4: Implement Menu → Options → Appearance**

The Appearance screen must use `useAppearance()` and render two radio-style 48-point controls:

```tsx
<AppearanceChoice label="Light Mode" value="light" icon="sunny" />
<AppearanceChoice label="Dark Mode" value="dark" icon="moon" />
```

Do not render a System option or a theme badge anywhere in the Feed.

- [ ] **Step 5: Verify focused behavior**

Run: `npm.cmd test -- --runInBand src/ui/GlassTabBar.test.ts src/feed/socialScreenContract.test.ts src/navigation/routeAccessContract.test.ts`

Expected: PASS with five visible destinations and no hidden-slot spacing.

- [ ] **Step 6: Commit**

```bash
git add src/app/appearance.tsx src/app/menu.tsx src/app/'(app)'/menu.tsx src/app/'(app)'/_layout.tsx src/ui/GlassTabBar.tsx src/ui/GlassTabBar.test.ts src/feed/socialScreenContract.test.ts
git commit -m "feat: add Menu tab and appearance options"
```

## Task 3: Vertical My Day portrait rail

**Files:**
- Modify: `src/stories/StoryRail.tsx`
- Test: `src/stories/StoryRail.test.ts`
- Modify: `src/app/(app)/index.tsx`

- [ ] **Step 1: Write failing portrait-card tests**

```ts
expect(storyTileSizeForFontScale(1)).toEqual({ tileWidth: 84, tileHeight: 132, hintWidth: 76 });
expect(storyTileSizeForFontScale(1.5).tileHeight).toBeGreaterThan(132);
```

Add source assertions for owner-first “Add to My Day,” buddy media previews, name, avatar, and viewed/unseen accessibility state.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --runInBand src/stories/StoryRail.test.ts`

Expected: FAIL with the current larger tile dimensions and current owner copy.

- [ ] **Step 3: Implement one portrait-card system**

Use a single `StoryPortraitCard` presentation for owner and buddy rows. The owner variant keeps picker behavior and displays `Add to My Day`; buddy variants retain ordering, viewed receipts, retry, identity guards, and picker queue behavior. Use `contentFit="cover"`, a bottom scrim, a top-left avatar ring, and a two-line maximum name.

- [ ] **Step 4: Verify story behavior and lifecycle**

Run: `npm.cmd test -- --runInBand src/stories/StoryRail.test.ts src/stories/storyOrdering.test.ts src/stories/api.behavior.test.ts src/stories/storyPlaybackLifecycle.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stories/StoryRail.tsx src/stories/StoryRail.test.ts src/app/'(app)'/index.tsx
git commit -m "feat: redesign My Day as portrait stories"
```

## Task 4: Compact composer and polished post actions

**Files:**
- Create: `src/feed/FeedComposer.tsx`
- Modify: `src/app/(app)/index.tsx`
- Modify: `src/feed/FeedProofCard.tsx`
- Modify: `src/memories/SaveToMemories.tsx`
- Test: `src/feed/socialScreenContract.test.ts`
- Test: `src/feed/immersivePostContract.test.ts`

- [ ] **Step 1: Write the failing presentation contract**

Assert the Feed composer has one row, one prompt, avatar, and media action; reject the old Post/Photo/Flex three-action card. Assert action icons share size 26, equal flex, and 48-point minimum targets. Assert Cheer and Save use outline normally and filled active variants, while Comment and Share never expose selected state.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts`

Expected: FAIL on the old composer and current icon presentation.

- [ ] **Step 3: Implement the compact composer**

```tsx
<FeedComposer
  avatarUrl={myAvatar}
  prompt="Share today’s progress…"
  onCompose={() => router.push('/compose')}
  onMedia={() => router.push({ pathname: '/compose', params: { media: '1' } })}
/>
```

Preserve the global Create modal and its other creation destinations.

- [ ] **Step 4: Implement action-state icon rules**

Create an action descriptor that separates toggle state from momentary actions:

```ts
type FeedAction = {
  icon: IoniconName;
  activeIcon?: IoniconName;
  active?: boolean;
  count?: number;
  label: string;
};
```

Only Cheer and Save receive `active` and `accessibilityState.selected`. Counts render and are spoken only above zero. Preserve post mutation locks, retry, share behavior, comments, and Save-to-Memories lifecycle.

- [ ] **Step 5: Verify contracts and types**

Run: `npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts src/feed/encouragementContract.test.ts`

Expected: PASS.

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/feed/FeedComposer.tsx src/app/'(app)'/index.tsx src/feed/FeedProofCard.tsx src/memories/SaveToMemories.tsx src/feed/socialScreenContract.test.ts src/feed/immersivePostContract.test.ts
git commit -m "feat: polish Feed composer and post actions"
```

## Task 5: Relevant-only community module contract

**Files:**
- Create: `supabase/migrations/0102_relevant_feed_and_buddy_card_defaults.sql`
- Create: `src/feed/relevantCommunityMigration.test.ts`
- Create: `src/feed/feedCommunity.ts`
- Create: `src/feed/feedCommunity.test.ts`

- [ ] **Step 1: Write failing SQL and parsing contracts**

The migration test must require an authenticated-only RPC named `relevant_feed_modules(p_limit integer default 10)`. It must return a reason code and human-readable reason for every row and reject rows with no direct invitation, ownership, or eligibility relationship.

```ts
expect(parseCommunityRow({ kind: 'challenge', reason_code: null })).toBeNull();
expect(parseCommunityRow({ kind: 'challenge', reason_code: 'invited', reason: 'Invited by Jamie' })?.reason).toBe('Invited by Jamie');
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --runInBand src/feed/relevantCommunityMigration.test.ts src/feed/feedCommunity.test.ts`

Expected: FAIL because migration and parser are missing.

- [ ] **Step 3: Implement the security boundary**

The SQL function must capture `auth.uid()`, reject anonymous callers, use a fixed `search_path`, apply current moderation and block rules, and emit challenge rows only for creator, participant/invite, eligible group, or declared interest relationships. Suggested people/groups/pages require a nonempty reason derived from existing relationship tables. Revoke execution from PUBLIC and anon; grant only to authenticated.

- [ ] **Step 4: Implement the typed client parser**

Use a discriminated union:

```ts
export type FeedCommunityModule =
  | { kind: 'challenge'; id: string; title: string; reason: string; reasonCode: 'created' | 'invited' | 'eligible' }
  | { kind: 'person' | 'group' | 'page'; id: string; title: string; reason: string; reasonCode: 'mutual' | 'shared_group' | 'shared_interest' };
```

Return `null` for unknown kinds, missing IDs, missing titles, or blank reasons.

- [ ] **Step 5: Verify GREEN and migration boundary**

Run: `npm.cmd test -- --runInBand src/feed/relevantCommunityMigration.test.ts src/feed/feedCommunity.test.ts src/feed/unifiedFeedMigration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0102_relevant_feed_and_buddy_card_defaults.sql src/feed/relevantCommunityMigration.test.ts src/feed/feedCommunity.ts src/feed/feedCommunity.test.ts
git commit -m "feat: define relevant Feed community modules"
```

## Task 6: Mixed Feed row compositor

**Files:**
- Create: `src/feed/FeedCommunityCard.tsx`
- Modify: `src/feed/api.ts`
- Modify: `src/app/(app)/index.tsx`
- Test: `src/feed/relationshipFeed.test.ts`
- Test: `src/feed/socialScreenContract.test.ts`

- [ ] **Step 1: Write failing mixed-row behavior tests**

Cover personal posts first, no leading community module, one module only after at least four posts, no unexplained rows, no duplicates, and account-switch suppression. A challenge created by or invited to the viewer must preserve its reason text.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --runInBand src/feed/relationshipFeed.test.ts src/feed/socialScreenContract.test.ts`

Expected: FAIL because Feed rows contain posts only.

- [ ] **Step 3: Hydrate community rows independently**

Fetch community modules concurrently with the personal snapshot refresh, but do not fail or clear an otherwise successful post Feed when the community RPC fails. Stamp results with the existing owner/generation identity and reject stale completion.

- [ ] **Step 4: Render explained module cards**

`FeedCommunityCard` must display the reason above the title, use existing owner-bound mutation APIs, and provide `Not now` dismissal without mutating relationships. Generic challenges never render. Suggested modules must route to Buddy Card, group, page, or challenge detail.

- [ ] **Step 5: Verify Feed lifecycle**

Run: `npm.cmd test -- --runInBand src/feed/relationshipFeed.test.ts src/feed/socialScreenContract.test.ts src/feed/videoPolicy.test.ts src/feed/useActiveVideoList.test.tsx`

Expected: PASS without changing one-active-video behavior or preserved Feed return state.

- [ ] **Step 6: Commit**

```bash
git add src/feed/FeedCommunityCard.tsx src/feed/api.ts src/app/'(app)'/index.tsx src/feed/relationshipFeed.test.ts src/feed/socialScreenContract.test.ts
git commit -m "feat: mix relevant community into Feed"
```

## Task 7: Buddy Card category defaults and per-post overrides

**Files:**
- Modify: `supabase/migrations/0102_relevant_feed_and_buddy_card_defaults.sql`
- Create: `src/buddy/cardPostVisibility.ts`
- Create: `src/buddy/cardPostVisibility.test.ts`
- Modify: `src/buddy/card.ts`
- Modify: `src/feed/api.ts`
- Modify: `src/app/compose.tsx`

- [ ] **Step 1: Write failing precedence tests**

```ts
expect(resolveCardVisibility({ categoryDefault: true, override: false })).toBe(false);
expect(resolveCardVisibility({ categoryDefault: false, override: true })).toBe(true);
expect(resolveCardVisibility({ categoryDefault: true, override: null })).toBe(true);
```

Require category keys for run, achievement, workout, photo, video, milestone, event, and ordinary post content. The function must not mutate its input.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --runInBand src/buddy/cardPostVisibility.test.ts src/buddy/publicProfilePrivacyMigration.test.ts`

Expected: FAIL because defaults and nullable override semantics are absent.

- [ ] **Step 3: Extend storage without weakening privacy**

Store category defaults in the owner's `buddy_card` JSON as `post_category_defaults`. Add a nullable `buddy_card_override` column to posts. Create an authenticated, owner-bound RPC that returns only final visible Buddy Card posts using:

```sql
coalesce(p.buddy_card_override, category_default_for(p.post_type), false)
```

The RPC must enforce owner/viewer rules server-side and must not expose rejected post rows for client filtering.

- [ ] **Step 4: Preserve compose compatibility**

Map the existing “Show on Buddy Card” control to explicit `true` or `false`; use `null` only when the user leaves the post on category default. Existing historical `show_on_card` values must migrate to explicit overrides so replay does not change prior choices.

- [ ] **Step 5: Verify migration and behavior**

Run: `npm.cmd test -- --runInBand src/buddy/cardPostVisibility.test.ts src/buddy/publicProfilePrivacyMigration.test.ts src/feed/relevantCommunityMigration.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0102_relevant_feed_and_buddy_card_defaults.sql src/buddy/cardPostVisibility.ts src/buddy/cardPostVisibility.test.ts src/buddy/card.ts src/feed/api.ts src/app/compose.tsx
git commit -m "feat: add Buddy Card post visibility defaults"
```

## Task 8: Buddy Card profile and owner controls

**Files:**
- Modify: `src/app/menu.tsx`
- Modify: `src/app/buddy-card-edit.tsx`
- Modify: `src/app/buddy-card/[id].tsx`
- Modify: `src/buddy/card.ts`
- Test: `src/buddy/publicProfilePrivacyMigration.test.ts`
- Test: `src/feed/socialScreenContract.test.ts`

- [ ] **Step 1: Write failing Buddy Card UI contracts**

Require Menu profile entry to route to the owner's Buddy Card editor/preview, visitor screens to show rank, badges, achievements, summaries, and server-approved posts only, and owner controls for category defaults plus per-post explanation.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- --runInBand src/buddy/publicProfilePrivacyMigration.test.ts src/feed/socialScreenContract.test.ts`

Expected: FAIL on missing category controls and inconsistent profile terminology.

- [ ] **Step 3: Implement the owner editor**

Add a “Posts shown on your Buddy Card” section with category switches and this fixed explanation:

```tsx
<Text>
  Category choices are your defaults. You can override any individual post when you publish or edit it.
</Text>
```

Provide a Preview action that opens the owner's Buddy Card through the same viewer route used by other people.

- [ ] **Step 4: Implement visitor projection**

Replace `listCardPosts(userId, isBuddy)` with the owner/viewer-bound RPC. Do not let buddy status bypass the owner's final selection. Render empty copy as “No Buddy Card posts shared yet.” Preserve blocks, report options, chat actions, medals, and performance metric privacy flags.

- [ ] **Step 5: Verify focused suites**

Run: `npm.cmd test -- --runInBand src/buddy src/feed/socialScreenContract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/menu.tsx src/app/buddy-card-edit.tsx src/app/buddy-card/'[id].tsx' src/buddy/card.ts src/buddy/publicProfilePrivacyMigration.test.ts src/feed/socialScreenContract.test.ts
git commit -m "feat: make Buddy Card the curated profile"
```

## Task 9: Full verification and physical Android acceptance

**Files:**
- Modify only regression tests required by evidence discovered in this task.

- [ ] **Step 1: Run static verification**

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

Run: `npm.cmd run lint`

Expected: zero errors and warnings.

- [ ] **Step 2: Run the full Jest suite**

Run: `npm.cmd test -- --runInBand`

Expected: all suites and snapshots pass.

- [ ] **Step 3: Validate migration locally when PostgreSQL is available**

Run: `npx.cmd supabase db reset`

Expected: migrations replay through `0102` successfully. If Docker is unavailable, record this as an explicit verification concern and do not apply remotely as a substitute.

- [ ] **Step 4: Build/export the Android preview bundle**

Run: `npx.cmd expo export --platform android --output-dir dist-feed-redesign`

Expected: Android bundle completes without missing modules or routes. Remove only the generated `dist-feed-redesign` output after verification.

- [ ] **Step 5: Perform physical-device acceptance**

Verify on the connected Android preview build:

1. Feed opens in Light Mode for a new preference.
2. All My Day cards are portrait rectangles and scroll horizontally.
3. Opening and backing out of a post never shows a black screen or blocking Feed reload.
4. Comment text stays visible above the keyboard.
5. Cheer and Save fill blue; Comment and Share remain outlines.
6. Menu is the fifth bottom tab after Messages.
7. Dark Mode is selected only through Menu → Options → Appearance and survives restart.
8. No theme badge appears in Feed.
9. Invited/created/eligible challenges show an explicit reason; generic challenges do not appear.
10. Buddy Card category defaults and per-post overrides produce the expected visitor view from a second account.

- [ ] **Step 6: Commit any evidence-driven regression tests**

```bash
git add src/feed/socialScreenContract.test.ts src/stories/StoryRail.test.ts src/buddy/cardPostVisibility.test.ts
git commit -m "test: verify fitness community Feed acceptance"
```

Do not create this commit if physical verification finds no missing regression coverage.
