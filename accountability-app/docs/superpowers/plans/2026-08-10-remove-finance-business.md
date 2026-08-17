# Remove Finance and Business Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently remove every finance and business feature, reference, and database object while preserving fitness, social, moderation, and messaging data.

**Architecture:** Remove user-facing entry points first, then delete dead client modules, then apply one reviewed Supabase migration that updates shared functions before dropping finance-owned objects. Keep the mixed `ai_scans` table for food scans but remove receipt rows and the receipt quota field.

**Tech Stack:** Expo Router, React Native, TypeScript, Jest, Supabase/PostgreSQL

---

## File map

- Navigation and copy: `src/app/(app)/_layout.tsx`, `src/app/(app)/activity.tsx`, `src/app/menu.tsx`, `src/app/_layout.tsx`, `src/app/onboarding.tsx`, `src/social/invite.ts`, `src/app/edit-profile.tsx`, `src/legal/content.ts`, `src/voice/parse.ts`.
- Shared data contracts: `src/home/api.ts`, `src/home/HomeHeader.tsx`, `src/feed/types.ts`, `src/entry/promisePersistence.ts`.
- Finance-owned client code: `src/money/**`, `src/business/**`, finance/business route files listed in Task 3.
- Database removal: `supabase/migrations/0097_remove_finance_business.sql`.
- Contract coverage: `src/navigation/fitnessFocusContract.test.ts`, `src/database/financeRemovalMigration.test.ts`.

### Task 1: Lock the four-tab and no-money contract

**Files:**
- Create: `src/navigation/fitnessFocusContract.test.ts`
- Test: `src/navigation/fitnessFocusContract.test.ts`

- [ ] **Step 1: Write the failing source contract**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

test('keeps Feed, Journey, Run and Messages and removes Finance', () => {
  const tabs = source('src/app/(app)/_layout.tsx');
  expect(tabs).toContain("title: 'Feed'");
  expect(tabs).toContain("title: 'Journey'");
  expect(tabs).toContain("title: 'Run'");
  expect(tabs).toContain("title: 'Messages'");
  expect(tabs).not.toContain('name="finance"');
});

test('removes money from Journey, menu, onboarding and invitations', () => {
  for (const file of [
    'src/app/(app)/activity.tsx',
    'src/app/menu.tsx',
    'src/app/onboarding.tsx',
    'src/social/invite.ts',
  ]) {
    expect(source(file)).not.toMatch(/finance|money|save \$|wallet-outline|cash-outline/i);
  }
});
```

- [ ] **Step 2: Run the contract and verify it fails**

Run: `npm test -- --runInBand src/navigation/fitnessFocusContract.test.ts`  
Expected: FAIL on the Finance tab and existing money copy.

- [ ] **Step 3: Commit the failing contract**

```bash
git add src/navigation/fitnessFocusContract.test.ts
git commit -m "test: lock fitness-only navigation contract"
```

### Task 2: Remove visible finance entry points and copy

**Files:**
- Modify: `src/app/(app)/_layout.tsx`
- Modify: `src/app/(app)/activity.tsx`
- Modify: `src/app/menu.tsx`
- Modify: `src/app/onboarding.tsx`
- Modify: `src/social/invite.ts`
- Modify: `src/app/edit-profile.tsx`
- Modify: `src/legal/content.ts`
- Modify: `src/voice/parse.ts`
- Modify: `src/voice/parse.test.ts`
- Modify: `src/entry/promisePersistence.ts`
- Modify: `src/entry/promisePersistence.test.ts`

- [ ] **Step 1: Delete the Finance `Tabs.Screen` block**

Remove only this block from `src/app/(app)/_layout.tsx`:

```tsx
<Tabs.Screen
  name="finance"
  options={{
    title: 'Finance',
    tabBarIcon: tabIcon('wallet', 'wallet-outline'),
    headerShown: false,
  }}
/>
```

- [ ] **Step 2: Delete the Money pillar and narrow its route union**

In `src/app/(app)/activity.tsx`, remove the `key: 'money'` object and change the route union to:

```ts
route: '/gym' | '/today' | '/messages' | '/run' | '/insights' | '/achievements';
```

- [ ] **Step 3: Remove Finance from the menu and all money examples**

Delete the Finance item from `src/app/menu.tsx`; replace onboarding/invitation language with fitness copy such as:

```ts
`I'm using AccountAbility to stay on track — workouts, meals, runs and challenges. Join me as an accountability buddy.`
```

Remove `money-save` from onboarding and promise persistence. Replace broad account-deletion copy with:

```ts
'This permanently erases your profile, posts, activity, buddies and everything else. Your chats stay with your buddies as "Deleted Account." This cannot be undone.'
```

- [ ] **Step 4: Remove the expense voice intent**

Delete the `pay|spend|budget|bill` branch from `src/voice/parse.ts` and update `src/voice/parse.test.ts` so money speech returns the ordinary fallback rather than `expense`.

- [ ] **Step 5: Rewrite legal descriptions without weakening safety text**

Remove finance, business, receipt, debt, bill, account, savings, and money disclaimers from `src/legal/content.ts`. Preserve fitness risk, food-scan limitations, moderation, reporting, privacy, and private-message language.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- --runInBand src/navigation/fitnessFocusContract.test.ts src/voice/parse.test.ts src/entry/promisePersistence.test.ts`  
Expected: PASS.

