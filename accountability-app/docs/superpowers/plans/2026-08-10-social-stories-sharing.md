# Social Feed, My Day, and Achievement Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the existing Meta-like Feed and My Day so buddies and followed people appear correctly and every achievement share remains explicitly user-triggered.

**Architecture:** Reuse `buddy_stars` as the existing person-follow relationship, add per-user story view receipts, and centralize optional achievement destinations behind one confirmation model. Activity persistence remains independent from social publishing.

**Tech Stack:** Expo Router, React Native, TypeScript, Jest, Supabase/PostgreSQL

---

## File map

- Story audience/view state: `supabase/migrations/0098_story_followers_and_views.sql`, `src/stories/api.ts`, `src/stories/storyOrdering.ts`, `src/stories/StoryRail.tsx`, `src/app/story/[userId].tsx`.
- Feed story placement: `src/app/(app)/index.tsx`; delete the dashboard-only `src/feed/MyDayRail.tsx`.
- Feed audience: `src/feed/api.ts` using `buddy_links` and `buddy_stars`.
- Explicit share decision: `src/entry/achievementShareDecision.ts`, `src/entry/AchievementSharePrompt.tsx`, `src/activity/RunMediaActions.tsx`, completion surfaces for workouts, streaks, and challenges.
- Tests: `src/stories/storyOrdering.test.ts`, `src/feed/followedFeed.test.ts`, `src/entry/achievementShareDecision.test.ts`.

### Task 1: Define story ordering as a pure function

**Files:**
- Create: `src/stories/storyOrdering.ts`
- Create: `src/stories/storyOrdering.test.ts`

- [ ] **Step 1: Write failing ordering tests**

```ts
import { orderStoryGroups } from './storyOrdering';

const group = (user_id: string, isMe: boolean, viewed: boolean, latest: string) => ({
  user_id, isMe, viewed, latestCreatedAt: latest,
});

test('orders me, unseen relationships, then viewed relationships', () => {
  const result = orderStoryGroups([
    group('viewed', false, true, '2026-08-10T10:00:00Z'),
    group('unseen-old', false, false, '2026-08-10T08:00:00Z'),
    group('me', true, true, '2026-08-10T07:00:00Z'),
    group('unseen-new', false, false, '2026-08-10T09:00:00Z'),
  ]);
  expect(result.map((item) => item.user_id)).toEqual(['me', 'unseen-new', 'unseen-old', 'viewed']);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --runInBand src/stories/storyOrdering.test.ts`  
Expected: FAIL because `storyOrdering.ts` does not exist.

- [ ] **Step 3: Implement the deterministic ordering**

```ts
export type OrderableStoryGroup = {
  user_id: string;
  isMe: boolean;
  viewed: boolean;
  latestCreatedAt: string;
};

export function orderStoryGroups<T extends OrderableStoryGroup>(groups: readonly T[]): T[] {
  return [...groups].sort((a, b) =>
    Number(b.isMe) - Number(a.isMe) ||
    Number(a.viewed) - Number(b.viewed) ||
    new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime() ||
    a.user_id.localeCompare(b.user_id),
  );
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- --runInBand src/stories/storyOrdering.test.ts`  
Expected: PASS.

```bash
git add src/stories/storyOrdering.ts src/stories/storyOrdering.test.ts
git commit -m "feat: define My Day story ordering"
```

### Task 2: Add followed-user story access and view receipts

**Files:**
- Create: `supabase/migrations/0098_story_followers_and_views.sql`
- Create: `src/stories/storyAudienceMigration.test.ts`

- [ ] **Step 1: Write the failing migration contract**

Assert that migration `0098` creates `story_views`, references `buddy_stars`, preserves `are_buddies`, and calls `users_blocked`.

```ts
expect(sql).toContain('create table if not exists public.story_views');
expect(sql).toContain('public.buddy_stars');
expect(sql).toContain('public.are_buddies');
expect(sql).toContain('not public.users_blocked');
```

- [ ] **Step 2: Implement the migration**

```sql
create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

alter table public.story_views enable row level security;
create policy story_views_select_own on public.story_views
  for select to authenticated using (user_id = auth.uid());
create policy story_views_insert_own on public.story_views
  for insert to authenticated with check (user_id = auth.uid());
create policy story_views_update_own on public.story_views
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories
  for select to authenticated using (
    user_id = auth.uid()
    or (
      expires_at > now()
      and not public.users_blocked(auth.uid(), user_id)
      and (
        public.are_buddies(user_id, auth.uid())
        or exists (
          select 1 from public.buddy_stars s
          where s.target = stories.user_id and s.starrer = auth.uid()
        )
      )
    )
  );
```

- [ ] **Step 3: Run the migration test and local reset**

