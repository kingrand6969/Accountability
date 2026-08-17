# Unified Meta-Style Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Buddies/Discover Feed switch with one ranked social timeline, move discovery into Menu, rename user-facing Encourage language to Cheer, and repair the missing staging Feed database contract.

**Architecture:** A security-invoker Postgres RPC selects eligible connection and suggestion candidates, assigns deterministic tiers, limits suggestion frequency, and returns a stable ordered page. The client hydrates returned IDs without reordering, while a separate Menu route hosts discovery for people, groups, and pages. Database migrations are verified and applied to staging before a replacement preview APK is built.

**Tech Stack:** Expo SDK 56, React Native, Expo Router, TypeScript, Supabase/Postgres RLS and RPC, Jest, EAS preview builds, Android ADB

---

## File map

- Feed ranking contract: `src/feed/unifiedFeedRanking.ts`, `src/feed/unifiedFeedRanking.test.ts`.
- Feed database RPC: `supabase/migrations/0101_unified_social_feed.sql`, `src/feed/unifiedFeedMigration.test.ts`.
- Feed API hydration: `src/feed/api.ts`, `src/feed/api.test.ts`.
- Feed screen: `src/app/(app)/index.tsx`, `src/feed/socialScreenContract.test.ts`.
- Discover route and hub: `src/app/discover.tsx`, `src/discover/DiscoverHub.tsx`, `src/discover/DiscoverExperience.tsx`, `src/discover/DiscoverHub.test.ts`.
- Menu navigation: `src/app/menu.tsx`, `src/navigation/socialUtilityRouteContract.test.ts`.
- Cheer presentation: Feed/detail/notification/accessibility files discovered by the contract in Task 6.
- Staging verification evidence: `docs/release-evidence/2026-08-11-unified-feed-staging.md`.

### Task 1: Lock the unified ranking contract

**Files:**
- Create: `src/feed/unifiedFeedRanking.ts`
- Create: `src/feed/unifiedFeedRanking.test.ts`

- [ ] **Step 1: Write failing ranking and suggestion-frequency tests**

```ts
import { interleaveUnifiedFeed, type RankedFeedCandidate } from './unifiedFeedRanking';

const row = (
  id: string,
  source: RankedFeedCandidate['source'],
  createdAt: string,
  score = 0,
): RankedFeedCandidate => ({ id, source, createdAt, score });

test('keeps connection content dominant and inserts at most one suggestion per five rows', () => {
  const result = interleaveUnifiedFeed({
    connections: [
      row('me', 'self', '2026-08-11T00:06:00Z'),
      row('buddy', 'buddy', '2026-08-11T00:05:00Z'),
      row('follow', 'followed_person', '2026-08-11T00:04:00Z'),
      row('group', 'joined_group', '2026-08-11T00:03:00Z'),
      row('page', 'followed_page', '2026-08-11T00:02:00Z'),
    ],
    suggestions: [row('suggested', 'suggested', '2026-08-11T00:07:00Z', 100)],
    limit: 20,
  });

  expect(result.map(({ id }) => id)).toEqual([
    'me', 'buddy', 'follow', 'group', 'suggested', 'page',
  ]);
});

test('uses score only inside a source tier and applies deterministic id ties', () => {
  const result = interleaveUnifiedFeed({
    connections: [
      row('b', 'buddy', '2026-08-11T00:00:00Z', 2),
      row('a', 'buddy', '2026-08-11T00:00:00Z', 2),
    ],
    suggestions: [],
    limit: 20,
  });
  expect(result.map(({ id }) => id)).toEqual(['a', 'b']);
});
```

- [ ] **Step 2: Run the test and record RED**

Run: `npm.cmd test -- --runInBand src/feed/unifiedFeedRanking.test.ts`
Expected: FAIL because `unifiedFeedRanking` does not exist.

- [ ] **Step 3: Implement the pure deterministic policy**