- [ ] **Step 7: Commit the visible removal**

```bash
git add src/app src/social/invite.ts src/legal/content.ts src/voice src/entry/promisePersistence.ts src/entry/promisePersistence.test.ts src/navigation/fitnessFocusContract.test.ts
git commit -m "feat: remove finance from the app experience"
```

### Task 3: Delete finance routes and client modules

**Files:**
- Delete: `src/app/(app)/finance.tsx`
- Delete: `src/app/money-add.tsx`
- Delete: `src/app/bill-new.tsx`
- Delete: `src/app/account-new.tsx`
- Delete: `src/app/saving-new.tsx`
- Delete: `src/app/debt-new.tsx`
- Delete: `src/app/shared-goal-new.tsx`
- Delete: `src/app/shared-goal/[id].tsx`
- Delete: `src/app/business.tsx`
- Delete: `src/money/**`
- Delete: `src/business/**`
- Modify: `src/app/_layout.tsx`
- Modify: `src/home/api.ts`
- Modify: `src/home/HomeHeader.tsx`
- Modify: `src/feed/types.ts`
- Modify: `src/achievements/api.ts`
- Modify: `src/achievements/catalog.ts`
- Modify: `src/achievements/medalArt.ts`
- Modify: `supabase/functions/ai-scan/index.ts`
- Modify: tests importing removed modules

- [ ] **Step 1: Remove route registrations before deleting screens**

Delete every Finance, money editor, shared savings, and business `Stack.Screen` registration from `src/app/_layout.tsx`. Do not change fitness, social, story, challenge, moderation, or message registrations.

- [ ] **Step 2: Remove shared imports and savings post type**

Remove money queries from `src/home/api.ts` and money formatting from `src/home/HomeHeader.tsx`. Remove `'savings'` from `PostType` in `src/feed/types.ts`:

```ts
export type PostType =
  | 'post'
  | 'photo'
  | 'video'
  | 'run'
  | 'workout'
  | 'milestone'
  | 'event'
  | 'memory';
```

Remove `goalsHit` from the achievement metrics type, default metrics, catalogue predicates, and Goal Crusher medal art. Update achievement tests so every remaining medal is fitness, social, consistency, or profile based.

- [ ] **Step 3: Delete finance-owned screens and modules**

Delete exactly the files/directories listed in this task. Use `rg -n "../money|../business|/finance|money_transactions|savings_goals|shared_goals|biz_" src` afterward and remove only remaining live feature imports or copy.

In `supabase/functions/ai-scan/index.ts`, remove `RECEIPT_PROMPT`, reject every kind except `food`, always use the food prompt, and continue writing `{ kind: 'food' }` quota rows. Do not remove food-photo scanning.

- [ ] **Step 4: Run TypeScript and the full Jest suite**

Run: `npx tsc --noEmit`  
Expected: exit 0 with no unresolved finance imports.

Run: `npm test -- --runInBand`  
Expected: PASS; removed finance-only suites no longer run.

- [ ] **Step 5: Commit dead-code removal**

```bash
git add -A src
git commit -m "refactor: delete finance and business client code"
```

### Task 4: Write the destructive database migration contract

**Files:**
- Create: `src/database/financeRemovalMigration.test.ts`
- Create: `supabase/migrations/0097_remove_finance_business.sql`

- [ ] **Step 1: Write a failing migration source test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0097_remove_finance_business.sql'),
  'utf8',
).toLowerCase();

test('drops finance objects but retains fitness and social tables', () => {
  for (const name of ['money_transactions', 'bills', 'accounts', 'savings_goals', 'debts', 'shared_goals', 'biz_business']) {
    expect(sql).toContain(`drop table if exists public.${name}`);
  }
  for (const name of ['activities', 'posts', 'stories', 'buddy_messages', 'challenges', 'ai_scans']) {
    expect(sql).not.toContain(`drop table if exists public.${name}`);
  }
  expect(sql).toContain("delete from public.ai_scans where kind = 'receipt'");
});
```

- [ ] **Step 2: Run it and verify the missing migration failure**

Run: `npm test -- --runInBand src/database/financeRemovalMigration.test.ts`  
Expected: FAIL because migration `0097` does not exist.

- [ ] **Step 3: Commit the failing database contract**

```bash
git add src/database/financeRemovalMigration.test.ts
git commit -m "test: define finance database removal boundary"
```

### Task 5: Implement the database cleanup in dependency order

**Files:**
- Create: `supabase/migrations/0097_remove_finance_business.sql`
- Test: `src/database/financeRemovalMigration.test.ts`

- [ ] **Step 1: Remove mixed-table finance rows and constraints**

Start the migration with:

```sql
begin;

delete from public.timeline_items where type in ('expense', 'income');
delete from public.posts where post_type = 'savings';
delete from public.ai_scans where kind = 'receipt';

