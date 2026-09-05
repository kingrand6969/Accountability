import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import {
  clearProgressShareRecovery,
  assertProgressShareRecoveryCapacity,
  listProgressShareRecovery,
  PROGRESS_SHARE_RECOVERY_MAX_AGE_MS,
  PROGRESS_SHARE_RECOVERY_MAX_COUNT,
  recordProgressShareRecovery,
  updateProgressShareRecoveryStatus,
  type ProgressShareRecoveryStorage,
} from './progressShareRecovery';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

const ownerA = '11111111-1111-4111-8111-111111111111';
const ownerB = '22222222-2222-4222-8222-222222222222';
const operation = (index: number) => `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`;
const sha256 = 'a'.repeat(64);

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: ProgressShareRecoveryStorage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  return { values, storage };
}

function entry(ownerId = ownerA, operationId = operation(1), createdAt = Date.parse('2026-08-22T00:00:00Z')) {
  return {
    ownerId,
    operationId,
    mediaRef: `r2://post-images/${ownerId}/${sha256}.jpg`,
    sha256,
    artifactFingerprint: `${operationId}:${sha256}`,
    status: 'uploaded' as const,
    createdAt,
    updatedAt: createdAt,
  };
}

describe('Journey progress durable uploaded recovery', () => {
  let store: ReturnType<typeof memoryStorage>;
  beforeEach(() => { store = memoryStorage(); });

  test('survives a fresh reader while persisting only bounded non-sensitive recovery identity', async () => {
    await recordProgressShareRecovery(entry(), store.storage);
    const serialized = [...store.values.values()][0];
    expect(serialized).toBeDefined();
    expect(serialized).not.toMatch(/weight|bmi|caption|private|base64|signed|token/i);
    await expect(listProgressShareRecovery(ownerA, store.storage, Date.parse('2026-08-22T01:00:00Z')))
      .resolves.toEqual([{ ...entry(), expired: false }]);
    await expect(recordProgressShareRecovery({ ...entry(), caption: 'secret' } as never, store.storage))
      .rejects.toThrow(/invalid|recovery/i);
  });

  test('keeps A recovery reachable through A to B to A activation and explicit status updates', async () => {
    await recordProgressShareRecovery(entry(ownerA), store.storage);
    await recordProgressShareRecovery(entry(ownerB, operation(2)), store.storage);
    await expect(listProgressShareRecovery(ownerB, store.storage)).resolves.toHaveLength(1);
    await updateProgressShareRecoveryStatus(ownerA, operation(1), 'cleanup_pending', store.storage, Date.parse('2026-08-22T02:00:00Z'));
    await expect(listProgressShareRecovery(ownerA, store.storage)).resolves.toEqual([
      expect.objectContaining({ ownerId: ownerA, status: 'cleanup_pending' }),
    ]);
    await clearProgressShareRecovery(ownerB, operation(2), store.storage);
    await expect(listProgressShareRecovery(ownerA, store.storage)).resolves.toHaveLength(1);
  });

  test('never evicts an uploaded orphan for age or overflow and returns an explicit capacity error', async () => {
    const old = Date.parse('2026-01-01T00:00:00Z');
    for (let index = 1; index <= PROGRESS_SHARE_RECOVERY_MAX_COUNT; index += 1) {
      await recordProgressShareRecovery(entry(ownerA, operation(index), old), store.storage);
    }
    const listed = await listProgressShareRecovery(ownerA, store.storage, old + PROGRESS_SHARE_RECOVERY_MAX_AGE_MS + 1);
    expect(listed).toHaveLength(PROGRESS_SHARE_RECOVERY_MAX_COUNT);
    expect(listed.every((item) => item.expired)).toBe(true);
    await expect(recordProgressShareRecovery(entry(ownerA, operation(99)), store.storage))
      .rejects.toThrow(/reconcile|recovery|capacity/i);
    await expect(assertProgressShareRecoveryCapacity(ownerA, operation(1), store.storage)).resolves.toBeUndefined();
    await expect(assertProgressShareRecoveryCapacity(ownerA, operation(99), store.storage))
      .rejects.toThrow(/reconcile|recovery|capacity/i);
    await expect(listProgressShareRecovery(ownerA, store.storage)).resolves.toHaveLength(PROGRESS_SHARE_RECOVERY_MAX_COUNT);
  });
});
