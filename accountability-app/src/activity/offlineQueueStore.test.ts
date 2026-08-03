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
  getOwnerQueueSnapshot,
  listQueueIssues,
  listQueuedActivities,
  MAX_OFFLINE_QUEUE_INDEX_BYTES,
  MAX_OFFLINE_QUEUE_TOTAL_BYTES,
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
const TOMBSTONE_PREFIX = 'activity:offline:tombstone:';
const QUARANTINE_KEY = 'activity:offline:quarantine:v1';
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
  queuedActivity = activity,
): QueuedActivity {
  return {
    schema: 1,
    id,
    ownerId,
    activity: queuedActivity,
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

function recoverySummary(queuedCount: number, issueCount = 0) {
  return { queuedCount, issueCount };
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
    const unsubscribe = subscribeToQueue(() => {
      observed.push('emit');
    });
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

  it('returns an exact canonical ID collision idempotently without overwriting it', async () => {
    const existing = entry(ID_A);
    seedEntry(existing);
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));

    const result = await enqueueActivity(OWNER_A, { ...activity }, ID_A);

    expect(result).toEqual(existing);
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects a different or corrupt existing ID collision without overwriting it', async () => {
    const conflicting = entry(ID_A, OWNER_B);
    const key = `${ENTRY_PREFIX}${ID_A}`;
    seedEntry(conflicting);

    await expect(enqueueActivity(OWNER_A, activity, ID_A)).rejects.toThrow(
      'Activity ID collision',
    );
    expect(stored.get(key)).toBe(JSON.stringify(conflicting));

    stored.set(key, '{broken');
    await expect(enqueueActivity(OWNER_A, activity, ID_A)).rejects.toThrow(
      'Activity ID collision',
    );
    expect(stored.get(key)).toBe('{broken');
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects a tombstoned ID without overwriting or resurrecting it', async () => {
    stored.set(
      `${TOMBSTONE_PREFIX}${ID_A}`,
      JSON.stringify({ schema: 1, id: ID_A, ownerId: OWNER_A }),
    );

    await expect(enqueueActivity(OWNER_A, activity, ID_A)).rejects.toThrow(
      'Activity ID is pending deletion',
    );

    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(false);
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('rejects a queue-total overflow before writing the new entry', async () => {
    const largeActivity: NewActivity = {
      ...activity,
      route: Array.from({ length: 9_000 }, () => ({
        lat: 89.12345678901234,
        lon: 179.12345678901234,
      })),
    };
    const sample = JSON.stringify(entry(generatedId(0), OWNER_A, undefined, largeActivity));
    const sampleBytes = new TextEncoder().encode(sample).byteLength;
    expect(sampleBytes).toBeLessThanOrEqual(MAX_QUEUED_ACTIVITY_BYTES);
    const existingCount = Math.floor(
      MAX_OFFLINE_QUEUE_TOTAL_BYTES / sampleBytes,
    );
    const ids: string[] = [];
    for (let index = 0; index < existingCount; index += 1) {
      const id = generatedId(index);
      ids.push(id);
      seedEntry(entry(id, OWNER_A, undefined, largeActivity));
    }
    stored.set(INDEX_KEY, JSON.stringify(ids));

    await expect(
      enqueueActivity(OWNER_A, largeActivity, ID_A),
    ).rejects.toThrow(
      `${MAX_OFFLINE_QUEUE_TOTAL_BYTES}-byte total storage limit`,
    );

    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(false);
  });

  it('continues serialized mutations after a rejected operation', async () => {
    mockedStorage.setItem.mockImplementationOnce(async () => {
      throw new Error('entry write failed');
    });

    await expect(enqueueActivity(OWNER_A, activity, ID_A)).rejects.toThrow(
      'entry write failed',
    );
    await expect(
      enqueueActivity(OWNER_A, activity, ID_B),
    ).resolves.toMatchObject({ id: ID_B });
  });
});

describe('getOwnerQueueSnapshot', () => {
  it('returns live current-owner entries and redacted counts from one serialized snapshot', async () => {
    const ownerAEntry = await enqueueActivity(OWNER_A, activity, ID_A);
    await enqueueActivity(OWNER_B, activity, ID_B);

    await expect(getOwnerQueueSnapshot(OWNER_A)).resolves.toEqual({
      queued: [ownerAEntry],
      summary: {
        currentOwnerCount: 1,
        otherOwnerCount: 1,
        totalQueuedCount: 2,
        issueCount: 0,
      },
    });

    await enqueueActivity(OWNER_B, activity, ID_C);
    await expect(getOwnerQueueSnapshot(OWNER_A)).resolves.toMatchObject({
      queued: [{ id: ID_A, ownerId: OWNER_A }],
      summary: {
        currentOwnerCount: 1,
        otherOwnerCount: 2,
        totalQueuedCount: 3,
      },
    });

    await removeQueuedActivity(OWNER_A, ID_A);
    await expect(getOwnerQueueSnapshot(OWNER_A)).resolves.toEqual({
      queued: [],
      summary: {
        currentOwnerCount: 0,
        otherOwnerCount: 2,
        totalQueuedCount: 2,
        issueCount: 0,
      },
    });
  });
});

describe('recovery and reads', () => {
  it('recovers a valid orphan after an interrupted index write', async () => {
    seedEntry(entry(ID_A));

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(1));
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

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0, 1));

    expect(parseSpy).not.toHaveBeenCalledWith(oversized);
    expect(stored.get(key)).toBe(oversized);
    parseSpy.mockRestore();
  });

  it('quarantines invalid JSON without exposing or deleting it', async () => {
    const key = `${ENTRY_PREFIX}${ID_A}`;
    stored.set(key, '{broken');
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0, 1));

    expect(stored.get(key)).toBe('{broken');
    expect(stored.get(INDEX_KEY)).toBe('[]');
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
  });

  it('repairs a missing index from valid entries', async () => {
    seedEntry(entry(ID_B));
    seedEntry(entry(ID_A));

    const recovered = await recoverQueue();

    expect(recovered).toEqual(recoverySummary(2));
    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A, ID_B]);
  });

  it('persists an empty repair when an existing index is corrupt', async () => {
    stored.set(INDEX_KEY, '{broken');

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0));

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

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0));

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

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(1));
    expect(JSON.parse(stored.get(INDEX_KEY)!)).toEqual([ID_A]);
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
  });

  it('sorts oldest first with a stable ID tie-break', async () => {
    seedEntry(entry(ID_C, OWNER_A, '2026-07-26T02:00:00.000Z'));
    seedEntry(entry(ID_B, OWNER_A, '2026-07-26T01:00:00.000Z'));
    seedEntry(entry(ID_A, OWNER_A, '2026-07-26T01:00:00.000Z'));
    stored.set(INDEX_KEY, JSON.stringify([ID_C, ID_B, ID_A]));

    await recoverQueue();
    const recovered = await listQueuedActivities(OWNER_A);

    expect(recovered.map((item) => item.id)).toEqual([ID_A, ID_B, ID_C]);
  });

  it('returns null for invalid quarantined entries', async () => {
    stored.set(`${ENTRY_PREFIX}${ID_A}`, '{broken');

    await expect(getQueuedActivity(OWNER_A, ID_A)).resolves.toBeNull();
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(true);
  });

  it('uses the index for normal owner reads without a full storage scan', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));

    await expect(listQueuedActivities(OWNER_A)).resolves.toHaveLength(1);

    expect(mockedStorage.getAllKeys).not.toHaveBeenCalled();
    expect(mockedStorage.multiGet).toHaveBeenCalled();
  });

  it('returns null to the wrong owner without exposing private fields', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));

    await expect(getQueuedActivity(OWNER_B, ID_A)).resolves.toBeNull();
    await expect(listQueuedActivities(OWNER_B)).resolves.toEqual([]);
  });

  it('returns only a redacted recovery summary', async () => {
    seedEntry(entry(ID_A));

    const summary = await recoverQueue();

    expect(summary).toEqual(recoverySummary(1));
    expect(summary).not.toHaveProperty('entries');
    expect(JSON.stringify(summary)).not.toContain(OWNER_A);
    expect(JSON.stringify(summary)).not.toContain('distance_m');
  });

  it('persists privacy-safe issue metadata idempotently for quarantined bytes', async () => {
    const key = `${ENTRY_PREFIX}${ID_A}`;
    const privateInvalidBytes =
      '{"route":[{"lat":-31.95}],"distance_m":987654,"started_at":"secret"}';
    stored.set(key, privateInvalidBytes);

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0, 1));
    const first = await listQueueIssues();
    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0, 1));
    const second = await listQueueIssues();

    expect(first).toEqual([
      {
        id: ID_A,
        storageKey: key,
        category: 'needs_attention',
        reason: 'invalid_schema',
        detectedAt: expect.any(String),
      },
    ]);
    expect(second).toEqual(first);
    expect(stored.get(key)).toBe(privateInvalidBytes);
    const serializedIssues = stored.get(QUARANTINE_KEY)!;
    expect(serializedIssues).not.toContain('route');
    expect(serializedIssues).not.toContain('987654');
    expect(serializedIssues).not.toContain('secret');
  });

  it('suppresses but does not delete bytes behind a corrupt tombstone', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    stored.set(`${TOMBSTONE_PREFIX}${ID_A}`, '{broken');

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0, 1));

    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(true);
    expect(stored.get(`${TOMBSTONE_PREFIX}${ID_A}`)).toBe('{broken');
    await expect(listQueuedActivities(OWNER_A)).resolves.toEqual([]);
    await expect(listQueueIssues()).resolves.toEqual([
      expect.objectContaining({
        id: ID_A,
        storageKey: `${TOMBSTONE_PREFIX}${ID_A}`,
        category: 'needs_attention',
        reason: 'invalid_tombstone',
      }),
    ]);
  });

  it('retains owner-mismatched tombstone and entry bytes without leaking details', async () => {
    const existing = entry(ID_A, OWNER_A);
    const entryStorageKey = `${ENTRY_PREFIX}${ID_A}`;
    const tombstoneStorageKey = `${TOMBSTONE_PREFIX}${ID_A}`;
    seedEntry(existing);
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    stored.set(
      tombstoneStorageKey,
      JSON.stringify({ schema: 1, id: ID_A, ownerId: OWNER_B }),
    );

    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0, 1));

    expect(stored.get(entryStorageKey)).toBe(JSON.stringify(existing));
    expect(stored.has(tombstoneStorageKey)).toBe(true);
    expect(stored.get(INDEX_KEY)).toBe('[]');
    await expect(listQueuedActivities(OWNER_A)).resolves.toEqual([]);
    const issues = await listQueueIssues();
    expect(issues).toEqual([
      expect.objectContaining({
        id: ID_A,
        storageKey: tombstoneStorageKey,
        category: 'needs_attention',
        reason: 'tombstone_owner_mismatch',
      }),
    ]);
    expect(JSON.stringify(issues)).not.toContain('distance_m');
    expect(JSON.stringify(issues)).not.toContain('started_at');
  });

  it('returns deep copies rather than mutable aliases', async () => {
    const queued = await enqueueActivity(OWNER_A, activity, ID_A);
    queued.activity.route[0].lat = 0;

    const first = await getQueuedActivity(OWNER_A, ID_A);
    expect(first?.activity.route[0].lat).toBe(-31.9523);
    first!.activity.route[0].lat = 1;

    const second = await listQueuedActivities(OWNER_A);
    expect(second[0].activity.route[0].lat).toBe(-31.9523);
  });
});

