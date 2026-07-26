# Offline Activity Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every completed run, walk, or ride durable on the phone first and upload it exactly once when the correct account and internet connection are available.

**Architecture:** A focused AsyncStorage-backed queue owns durable activity records, while an injected synchronizer owns network retries and account isolation. The run tracker writes to the queue before clearing raw GPS points; a provider starts synchronization on connectivity, foreground, authentication, and manual-retry events and exposes queue summaries to the UI.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript, AsyncStorage, Supabase, `@react-native-community/netinfo`, Jest.

---

## File Map

- Create `src/activity/offlineQueueTypes.ts` — queue schema, statuses, error categories, and UUID generation.
- Create `src/activity/offlineQueueStore.ts` — durable entry/index writes, recovery, subscriptions, and owner-filtered reads.
- Create `src/activity/offlineQueueStore.test.ts` — persistence, recovery, isolation, and deletion tests.
- Create `src/activity/activityUpload.ts` — authenticated idempotent server insert and error classification.
- Create `src/activity/activityUpload.test.ts` — network/auth/duplicate/server behavior.
- Create `src/activity/activitySynchronizer.ts` — ordered single-flight queue drain and retry timing.
- Create `src/activity/activitySynchronizer.test.ts` — order, backoff, retries, and account switching.
- Create `src/activity/ActivitySyncProvider.tsx` — app lifecycle, connectivity, session triggers, and observable status.
- Create `src/activity/UploadStatus.tsx` — small status badge and pending-upload panel.
- Modify `src/activity/api.ts` — keep compatibility exports while delegating durable uploads to the new API.
- Modify `src/activity/locationTask.ts` — clear raw recording storage only after durable queue confirmation.
- Modify `src/app/(app)/run.tsx` — queue-first completion and locally shareable result.
- Modify `src/app/(app)/activity.tsx` — pending-upload summary and Uploads panel entry point.
- Modify `src/app/_layout.tsx` — mount one synchronization provider.
- Modify `src/lib/supabase.ts` — React Native session locking and foreground refresh.
- Modify `package.json` and `package-lock.json` — add NetInfo through Expo.

### Task 1: Preserve Real Authentication Errors and Refresh Sessions Correctly

**Files:**
- Create: `src/activity/activityAuth.test.ts`
- Modify: `src/activity/api.ts`
- Modify: `src/lib/supabase.ts`

- [ ] **Step 1: Write the failing authentication-error test**

```ts
import { saveActivity } from './api';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

test('preserves a network failure from getUser', async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: null },
    error: new Error('Network request failed'),
  });
  await expect(
    saveActivity({
      type: 'walk',
      distance_m: 330,
      duration_s: 387,
      route: [],
      started_at: '2026-07-26T06:58:00.000Z',
    }),
  ).rejects.toThrow('Network request failed');
});
```

- [ ] **Step 2: Run the focused test and verify the reported bug**

Run: `npx jest src/activity/activityAuth.test.ts --runInBand`

Expected: FAIL because the current implementation throws `Not signed in.` instead of the real network error.

- [ ] **Step 3: Preserve the Supabase error**

Change the start of `saveActivity` to:

```ts
const { data, error: authError } = await supabase.auth.getUser();
if (authError) throw authError;
const uid = data.user?.id;
if (!uid) throw new Error('Not signed in.');
```

- [ ] **Step 4: Add React Native auth locking and foreground refresh**

Update `src/lib/supabase.ts`:

```ts
import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
```

- [ ] **Step 5: Run the focused test and type-check**

Run: `npx jest src/activity/activityAuth.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/activity/activityAuth.test.ts src/activity/api.ts src/lib/supabase.ts
git commit -m "fix: preserve activity auth failures"
```

### Task 2: Define the Durable Queue Schema

**Files:**
- Create: `src/activity/offlineQueueTypes.ts`
- Create: `src/activity/offlineQueueTypes.test.ts`

- [ ] **Step 1: Write failing schema and UUID tests**

```ts
import { createActivityId, parseQueuedActivity } from './offlineQueueTypes';

test('creates RFC 4122 version-4 activity ids', () => {
  expect(createActivityId(() => 0.5)).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test('rejects a queue entry with no owner', () => {
  expect(() => parseQueuedActivity({ schema: 1, id: createActivityId() })).toThrow(
    'Invalid queued activity',
  );
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/activity/offlineQueueTypes.test.ts --runInBand`

