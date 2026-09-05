# Journey Progress and Share Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add simple private body and appearance tracking to Journey, then give every post-producing flow one truthful Buddies-only or Public-plus-Buddy-Card sharing decision.

**Architecture:** Deliver five independently testable phases: owner-only progress persistence, a focused Journey Progress route, a private photo vault, a shared visibility contract and Share Studio, and Run/Journey/Flex integrations. Preserve existing idempotent Feed publishing and account-generation guards; render a separate share copy so private originals and excluded values never enter Feed data.

**Tech Stack:** Expo SDK 56, React Native, Expo Router, Supabase/PostgreSQL/RLS/Storage, TypeScript, Jest, react-native-view-shot, expo-image-picker, existing Feed/R2 upload helpers.

---

## File Structure

New focused units:

- `supabase/migrations/0114_private_body_progress.sql` — measurement and private-photo tables, owner-only RLS, and private storage bucket policies.
- `src/progress/types.ts` — body measurement and progress photo contracts.
- `src/progress/bmi.ts` — neutral BMI calculation and input validation.
- `src/progress/api.ts` — owner-bound measurement/photo reads and writes.
- `src/progress/visibility.ts` — single switch-to-persistence mapping used by every post flow.
- `src/progress/photoCapture.ts` — front/rear camera and gallery selection normalization.
- `src/progress/ProgressPhotoVault.tsx` — private dated Before/Latest photo management.
- `src/progress/ShareStudio.tsx` — reusable preview, caption, sensitive-field controls, and visibility switch.
- `src/progress/ProgressShareCard.tsx` — 4:5 render-only Journey progress card.
- `src/progress/workoutPhotoLibrary.ts` — 64-image semantic pool and recent-history selection.
- `src/progress/WorkoutPhotoHero.tsx` — category-aware Body workout photography with database-image preference.
- `src/app/journey-progress.tsx` — owner-scoped Journey Progress route.

Existing integration files:

- `src/journey/JourneyTabs.tsx` — adds the Progress tab without removing Momentum, Path, or Journal.
- `src/app/_layout.tsx` — registers the protected Progress route.
- `src/app/compose.tsx`, `src/entry/CreateHub.tsx`, `src/entry/composeDraft.ts` — replace duplicate audience/Buddy-Card controls with the shared switch contract.
- `src/activity/RunShareSheet.tsx`, `src/app/win-card.tsx`, `src/entry/flexContext.ts`, `src/entry/flexFeedPost.ts`, `src/events/api.ts` — use the same visibility semantics and Share Studio.
- `src/feed/api.ts` — enforces the invariant at the persistence boundary, including run posts.

## Phase 1 — Private Body Progress

### Task 1: Add owner-only progress persistence

**Files:**
- Create: `supabase/migrations/0114_private_body_progress.sql`
- Create: `src/progress/privateBodyProgressMigration.test.ts`

- [ ] **Step 1: Write the failing migration contract**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0114_private_body_progress.sql'),
  'utf8',
);

describe('private body progress migration', () => {
  test('is transactional and keeps measurements owner-only', () => {
    expect(sql).toMatch(/^begin;/i);
    expect(sql).toMatch(/create table if not exists public\.body_measurements/i);
    expect(sql).toMatch(/weight_kg numeric\(6,2\).*check \(weight_kg between 20 and 500\)/is);
    expect(sql).toMatch(/height_cm numeric\(5,2\).*check \(height_cm between 80 and 250\)/is);
    expect(sql.match(/user_id = \(select auth\.uid\(\)\)/gi)?.length).toBeGreaterThanOrEqual(4);
    expect(sql).toMatch(/commit;\s*$/i);
  });

  test('keeps progress photos in a private owner folder', () => {
    expect(sql).toMatch(/create table if not exists public\.progress_photos/i);
    expect(sql).toMatch(/values \('progress-photos', 'progress-photos', false\)/i);
    expect(sql).toMatch(/bucket_id = 'progress-photos'/i);
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/i);
    expect(sql).not.toMatch(/create policy[^;]+to anon/is);
  });
});
```

- [ ] **Step 2: Run the contract to verify RED**

Run: `npm test -- --runInBand src/progress/privateBodyProgressMigration.test.ts`

Expected: FAIL because migration `0114_private_body_progress.sql` does not exist.

- [ ] **Step 3: Add the transactional schema**

```sql
begin;

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  weight_kg numeric(6,2) not null check (weight_kg between 20 and 500),
  height_cm numeric(5,2) not null check (height_cm between 80 and 250),
  created_at timestamptz not null default now()
);
create index if not exists body_measurements_owner_date_idx
  on public.body_measurements (user_id, recorded_at desc, id desc);
