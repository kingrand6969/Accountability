import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import {
  MAX_ROUTE_POINTS,
  type QueuedActivity,
} from './offlineQueueTypes';
import {
  enqueueActivity,
  getQueuedActivity,
  listQueuedActivities,
  MAX_OFFLINE_QUEUE_INDEX_BYTES,
  MAX_QUEUED_ACTIVITY_BYTES,
  patchQueuedActivity,
  recoverQueue,
  removeQueuedActivity,
  subscribeToQueue,
} from './offlineQueueStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getAllKeys: jest.fn(),
    getItem: jest.fn(),
    multiGet: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const INDEX_KEY = 'activity:offline:index:v1';
const ENTRY_PREFIX = 'activity:offline:entry:';
const OWNER_A = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OWNER_B = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_C = '33333333-3333-4333-8333-333333333333';

const mockedStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
let stored: Map<string, string>;
let writeCalls: string[];

const activity: NewActivity = {
  type: 'run',
  distance_m: 1_500.5,
  duration_s: 420,
  route: [{ lat: -31.9523, lon: 115.8613 }],
  started_at: '2026-07-26T01:02:03.000Z',
};

function entry(
  id: string,
  ownerId = OWNER_A,
  createdAt = '2026-07-26T01:02:04.000Z',
): QueuedActivity {
  return {
    schema: 1,
    id,
    ownerId,
    activity,
    createdAt,
    status: 'saved',
    attemptCount: 0,
    nextAttemptAt: 0,
    lastError: null,
  };
}

function seedEntry(value: QueuedActivity): void {
  stored.set(`${ENTRY_PREFIX}${value.id}`, JSON.stringify(value));
}