```ts
export type UnifiedFeedSource =
  | 'self'
  | 'buddy'
  | 'followed_person'
  | 'joined_group'
  | 'followed_page'
  | 'suggested';

export type RankedFeedCandidate = Readonly<{
  id: string;
  source: UnifiedFeedSource;
  createdAt: string;
  score: number;
}>;

const tier: Record<Exclude<UnifiedFeedSource, 'suggested'>, number> = {
  self: 0,
  buddy: 1,
  followed_person: 2,
  joined_group: 3,
  followed_page: 4,
};

function connectionOrder(a: RankedFeedCandidate, b: RankedFeedCandidate) {
  const sourceDelta = tier[a.source as Exclude<UnifiedFeedSource, 'suggested'>]
    - tier[b.source as Exclude<UnifiedFeedSource, 'suggested'>];
  if (sourceDelta) return sourceDelta;
  const timeDelta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (timeDelta) return timeDelta;
  if (a.score !== b.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

export function interleaveUnifiedFeed(input: {
  connections: readonly RankedFeedCandidate[];
  suggestions: readonly RankedFeedCandidate[];
  limit: number;
}) {
  const connections = [...input.connections].sort(connectionOrder);
  const suggestions = [...input.suggestions].sort(connectionOrder);
  const output: RankedFeedCandidate[] = [];
  while (connections.length && output.length < input.limit) {
    output.push(...connections.splice(0, 4));
    if (suggestions.length && output.length < input.limit) output.push(suggestions.shift()!);
  }
  return output.concat(connections).slice(0, input.limit);
}
```

- [ ] **Step 4: Run focused tests and commit**

Run: `npm.cmd test -- --runInBand src/feed/unifiedFeedRanking.test.ts`
Expected: PASS.

```powershell
git add src/feed/unifiedFeedRanking.ts src/feed/unifiedFeedRanking.test.ts
git commit -m "test: define unified Feed ranking"
```

### Task 2: Create the unified Feed database RPC

**Files:**
- Create: `supabase/migrations/0101_unified_social_feed.sql`
- Create: `src/feed/unifiedFeedMigration.test.ts`

- [ ] **Step 1: Write a failing migration contract**

```ts
import { readFileSync } from 'node:fs';

test('defines an authenticated security-invoker unified Feed RPC', () => {
  const sql = readFileSync(
    require.resolve('../../supabase/migrations/0101_unified_social_feed.sql'),
    'utf8',
  );
  expect(sql).toMatch(/create or replace function public\.unified_feed_post_ids/i);
  expect(sql).toMatch(/security invoker/i);
  expect(sql).toMatch(/returns table\(id uuid, source text, suggested boolean\)/i);
  expect(sql).toMatch(/moderation_state = 'visible'/i);
  expect(sql).toMatch(/post_hides|users_blocked/i);
  expect(sql).toMatch(/joined_group|followed_page|suggested/i);
  expect(sql).toMatch(/revoke execute[\s\S]*from public, anon/i);
  expect(sql).toMatch(/grant execute[\s\S]*to authenticated/i);
  expect(sql).not.toMatch(/security definer|execute format|\bdynamic\b/i);
});
```

- [ ] **Step 2: Run the contract and record RED**

Run: `npm.cmd test -- --runInBand src/feed/unifiedFeedMigration.test.ts`
Expected: FAIL because migration 0101 is absent.

- [ ] **Step 3: Implement one bounded SQL function**

Create `public.unified_feed_post_ids(p_before timestamptz, p_before_id uuid, p_limit integer)` returning `(id uuid, source text, suggested boolean)`. Build explicit CTEs for:

```sql
connection_candidates as (
  select p.id,
         case
           when p.user_id = auth.uid() then 'self'
           when public.are_buddies(auth.uid(), p.user_id) then 'buddy'
           when exists (
             select 1 from public.buddy_stars s
             where s.starrer = auth.uid() and s.target = p.user_id
           ) then 'followed_person'
           when p.group_id is not null then 'joined_group'
           else 'followed_page'
         end as source,
         false as suggested,
         p.created_at,
         p.id as tie_id
  from public.posts p
  where p.moderation_state = 'visible'
    and not exists (
      select 1 from public.post_hides h
      where h.user_id = auth.uid() and h.post_id = p.id
    )
    and not public.users_blocked(auth.uid(), p.user_id)
    and (
      p.user_id = auth.uid()
      or public.are_buddies(auth.uid(), p.user_id)
      or exists (select 1 from public.buddy_stars s where s.starrer = auth.uid() and s.target = p.user_id)
      or exists (select 1 from public.group_members gm where gm.group_id = p.group_id and gm.user_id = auth.uid())
      or exists (select 1 from public.page_follows pf where pf.page_id = p.page_id and pf.user_id = auth.uid())
    )
),
suggestion_candidates as (
  select p.id, 'suggested'::text as source, true as suggested, p.created_at, p.id as tie_id
  from public.posts p
  where p.audience = 'public'
    and p.moderation_state = 'visible'
    and p.user_id <> auth.uid()
    and not public.are_buddies(auth.uid(), p.user_id)
    and not exists (select 1 from public.buddy_stars s where s.starrer = auth.uid() and s.target = p.user_id)
    and not exists (select 1 from public.post_hides h where h.user_id = auth.uid() and h.post_id = p.id)
    and not public.users_blocked(auth.uid(), p.user_id)
)
```

Use `public.group_members(group_id, user_id)` and `public.page_follows(page_id, user_id)`, matching migrations 0023 and 0025. Apply `(created_at, id) < (p_before, p_before_id)` when both cursor values are present, cap the requested limit with `least(greatest(coalesce(p_limit, 20), 1), 50)`, deterministically interleave a maximum of one suggestion per five returned rows, and set `search_path = public`.

- [ ] **Step 4: Add closed security and schema-history assertions**

Extend the test to resolve the real table/function names from migration history and assert no removed Finance/business object is referenced. Assert PUBLIC and anon cannot execute the RPC and authenticated can.

- [ ] **Step 5: Run database contracts and commit**

Run: `npm.cmd test -- --runInBand src/feed/unifiedFeedMigration.test.ts src/feed/followedIndexMigration.test.ts src/database/financeRemovalMigration.test.ts`
Expected: PASS.

```powershell
git add supabase/migrations/0101_unified_social_feed.sql src/feed/unifiedFeedMigration.test.ts
git commit -m "feat: add unified social Feed query"
```

### Task 3: Hydrate the ranked server Feed without reordering

**Files:**
- Modify: `src/feed/api.ts`
- Modify: `src/feed/api.test.ts`
- Create: `src/feed/unifiedFeedApi.test.ts`

- [ ] **Step 1: Write failing RPC-order and failure-boundary tests**

```ts
test('hydrates only RPC ids and preserves the ranked order', async () => {
  rpc.mockResolvedValue({
    data: [
      { id: 'post-b', source: 'buddy', suggested: false },
      { id: 'post-s', source: 'suggested', suggested: true },
      { id: 'post-a', source: 'followed_person', suggested: false },
    ],
    error: null,
  });
  postsSelect.mockResolvedValue({ data: [postA, postB, postS], error: null });
  await expect(listFeed()).resolves.toMatchObject([
    { id: 'post-b', feed_source: 'buddy', suggested: false },
    { id: 'post-s', feed_source: 'suggested', suggested: true },
    { id: 'post-a', feed_source: 'followed_person', suggested: false },
  ]);
});

test('keeps the previous page when refresh fails', () => {
  expect(resolveRefreshResult([postA], { status: 'error' })).toEqual([postA]);
});
```

- [ ] **Step 2: Run and record RED**

Run: `npm.cmd test -- --runInBand src/feed/unifiedFeedApi.test.ts`
Expected: FAIL because the client still calls `personal_feed_post_ids` and lacks Feed metadata.

- [ ] **Step 3: Replace the personal-mode branch**