alter table public.body_measurements enable row level security;

drop policy if exists body_measurements_select on public.body_measurements;
create policy body_measurements_select on public.body_measurements for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists body_measurements_insert on public.body_measurements;
create policy body_measurements_insert on public.body_measurements for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists body_measurements_update on public.body_measurements;
create policy body_measurements_update on public.body_measurements for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists body_measurements_delete on public.body_measurements;
create policy body_measurements_delete on public.body_measurements for delete to authenticated
  using (user_id = (select auth.uid()));

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null check (length(storage_path) between 1 and 220),
  captured_at timestamptz not null,
  weight_kg numeric(6,2) check (weight_kg is null or weight_kg between 20 and 500),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);
create index if not exists progress_photos_owner_date_idx
  on public.progress_photos (user_id, captured_at desc, id desc);
alter table public.progress_photos enable row level security;

drop policy if exists progress_photos_select on public.progress_photos;
create policy progress_photos_select on public.progress_photos for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists progress_photos_insert on public.progress_photos;
create policy progress_photos_insert on public.progress_photos for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists progress_photos_update on public.progress_photos;
create policy progress_photos_update on public.progress_photos for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists progress_photos_delete on public.progress_photos;
create policy progress_photos_delete on public.progress_photos for delete to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do update set public = false;

drop policy if exists progress_photos_storage_select on storage.objects;
create policy progress_photos_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists progress_photos_storage_insert on storage.objects;
create policy progress_photos_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists progress_photos_storage_delete on storage.objects;
create policy progress_photos_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
```

- [ ] **Step 4: Run the migration contract**

Run: `npm test -- --runInBand src/progress/privateBodyProgressMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0114_private_body_progress.sql src/progress/privateBodyProgressMigration.test.ts
git commit -m "feat: add private body progress storage"
```

### Task 2: Add BMI and progress domain APIs

**Files:**
- Create: `src/progress/types.ts`
- Create: `src/progress/bmi.ts`
- Create: `src/progress/bmi.test.ts`
- Create: `src/progress/api.ts`
- Create: `src/progress/api.test.ts`

- [ ] **Step 1: Write failing BMI and owner-binding tests**

```ts
import { describe, expect, test } from '@jest/globals';
import { calculateBmi } from './bmi';

describe('calculateBmi', () => {
  test('returns one neutral decimal without a category', () => {
    expect(calculateBmi(78.4, 180)).toBe(24.2);
  });
  test.each([[0, 180], [78, 0], [19, 180], [78, 251]])(
    'rejects invalid inputs',
    (weight, height) => expect(() => calculateBmi(weight, height)).toThrow('valid'),
  );
});
```

In `api.test.ts`, mock `supabase.auth.getUser()` and assert `addMeasurement(input, expectedOwnerId)` inserts `user_id: expectedOwnerId`, orders history by `recorded_at desc`, caps the query, and throws `Account changed.` before any write when the current user differs.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand src/progress/bmi.test.ts src/progress/api.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the focused contracts**

```ts
// src/progress/types.ts
export type BodyMeasurement = Readonly<{
  id: string;
  recordedAt: string;
  weightKg: number;
  heightCm: number;
}>;