function generatedId(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence
    .toString(16)
    .padStart(12, '0')}`;
}

beforeEach(() => {
  stored = new Map();
  writeCalls = [];
  jest.clearAllMocks();

  mockedStorage.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
  mockedStorage.setItem.mockImplementation(async (key, value) => {
    writeCalls.push(`set:${key}`);
    stored.set(key, value);
  });
  mockedStorage.removeItem.mockImplementation(async (key) => {
    writeCalls.push(`remove:${key}`);
    stored.delete(key);
  });
  mockedStorage.getAllKeys.mockImplementation(async () => [...stored.keys()]);
  mockedStorage.multiGet.mockImplementation(async (keys) =>
    keys.map((key) => [key, stored.get(key) ?? null]),
  );
});

describe('enqueueActivity', () => {
  it('writes the full entry before its index and emits only after both are durable', async () => {
    const observed: string[] = [];
    const unsubscribe = subscribeToQueue(() => observed.push('emit'));
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      observed.push(key);
      stored.set(key, value);
    });

    const queued = await enqueueActivity(OWNER_A, activity, ID_A);

    expect(observed).toEqual([
      `${ENTRY_PREFIX}${ID_A}`,
      INDEX_KEY,
      'emit',
    ]);
    expect(JSON.parse(stored.get(`${ENTRY_PREFIX}${ID_A}`)!)).toEqual(queued);
    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A]);
    unsubscribe();
  });

  it('does not lose IDs when enqueues overlap', async () => {
    await Promise.all([
      enqueueActivity(OWNER_A, activity, ID_A),
      enqueueActivity(OWNER_A, activity, ID_B),
      enqueueActivity(OWNER_A, activity, ID_C),
    ]);

    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('rejects an oversized serialized entry before writing it', async () => {
    const hugeActivity: NewActivity = {
      ...activity,
      route: Array.from({ length: MAX_ROUTE_POINTS }, () => ({
        lat: 89.12345678901234,
        lon: 179.12345678901234,
      })),
    };

    await expect(enqueueActivity(OWNER_A, hugeActivity, ID_A)).rejects.toThrow(
      `${MAX_QUEUED_ACTIVITY_BYTES}-byte storage limit`,
    );
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects an oversized projected index before writing the entry', async () => {
    const maximumIdsThatFit = Math.floor(
      (MAX_OFFLINE_QUEUE_INDEX_BYTES - 1) / 39,
    );
    const nearlyFullIndex = Array.from(
      { length: maximumIdsThatFit },
      (_, index) => generatedId(index),
    );
    const serializedIndex = JSON.stringify(nearlyFullIndex);
    expect(new TextEncoder().encode(serializedIndex).byteLength).toBeLessThanOrEqual(
      MAX_OFFLINE_QUEUE_INDEX_BYTES,
    );
    expect(
      new TextEncoder().encode(
        JSON.stringify([...nearlyFullIndex, ID_A]),
      ).byteLength,
    ).toBeGreaterThan(MAX_OFFLINE_QUEUE_INDEX_BYTES);
    stored.set(INDEX_KEY, serializedIndex);

    await expect(enqueueActivity(OWNER_A, activity, ID_A)).rejects.toThrow(
      `${MAX_OFFLINE_QUEUE_INDEX_BYTES}-byte index storage limit`,
    );

    expect(mockedStorage.setItem).not.toHaveBeenCalled();
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(false);
    expect(stored.get(INDEX_KEY)).toBe(serializedIndex);
  });
});

describe('recovery and reads', () => {
  it('recovers a valid orphan after an interrupted index write', async () => {
    seedEntry(entry(ID_A));

    await expect(recoverQueue()).resolves.toEqual([entry(ID_A)]);
    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A]);
  });

  it('never returns another owner private activity from an owner-filtered read', async () => {
    const privateActivity = { ...activity, distance_m: 987_654 };
    await enqueueActivity(OWNER_A, activity, ID_A);
    await enqueueActivity(OWNER_B, privateActivity, ID_B);

    const result = await listQueuedActivities(OWNER_A);

    expect(result).toEqual([
      expect.objectContaining({ id: ID_A, ownerId: OWNER_A }),
    ]);
    expect(JSON.stringify(result)).not.toContain('987654');
    expect(JSON.stringify(result)).not.toContain(OWNER_B);
  });

  it('checks the UTF-8 byte cap before parsing a stored entry and leaves it quarantined', async () => {
    const oversized = 'x'.repeat(MAX_QUEUED_ACTIVITY_BYTES + 1);
    const key = `${ENTRY_PREFIX}${ID_A}`;
    stored.set(key, oversized);
    const originalParse = JSON.parse;
    const parseSpy = jest.spyOn(JSON, 'parse').mockImplementation((value) => {
      if (value === oversized) throw new Error('oversized value was parsed');
      return originalParse(value);
    });

    await expect(recoverQueue()).resolves.toEqual([]);

    expect(parseSpy).not.toHaveBeenCalledWith(oversized);
    expect(stored.get(key)).toBe(oversized);
    parseSpy.mockRestore();
  });

  it('quarantines invalid JSON without exposing or deleting it', async () => {
    const key = `${ENTRY_PREFIX}${ID_A}`;
    stored.set(key, '{broken');
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));

    await expect(recoverQueue()).resolves.toEqual([]);

    expect(stored.get(key)).toBe('{broken');
    expect(stored.get(INDEX_KEY)).toBe('[]');
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
  });

  it('repairs a missing index from valid entries', async () => {
    seedEntry(entry(ID_B));
    seedEntry(entry(ID_A));

    const recovered = await recoverQueue();

    expect(recovered.map((item) => item.id)).toEqual([ID_A, ID_B]);
    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A, ID_B]);
  });

  it('persists an empty repair when an existing index is corrupt', async () => {
    stored.set(INDEX_KEY, '{broken');

    await expect(recoverQueue()).resolves.toEqual([]);

    expect(stored.get(INDEX_KEY)).toBe('[]');
    expect(mockedStorage.setItem).toHaveBeenCalledWith(INDEX_KEY, '[]');
  });

  it('repairs an oversized corrupt index without parsing or deleting entries', async () => {
    const oversizedIndex = 'x'.repeat(MAX_OFFLINE_QUEUE_INDEX_BYTES + 1);
    stored.set(INDEX_KEY, oversizedIndex);
    const originalParse = JSON.parse;
    const parseSpy = jest.spyOn(JSON, 'parse').mockImplementation((value) => {
      if (value === oversizedIndex) {
        throw new Error('oversized index was parsed');
      }
      return originalParse(value);
    });

    await expect(recoverQueue()).resolves.toEqual([]);

    expect(parseSpy).not.toHaveBeenCalledWith(oversizedIndex);
    expect(stored.get(INDEX_KEY)).toBe('[]');
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('surfaces an oversized recovery index without writing or deleting entries', async () => {
    const tooManyEntries = Math.floor(
      (MAX_OFFLINE_QUEUE_INDEX_BYTES - 1) / 39,
    ) + 1;
    for (let index = 0; index < tooManyEntries; index += 1) {
      seedEntry(entry(generatedId(index)));
    }

    await expect(recoverQueue()).rejects.toThrow(
      `${MAX_OFFLINE_QUEUE_INDEX_BYTES}-byte index storage limit`,
    );

    expect(stored.has(INDEX_KEY)).toBe(false);
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
    expect(stored.size).toBe(tooManyEntries);
  });

  it('drops missing IDs from the effective index without deleting quarantined values', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A, ID_B]));

    await expect(recoverQueue()).resolves.toEqual([entry(ID_A)]);
    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A]);
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
  });

  it('sorts oldest first with a stable ID tie-break', async () => {
    seedEntry(entry(ID_C, OWNER_A, '2026-07-26T02:00:00.000Z'));
    seedEntry(entry(ID_B, OWNER_A, '2026-07-26T01:00:00.000Z'));
    seedEntry(entry(ID_A, OWNER_A, '2026-07-26T01:00:00.000Z'));
    stored.set(INDEX_KEY, JSON.stringify([ID_C, ID_B, ID_A]));

    const recovered = await recoverQueue();

    expect(recovered.map((item) => item.id)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('returns null for invalid quarantined entries', async () => {
    stored.set(`${ENTRY_PREFIX}${ID_A}`, '{broken');

    await expect(getQueuedActivity(ID_A)).resolves.toBeNull();
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(true);
  });
});

describe('patchQueuedActivity', () => {
  it('only persists a reconstructed valid allowed patch before emitting', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    const observed: string[] = [];
    const unsubscribe = subscribeToQueue(() => observed.push('emit'));
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      observed.push(key);
      stored.set(key, value);
    });

    const updated = await patchQueuedActivity(ID_A, {
      status: 'waiting_network',
      attemptCount: 1,
      nextAttemptAt: 123,
      lastError: { category: 'network', message: 'Offline' },
    });

    expect(updated).toMatchObject({
      id: ID_A,
      ownerId: OWNER_A,
      status: 'waiting_network',
      attemptCount: 1,
      nextAttemptAt: 123,
      lastError: { category: 'network', message: 'Offline' },
    });
    expect(observed).toEqual([`${ENTRY_PREFIX}${ID_A}`, 'emit']);
    unsubscribe();
  });

  it('rejects invalid or disallowed patches without writing', async () => {
    seedEntry(entry(ID_A));

    await expect(
      patchQueuedActivity(ID_A, { attemptCount: -1 }),
    ).rejects.toThrow('Invalid queued activity patch');
    await expect(
      patchQueuedActivity(
        ID_A,
        { ownerId: OWNER_B } as Parameters<typeof patchQueuedActivity>[1],
      ),
    ).rejects.toThrow('Invalid queued activity patch');
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('throws a clear error for missing or quarantined entries', async () => {
    await expect(
      patchQueuedActivity(ID_A, { status: 'uploading' }),
    ).rejects.toThrow('Queued activity not found or invalid');

    stored.set(`${ENTRY_PREFIX}${ID_A}`, '{broken');
    await expect(
      patchQueuedActivity(ID_A, { status: 'uploading' }),
    ).rejects.toThrow('Queued activity not found or invalid');
    expect(stored.get(`${ENTRY_PREFIX}${ID_A}`)).toBe('{broken');
  });
});

describe('removeQueuedActivity', () => {
  it('updates the index before removing the entry and emits after both', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    const observed: string[] = [];
    const unsubscribe = subscribeToQueue(() => observed.push('emit'));
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      observed.push(`set:${key}`);
      stored.set(key, value);
    });
    mockedStorage.removeItem.mockImplementation(async (key) => {
      observed.push(`remove:${key}`);
      stored.delete(key);
    });

    await removeQueuedActivity(ID_A);

    expect(observed).toEqual([
      `set:${INDEX_KEY}`,
      `remove:${ENTRY_PREFIX}${ID_A}`,
      'emit',
    ]);
    expect(stored.get(INDEX_KEY)).toBe('[]');
    unsubscribe();
  });

  it('is idempotent when the activity is already missing', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToQueue(listener);

    await removeQueuedActivity(ID_A);
    await removeQueuedActivity(ID_A);

    expect(listener).not.toHaveBeenCalled();
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('subscribeToQueue', () => {
  it('isolates listener errors and unsubscribe is idempotent', async () => {
    const throwingListener = jest.fn(() => {
      throw new Error('listener failed');
    });
    const healthyListener = jest.fn();
    const unsubscribeThrowing = subscribeToQueue(throwingListener);
    const unsubscribeHealthy = subscribeToQueue(healthyListener);

    await expect(enqueueActivity(OWNER_A, activity, ID_A)).resolves.toBeDefined();
    expect(throwingListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(1);

    unsubscribeThrowing();
    unsubscribeThrowing();
    unsubscribeHealthy();
    await enqueueActivity(OWNER_A, activity, ID_B);
    expect(throwingListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(1);
  });
});