Expected: FAIL because the queue types do not exist.

- [ ] **Step 3: Add the queue domain types and parser**

Implement:

```ts
import type { NewActivity } from './api';

export type UploadStatus =
  | 'saved'
  | 'uploading'
  | 'waiting_network'
  | 'needs_sign_in'
  | 'needs_attention';

export type UploadErrorCategory =
  | 'network'
  | 'auth'
  | 'server'
  | 'validation'
  | 'storage';

export type QueuedActivity = {
  schema: 1;
  id: string;
  ownerId: string;
  activity: NewActivity;
  createdAt: string;
  status: UploadStatus;
  attemptCount: number;
  nextAttemptAt: number;
  lastError: { category: UploadErrorCategory; message: string } | null;
};

export function createActivityId(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const n = Math.floor(random() * 16);
    return (token === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}

export function parseQueuedActivity(value: unknown): QueuedActivity {
  const row = value as Partial<QueuedActivity> | null;
  if (
    !row ||
    row.schema !== 1 ||
    typeof row.id !== 'string' ||
    typeof row.ownerId !== 'string' ||
    !row.ownerId ||
    !row.activity ||
    typeof row.createdAt !== 'string' ||
    typeof row.attemptCount !== 'number' ||
    typeof row.nextAttemptAt !== 'number'
  ) {
    throw new Error('Invalid queued activity');
  }
  return row as QueuedActivity;
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/activity/offlineQueueTypes.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/offlineQueueTypes.ts src/activity/offlineQueueTypes.test.ts
git commit -m "feat: define offline activity queue schema"
```

### Task 3: Implement Durable Entry Storage and Recovery

**Files:**
- Create: `src/activity/offlineQueueStore.ts`
- Create: `src/activity/offlineQueueStore.test.ts`

- [ ] **Step 1: Write failing persistence and recovery tests**

The tests must mock AsyncStorage and cover:

```ts
test('writes the full entry before adding it to the index', async () => {
  const calls: string[] = [];
  mockedSetItem.mockImplementation(async (key) => void calls.push(key));
  await enqueueActivity('owner-a', activity, '11111111-1111-4111-8111-111111111111');
  expect(calls[0]).toContain(':entry:');
  expect(calls[1]).toBe('activity:offline:index:v1');
});

test('recovers an orphan entry after an interrupted index write', async () => {
  mockedGetAllKeys.mockResolvedValue(['activity:offline:entry:orphan']);
  mockedMultiGet.mockResolvedValue([
    ['activity:offline:entry:orphan', JSON.stringify(validEntry)],
  ]);
  expect(await recoverQueue()).toEqual([validEntry]);
});

test('never exposes another owners private activity details', async () => {
  await enqueueActivity('owner-a', activity, idA);
  await enqueueActivity('owner-b', activity, idB);
  expect((await listQueuedActivities('owner-a')).map((x) => x.id)).toEqual([idA]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/activity/offlineQueueStore.test.ts --runInBand`

Expected: FAIL because the store does not exist.

- [ ] **Step 3: Implement the store**

Use these exact public functions:

```ts
export async function enqueueActivity(
  ownerId: string,
  activity: NewActivity,
  id = createActivityId(),
): Promise<QueuedActivity>;
export async function recoverQueue(): Promise<QueuedActivity[]>;
export async function listQueuedActivities(ownerId?: string): Promise<QueuedActivity[]>;
export async function getQueuedActivity(id: string): Promise<QueuedActivity | null>;
export async function patchQueuedActivity(
  id: string,
  patch: Partial<Pick<QueuedActivity, 'status' | 'attemptCount' | 'nextAttemptAt' | 'lastError'>>,
): Promise<QueuedActivity>;
export async function removeQueuedActivity(id: string): Promise<void>;
export function subscribeToQueue(listener: () => void): () => void;
```

Implementation rules:

```ts
const INDEX_KEY = 'activity:offline:index:v1';
const ENTRY_PREFIX = 'activity:offline:entry:';

// enqueue order:
await AsyncStorage.setItem(`${ENTRY_PREFIX}${entry.id}`, JSON.stringify(entry));
const ids = await readIndex();
await AsyncStorage.setItem(INDEX_KEY, JSON.stringify([...ids, entry.id]));
emitQueueChanged();

// remove order:
await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(ids.filter((x) => x !== id)));
await AsyncStorage.removeItem(`${ENTRY_PREFIX}${id}`);
emitQueueChanged();
```