export type ProgressPhoto = Readonly<{
  id: string;
  storagePath: string;
  capturedAt: string;
  weightKg: number | null;
}>;
```

```ts
// src/progress/bmi.ts
export function calculateBmi(weightKg: number, heightCm: number): number {
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500 ||
      !Number.isFinite(heightCm) || heightCm < 80 || heightCm > 250) {
    throw new Error('Enter valid weight and height values.');
  }
  return Math.round((weightKg / ((heightCm / 100) ** 2)) * 10) / 10;
}
```

Implement `listMeasurements(expectedOwnerId, limit = 52)`, `addMeasurement(input, expectedOwnerId)`, `listProgressPhotos(expectedOwnerId)`, `saveProgressPhoto(input, expectedOwnerId)`, and `deleteProgressPhoto(photo, expectedOwnerId)` in `api.ts`. Every public function must resolve the current user, compare it with `expectedOwnerId`, and recheck after upload before inserting a row.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --runInBand src/progress/bmi.test.ts src/progress/api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progress/types.ts src/progress/bmi.ts src/progress/bmi.test.ts src/progress/api.ts src/progress/api.test.ts
git commit -m "feat: add private progress domain APIs"
```

## Phase 2 — Journey Progress Route

### Task 3: Add the simple Progress screen and check-in flow

**Files:**
- Create: `src/app/journey-progress.tsx`
- Create: `src/progress/BodyCheckInSheet.tsx`
- Create: `src/progress/WeightTrendChart.tsx`
- Create: `src/progress/JourneyProgressLifecycle.test.tsx`
- Modify: `src/journey/JourneyTabs.tsx`
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Write the failing route and lifecycle tests**

Test that:

```ts
expect(JOURNEY_TABS).toEqual([
  ['momentum', 'Momentum', '/activity'],
  ['progress', 'Progress', '/journey-progress'],
  ['path', 'Path', '/journey-path'],
  ['journal', 'Journal', '/today'],
]);
```

Render the route with deferred API promises and assert initial progress state, current weight/BMI after success, weekly/monthly buttons, private copy, retry on initial failure, cached rows retained on same-owner refresh failure, and stale Account A completion ignored after switching to Account B.

- [ ] **Step 2: Run the new route test to verify RED**

Run: `npm test -- --runInBand src/progress/JourneyProgressLifecycle.test.tsx`

Expected: FAIL because the route and components do not exist.

- [ ] **Step 3: Add the protected route and tab**

Extend `JourneySection` with `'progress'`, add `{ key: 'progress', label: 'Progress', route: '/journey-progress' }`, and register `journey-progress` under the existing `!!session && onboarded === true` protected Stack group in `src/app/_layout.tsx`.

- [ ] **Step 4: Build one smooth owner-bound scroll**

The route loads measurements and private photos together, derives current values from the newest record, and renders in this order:

```tsx
<JourneyTabs active="progress" />
<ConsistencySummary />
<CurrentBodyStats weightKg={latest?.weightKg} bmi={latest ? calculateBmi(latest.weightKg, latest.heightCm) : null} />
<WeightTrendChart entries={measurements} period={period} onPeriodChange={setPeriod} />
<ProgressPhotoVault photos={photos} expectedOwnerId={ownerId} />
<ShareProgressButton disabled={!latest && photos.length === 0} />
```

Do not add body-fat or circumference fields. The check-in sheet asks only weight, height if no prior height exists, and date.

- [ ] **Step 5: Run Journey and accessibility regressions**

Run: `npm test -- --runInBand src/progress/JourneyProgressLifecycle.test.tsx src/journey/momentumAppearanceContract.test.ts src/journey/largeTextContract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/journey-progress.tsx src/progress/BodyCheckInSheet.tsx src/progress/WeightTrendChart.tsx src/progress/JourneyProgressLifecycle.test.tsx src/journey/JourneyTabs.tsx src/app/_layout.tsx
git commit -m "feat: add simple Journey progress tracking"
```

### Task 4: Add the private progress photo vault

**Files:**
- Create: `src/progress/photoCapture.ts`
- Create: `src/progress/photoCapture.test.ts`
- Create: `src/progress/ProgressPhotoVault.tsx`
- Create: `src/progress/ProgressPhotoVault.test.tsx`
- Modify: `src/app/journey-progress.tsx`

- [ ] **Step 1: Write failing capture and privacy tests**