```ts
const { data: rankedRows, error: rankedError } = await supabase.rpc(
  'unified_feed_post_ids',
  { p_before: before ?? null, p_before_id: beforeId ?? null, p_limit: PAGE_SIZE },
);
if (rankedError) throw rankedError;

const ids = (rankedRows ?? []).map((row) => row.id);
if (!ids.length) return [];
const hydrated = await hydrateFeedPosts(ids);
const byId = new Map(hydrated.map((post) => [post.id, post]));
return rankedRows.flatMap((ranked) => {
  const post = byId.get(ranked.id);
  return post ? [{ ...post, feed_source: ranked.source, suggested: ranked.suggested }] : [];
});
```

Preserve the existing group/page branches and enrichment for likes, author profiles, hidden rows, and moderation. Remove the obsolete `FeedMode` argument from `listFeed` only after all callers/tests are migrated.

- [ ] **Step 4: Run Feed API tests and commit**

Run: `npm.cmd test -- --runInBand src/feed/api.test.ts src/feed/unifiedFeedApi.test.ts`
Expected: PASS.

```powershell
git add src/feed/api.ts src/feed/api.test.ts src/feed/unifiedFeedApi.test.ts
git commit -m "feat: load one ranked social Feed"
```

### Task 4: Remove the Feed mode selector

**Files:**
- Modify: `src/app/(app)/index.tsx`
- Modify: `src/feed/SocialModeSelector.tsx`
- Modify: `src/feed/socialScreenContract.test.ts`
- Modify: `src/feed/FeedProofCard.tsx`

- [ ] **Step 1: Write failing screen-contract tests**

```ts
test('Feed is a single timeline without a Buddies/Discover selector', () => {
  expect(feedSource).not.toContain('<SocialModeSelector');
  expect(feedSource).not.toContain('feedMode');
  expect(feedSource).not.toContain('<DiscoverExperience');
  expect(feedSource).toContain('<StoryRail');
  expect(feedSource).toContain('<FlatList');
});

test('suggested rows disclose why they appear', () => {
  expect(cardSource).toContain('Suggested for you');
});
```

- [ ] **Step 2: Run and record RED**

Run: `npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts`
Expected: FAIL because the switch and embedded Discover experience remain.

- [ ] **Step 3: Simplify Feed state to one timeline**

Remove `feedMode`, `discoverVisited`, `changeFeedMode`, per-mode offset restoration, selector rendering, and embedded `DiscoverExperience`. Keep the account/data generation guard, Feed scroll restoration, My Day picker queue, video viewability, refresh, pagination, Create, and social action handlers.

Render suggestion disclosure in `FeedProofCard`:

```tsx
{post.suggested ? (
  <Text style={styles.suggestionLabel} accessibilityLabel="Suggested for you">
    Suggested for you
  </Text>
) : null}
```

- [ ] **Step 4: Retire only obsolete selector UI**

Keep reusable session/view-state helpers in `SocialModeSelector.tsx` only if still used. Otherwise move them to a focused `feedViewState.ts` with tests, then delete the selector component. Do not discard offline/error guards.

- [ ] **Step 5: Verify and commit**

Run: `npm.cmd test -- --runInBand src/feed/socialScreenContract.test.ts src/feed/videoPolicy.test.ts src/feed/PostVideo.test.tsx`
Expected: PASS.

```powershell
git add src/app/(app)/index.tsx src/feed/SocialModeSelector.tsx src/feed/FeedProofCard.tsx src/feed/socialScreenContract.test.ts
git commit -m "feat: replace Feed modes with one timeline"
```

### Task 5: Move Discover into Menu

**Files:**
- Create: `src/app/discover.tsx`
- Create: `src/discover/DiscoverHub.tsx`
- Create: `src/discover/DiscoverHub.test.ts`
- Modify: `src/app/menu.tsx`
- Modify: `src/navigation/socialUtilityRouteContract.test.ts`

- [ ] **Step 1: Write failing route and hub-state tests**

```ts
test('Menu exposes separate Buddies and Discover destinations', () => {
  expect(menuSource).toContain("title: 'Buddies'");
  expect(menuSource).toContain("title: 'Discover'");
  expect(menuSource).toContain("route: '/discover'");
});

test('Discover hub contains people, groups and pages sections', () => {
  expect(discoverHubSource).toContain("value: 'people'");
  expect(discoverHubSource).toContain("value: 'groups'");
  expect(discoverHubSource).toContain("value: 'pages'");
});
```