Run: `npm test -- --runInBand src/stories/storyAudienceMigration.test.ts`  
Expected: PASS.

Run: `npx supabase db reset`  
Expected: migration succeeds and unrelated users cannot read or mark stories viewed.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0098_story_followers_and_views.sql src/stories/storyAudienceMigration.test.ts
git commit -m "feat: add followed My Day stories and view receipts"
```

### Task 3: Hydrate and record viewed state in the existing viewer

**Files:**
- Modify: `src/stories/api.ts`
- Modify: `src/app/story/[userId].tsx`
- Modify: `src/stories/StoryRail.tsx`
- Modify: `src/stories/StoryRail.test.ts`
- Modify: `src/app/(app)/index.tsx`
- Delete: `src/feed/MyDayRail.tsx`

- [ ] **Step 1: Expand `StoryGroup` and load receipts**

Add:

```ts
export type StoryGroup = {
  user_id: string;
  name: string | null;
  avatar: string | null;
  isMe: boolean;
  viewed: boolean;
  latestCreatedAt: string;
  stories: Story[];
};
```

After loading stories, query `story_views` for visible story IDs, mark a non-owner group viewed only when every active story has a receipt, and call `orderStoryGroups(groups)`.

- [ ] **Step 2: Add an idempotent receipt writer**

```ts
export async function markStoryViewed(storyId: string): Promise<void> {
  const uid = await me();
  if (!uid) return;
  const { error } = await supabase.from('story_views').upsert(
    { story_id: storyId, user_id: uid, viewed_at: new Date().toISOString() },
    { onConflict: 'story_id,user_id' },
  );
  if (error) throw error;
}
```

- [ ] **Step 3: Record only the story actually displayed**

In `src/app/story/[userId].tsx`, call `markStoryViewed(story.id)` in an effect keyed by `story.id`. Do not block viewing or auto-advance if receipt storage fails.

- [ ] **Step 4: Render unseen/viewed rings without redesigning tiles**

Pass `viewed={g.viewed}` into `StoryTile` and change only the existing ring color/opacity. Preserve dimensions, photo layout, labels, picker, and viewer route.

- [ ] **Step 5: Put the existing Meta-style rail visibly inside Feed**

Delete the `MyDayRail` import, `myDayValues` summary calculation, and `<MyDayRail values={myDayValues} />` from `src/app/(app)/index.tsx`. Move the existing `StoryRail` out of `hiddenStoryController` and into `feedHeader`:

```tsx
<StoryRail
  key={myId}
  ref={storyRailRef}
  meName={profileOwnerId === myId ? me.name : null}
  meAvatar={profileOwnerId === myId ? me.avatar : null}
/>
```

Keep the ref so the existing “Add to My Day” quick action still opens its picker. Delete `src/feed/MyDayRail.tsx` and its now-unused `MyDayValues` contract if no other caller remains.

- [ ] **Step 6: Show a retry tile when story loading fails**

Add `loadError` state in `StoryRail`. `load()` clears it, awaits `listStoryGroups`, and sets it on rejection. Render a compact “Couldn’t load My Day · Retry” tile that calls `load`; do not hide Feed posts or other tabs.

- [ ] **Step 7: Test and commit**

Run: `npm test -- --runInBand src/stories`  
Expected: PASS.

```bash
git add src/stories src/app/story/[userId].tsx src/app/(app)/index.tsx src/feed/MyDayRail.tsx
git commit -m "feat: order My Day by unseen buddy and followed stories"
```

### Task 4: Include followed people in the relationship Feed

**Files:**
- Modify: `src/feed/api.ts`
- Create: `src/feed/followedFeed.test.ts`

- [ ] **Step 1: Write a failing relationship-ID test**

Extract a pure helper and test stable deduplication:

```ts
expect(relationshipFeedIds('me', ['buddy', 'same'], ['followed', 'same']))
  .toEqual(['me', 'buddy', 'same', 'followed']);
```

- [ ] **Step 2: Load followed IDs from the existing Buddy Stars table**

```ts
async function myFollowedIds(me: string | null): Promise<string[]> {
  if (!me) return [];
  const { data, error } = await supabase
    .from('buddy_stars')
    .select('target')
    .eq('starrer', me);
  if (error) throw error;
  return (data ?? []).map((row: { target: string }) => row.target);
}
```

Load hidden IDs, buddies, and followed IDs in the existing `Promise.all`, then use the deduplicated relationship IDs for buddies mode. Keep Discover public-only and exclude known relationships.

- [ ] **Step 3: Test and commit**

Run: `npm test -- --runInBand src/feed/followedFeed.test.ts src/feed/runPostIdempotency.test.ts`  
Expected: PASS.

```bash
git add src/feed/api.ts src/feed/followedFeed.test.ts
git commit -m "feat: include followed people in the Feed"
```

### Task 5: Centralize explicit achievement-share decisions

**Files:**
- Create: `src/entry/achievementShareDecision.ts`
- Create: `src/entry/achievementShareDecision.test.ts`
- Create: `src/entry/AchievementSharePrompt.tsx`

- [ ] **Step 1: Write tests proving there is no automatic publish outcome**

```ts
import { initialAchievementShare, chooseAchievementDestination } from './achievementShareDecision';