Cover front camera, rear camera, gallery, cancel, denied permission, EXIF date fallback, editable date, upload-before-row ordering, auth switch during upload, delete row then storage object, and the absence of any public URL in the returned model.

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm test -- --runInBand src/progress/photoCapture.test.ts src/progress/ProgressPhotoVault.test.tsx`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement normalized capture**

```ts
export type ProgressPhotoSource = 'front-camera' | 'rear-camera' | 'gallery';

export type CapturedProgressPhoto = Readonly<{
  uri: string;
  capturedAt: string;
  width: number;
  height: number;
}>;

export async function chooseProgressPhoto(source: ProgressPhotoSource): Promise<CapturedProgressPhoto | null> {
  // Request only the needed permission, use cameraType.front for selfie,
  // preserve cancellation as null, normalize the selected asset, and never upload here.
}
```

Use `ImagePicker.launchCameraAsync` for native camera sources and `launchImageLibraryAsync` for gallery/web. Parse the asset EXIF date only when it is a finite valid timestamp; otherwise use the injected clock.

- [ ] **Step 4: Implement Before/Latest presentation**

`ProgressPhotoVault` displays the selected two records with readable dates and optional weights, plus three actions: Take selfie, Take photo, Choose from gallery. Saving is explicit; capture alone does not publish or create a Feed post.

- [ ] **Step 5: Run focused and account-race tests**

Run: `npm test -- --runInBand src/progress/photoCapture.test.ts src/progress/ProgressPhotoVault.test.tsx src/progress/api.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/progress/photoCapture.ts src/progress/photoCapture.test.ts src/progress/ProgressPhotoVault.tsx src/progress/ProgressPhotoVault.test.tsx src/app/journey-progress.tsx
git commit -m "feat: add private Journey progress photos"
```

## Phase 3 — Universal Visibility Contract

### Task 5: Enforce the two-state visibility invariant at one boundary

**Files:**
- Create: `src/progress/visibility.ts`
- Create: `src/progress/visibility.test.ts`
- Modify: `src/feed/api.ts`
- Modify: `src/feed/runPostIdempotency.test.ts`
- Modify: `src/events/api.ts`
- Modify: `src/events/api.test.ts`

- [ ] **Step 1: Write the failing invariant tests**

```ts
import { describe, expect, test } from '@jest/globals';
import { postVisibility } from './visibility';

describe('postVisibility', () => {
  test('maps one switch to the only two valid states', () => {
    expect(postVisibility(false)).toEqual({ audience: 'buddies', showOnCard: false });
    expect(postVisibility(true)).toEqual({ audience: 'public', showOnCard: true });
  });
});
```

Extend Feed tests to prove every non-group standard/run post persists buddies+false or public+true. Add an update test proving changing audience updates `show_on_card` atomically rather than leaving an impossible combination.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand src/progress/visibility.test.ts src/feed/runPostIdempotency.test.ts src/events/api.test.ts`

Expected: FAIL because current Run always writes `show_on_card: false` and APIs accept mismatched fields.

- [ ] **Step 3: Add the single mapping**

```ts
export type ShareVisibility = Readonly<{
  audience: 'buddies' | 'public';
  showOnCard: boolean;
}>;

export function postVisibility(showPublicly: boolean): ShareVisibility {
  return showPublicly
    ? { audience: 'public', showOnCard: true }
    : { audience: 'buddies', showOnCard: false };
}
```

Change non-group `createPost`, `createRunPostIdempotent`, event creation, and audience updates to accept `showPublicly: boolean` or a validated `ShareVisibility`, and derive both database fields from this function. Preserve `group` and `page` special cases outside this switch.

- [ ] **Step 4: Run invariant tests**

Run: `npm test -- --runInBand src/progress/visibility.test.ts src/feed/runPostIdempotency.test.ts src/events/api.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progress/visibility.ts src/progress/visibility.test.ts src/feed/api.ts src/feed/runPostIdempotency.test.ts src/events/api.ts src/events/api.test.ts
git commit -m "feat: unify post visibility semantics"
```