describe('patchQueuedActivity', () => {
  it('only persists a reconstructed valid allowed patch before emitting', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    const observed: string[] = [];
    const unsubscribe = subscribeToQueue(() => {
      observed.push('emit');
    });
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      observed.push(key);
      stored.set(key, value);
    });

    const updated = await patchQueuedActivity(OWNER_A, ID_A, {
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
      patchQueuedActivity(OWNER_A, ID_A, { attemptCount: -1 }),
    ).rejects.toThrow('Invalid queued activity patch');
    await expect(
      patchQueuedActivity(
        OWNER_A,
        ID_A,
        { ownerId: OWNER_B } as Parameters<typeof patchQueuedActivity>[2],
      ),
    ).rejects.toThrow('Invalid queued activity patch');
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('throws a clear error for missing or quarantined entries', async () => {
    await expect(
      patchQueuedActivity(OWNER_A, ID_A, { status: 'uploading' }),
    ).rejects.toThrow('Queued activity not found or invalid');

    stored.set(`${ENTRY_PREFIX}${ID_A}`, '{broken');
    await expect(
      patchQueuedActivity(OWNER_A, ID_A, { status: 'uploading' }),
    ).rejects.toThrow('Queued activity not found or invalid');
    expect(stored.get(`${ENTRY_PREFIX}${ID_A}`)).toBe('{broken');
  });

  it('rejects a wrong-owner patch without changing the entry', async () => {
    const existing = entry(ID_A);
    seedEntry(existing);

    await expect(
      patchQueuedActivity(OWNER_B, ID_A, { status: 'uploading' }),
    ).rejects.toThrow('Queued activity owner mismatch');
    expect(stored.get(`${ENTRY_PREFIX}${ID_A}`)).toBe(
      JSON.stringify(existing),
    );
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('removeQueuedActivity', () => {
  it('persists deletion intent before index and entry cleanup', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    const observed: string[] = [];
    const unsubscribe = subscribeToQueue(() => {
      observed.push('emit');
    });
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      observed.push(`set:${key}`);
      stored.set(key, value);
    });
    mockedStorage.removeItem.mockImplementation(async (key) => {
      observed.push(`remove:${key}`);
      stored.delete(key);
    });

    await removeQueuedActivity(OWNER_A, ID_A);

    expect(observed).toEqual([
      `set:${TOMBSTONE_PREFIX}${ID_A}`,
      `set:${INDEX_KEY}`,
      `remove:${ENTRY_PREFIX}${ID_A}`,
      `remove:${TOMBSTONE_PREFIX}${ID_A}`,
      'emit',
    ]);
    expect(stored.get(INDEX_KEY)).toBe('[]');
    expect(stored.has(`${TOMBSTONE_PREFIX}${ID_A}`)).toBe(false);
    unsubscribe();
  });

  it('is idempotent when the activity is already missing', async () => {
    const listener = jest.fn<() => void>();
    const unsubscribe = subscribeToQueue(listener);

    await removeQueuedActivity(OWNER_A, ID_A);
    await removeQueuedActivity(OWNER_A, ID_A);

    expect(listener).not.toHaveBeenCalled();
    expect(mockedStorage.removeItem).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('rejects a wrong-owner removal before writing a tombstone', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));

    await expect(removeQueuedActivity(OWNER_B, ID_A)).rejects.toThrow(
      'Queued activity owner mismatch',
    );

    expect(mockedStorage.setItem).not.toHaveBeenCalled();
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(true);
  });

  it('does not resurrect after failure following the tombstone write', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      if (key === INDEX_KEY) throw new Error('index failed');
      stored.set(key, value);
    });

    await expect(removeQueuedActivity(OWNER_A, ID_A)).rejects.toThrow(
      'index failed',
    );
    await expect(getQueuedActivity(OWNER_A, ID_A)).resolves.toBeNull();

    mockedStorage.setItem.mockImplementation(async (key, value) => {
      stored.set(key, value);
    });
    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0));
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(false);
    expect(stored.has(`${TOMBSTONE_PREFIX}${ID_A}`)).toBe(false);
  });

  it('does not resurrect after failure following the index write', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    mockedStorage.removeItem.mockImplementation(async (key) => {
      if (key === `${ENTRY_PREFIX}${ID_A}`) throw new Error('entry failed');
      stored.delete(key);
    });

    await expect(removeQueuedActivity(OWNER_A, ID_A)).rejects.toThrow(
      'entry failed',
    );
    await expect(getQueuedActivity(OWNER_A, ID_A)).resolves.toBeNull();

    mockedStorage.removeItem.mockImplementation(async (key) => {
      stored.delete(key);
    });
    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0));
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(false);
    expect(stored.has(`${TOMBSTONE_PREFIX}${ID_A}`)).toBe(false);
  });

  it('does not resurrect after failure following the entry deletion', async () => {
    seedEntry(entry(ID_A));
    stored.set(INDEX_KEY, JSON.stringify([ID_A]));
    mockedStorage.removeItem.mockImplementation(async (key) => {
      if (key === `${TOMBSTONE_PREFIX}${ID_A}`) {
        throw new Error('tombstone cleanup failed');
      }
      stored.delete(key);
    });

    await expect(removeQueuedActivity(OWNER_A, ID_A)).rejects.toThrow(
      'tombstone cleanup failed',
    );
    expect(stored.has(`${ENTRY_PREFIX}${ID_A}`)).toBe(false);
    expect(stored.has(`${TOMBSTONE_PREFIX}${ID_A}`)).toBe(true);
    await expect(getQueuedActivity(OWNER_A, ID_A)).resolves.toBeNull();

    mockedStorage.removeItem.mockImplementation(async (key) => {
      stored.delete(key);
    });
    await expect(recoverQueue()).resolves.toEqual(recoverySummary(0));
    await expect(listQueuedActivities(OWNER_A)).resolves.toEqual([]);
  });
});

describe('subscribeToQueue', () => {
  it('isolates listener errors and unsubscribe is idempotent', async () => {
    const throwingListener = jest.fn(() => {
      throw new Error('listener failed');
    });
    const healthyListener = jest.fn<() => void>();
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

  it('catches rejected listener promises without blocking other listeners', async () => {
    const rejectingListener = jest.fn(async () => {
      throw new Error('async listener failed');
    });
    const healthyListener = jest.fn<() => void>();
    const unsubscribeRejecting = subscribeToQueue(rejectingListener);
    const unsubscribeHealthy = subscribeToQueue(healthyListener);

    await expect(enqueueActivity(OWNER_A, activity, ID_A)).resolves.toBeDefined();
    await Promise.resolve();

    expect(rejectingListener).toHaveBeenCalledTimes(1);
    expect(healthyListener).toHaveBeenCalledTimes(1);
    unsubscribeRejecting();
    unsubscribeHealthy();
  });
});