test('starts private and requires an explicit destination', () => {
  expect(initialAchievementShare()).toEqual({ destination: null, confirmed: false });
});

test('choosing a destination still requires confirmation', () => {
  expect(chooseAchievementDestination('feed')).toEqual({ destination: 'feed', confirmed: false });
});
```

- [ ] **Step 2: Implement the pure state model**

```ts
export type AchievementDestination = 'feed' | 'story' | 'private';
export type AchievementShareDecision = {
  destination: AchievementDestination | null;
  confirmed: boolean;
};

export const initialAchievementShare = (): AchievementShareDecision => ({ destination: null, confirmed: false });
export const chooseAchievementDestination = (destination: AchievementDestination): AchievementShareDecision => ({ destination, confirmed: false });
export const confirmAchievementShare = (decision: AchievementShareDecision): AchievementShareDecision => ({ ...decision, confirmed: true });
```

- [ ] **Step 3: Build the reusable prompt**

`AchievementSharePrompt` renders three buttons—Share to Feed, Add to My Day, Keep private—then an explicit confirmation action for Feed/My Day. `Keep private` closes immediately without a network call. Accept callbacks `onFeed`, `onStory`, and `onPrivate`; never call them on mount.

- [ ] **Step 4: Test and commit**

Run: `npm test -- --runInBand src/entry/achievementShareDecision.test.ts`  
Expected: PASS.

```bash
git add src/entry/achievementShareDecision.ts src/entry/achievementShareDecision.test.ts src/entry/AchievementSharePrompt.tsx
git commit -m "feat: require explicit achievement sharing"
```

### Task 6: Integrate the prompt into completion flows

**Files:**
- Modify: `src/activity/RunMediaActions.tsx`
- Modify: `src/activity/saveRunMedia.ts`
- Modify: `src/activity/saveRunMedia.test.ts`
- Modify: `src/app/gym.tsx`
- Modify: `src/app/exercise/[id].tsx`
- Modify: `src/gym/WorkoutTitleModal.tsx`
- Modify: `src/app/win-card.tsx`
- Modify: challenge completion/win surface in `src/app/challenge/[id].tsx` and `src/app/compete.tsx`

- [ ] **Step 1: Add `story` to the run media destination contract**

Extend `RunMediaDestination` from `'memories' | 'phone' | 'share' | 'feed'` to `'memories' | 'phone' | 'share' | 'feed' | 'story'`. Add a `story` action beside Feed in `RunMediaActions`. Its callback renders/uploads the existing run card and calls `addStory` only after `AchievementSharePrompt` returns a confirmed `story` decision. Keep `completeRecordedActivity` before the prompt so sharing cannot affect durable activity storage.

- [ ] **Step 2: Replace direct Post-to-Feed execution with the prompt**

Opening the run completion actions must show `AchievementSharePrompt`. Feed calls the existing `createRunPostIdempotent` path; My Day calls `addStory`; private closes the prompt. A rejected callback sets the prompt error text and leaves the completed activity and rendered preview intact.

- [ ] **Step 3: Reuse the same prompt for workout, streak, and challenge completions**

Make `src/app/win-card.tsx` the shared non-run completion surface. After `WorkoutTitleModal` confirms a saved workout, offer `/win-card?kind=workout&sourceId=<timeline-id>`; challenge wins use `/win-card?kind=challenge&sourceId=<challenge-id>`; the existing streak metrics use `kind=streak`. Parse these into:

```ts
export type AchievementPayload = {
  kind: 'workout' | 'streak' | 'challenge';
  sourceId: string;
  text: string;
  mediaUri: string | null;
};
```

`win-card.tsx` passes this payload to the same `AchievementSharePrompt`; only the destination adapter differs.

- [ ] **Step 4: Prove cancellation and failures never publish**

Add tests where `onFeed` rejects and where the prompt closes before confirmation. Assert zero `createRunPostIdempotent`/`addStory` calls and unchanged activity completion state.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- --runInBand src/activity src/entry src/stories src/feed`  
Expected: PASS.

Run: `npx tsc --noEmit`  
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/activity src/entry src/stories src/app/gym.tsx src/app/exercise src/app/challenge src/app/compete.tsx
git commit -m "feat: share achievements only on user confirmation"
```