### Task 6: Build the reusable Share Studio shell

**Files:**
- Create: `src/progress/ShareStudio.tsx`
- Create: `src/progress/ShareStudio.test.tsx`
- Create: `src/progress/shareDraft.ts`
- Create: `src/progress/shareDraft.test.ts`

- [ ] **Step 1: Write the failing component contract**

Render the studio and assert:

```ts
expect(screen.getByRole('switch', { name: 'Show publicly and on my Buddy Card' }))
  .toHaveAccessibilityState({ checked: false });
expect(screen.getByText('Buddies only')).toBeTruthy();
expect(screen.getByText('POST TO BUDDIES')).toBeTruthy();
```

After toggling, assert Public + Buddy Card copy and `onSubmit({ showPublicly: true, ... })`. Also cover 48-point targets, caption limit, camera/gallery actions only when enabled, sensitive fields excluded by default, owner reset, single-flight submit, and retry retaining the same operation ID.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand src/progress/ShareStudio.test.tsx src/progress/shareDraft.test.ts`

Expected: FAIL because the studio does not exist.

- [ ] **Step 3: Implement the small public interface**

```ts
export type ShareStudioDraft = Readonly<{
  operationId: string;
  caption: string;
  showPublicly: boolean;
  includeWeight: boolean;
  selectedPhotoIds: readonly string[];
}>;

