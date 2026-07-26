import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ActivityUploadError } from './activityUpload';
import {
  createActivitySynchronizer,
  retryDelayMs,
} from './activitySynchronizer';
import type {
  QueuedActivity,
  UploadErrorCategory,
} from './offlineQueueTypes';

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {},
}));

const OWNER_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OWNER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-07-26T02:00:00.000Z');

type QueuePatch = Partial<
  Pick<
    QueuedActivity,
    'status' | 'attemptCount' | 'nextAttemptAt' | 'lastError'
  >
>;

function entry(
  id: string,
  {
    ownerId = OWNER_A,
    createdAt = '2026-07-26T01:00:00.000Z',
    status = 'saved',
    attemptCount = 0,
    nextAttemptAt = 0,
  }: Partial<QueuedActivity> = {},
): QueuedActivity {
  return {
    schema: 1,
    id,
    ownerId,
    activity: {
      type: 'run',
      distance_m: 1_500,
      duration_s: 420,
      route: [{ lat: -31.9523, lon: 115.8613 }],
      started_at: '2026-07-26T00:50:00.000Z',
    },
    createdAt,
    status,
    attemptCount,
    nextAttemptAt,
    lastError: null,
  };
}

function harness(initial: QueuedActivity[]) {
  const records = new Map(
    initial.map((item) => [item.id, structuredClone(item)]),
  );
  const list = jest.fn(async (ownerId: string) =>
    [...records.values()]
      .filter((item) => item.ownerId === ownerId)
      .map((item) => structuredClone(item)),
  );
  const patch = jest.fn(
    async (ownerId: string, id: string, value: QueuePatch) => {
      const current = records.get(id);
      if (!current) throw new Error('Queued activity not found or invalid');
      if (current.ownerId !== ownerId) {
        throw new Error('Queued activity owner mismatch');
      }
      const updated = { ...current, ...value };
      records.set(id, updated);
      return structuredClone(updated);
    },
  );
  const remove = jest.fn(async (ownerId: string, id: string) => {
    const current = records.get(id);
    if (current && current.ownerId !== ownerId) {
      throw new Error('Queued activity owner mismatch');
    }
    records.delete(id);
  });
  const upload = jest.fn(async (item: QueuedActivity) => item.id);
  const now = jest.fn(() => NOW);
  const random = jest.fn(() => 0.5);
  const synchronizer = createActivitySynchronizer({
    list,
    patch,
    remove,
    upload,
    now,
    random,
  });

  return {
    records,
    list,
    patch,
    remove,
    upload,
    now,
    random,
    synchronizer,
  };
}

function uploadError(
  category: UploadErrorCategory,
  transient: boolean,
): ActivityUploadError {
  return new ActivityUploadError(
    category,
    `${category} upload failure`,
    transient,
  );
}

describe('retryDelayMs', () => {
  it('applies bounded jitter and caps retries at thirty minutes', () => {
    expect(retryDelayMs(0, () => 0)).toBe(800);
    expect(retryDelayMs(0, () => 1)).toBe(1_200);
    expect(retryDelayMs(1_000_000, () => 1)).toBe(30 * 60_000);
  });

  it('normalizes unsafe attempt and random inputs', () => {
    expect(retryDelayMs(Number.NaN, () => Number.NaN)).toBe(1_000);
    expect(retryDelayMs(-10, () => -5)).toBe(800);
    expect(retryDelayMs(Number.POSITIVE_INFINITY, () => 5)).toBe(
      30 * 60_000,
    );
  });
});

