import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NewActivity } from './api';
import {
  createActivityId,
  parseQueuedActivity,
  type QueuedActivity,
} from './offlineQueueTypes';

const INDEX_KEY = 'activity:offline:index:v1';
const ENTRY_PREFIX = 'activity:offline:entry:';
const TOMBSTONE_PREFIX = 'activity:offline:tombstone:';
const QUARANTINE_KEY = 'activity:offline:quarantine:v1';
const MULTI_GET_BATCH_SIZE = 50;

/**
 * Maximum UTF-8 size of one serialized route entry. This store-level bound is
 * intentionally tighter than the in-memory route point limit.
 */
export const MAX_QUEUED_ACTIVITY_BYTES = 512 * 1024;

/**
 * Maximum combined UTF-8 payload of valid queue entries. Four MiB leaves
 * headroom for indexes, authentication state, and other AsyncStorage users.
 */
export const MAX_OFFLINE_QUEUE_TOTAL_BYTES = 4 * 1024 * 1024;

/**
 * Maximum UTF-8 size of the queue's ID-only and issue metadata indexes.
 */
export const MAX_OFFLINE_QUEUE_INDEX_BYTES = 256 * 1024;

export type QueueRecoverySummary = {
  queuedCount: number;
  issueCount: number;
};

export type QueueIssue = {
  id: string;
  storageKey: string;
  category: 'needs_attention';
  reason:
    | 'entry_oversize'
    | 'invalid_json'
    | 'invalid_schema'
    | 'id_mismatch'
    | 'invalid_tombstone'
    | 'tombstone_owner_mismatch';
  detectedAt: string;
};

type Tombstone = {
  schema: 1;
  id: string;
  ownerId: string;
};

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

const listeners = new Set<() => void | Promise<void>>();
let operationTail: Promise<void> = Promise.resolve();

type IndexRead = {
  state: 'missing' | 'valid' | 'corrupt' | 'oversize';
  ids: string[];
};

type IssueRead = {
  state: 'missing' | 'valid' | 'corrupt' | 'oversize';
  issues: QueueIssue[];
};

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
    const serializedEntry = serializeEntry(entry);
    const [index, existingRaw, tombstoneRaw] = await Promise.all([
      readIndex(),
      AsyncStorage.getItem(entryKey(entry.id)),
      AsyncStorage.getItem(tombstoneKey(entry.id)),
    ]);

    if (tombstoneRaw !== null) {
      throw new Error('Activity ID is pending deletion');
    }
    if (existingRaw !== null) {
      const existing = parseStoredEntry(existingRaw, entry.id);
      if (
        !existing ||
        existing.ownerId !== entry.ownerId ||
        JSON.stringify(existing.activity) !== JSON.stringify(entry.activity)
      ) {
        throw new Error('Activity ID collision');
      }

      if (!index.ids.includes(entry.id)) {
        await AsyncStorage.setItem(
          INDEX_KEY,
          serializeIndex([...index.ids, entry.id]),
        );
        emitQueueChanged();
      }
      return existing;
    }

    const nextIds = index.ids.includes(entry.id)
      ? index.ids
      : [...index.ids, entry.id];
    const serializedIndex = serializeIndex(nextIds);
    const currentBytes = await sumValidEntryBytes();
    if (
      currentBytes + utf8ByteLength(serializedEntry) >
      MAX_OFFLINE_QUEUE_TOTAL_BYTES
    ) {
      throw new Error(
        `Offline queue exceeds ${MAX_OFFLINE_QUEUE_TOTAL_BYTES}-byte total storage limit`,
      );
    }
    await AsyncStorage.setItem(entryKey(entry.id), serializedEntry);
    await AsyncStorage.setItem(INDEX_KEY, serializedIndex);
    emitQueueChanged();
    return entry;
  });
}

export async function recoverQueue(): Promise<QueueRecoverySummary> {
  return serializeOperation(recoverQueueUnlocked);
}

export async function listQueuedActivities(
  ownerId: string,
): Promise<QueuedActivity[]> {
  return serializeOperation(async () => {
    const index = await readIndex();
    if (index.state !== 'valid' || index.ids.length === 0) return [];

    const pairs = await multiGetInBatches([
      ...index.ids.map(entryKey),
      ...index.ids.map(tombstoneKey),
    ]);
    const values = new Map(pairs);
    const entries: QueuedActivity[] = [];
    for (const id of index.ids) {
      if (values.get(tombstoneKey(id)) != null) continue;
      const parsed = parseStoredEntry(values.get(entryKey(id)) ?? null, id);
      if (parsed?.ownerId === ownerId) entries.push(parsed);
    }
    return entries.sort(compareEntries);
  });
}