export type ShareStudioProps = Readonly<{
  ownerId: string;
  title: string;
  preview: React.ReactNode;
  allowMedia: boolean;
  allowWeight: boolean;
  onTakeSelfie?: () => Promise<void>;
  onChoosePhotos?: () => Promise<void>;
  onSubmit: (draft: ShareStudioDraft) => Promise<void>;
  onClose: () => void;
}>;
```

Use a React Native `Switch`, not a custom gesture implementation. Label it with visible Buddies-only/Public-plus-Buddy-Card copy and accessibility state. Default `showPublicly` and `includeWeight` to false for every new draft.

- [ ] **Step 4: Run focused component tests**

Run: `npm test -- --runInBand src/progress/ShareStudio.test.tsx src/progress/shareDraft.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progress/ShareStudio.tsx src/progress/ShareStudio.test.tsx src/progress/shareDraft.ts src/progress/shareDraft.test.ts
git commit -m "feat: add universal Share Studio"
```

## Phase 4 — Posting Integrations

### Task 7: Replace Composer and Create Hub audience controls

**Files:**
- Modify: `src/app/compose.tsx`
- Modify: `src/entry/CreateHub.tsx`
- Modify: `src/entry/createFlow.ts`
- Modify: `src/entry/createFlow.test.ts`
- Modify: `src/entry/composeDraft.ts`
- Modify: `src/entry/composeDraft.test.ts`
- Modify: `src/navigation/safeExitContract.test.ts`

- [ ] **Step 1: Change tests to the approved switch contract**

Remove expectations for an audience radio group and a separate Buddy Card checkbox. Assert one switch, default Off, restored legacy draft normalization, Public always coupled to Buddy Card, Buddies always excluded, and post-success/cleanup/account-switch behavior unchanged.

- [ ] **Step 2: Run focused Compose tests to verify RED**

Run: `npm test -- --runInBand src/entry/createFlow.test.ts src/entry/composeDraft.test.ts src/navigation/safeExitContract.test.ts`

Expected: FAIL on the old dual-control source and state shape.

- [ ] **Step 3: Migrate draft state without breaking old drafts**

Replace new-draft state with `showPublicly: boolean`. When parsing a legacy draft, normalize only `audience === 'public' && showOnCard === true` to On; every other combination becomes Off. Continue writing schema version 1 only if backward parsing remains exact, otherwise add `ComposeDraftV2` and a V1-to-V2 migration function.

- [ ] **Step 4: Use Share Studio for final Composer preview**

Keep editor, tags, event form, media editor, idempotent operation ID, and cleanup recovery unchanged. Remove the audience chips and card checkbox; pass the derived visibility into the existing event or standard post submission.

- [ ] **Step 5: Run Compose regression set**

Run: `npm test -- --runInBand src/entry/createFlow.test.ts src/entry/composeDraft.test.ts src/navigation/safeExitContract.test.ts src/events/composeEventContract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/compose.tsx src/entry/CreateHub.tsx src/entry/createFlow.ts src/entry/createFlow.test.ts src/entry/composeDraft.ts src/entry/composeDraft.test.ts src/navigation/safeExitContract.test.ts
git commit -m "feat: use one visibility switch for posts"
```

### Task 8: Integrate Run, Flex, milestones, and events

**Files:**
- Modify: `src/activity/RunShareSheet.tsx`
- Modify: `src/activity/runCompletion.test.ts`
- Modify: `src/activity/saveRunMedia.test.ts`
- Modify: `src/app/win-card.tsx`
- Modify: `src/entry/flexContext.ts`
- Modify: `src/entry/flexContext.test.ts`
- Modify: `src/entry/flexFeedPost.ts`
- Modify: `src/entry/flexFeedPost.test.ts`
- Modify: `src/navigation/authRouteIntent.ts`
- Modify: `src/navigation/authRouteIntent.test.ts`

- [ ] **Step 1: Write failing shared-visibility and camera tests**

Assert Run exposes Take selfie, Take photo, and Choose photos before Feed submission; Public run posts persist `show_on_card: true`; Flex no longer accepts an independent audience/showOnCard mismatch; route intent stores one scalar `showPublicly=1`; and account-switch/operation-ID tests remain green.

- [ ] **Step 2: Run the integration tests to verify RED**

Run: `npm test -- --runInBand src/activity/runCompletion.test.ts src/activity/saveRunMedia.test.ts src/entry/flexContext.test.ts src/entry/flexFeedPost.test.ts src/navigation/authRouteIntent.test.ts`

Expected: FAIL because Run lacks gallery/selfie parity in the final share path and Flex carries two independent fields.

- [ ] **Step 3: Replace the final destination UI with Share Studio**

Retain Run’s Beauty Camera, rear-camera path, route-map rendering, `captureRef` export, media cache leases, and `createRunPostIdempotent`. Add a gallery action through the normalized progress photo picker. Feed submission passes only `showPublicly`, which the persistence boundary maps to audience/show_on_card.

- [ ] **Step 4: Normalize Flex route context**

Replace `audience` plus `showOnCard` with `showPublicly: boolean` for new routes. Continue accepting legacy sanitized links during one compatibility window by mapping only `audience=public&showOnCard=1` to true; map every other legacy combination to false. Do not resume arbitrary query values.

- [ ] **Step 5: Run all share integration tests**

Run: `npm test -- --runInBand src/activity/runCompletion.test.ts src/activity/saveRunMedia.test.ts src/entry/flexContext.test.ts src/entry/flexFeedPost.test.ts src/navigation/authRouteIntent.test.ts src/events/api.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/activity/RunShareSheet.tsx src/activity/runCompletion.test.ts src/activity/saveRunMedia.test.ts src/app/win-card.tsx src/entry/flexContext.ts src/entry/flexContext.test.ts src/entry/flexFeedPost.ts src/entry/flexFeedPost.test.ts src/navigation/authRouteIntent.ts src/navigation/authRouteIntent.test.ts
git commit -m "feat: unify Run and Flex sharing"
```

### Task 9: Add Journey progress card rendering and publishing

**Files:**
- Create: `src/progress/ProgressShareCard.tsx`
- Create: `src/progress/ProgressShareCard.test.tsx`
- Create: `src/progress/publishProgressPost.ts`
- Create: `src/progress/publishProgressPost.test.ts`
- Modify: `src/app/journey-progress.tsx`

- [ ] **Step 1: Write the failing privacy and idempotency tests**

Assert that hidden weight is absent from rendered labels and `shareData`, selected photos are read from the owner-only source, output is exactly 1080×1350 JPEG, `post_type` is `milestone`, one stable UUID operation ID is reused across capture/upload/create retries, `markFeedPostPublished` is called after commit, and account changes prevent upload/publication.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- --runInBand src/progress/ProgressShareCard.test.tsx src/progress/publishProgressPost.test.ts`