- [ ] **Step 2: Run and record RED**

Run: `npm.cmd test -- --runInBand src/discover/DiscoverHub.test.ts src/navigation/socialUtilityRouteContract.test.ts`
Expected: FAIL because `/discover` and the hub do not exist.

- [ ] **Step 3: Build a focused Discover route using existing APIs**

```tsx
export default function DiscoverRoute() {
  return <DiscoverHub />;
}
```

`DiscoverHub` uses a compact accessible three-option control. People renders the existing `DiscoverExperience`. Groups and Pages reuse the existing discovery/list APIs and cards already used by `src/app/groups.tsx` and page discovery surfaces; do not duplicate network logic or introduce a second global navigation system.

- [ ] **Step 4: Add Menu entry and Stack route coverage**

Add `{ icon: 'compass-outline', tint: colors.primary, title: 'Discover', route: '/discover' }` near Buddies. Ensure the root Stack can navigate to the file-based route without changing the four tab destinations.

- [ ] **Step 5: Verify and commit**

Run: `npm.cmd test -- --runInBand src/discover src/navigation/socialUtilityRouteContract.test.ts`
Expected: PASS.

```powershell
git add src/app/discover.tsx src/discover/DiscoverHub.tsx src/discover/DiscoverHub.test.ts src/app/menu.tsx src/navigation/socialUtilityRouteContract.test.ts
git commit -m "feat: move Discover into Menu"
```

### Task 6: Rename user-facing Encourage copy to Cheer

**Files:**
- Create: `src/feed/cheerCopyContract.test.ts`
- Modify: all live user-facing files identified by the contract

- [ ] **Step 1: Write a closed user-facing copy contract**