export async function getQueuedActivity(
  ownerId: string,
  id: string,
): Promise<QueuedActivity | null> {
  return serializeOperation(async () => {
    const [raw, tombstone] = await Promise.all([
      AsyncStorage.getItem(entryKey(id)),
      AsyncStorage.getItem(tombstoneKey(id)),
    ]);
    if (tombstone !== null) return null;
    const parsed = parseStoredEntry(raw, id);
    return parsed?.ownerId === ownerId ? parsed : null;
  });
}

export async function patchQueuedActivity(
  ownerId: string,
  id: string,
  patch: QueuePatch,
): Promise<QueuedActivity> {
  return serializeOperation(async () => {
    if (!isAllowedPatch(patch)) {
      throw new Error('Invalid queued activity patch');
    }

    const [raw, tombstone] = await Promise.all([
      AsyncStorage.getItem(entryKey(id)),
      AsyncStorage.getItem(tombstoneKey(id)),
    ]);
    if (tombstone !== null) {
      throw new Error('Queued activity not found or invalid');
    }
    const current = parseStoredEntry(raw, id);
    if (!current) {
      throw new Error('Queued activity not found or invalid');
    }
    if (current.ownerId !== ownerId) {
      throw new Error('Queued activity owner mismatch');
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

export async function removeQueuedActivity(
  ownerId: string,
  id: string,
): Promise<void> {
  return serializeOperation(async () => {
    const [index, raw, tombstoneRaw] = await Promise.all([
      readIndex(),
      AsyncStorage.getItem(entryKey(id)),
      AsyncStorage.getItem(tombstoneKey(id)),
    ]);
    const existingTombstone = parseTombstone(tombstoneRaw, id);
    const validEntry = parseStoredEntry(raw, id);

    if (tombstoneRaw !== null && !existingTombstone) {
      throw new Error('Queued activity deletion state is invalid');
    }
    if (existingTombstone && existingTombstone.ownerId !== ownerId) {
      throw new Error('Queued activity owner mismatch');
    }
    if (!existingTombstone && !validEntry) {
      if (raw === null) return;
      throw new Error('Queued activity not found or invalid');
    }
    if (validEntry && validEntry.ownerId !== ownerId) {
      throw new Error('Queued activity owner mismatch');
    }

    const tombstone: Tombstone =
      existingTombstone ?? { schema: 1, id, ownerId };
    const nextIds = index.ids.filter((candidate) => candidate !== id);
    const serializedIndex = serializeIndex(nextIds);
    if (!existingTombstone) {
      await AsyncStorage.setItem(
        tombstoneKey(id),
        JSON.stringify(tombstone),
      );
    }
    await AsyncStorage.setItem(INDEX_KEY, serializedIndex);
    await AsyncStorage.removeItem(entryKey(id));
    await AsyncStorage.removeItem(tombstoneKey(id));
    emitQueueChanged();
  });
}

export async function listQueueIssues(): Promise<QueueIssue[]> {
  return serializeOperation(async () => {
    const { issues } = await readIssues();
    return issues.map((issue) => ({ ...issue }));
  });
}

export function subscribeToQueue(
  listener: () => void | Promise<void>,
): () => void {
  listeners.add(listener);
  let subscribed = true;

  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners.delete(listener);
  };
}

async function recoverQueueUnlocked(): Promise<QueueRecoverySummary> {
  const [storedIndex, keys, storedIssues] = await Promise.all([
    readIndex(),
    AsyncStorage.getAllKeys(),
    readIssues(),
  ]);
  const previousIssues = storedIssues.issues;
  const entryKeys = keys.filter((key) => key.startsWith(ENTRY_PREFIX));
  const tombstoneKeys = keys.filter((key) =>
    key.startsWith(TOMBSTONE_PREFIX),
  );
  const pairs = await multiGetInBatches([
    ...entryKeys,
    ...tombstoneKeys,
  ]);
  const values = new Map(pairs);
  const validById = new Map<string, QueuedActivity>();
  const validTombstoneIds = new Set<string>();
  const allTombstoneIds = new Set<string>();
  const issues: QueueIssue[] = [];
  const detectedAtByIssue = new Map(
    previousIssues.map((issue) => [
      `${issue.storageKey}:${issue.reason}`,
      issue.detectedAt,
    ]),
  );

  const addIssue = (
    id: string,
    storageKey: string,
    reason: QueueIssue['reason'],
  ) => {
    issues.push({
      id,
      storageKey,
      category: 'needs_attention',
      reason,
      detectedAt:
        detectedAtByIssue.get(`${storageKey}:${reason}`) ??
        new Date().toISOString(),
    });
  };

  for (const key of tombstoneKeys) {
    const id = key.slice(TOMBSTONE_PREFIX.length);
    allTombstoneIds.add(id);
    const tombstone = parseTombstone(values.get(key) ?? null, id);
    const rawEntry = values.get(entryKey(id)) ?? null;
    const storedEntry = inspectStoredEntry(rawEntry, id).entry;
    if (
      tombstone &&
      (rawEntry === null || storedEntry?.ownerId === tombstone.ownerId)
    ) {
      validTombstoneIds.add(id);
    } else if (tombstone) {
      addIssue(id, key, 'tombstone_owner_mismatch');
    } else {
      addIssue(id, key, 'invalid_tombstone');
    }
  }

  for (const key of entryKeys) {
    const keyId = key.slice(ENTRY_PREFIX.length);
    if (allTombstoneIds.has(keyId)) continue;
    const inspected = inspectStoredEntry(values.get(key) ?? null, keyId);
    if (inspected.entry) {
      validById.set(inspected.entry.id, inspected.entry);
    } else if (inspected.reason) {
      addIssue(keyId, key, inspected.reason);
    }
  }

  const entries = [...validById.values()].sort(compareEntries);
  const effectiveIds = entries.map((entry) => entry.id);
  issues.sort(
    (left, right) =>
      left.storageKey.localeCompare(right.storageKey) ||
      left.reason.localeCompare(right.reason),
  );
  const serializedIndex = serializeIndex(effectiveIds);
  const serializedIssues = serializeIssues(issues);

  const needsRepair =
    storedIndex.state === 'corrupt' ||
    storedIndex.state === 'oversize' ||
    !sameIds(storedIndex.ids, effectiveIds);
  if (needsRepair) {
    await AsyncStorage.setItem(INDEX_KEY, serializedIndex);
  }
  const issuesChanged =
    storedIssues.state === 'corrupt' ||
    storedIssues.state === 'oversize' ||
    JSON.stringify(previousIssues) !== JSON.stringify(issues);
  if (issuesChanged) {
    await AsyncStorage.setItem(QUARANTINE_KEY, serializedIssues);
  }

  for (const id of validTombstoneIds) {
    await AsyncStorage.removeItem(entryKey(id));
    await AsyncStorage.removeItem(tombstoneKey(id));
  }

  if (
    needsRepair ||
    validTombstoneIds.size > 0 ||
    issuesChanged
  ) {
    emitQueueChanged();
  }

  return { queuedCount: entries.length, issueCount: issues.length };
}

async function readIndex(): Promise<IndexRead> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  if (raw === null) return { state: 'missing', ids: [] };
  if (utf8ByteLength(raw) > MAX_OFFLINE_QUEUE_INDEX_BYTES) {
    return { state: 'oversize', ids: [] };
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return { state: 'corrupt', ids: [] };

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      if (
        typeof item !== 'string' ||
        !isActivityId(item) ||
        seen.has(item)
      ) {
        return { state: 'corrupt', ids: [] };
      }
      seen.add(item);
      ids.push(item);
    }
    return { state: 'valid', ids };
  } catch {
    return { state: 'corrupt', ids: [] };
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

async function sumValidEntryBytes(): Promise<number> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(ENTRY_PREFIX),
  );
  const pairs = await multiGetInBatches(keys);
  let total = 0;
  for (const [key, raw] of pairs) {
    const id = key.slice(ENTRY_PREFIX.length);
    if (raw !== null && parseStoredEntry(raw, id)) {
      total += utf8ByteLength(raw);
    }
  }
  return total;
}

function parseStoredEntry(
  raw: string | null,
  expectedId: string,
): QueuedActivity | null {
  return inspectStoredEntry(raw, expectedId).entry;
}

function inspectStoredEntry(
  raw: string | null,
  expectedId: string,
): {
  entry: QueuedActivity | null;
  reason: QueueIssue['reason'] | null;
} {
  if (raw === null) return { entry: null, reason: null };
  if (utf8ByteLength(raw) > MAX_QUEUED_ACTIVITY_BYTES) {
    return { entry: null, reason: 'entry_oversize' };
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { entry: null, reason: 'invalid_json' };
  }
  try {
    const parsed = parseQueuedActivity(value);
    return parsed.id === expectedId
      ? { entry: parsed, reason: null }
      : { entry: null, reason: 'id_mismatch' };
  } catch {
    return { entry: null, reason: 'invalid_schema' };
  }
}

function parseTombstone(
  raw: string | null,
  expectedId: string,
): Tombstone | null {
  if (
    raw === null ||
    utf8ByteLength(raw) > MAX_OFFLINE_QUEUE_INDEX_BYTES
  ) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }
    const record = value as Record<string, unknown>;
    if (
      record.schema !== 1 ||
      record.id !== expectedId ||
      typeof record.ownerId !== 'string' ||
      !isOwnerId(record.ownerId) ||
      Object.keys(record).some(
        (key) => !['schema', 'id', 'ownerId'].includes(key),
      )
    ) {
      return null;
    }
    return {
      schema: 1,
      id: expectedId,
      ownerId: record.ownerId,
    };
  } catch {
    return null;
  }
}