Expected: FAIL because the card and publisher do not exist.

- [ ] **Step 3: Implement a render-only card**

```ts
export type ProgressShareModel = Readonly<{
  workoutsThisWeek: number;
  caption: string;
  beforeUri: string | null;
  afterUri: string | null;
  beforeDate: string | null;
  afterDate: string | null;
  weightChangeKg: number | null;
  includeWeight: boolean;
}>;
```

The component receives only already-filtered values. It never fetches private records itself. The publisher builds `shareData` from non-sensitive activity totals plus `client_media_sha256`; include weight only when `includeWeight` is true.

- [ ] **Step 4: Integrate the Share Studio**

From `journey-progress.tsx`, snapshot the selected owner-bound measurement/photo IDs when opening the studio. Revalidate ownership and row identity immediately before capture and again before upload/post creation. A close/cancel leaves all private data unchanged.

- [ ] **Step 5: Run focused progress and Feed tests**

Run: `npm test -- --runInBand src/progress/ProgressShareCard.test.tsx src/progress/publishProgressPost.test.ts src/feed/runPostIdempotency.test.ts src/feed/relationshipFeed.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/progress/ProgressShareCard.tsx src/progress/ProgressShareCard.test.tsx src/progress/publishProgressPost.ts src/progress/publishProgressPost.test.ts src/app/journey-progress.tsx
git commit -m "feat: share Journey progress safely"
```

## Phase 5 — Semantic Workout Photography

### Task 10: Add the curated 64-image rotation library

**Files:**
- Create: `src/progress/workoutPhotoLibrary.ts`
- Create: `src/progress/workoutPhotoLibrary.test.ts`
- Create: `src/progress/workoutPhotoHistory.ts`
- Create: `src/progress/workoutPhotoHistory.test.ts`
- Create: `src/progress/WorkoutPhotoHero.tsx`
- Create: `src/progress/workoutPhotoBodyIntegration.test.tsx`
- Modify: `src/app/body.tsx`

- [ ] **Step 1: Add licensed assets and a failing semantic contract**

Import 64 approved local image assets under `assets/journey/workouts/` and define exactly four 16-item pools: `push`, `pull`, `legs`, and `general`. Each entry includes `id`, `source`, `alt`, `category`, `licenseSource`, and `licenseAuthor`. The test rejects duplicate IDs/sources, missing attribution, incorrect counts, and cross-category keywords.

```ts
export type WorkoutPhotoCategory = 'push' | 'pull' | 'legs' | 'general';
export type WorkoutPhoto = Readonly<{
  id: string;
  category: WorkoutPhotoCategory;
  source: ImageSourcePropType;
  alt: string;
  licenseSource: string;
  licenseAuthor: string;
}>;
```

- [ ] **Step 2: Run the library test to verify RED**

Run: `npm test -- --runInBand src/progress/workoutPhotoLibrary.test.ts`

Expected: FAIL until all 64 curated entries and assets exist.

- [ ] **Step 3: Implement deterministic non-repeating selection**

```ts
export function selectWorkoutPhoto(
  pool: readonly WorkoutPhoto[],
  recentIds: readonly string[],
  random: () => number,
): WorkoutPhoto {
  const eligible = pool.filter((photo) => !recentIds.slice(-4).includes(photo.id));
  const candidates = eligible.length > 0 ? eligible : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}
```

Persist only the last four opaque IDs per category in AsyncStorage. Select once on screen mount; do not rotate while mounted. If an image fails, select another entry from the same category and record the failed ID for that opening.

- [ ] **Step 4: Prefer exercise-library images for specific exercises**

Add `classifyWorkoutTitle(title)` with explicit token sets: bench/chest/shoulder/triceps/dip → `push`; row/pull/deadlift/back/biceps/curl → `pull`; squat/lunge/leg/hamstring/calf → `legs`; otherwise `general`. `WorkoutPhotoHero` receives the current `LibraryExercise` and workout title, uses `exercise.images[0]` when present, and otherwise selects from only the classified pool. Replace the inline hero `<Image>`/fallback block in `src/app/body.tsx` with this component; exercise rows elsewhere continue using `src/gym/library.ts` images unchanged.