`recoverQueue()` must scan `AsyncStorage.getAllKeys()`, parse every entry key,
quarantine invalid JSON by leaving it stored, merge valid missing IDs into the
index, and return entries ordered by `createdAt`.

- [ ] **Step 4: Run tests**

Run: `npx jest src/activity/offlineQueueStore.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/offlineQueueStore.ts src/activity/offlineQueueStore.test.ts
git commit -m "feat: persist offline activity queue"
```

### Task 4: Make Server Uploads Idempotent and Account-Bound

**Files:**
- Create: `src/activity/activityUpload.ts`
- Create: `src/activity/activityUpload.test.ts`
- Modify: `src/activity/api.ts`

- [ ] **Step 1: Write failing upload tests**

Cover the actual Supabase chain with a mocked client:

```ts
test('inserts the client activity id and bound owner', async () => {
  await uploadQueuedActivity(entry);
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({ id: entry.id, user_id: entry.ownerId }),
  );
});

test('refuses to upload under a different signed-in account', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'owner-b' } }, error: null });
  await expect(uploadQueuedActivity(entryForOwnerA)).rejects.toMatchObject({
    category: 'auth',
  });
});

test('treats a duplicate id as success only when the existing row matches', async () => {
  insertSingle.mockResolvedValue({ data: null, error: { code: '23505' } });
  existingSingle.mockResolvedValue({
    data: expectedServerRow,
    error: null,
  });
  await expect(uploadQueuedActivity(entry)).resolves.toBe(entry.id);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/activity/activityUpload.test.ts --runInBand`

Expected: FAIL because the upload module does not exist.

- [ ] **Step 3: Implement classified errors and idempotent confirmation**

Export:

```ts
export class ActivityUploadError extends Error {
  constructor(
    public category: UploadErrorCategory,
    message: string,
    public transient: boolean,
  ) {
    super(message);
  }
}

export async function uploadQueuedActivity(entry: QueuedActivity): Promise<string>;
```

Behavior:

1. Call `supabase.auth.getUser()`.
2. Preserve `authError`; classify fetch/network failures as `network`.
3. Require `user.id === entry.ownerId`.
4. Insert `{ id: entry.id, user_id: entry.ownerId, ...entry.activity }`.
5. On PostgreSQL `23505`, select the existing row by ID.
6. Confirm owner, type, rounded distance, rounded duration, and `started_at`.
7. Return the ID only when the row matches; otherwise throw permanent
   `validation`.

Keep `saveActivity()` as a compatibility wrapper that creates a one-off
`QueuedActivity` and calls `uploadQueuedActivity`; the run screen will stop using
this wrapper in Task 7.

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest src/activity/activityUpload.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/activityUpload.ts src/activity/activityUpload.test.ts src/activity/api.ts
git commit -m "feat: upload activities idempotently"
```

### Task 5: Implement Ordered Synchronization and Backoff

**Files:**
- Create: `src/activity/activitySynchronizer.ts`
- Create: `src/activity/activitySynchronizer.test.ts`

- [ ] **Step 1: Write failing synchronization tests**

Use injected store/upload/time dependencies:

```ts
test('uploads oldest first and only one at a time', async () => {
  const sync = createActivitySynchronizer(deps);
  await sync.drain('owner-a');
  expect(upload.mock.calls.map(([entry]) => entry.id)).toEqual(['oldest', 'newest']);
  expect(maxConcurrentUploads).toBe(1);
});

test('keeps an offline entry and schedules a retry', async () => {
  upload.mockRejectedValue(new ActivityUploadError('network', 'Offline', true));
  await sync.drain('owner-a');
  expect(patch).toHaveBeenCalledWith(
    'oldest',
    expect.objectContaining({
      status: 'waiting_network',
      attemptCount: 1,
      nextAttemptAt: expect.any(Number),
    }),
  );
  expect(remove).not.toHaveBeenCalled();
});