async function readIssues(): Promise<IssueRead> {
  const raw = await AsyncStorage.getItem(QUARANTINE_KEY);
  if (raw === null) return { state: 'missing', issues: [] };
  if (utf8ByteLength(raw) > MAX_OFFLINE_QUEUE_INDEX_BYTES) {
    return { state: 'oversize', issues: [] };
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return { state: 'corrupt', issues: [] };
    }
    const issues: QueueIssue[] = [];
    for (const item of value) {
      const parsed = parseIssue(item);
      if (!parsed) return { state: 'corrupt', issues: [] };
      issues.push(parsed);
    }
    return { state: 'valid', issues };
  } catch {
    return { state: 'corrupt', issues: [] };
  }
}

function parseIssue(value: unknown): QueueIssue | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const reasons: QueueIssue['reason'][] = [
    'entry_oversize',
    'invalid_json',
    'invalid_schema',
    'id_mismatch',
    'invalid_tombstone',
    'tombstone_owner_mismatch',
  ];
  if (
    typeof record.id !== 'string' ||
    typeof record.storageKey !== 'string' ||
    record.category !== 'needs_attention' ||
    !reasons.includes(record.reason as QueueIssue['reason']) ||
    typeof record.detectedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.detectedAt)) ||
    Object.keys(record).some(
      (key) =>
        !['id', 'storageKey', 'category', 'reason', 'detectedAt'].includes(
          key,
        ),
    )
  ) {
    return null;
  }
  return {
    id: record.id,
    storageKey: record.storageKey,
    category: 'needs_attention',
    reason: record.reason as QueueIssue['reason'],
    detectedAt: record.detectedAt,
  };
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

function serializeIndex(ids: string[]): string {
  const serialized = JSON.stringify(ids);
  if (utf8ByteLength(serialized) > MAX_OFFLINE_QUEUE_INDEX_BYTES) {
    throw new Error(
      `Offline queue index exceeds ${MAX_OFFLINE_QUEUE_INDEX_BYTES}-byte index storage limit`,
    );
  }
  return serialized;
}

function serializeIssues(issues: QueueIssue[]): string {
  const serialized = JSON.stringify(issues);
  if (utf8ByteLength(serialized) > MAX_OFFLINE_QUEUE_INDEX_BYTES) {
    throw new Error(
      `Queue issue metadata exceeds ${MAX_OFFLINE_QUEUE_INDEX_BYTES}-byte index storage limit`,
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

function tombstoneKey(id: string): string {
  return `${TOMBSTONE_PREFIX}${id}`;
}

function isActivityId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}

function isOwnerId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    value,
  );
}

function emitQueueChanged(): void {
  for (const listener of [...listeners]) {
    try {
      const result = listener();
      if (result && typeof result.then === 'function') {
        void Promise.resolve(result).catch(() => undefined);
      }
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