The integration test renders Body with a Pull Day title and no database image, asserts the chosen source belongs to `pull`, then supplies a database image and asserts it wins over the curated fallback.

- [ ] **Step 5: Run library, UI, and asset checks**

Run: `npm test -- --runInBand src/progress/workoutPhotoLibrary.test.ts src/progress/workoutPhotoHistory.test.ts src/progress/workoutPhotoBodyIntegration.test.tsx src/gym/plan.test.ts`

Expected: PASS with exactly 64 licensed local images.

- [ ] **Step 6: Commit**

```bash
git add assets/journey/workouts src/progress/workoutPhotoLibrary.ts src/progress/workoutPhotoLibrary.test.ts src/progress/workoutPhotoHistory.ts src/progress/workoutPhotoHistory.test.ts src/progress/WorkoutPhotoHero.tsx src/progress/workoutPhotoBodyIntegration.test.tsx src/app/body.tsx
git commit -m "feat: add semantic Journey workout photography"
```

## Phase 6 — Verification and Rollout

### Task 11: Run cumulative quality, privacy, and device gates

**Files:**
- Create: `src/progress/progressShareReleaseContract.test.ts`
- Modify: `docs/releases/` only after staging evidence exists

- [ ] **Step 1: Add the cross-surface release contract**

The contract enumerates Composer, Create Hub, Run Share, Win Card/Flex, Journey Progress, and Events, and asserts each imports the shared visibility contract or Share Studio. It rejects separate audience radio groups and Buddy Card checkboxes in those posting surfaces.

- [ ] **Step 2: Run focused suites**

Run:

```bash
npm test -- --runInBand \
  src/progress \
  src/entry/composeDraft.test.ts \
  src/activity/runCompletion.test.ts \
  src/activity/saveRunMedia.test.ts \
  src/entry/flexFeedPost.test.ts \
  src/events/api.test.ts \
  src/navigation/authRouteIntent.test.ts
```

Expected: all focused suites PASS.

- [ ] **Step 3: Run the full local gate**

Run:

```bash
npm test -- --runInBand
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Apply backend changes to staging in safe order**

Order: migration 0114 first, verify RLS and private bucket policies with two accounts, then publish the compatible client. Do not upload the client before the schema exists. Capture migration ledger and rollback receipt; rollback the client first and leave the additive private schema in place if rollback is necessary.

- [ ] **Step 5: Run Android staging acceptance**

Verify:

1. Journey check-in adds weight and calculated BMI; weekly/monthly trends update.
2. A selfie and gallery photo save privately and survive relaunch.
3. A second account cannot query or download the private measurement/photo.
4. Journey Before/After preview omits weight until explicitly enabled.
5. Run and Journey camera/gallery flows both work.
6. Every post/Flex shows one switch; Off produces Buddies-only/no Buddy Card; On produces Public/Buddy Card.
7. Account switching during capture, upload, and post retry does not leak or duplicate content.
8. Workout cards rotate on a fresh opening, avoid recent images, and never mismatch Push/Pull/Legs.

- [ ] **Step 6: Commit the release contract**

```bash
git add src/progress/progressShareReleaseContract.test.ts
git commit -m "test: lock Journey sharing release contract"
```

## Plan Self-Review

- Spec coverage: body stats, BMI, weekly/monthly trends, private dated Before/After photos, selfie/gallery, Run parity, caption/weight controls, universal switch, derived share copy, account safety, and 64-photo semantic rotation each map to a task.
- Scope: phases are independently testable and commit separately; no task requires replacing the entire Journey shell.
- Compatibility: legacy Compose drafts and Flex links receive explicit normalization; group/page posts remain outside the two-state personal-post switch.
- Privacy: private originals never enter Feed storage; excluded weight never enters rendered output or `share_data`.
- Type consistency: `showPublicly` is the single UI input and `postVisibility()` is the only personal-post mapping to `audience/show_on_card`.