test('removes only after confirmed upload', async () => {
  upload.mockResolvedValue('oldest');
  await sync.drain('owner-a');
  expect(remove).toHaveBeenCalledWith('oldest');
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/activity/activitySynchronizer.test.ts --runInBand`

Expected: FAIL because the synchronizer does not exist.

- [ ] **Step 3: Implement the synchronizer**

Export:

```ts
export function retryDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(30 * 60_000, 2 ** Math.min(attempt, 10) * 1_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

export function createActivitySynchronizer(deps = defaultDependencies) {
  let active: Promise<void> | null = null;
  return {
    drain(ownerId: string, force = false): Promise<void> {
      if (active) return active;
      active = drainOnce(ownerId, force, deps).finally(() => {
        active = null;
      });
      return active;
    },
  };
}
```

`drainOnce` must sort oldest first, skip entries whose `nextAttemptAt` is in the
future unless `force` is true, stop after a network/auth failure, quarantine a
permanent failure as `needs_attention`, and remove only confirmed successes.

- [ ] **Step 4: Run tests**

Run: `npx jest src/activity/activitySynchronizer.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/activity/activitySynchronizer.ts src/activity/activitySynchronizer.test.ts
git commit -m "feat: synchronize offline activities"
```

### Task 6: Start Synchronization from App, Network, and Auth Events

**Files:**
- Create: `src/activity/ActivitySyncProvider.tsx`
- Create: `src/activity/ActivitySyncProvider.test.ts`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the Expo-compatible connectivity package**

Run: `npx expo install @react-native-community/netinfo`

Expected: `package.json` and lockfile contain the SDK-compatible version.

- [ ] **Step 2: Write the provider trigger test**

Extract and test a pure trigger controller:

```ts
test('drains on startup, reconnect, foreground, and same-owner sign-in', async () => {
  const controller = createSyncTriggerController({ drain });
  await controller.onSession('owner-a');
  await controller.onConnectivity(true);
  await controller.onAppState('active');
  expect(drain).toHaveBeenCalledTimes(3);
  expect(drain).toHaveBeenLastCalledWith('owner-a');
});
```

- [ ] **Step 3: Implement the provider**

`ActivitySyncProvider` must:

- call `recoverQueue()` once;
- subscribe to `NetInfo.addEventListener`;
- subscribe to React Native `AppState`;
- read the current owner from `useAuth()`;
- call one synchronizer instance;
- expose `{ queued, retryNow, refreshQueue }` through `useActivitySync()`;
- reveal only aggregate counts for entries belonging to another owner.

Mount it inside `AuthProvider` and outside `RootNavigator`:

```tsx
<AuthProvider>
  <ActivitySyncProvider>
    <ProProvider>{/* existing hosts */}</ProProvider>
  </ActivitySyncProvider>
</AuthProvider>
```

- [ ] **Step 4: Run focused tests and type-check**

Run: `npx jest src/activity/ActivitySyncProvider.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/activity/ActivitySyncProvider.tsx src/activity/ActivitySyncProvider.test.ts src/app/_layout.tsx
git commit -m "feat: trigger automatic activity uploads"
```

### Task 7: Make Run Completion Local-First

**Files:**
- Modify: `src/app/(app)/run.tsx`
- Modify: `src/activity/locationTask.ts`
- Modify: `src/activity/RunShareSheet.tsx`
- Create: `src/activity/runCompletion.test.ts`

- [ ] **Step 1: Write a failing completion-order test**

Extract `completeRecordedActivity` and assert:

```ts
test('queues before clearing raw GPS points', async () => {
  const order: string[] = [];
  await completeRecordedActivity(pending, 'owner-a', {
    enqueue: async () => {
      order.push('queue');
      return queuedEntry;
    },
    clearRaw: async () => void order.push('clear'),
  });
  expect(order).toEqual(['queue', 'clear']);
});

test('does not clear GPS points when local storage fails', async () => {
  enqueue.mockRejectedValue(new Error('Storage full'));
  await expect(completeRecordedActivity(pending, 'owner-a', deps)).rejects.toThrow(
    'Storage full',
  );
  expect(clearRaw).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest src/activity/runCompletion.test.ts --runInBand`

Expected: FAIL because completion still uploads before durable storage.

- [ ] **Step 3: Implement queue-first completion**

At recording start, capture `session.user.id` into `ownerIdRef`. At stop:

```ts
const queued = await enqueueActivity(ownerIdRef.current, {
  type: p.type,
  distance_m: p.distance,
  duration_s: p.elapsed,
  route: p.points,
  started_at: p.startedAt,
});
await resetTrackPoints();
setPending(null);
setShareRun({
  activityId: queued.id,
  syncStatus: queued.status,
  type: p.type,
  distance: p.distance,
  elapsed: p.elapsed,
  points: p.points,
  title,
});
```

Change the success copy to **Saved on phone**. On local-storage failure, preserve
the raw route and show **Could not save on this phone** with retry. Do not show
**Not signed in** merely because upload cannot run.

Add `syncStatus` to `FinishedRun`. External image sharing remains enabled for
queued activities; **Post to Feed** is disabled until the queue no longer
contains that `activityId`.

- [ ] **Step 4: Run tests and type-check**

Run: `npx jest src/activity/runCompletion.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/run.tsx src/activity/locationTask.ts src/activity/RunShareSheet.tsx src/activity/runCompletion.test.ts
git commit -m "feat: save completed activities on phone first"
```

### Task 8: Add Upload Status and Manual Retry UI

**Files:**
- Create: `src/activity/UploadStatus.tsx`
- Modify: `src/app/(app)/run.tsx`
- Modify: `src/app/(app)/activity.tsx`
- Create: `src/activity/uploadStatusCopy.test.ts`

- [ ] **Step 1: Write status-copy tests**

```ts
expect(uploadStatusCopy('saved')).toEqual({
  title: 'Saved on phone',
  detail: 'Uploading automatically',
});
expect(uploadStatusCopy('waiting_network').title).toBe('Waiting for internet');
expect(uploadStatusCopy('needs_sign_in').title).toBe('Sign in to upload');
expect(uploadStatusCopy('needs_attention').title).toBe('Needs attention');
```

- [ ] **Step 2: Implement accessible status components**

Create:

```tsx
export function ActivityUploadBadge({ status }: { status: UploadStatus }) {
  const copy = uploadStatusCopy(status);
  return (
    <View accessibilityRole="status" accessibilityLiveRegion="polite">
      <Ionicons name={iconForStatus(status)} size={16} color={colorForStatus(status)} />
      <Text>{copy.title}</Text>
    </View>
  );
}
```

Add an **Uploads** row to the Activity pillar screen whenever the current owner
has queued entries. Its panel lists type, local start time, distance, status,
and **Retry now**. For a different signed-in owner, show only
`Pending uploads for another account` without private details.

- [ ] **Step 3: Run tests and type-check**

Run: `npx jest src/activity/uploadStatusCopy.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/activity/UploadStatus.tsx src/activity/uploadStatusCopy.test.ts src/app/\(app\)/run.tsx src/app/\(app\)/activity.tsx
git commit -m "feat: show pending activity uploads"
```

### Task 9: Full Verification and Staging Evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-offline-activity-queue-design.md` only if implementation evidence reveals a necessary clarification.
- Create: `docs/release-evidence/offline-activity-queue.md`

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
npx tsc --noEmit
npx jest --runInBand
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 2: Build an Android preview containing NetInfo**

Run: `npx eas-cli@latest build --platform android --profile preview`

Expected: successful installable APK. Record the EAS build URL.

- [ ] **Step 3: Execute the approved device matrix**

On the Android staging build:

1. Start a walk online, enable airplane mode, stop, and verify **Saved on phone**.
2. Force-close and reopen; verify the upload remains.
3. Record two more offline activities.
4. Restore internet; verify automatic oldest-first upload.
5. Tap **Retry now** repeatedly; verify one server row per activity ID.
6. Sign out and into another account; verify no details or upload cross accounts.
7. Return to the owner account; verify synchronization resumes.
8. Compare route, time, distance, type, and owner on phone and Supabase.

- [ ] **Step 4: Write release evidence**

`docs/release-evidence/offline-activity-queue.md` must contain the APK/build URL,
test commands and results, screenshots of every visible state, inspected server
IDs, account-isolation evidence, known limitations, and rollback instructions.

- [ ] **Step 5: Commit evidence**

```bash
git add docs/release-evidence/offline-activity-queue.md
git commit -m "docs: record offline activity queue evidence"
```