```ts
const liveUiFiles = [
  'src/feed/FeedProofCard.tsx',
  'src/feed/ImmersivePost.tsx',
  'src/feed/VoiceEncouragementRecorder.tsx',
  'src/app/post/[id].tsx',
  'src/notifications/copy.ts',
];

test.each(liveUiFiles)('%s does not expose Encourage wording', (file) => {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  expect(source).not.toMatch(/['"`]([^'"`]*\bencourag(?:e|ed|ement|ing)\b[^'"`]*)['"`]/i);
});
```

Enumerate all live UI matches using `rg -n -i "encourage|encouragement|encouraged" src`. Explicitly allow stable internal identifiers, database columns, API function names, and historical migration text.

- [ ] **Step 2: Run and record RED**

Run: `npm.cmd test -- --runInBand src/feed/cheerCopyContract.test.ts`
Expected: FAIL on current user-facing Encourage copy.

- [ ] **Step 3: Replace presentation copy only**

Examples:

```tsx
accessibilityLabel="Cheer this post"
<Text>Cheer</Text>
<Text>{count} Cheers</Text>
```

Do not rename persisted tables, RPCs, analytics identifiers, TypeScript data properties, or moderation categories unless a compatibility migration is explicitly required.

- [ ] **Step 4: Run copy, notification, Feed, and accessibility tests**

Run: `npm.cmd test -- --runInBand src/feed/cheerCopyContract.test.ts src/feed src/notifications`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src
git commit -m "feat: rename Encourage actions to Cheer"
```

### Task 7: Verify and deploy staging database migrations

**Files:**
- Create: `scripts/verify-staging-migrations.mjs`
- Create: `scripts/verify-staging-migrations.test.mjs`
- Create: `docs/release-evidence/2026-08-11-unified-feed-staging.md`

- [ ] **Step 1: Write a failing migration-order verifier**

```js
test('requires staging to include migrations through unified Feed', () => {
  assert.deepEqual(requiredMigrationVersions(), ['0097', '0098', '0099', '0100', '0101']);
});
```

The verifier accepts sanitized Supabase migration-list output and reports missing versions without printing credentials.

- [ ] **Step 2: Run and record RED, then implement the verifier**

Run: `node --test scripts/verify-staging-migrations.test.mjs`
Expected before implementation: FAIL.

Implement parsing that returns missing versions and refuses any project reference other than the configured staging project. Never infer that a production project is safe.

- [ ] **Step 3: Inspect the linked staging project read-only**

Run the Supabase migration-list command using staging credentials and record only project reference, migration versions, and status. Confirm the reported missing `personal_feed_post_ids` matches absent migration 0099.

Expected: staging is missing one or more reviewed migrations in 0097–0101.

- [ ] **Step 4: Request explicit deployment approval**

Before any remote write, report:

- exact staging project reference;
- exact migration versions to apply;
- that migration 0097 deletes confirmed Finance/business data and objects;
- that the user previously chose not to preserve that data; and
- that production is not targeted.

Do not proceed without explicit approval for this remote database write.

- [ ] **Step 5: Apply only reviewed migrations to staging**

Use the repository’s authenticated Supabase workflow to push migrations through 0101. Do not use `--include-all` unless the dry-run output shows only the reviewed versions. Do not target production.

- [ ] **Step 6: Verify authenticated RPC behavior**

Check that `personal_feed_post_ids` and `unified_feed_post_ids` are present, anonymous execution is rejected, authenticated execution returns a bounded page, and a missing suggestion set does not break connection rows.

- [ ] **Step 7: Record evidence and commit**

Document the sanitized migration list, project identity, deployment time, RPC verification, and rollback notes.

```powershell
git add scripts/verify-staging-migrations.mjs scripts/verify-staging-migrations.test.mjs docs/release-evidence/2026-08-11-unified-feed-staging.md
git commit -m "docs: verify unified Feed staging database"
```

### Task 8: Full Android verification and replacement APK

**Files:**
- Modify: `docs/release-evidence/2026-08-11-unified-feed-staging.md`

- [ ] **Step 1: Run complete local verification**

Run:

```powershell
npm.cmd test -- --runInBand
npx.cmd tsc --noEmit
npm.cmd run lint
npx.cmd expo export --platform android --output-dir dist-unified-feed
git diff --check
```

Expected: all commands exit 0. Remove `dist-unified-feed` after verifying the export and do not commit it.

- [ ] **Step 2: Build the approved preview profile**

Run from `accountability-app` with `EAS_NO_VCS=1`:

```powershell
$env:EAS_NO_VCS='1'
npx.cmd eas-cli build --platform android --profile preview --non-interactive --no-wait --json
```

Expected: a new Android build ID tied to the final implementation commit. This uploads source to Expo and requires the user’s explicit approval at action time.

- [ ] **Step 3: Download and install on the connected phone**

```powershell
& 'C:\Users\KinGrand\New folder\tools\android-platform-tools\adb.exe' \
  -s FY24068108E6 install -r 'AccountAbility-Unified-Feed-Preview.apk'
```

Expected: `Success`.

- [ ] **Step 4: Exercise risk flows**

Verify on device:

- Feed refresh no longer reports a missing function;
- no Buddies/Discover selector appears;
- personal, group, page, and suggested posts appear with correct labels;
- pagination has no duplicates;
- Discover opens from Menu and each section loads;
- Cheer works from Feed and post detail;
- hide, mute, unfollow, block, report, comments, and reactions remain functional;
- video remains limited to one visible player;
- My Day remains ordered and cleans up on close/background; and
- account switch never commits stale Feed data.

- [ ] **Step 5: Capture launch, memory, frame, and crash evidence**

Use `am start -W`, `dumpsys meminfo`, `dumpsys gfxinfo`, and `dumpsys activity exit-info`. Compare with the optimized baseline of 118 ms launch, 165 MB PSS, and 324 MB RSS without claiming improvement unless measurements support it.

- [ ] **Step 6: Commit final evidence**

```powershell
git add docs/release-evidence/2026-08-11-unified-feed-staging.md
git commit -m "docs: record unified Feed Android verification"
```

## Final review gate

After Task 8, request a final independent code review covering database security, ranking correctness, pagination, stale-account protection, content safety, navigation, accessibility, and Android performance. Do not merge, push, publish production updates, or apply production migrations without separate user approval.