describe('createActivitySynchronizer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads oldest first with maximum concurrency one', async () => {
    const oldest = entry(ID_A);
    const newest = entry(ID_B, {
      createdAt: '2026-07-26T01:30:00.000Z',
    });
    const setup = harness([newest, oldest]);
    let concurrent = 0;
    let maximumConcurrent = 0;
    setup.upload.mockImplementation(async (item) => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      return item.id;
    });

    await setup.synchronizer.drain(OWNER_A);

    expect(setup.upload.mock.calls.map(([item]) => item.id)).toEqual([
      ID_A,
      ID_B,
    ]);
    expect(maximumConcurrent).toBe(1);
    expect(setup.remove.mock.calls).toEqual([
      [OWNER_A, ID_A],
      [OWNER_A, ID_B],
    ]);
  });

  it('returns one in-flight promise for concurrent drains of the same owner', async () => {
    const setup = harness([entry(ID_A)]);

    const first = setup.synchronizer.drain(OWNER_A);
    const second = setup.synchronizer.drain(OWNER_A);

    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(setup.upload).toHaveBeenCalledTimes(1);
  });

  it('serializes different owners without sharing or mixing their drains', async () => {
    const setup = harness([
      entry(ID_A, { ownerId: OWNER_A }),
      entry(ID_B, { ownerId: OWNER_B }),
    ]);

    const ownerA = setup.synchronizer.drain(OWNER_A);
    const ownerB = setup.synchronizer.drain(OWNER_B);

    expect(ownerB).not.toBe(ownerA);
    await Promise.all([ownerA, ownerB]);
    expect(setup.list.mock.calls).toEqual([[OWNER_A], [OWNER_B]]);
    expect(
      setup.upload.mock.calls.map(([item]) => [item.ownerId, item.id]),
    ).toEqual([
      [OWNER_A, ID_A],
      [OWNER_B, ID_B],
    ]);
    expect(setup.remove.mock.calls).toEqual([
      [OWNER_A, ID_A],
      [OWNER_B, ID_B],
    ]);
  });

  it('skips future retries and needs-attention entries unless forced', async () => {
    const setup = harness([
      entry(ID_A, { nextAttemptAt: NOW + 60_000 }),
      entry(ID_B, { status: 'needs_attention' }),
    ]);

    await setup.synchronizer.drain(OWNER_A);
    expect(setup.upload).not.toHaveBeenCalled();

    await setup.synchronizer.drain(OWNER_A, true);
    expect(setup.upload.mock.calls.map(([item]) => item.id)).toEqual([
      ID_A,
      ID_B,
    ]);
  });

  it('schedules a network retry and stops to preserve queue order', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.upload.mockRejectedValueOnce(uploadError('network', true));

    await setup.synchronizer.drain(OWNER_A);

    expect(setup.upload).toHaveBeenCalledTimes(1);
    expect(setup.patch).toHaveBeenLastCalledWith(
      OWNER_A,
      ID_A,
      expect.objectContaining({
        status: 'waiting_network',
        attemptCount: 1,
        nextAttemptAt: NOW + 2_000,
        lastError: expect.objectContaining({ category: 'network' }),
      }),
    );
    expect(setup.remove).not.toHaveBeenCalled();
  });

  it('marks an auth failure as needing sign-in and stops', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.upload.mockRejectedValueOnce(uploadError('auth', false));

    await setup.synchronizer.drain(OWNER_A);

    expect(setup.upload).toHaveBeenCalledTimes(1);
    expect(setup.patch).toHaveBeenLastCalledWith(
      OWNER_A,
      ID_A,
      expect.objectContaining({
        status: 'needs_sign_in',
        attemptCount: 1,
        nextAttemptAt: NOW,
        lastError: expect.objectContaining({ category: 'auth' }),
      }),
    );
  });

  it('schedules a transient server failure and stops', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.upload.mockRejectedValueOnce(uploadError('server', true));

    await setup.synchronizer.drain(OWNER_A);

    expect(setup.upload).toHaveBeenCalledTimes(1);
    expect(setup.patch).toHaveBeenLastCalledWith(
      OWNER_A,
      ID_A,
      expect.objectContaining({
        status: 'waiting_network',
        attemptCount: 1,
        nextAttemptAt: NOW + 2_000,
        lastError: expect.objectContaining({ category: 'server' }),
      }),
    );
  });

  it.each<['validation' | 'server', false]>([
    ['validation', false],
    ['server', false],
  ])(
    'quarantines a permanent %s failure and continues',
    async (category, transient) => {
      const setup = harness([entry(ID_A), entry(ID_B)]);
      setup.upload
        .mockRejectedValueOnce(uploadError(category, transient))
        .mockResolvedValueOnce(ID_B);

      await setup.synchronizer.drain(OWNER_A);

      expect(setup.upload).toHaveBeenCalledTimes(2);
      expect(setup.patch).toHaveBeenNthCalledWith(
        2,
        OWNER_A,
        ID_A,
        expect.objectContaining({
          status: 'needs_attention',
          attemptCount: 1,
          lastError: expect.objectContaining({ category }),
        }),
      );
      expect(setup.remove).toHaveBeenCalledTimes(1);
      expect(setup.remove).toHaveBeenCalledWith(OWNER_A, ID_B);
    },
  );

  it('removes an entry only when upload confirms the same ID', async () => {
    const setup = harness([entry(ID_A)]);
    setup.upload.mockResolvedValue(ID_B);

    await setup.synchronizer.drain(OWNER_A);

    expect(setup.remove).not.toHaveBeenCalled();
    expect(setup.patch).toHaveBeenLastCalledWith(
      OWNER_A,
      ID_A,
      expect.objectContaining({
        status: 'needs_attention',
        lastError: expect.objectContaining({ category: 'validation' }),
      }),
    );
  });

  it('re-uploads for idempotent preflight after confirmed upload removal fails', async () => {
    const setup = harness([entry(ID_A)]);
    setup.remove
      .mockRejectedValueOnce(new Error('Storage unavailable'))
      .mockImplementationOnce(async (_ownerId, id) => {
        setup.records.delete(id);
      });

    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toEqual(
      expect.objectContaining({ category: 'storage' }),
    );
    expect(setup.upload).toHaveBeenCalledTimes(1);
    expect(setup.records.has(ID_A)).toBe(true);

    await expect(setup.synchronizer.drain(OWNER_A)).resolves.toBeUndefined();
    expect(setup.upload).toHaveBeenCalledTimes(2);
    expect(setup.remove).toHaveBeenCalledTimes(2);
  });

  it('stops before uploading when the uploading-state patch fails', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.patch.mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toEqual(
      expect.objectContaining({ category: 'storage' }),
    );

    expect(setup.upload).not.toHaveBeenCalled();
    expect(setup.remove).not.toHaveBeenCalled();
  });

  it('stops after an error-state patch fails without uploading the next entry', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.upload.mockRejectedValueOnce(uploadError('network', true));
    setup.patch
      .mockImplementationOnce(async (ownerId, id, value) => {
        const current = setup.records.get(id)!;
        const updated = { ...current, ...value };
        setup.records.set(id, updated);
        return updated;
      })
      .mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toEqual(
      expect.objectContaining({ category: 'storage' }),
    );
    expect(setup.upload).toHaveBeenCalledTimes(1);
  });

  it('clears single-flight state after rejection', async () => {
    const setup = harness([entry(ID_A)]);
    setup.patch.mockRejectedValueOnce(new Error('Storage unavailable'));

    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toBeDefined();
    await expect(setup.synchronizer.drain(OWNER_A)).resolves.toBeUndefined();

    expect(setup.list).toHaveBeenCalledTimes(2);
    expect(setup.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects non-canonical and cross-owner queue input before upload', async () => {
    const setup = harness([]);

    await expect(setup.synchronizer.drain(' OWNER-A ')).rejects.toEqual(
      expect.objectContaining({ category: 'auth' }),
    );
    expect(setup.list).not.toHaveBeenCalled();

    setup.list.mockResolvedValueOnce([
      entry(ID_C, { ownerId: OWNER_B }),
    ]);
    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toEqual(
      expect.objectContaining({ category: 'auth' }),
    );
    expect(setup.upload).not.toHaveBeenCalled();
  });

  it('classifies queue mutation owner mismatch without another upload', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.remove.mockRejectedValueOnce(
      new Error('Queued activity owner mismatch'),
    );

    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toEqual(
      expect.objectContaining({ category: 'auth' }),
    );
    expect(setup.upload).toHaveBeenCalledTimes(1);
  });

  it('does not mistake a queue auth error for an upload auth failure', async () => {
    const setup = harness([entry(ID_A), entry(ID_B)]);
    setup.remove.mockRejectedValueOnce(
      new ActivityUploadError(
        'auth',
        'Queue authorization failed',
        false,
        undefined,
        'storage_policy',
      ),
    );

    await expect(setup.synchronizer.drain(OWNER_A)).rejects.toEqual(
      expect.objectContaining({
        category: 'auth',
        code: 'queue_auth_error',
      }),
    );
    expect(setup.upload).toHaveBeenCalledTimes(1);
    expect(setup.patch).toHaveBeenCalledTimes(1);
  });
});
