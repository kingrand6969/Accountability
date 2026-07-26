import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import {
  createActivityId,
  parseQueuedActivity,
  type QueuedActivity,
} from './offlineQueueTypes';

const INDEX_KEY = 'activity:offline:index:v1';
const ENTRY_PREFIX = 'activity:offline:entry:';
const MULTI_GET_BATCH_SIZE = 50;

/**
 * Maximum UTF-8 size of one serialized queue entry. Four MiB leaves headroom
 * below common AsyncStorage/SQLite per-row limits while accommodating the
 * route schema's maximum point count.
 */
export const MAX_QUEUED_ACTIVITY_BYTES = 4 * 1024 * 1024;

type QueuePatch = Partial<
  Pick<
    QueuedActivity,
    'status' | 'attemptCount' | 'nextAttemptAt' | 'lastError'
  >
>;

const PATCH_KEYS = new Set<keyof QueuePatch>([
  'status',
  'attemptCount',
  'nextAttemptAt',
  'lastError',
]);

const listeners = new Set<() => void>();
let operationTail: Promise<void> = Promise.resolve();

export async function enqueueActivity(
  ownerId: string,
  activity: NewActivity,
  id = createActivityId(),
): Promise<QueuedActivity> {
  return serializeOperation(async () => {
    const now = Date.now();
    const entry = parseQueuedActivity({
      schema: 1,
      id,
      ownerId,
      activity,
      createdAt: new Date(now).toISOString(),
      status: 'saved',
      attemptCount: 0,
      nextAttemptAt: now,
      lastError: null,
    });
    const serialized = serializeEntry(entry);

    await AsyncStorage.setItem(entryKey(entry.id), serialized);

    const ids = await readIndex();
    const nextIds = ids.includes(entry.id) ? ids : [...ids, entry.id];
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(nextIds));
    emitQueueChanged();
    return entry;
  });
}

export async function recoverQueue(): Promise<QueuedActivity[]> {
  return serializeOperation(recoverQueueUnlocked);
}

export async function listQueuedActivities(
  ownerId?: string,
): Promise<QueuedActivity[]> {
  return serializeOperation(async () => {
    const entries = await recoverQueueUnlocked();
    return ownerId === undefined
      ? entries
      : entries.filter((entry) => entry.ownerId === ownerId);
  });
}

export async function getQueuedActivity(
  id: string,
): Promise<QueuedActivity | null> {
  return serializeOperation(async () => {
    const raw = await AsyncStorage.getItem(entryKey(id));
    return parseStoredEntry(raw, id);
  });
}

export async function patchQueuedActivity(
  id: string,
  patch: QueuePatch,
): Promise<QueuedActivity> {
  return serializeOperation(async () => {
    if (!isAllowedPatch(patch)) {
      throw new Error('Invalid queued activity patch');
    }

    const raw = await AsyncStorage.getItem(entryKey(id));
    const current = parseStoredEntry(raw, id);
    if (!current) {
      throw new Error('Queued activity not found or invalid');
    }

    let updated: QueuedActivity;
    try {
      updated = parseQueuedActivity({ ...current, ...patch });
    } catch {
      throw new Error('Invalid queued activity patch');
    }

    await AsyncStorage.setItem(entryKey(id), serializeEntry(updated));
    emitQueueChanged();
    return updated;
  });
}

export async function removeQueuedActivity(id: string): Promise<void> {
  return serializeOperation(async () => {
    const [ids, raw] = await Promise.all([
      readIndex(),
      AsyncStorage.getItem(entryKey(id)),
    ]);
    const validEntry = parseStoredEntry(raw, id);
    const indexed = ids.includes(id);

    if (!indexed && raw === null) return;

    const nextIds = ids.filter((candidate) => candidate !== id);
    if (indexed || validEntry) {
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(nextIds));
    }

    if (validEntry) {
      await AsyncStorage.removeItem(entryKey(id));
    }

    if (indexed || validEntry) emitQueueChanged();
  });
}

export function subscribeToQueue(listener: () => void): () => void {
  listeners.add(listener);
  let subscribed = true;

  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners.delete(listener);
  };
}

async function recoverQueueUnlocked(): Promise<QueuedActivity[]> {
  const [storedIds, keys] = await Promise.all([
    readIndex(),
    AsyncStorage.getAllKeys(),
  ]);
  const entryKeys = keys.filter((key) => key.startsWith(ENTRY_PREFIX));
  const pairs = await multiGetInBatches(entryKeys);
  const validById = new Map<string, QueuedActivity>();

  for (const [key, raw] of pairs) {
    const keyId = key.slice(ENTRY_PREFIX.length);
    const parsed = parseStoredEntry(raw, keyId);
    if (parsed) validById.set(parsed.id, parsed);
  }

  const entries = [...validById.values()].sort(compareEntries);
  const effectiveIds = entries.map((entry) => entry.id);

  if (!sameIds(storedIds, effectiveIds)) {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(effectiveIds));
    emitQueueChanged();
  }

  return entries;
}

async function readIndex(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (raw === null || utf8ByteLength(raw) > MAX_QUEUED_ACTIVITY_BYTES) {
    return [];
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      if (
        typeof item !== 'string' ||
        !isActivityId(item) ||
        seen.has(item)
      ) {
        return [];
      }
      seen.add(item);
      ids.push(item);
    }
    return ids;
  } catch {
    return [];
  }
}

async function multiGetInBatches(
  keys: string[],
): Promise<readonly (readonly [string, string | null])[]> {
  const pairs: [string, string | null][] = [];
  for (let start = 0; start < keys.length; start += MULTI_GET_BATCH_SIZE) {
    const batch = keys.slice(start, start + MULTI_GET_BATCH_SIZE);
    const values = await AsyncStorage.multiGet(batch);
    for (const pair of values) pairs.push([pair[0], pair[1]]);
  }
  return pairs;
}

function parseStoredEntry(
  raw: string | null,
  expectedId: string,
): QueuedActivity | null {
  if (
    raw === null ||
    utf8ByteLength(raw) > MAX_QUEUED_ACTIVITY_BYTES
  ) {
    return null;
  }

  try {
    const parsed = parseQueuedActivity(JSON.parse(raw));
    return parsed.id === expectedId ? parsed : null;
  } catch {
    return null;
  }
}

function serializeEntry(entry: QueuedActivity): string {
  const serialized = JSON.stringify(entry);
  if (utf8ByteLength(serialized) > MAX_QUEUED_ACTIVITY_BYTES) {
    throw new Error(
      `Queued activity exceeds ${MAX_QUEUED_ACTIVITY_BYTES}-byte storage limit`,
    );
  }
  return serialized;
}

function isAllowedPatch(value: unknown): value is QueuePatch {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).every((key) =>
    PATCH_KEYS.has(key as keyof QueuePatch),
  );
}

function compareEntries(a: QueuedActivity, b: QueuedActivity): number {
  const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : a.id.localeCompare(b.id);
}

function sameIds(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function entryKey(id: string): string {
  return `${ENTRY_PREFIX}${id}`;
}

function isActivityId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}

function emitQueueChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One consumer must not prevent other queue subscribers from updating.
    }
  }
}

function serializeOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationTail.then(operation, operation);
  operationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < value.length
    ) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