alter table public.ai_scans drop constraint if exists ai_scans_kind_check;
alter table public.ai_scans
  add constraint ai_scans_kind_check check (kind = 'food');

create or replace function public.my_scan_quota()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'limit', 20,
    'food_used', (
      select count(*) from public.ai_scans
      where user_id = auth.uid() and kind = 'food'
        and created_at >= date_trunc('month', now())
    )
  );
$$;
```

- [ ] **Step 2: Replace shared metric functions before dropping tables**

Replace `public.my_metric_counts()` with the complete finance-free body below. `public.member_card_stats(uuid)` does not reference a finance table in migration `0087`, so leave it unchanged.

```sql
create or replace function public.my_metric_counts()
returns json
language sql
stable
set search_path = public
as $$
  select json_build_object(
    'workouts',   (select count(*) from public.timeline_items where user_id = auth.uid() and type = 'workout'),
    'challenges', (select count(*) from public.challenge_participants where user_id = auth.uid()),
    'memories',   (select count(*) from public.memories where user_id = auth.uid()),
    'places',     (select count(*) from public.memories where user_id = auth.uid() and location is not null),
    'posts',      (select count(*) from public.posts where user_id = auth.uid()),
    'likes',      (select count(*) from public.post_likes where user_id = auth.uid()),
    'groups',     (select count(*) from public.group_members where user_id = auth.uid()),
    'messages',   (select count(*) from public.buddy_messages where sender = auth.uid()),
    'profile_fields', (
      select (avatar_url is not null and length(trim(avatar_url)) > 0)::int
           + (bio is not null and length(trim(bio)) > 0)::int
           + (display_name is not null and length(trim(display_name)) > 0)::int
      from public.profiles where id = auth.uid()
    )
  );
$$;
revoke all on function public.my_metric_counts() from public;
grant execute on function public.my_metric_counts() to authenticated;
```

- [ ] **Step 3: Drop finance functions, triggers, and tables**

Append the dependency-ordered removal:

```sql
drop trigger if exists money_tx_mirror on public.money_transactions;
drop function if exists public.mirror_money_tx();
drop function if exists public.income_trend(integer);
drop function if exists public.mark_bill_paid_atomic(uuid, numeric, uuid);
drop function if exists public.pay_card_atomic(uuid, numeric, uuid);
drop function if exists public.shared_goal_creator_join();
drop function if exists public.is_goal_member(uuid, uuid);
drop function if exists public.biz_dashboard(uuid, date, date);
drop function if exists public.biz_items_costed(uuid);
drop function if exists public.biz_item_unit_cost(uuid, integer);

drop table if exists public.shared_goal_contributions cascade;
drop table if exists public.shared_goal_members cascade;
drop table if exists public.shared_goals cascade;
drop table if exists public.debt_payments cascade;
drop table if exists public.bills cascade;
drop table if exists public.accounts cascade;
drop table if exists public.savings_goals cascade;
drop table if exists public.money_transactions cascade;
drop table if exists public.debts cascade;

drop table if exists public.biz_tenant cascade;
drop table if exists public.biz_payment cascade;
drop table if exists public.biz_recipe_line cascade;
drop table if exists public.biz_loss cascade;
drop table if exists public.biz_fixed_cost cascade;
drop table if exists public.biz_cost cascade;
drop table if exists public.biz_customer cascade;
drop table if exists public.biz_sale cascade;
drop table if exists public.biz_supply cascade;
drop table if exists public.biz_item cascade;
drop table if exists public.biz_business cascade;

commit;
```

- [ ] **Step 4: Run migration contracts and repository scans**

Run: `npm test -- --runInBand src/database/financeRemovalMigration.test.ts`  
Expected: PASS.

Run: `rg -n "money_transactions|savings_goals|shared_goals|biz_business|mark_bill_paid_atomic|pay_card_atomic" src supabase/functions`  
Expected: no live client or Edge Function references.

- [ ] **Step 5: Apply to a disposable/local Supabase database first**

Run: `npx supabase db reset`  
Expected: all migrations complete through `0097`; `activities`, `posts`, `stories`, challenges, moderation, profiles, and buddy messages exist; finance/business tables do not.

- [ ] **Step 6: Commit the migration**

```bash
git add supabase/migrations/0097_remove_finance_business.sql src/database/financeRemovalMigration.test.ts
git commit -m "feat: remove finance and business database objects"
```

### Task 6: Final finance-removal verification

- [ ] **Step 1: Run all static and automated checks**

Run: `npx tsc --noEmit`  
Expected: exit 0.

Run: `npm run lint`  
Expected: exit 0.

Run: `npm test -- --runInBand`  
Expected: PASS.

- [ ] **Step 2: Confirm the repository has no user-facing money feature**

Run: `rg -n -i "finance|money|receipt|savings|debt|bill|wallet|business tracker" src app.json`  
Expected: no live feature route, label, helper, or legal claim; inspect any incidental English use manually.

- [ ] **Step 3: Commit any final test-only correction**

```bash
git add -A
git commit -m "test: verify complete finance removal"
```
