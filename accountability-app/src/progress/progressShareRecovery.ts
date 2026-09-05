import AsyncStorage from '@react-native-async-storage/async-storage';

export const PROGRESS_SHARE_RECOVERY_MAX_COUNT = 8;
export const PROGRESS_SHARE_RECOVERY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RECOVERY_KEY = '@accountability/journey-progress-upload-recovery/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const RECOVERY_FIELDS = new Set([
  'ownerId', 'operationId', 'mediaRef', 'sha256', 'artifactFingerprint',
  'status', 'createdAt', 'updatedAt',
]);

export type ProgressShareRecoveryStorage = Readonly<{
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}>;

export type ProgressShareRecoveryStatus = 'uploaded' | 'cleanup_pending';
export type ProgressShareRecoveryEntry = Readonly<{
  ownerId: string;
  operationId: string;
  mediaRef: string;
  sha256: string;
  artifactFingerprint: string;
  status: ProgressShareRecoveryStatus;
  createdAt: number;
  updatedAt: number;
}>;
export type ListedProgressShareRecovery = ProgressShareRecoveryEntry & Readonly<{ expired: boolean }>;

let mutationTail: Promise<void> = Promise.resolve();

export async function assertProgressShareRecoveryCapacity(
  ownerId: string,
  operationId: string,
  storage: ProgressShareRecoveryStorage = AsyncStorage,
): Promise<void> {
  if (!UUID.test(ownerId) || !UUID.test(operationId)) throw new Error('Invalid Journey share recovery identity.');
  const current = await read(storage);
  const exists = current.some((entry) => entry.ownerId === ownerId && entry.operationId === operationId);
  if (!exists && current.length >= PROGRESS_SHARE_RECOVERY_MAX_COUNT) {
    throw new Error('Journey share recovery is at capacity. Reconcile an earlier upload before continuing.');
  }
}

export async function recordProgressShareRecovery(
  entry: ProgressShareRecoveryEntry,
  storage: ProgressShareRecoveryStorage = AsyncStorage,
): Promise<void> {
  assertRecoveryEntry(entry);
  return mutate(async () => {
    const current = await read(storage);
    const key = recoveryIdentity(entry.ownerId, entry.operationId);
    const index = current.findIndex((candidate) => recoveryIdentity(candidate.ownerId, candidate.operationId) === key);
    if (index < 0 && current.length >= PROGRESS_SHARE_RECOVERY_MAX_COUNT) {
      throw new Error('Journey share recovery is at capacity. Reconcile an earlier upload before continuing.');
    }
    const next = current.slice();
    if (index >= 0) next[index] = Object.freeze({ ...entry });
    else next.push(Object.freeze({ ...entry }));
    await storage.setItem(RECOVERY_KEY, JSON.stringify(next));
  });
}

export async function listProgressShareRecovery(
  ownerId: string,
  storage: ProgressShareRecoveryStorage = AsyncStorage,
  now = Date.now(),
): Promise<ListedProgressShareRecovery[]> {
  if (!UUID.test(ownerId)) throw new Error('Invalid Journey share recovery owner.');
  const entries = await read(storage);
  return entries.filter((entry) => entry.ownerId === ownerId).map((entry) => Object.freeze({
    ...entry,
    expired: now - entry.createdAt > PROGRESS_SHARE_RECOVERY_MAX_AGE_MS,
  }));
}

export async function updateProgressShareRecoveryStatus(
  ownerId: string,
  operationId: string,
  status: ProgressShareRecoveryStatus,
  storage: ProgressShareRecoveryStorage = AsyncStorage,
  updatedAt = Date.now(),
): Promise<void> {
  return mutate(async () => {
    const entries = await read(storage);
    const index = entries.findIndex((entry) => entry.ownerId === ownerId && entry.operationId === operationId);
    if (index < 0) throw new Error('Journey share recovery entry is missing.');
    const next = entries.slice();
    next[index] = Object.freeze({ ...entries[index], status, updatedAt });
    assertRecoveryEntry(next[index]);
    await storage.setItem(RECOVERY_KEY, JSON.stringify(next));
  });
}

export async function clearProgressShareRecovery(
  ownerId: string,
  operationId: string,
  storage: ProgressShareRecoveryStorage = AsyncStorage,
): Promise<void> {
  return mutate(async () => {
    const entries = await read(storage);
    const next = entries.filter((entry) => entry.ownerId !== ownerId || entry.operationId !== operationId);
    if (next.length !== entries.length) await storage.setItem(RECOVERY_KEY, JSON.stringify(next));
  });
}

function mutate(work: () => Promise<void>): Promise<void> {
  const pending = mutationTail.then(work, work);
  mutationTail = pending.catch(() => {});
  return pending;
}

async function read(storage: ProgressShareRecoveryStorage): Promise<ProgressShareRecoveryEntry[]> {
  const raw = await storage.getItem(RECOVERY_KEY);
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Journey share recovery data needs attention.');
  }
  if (!Array.isArray(value) || value.length > PROGRESS_SHARE_RECOVERY_MAX_COUNT) {
    throw new Error('Journey share recovery data is invalid.');
  }
  return value.map((entry) => {
    assertRecoveryEntry(entry);
    return Object.freeze({ ...entry });
  });
}

function assertRecoveryEntry(value: unknown): asserts value is ProgressShareRecoveryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Journey share recovery entry is invalid.');
  const entry = value as Partial<ProgressShareRecoveryEntry>;
  const keys = Object.keys(entry);
  const safeMediaRef = typeof entry.mediaRef === 'string' &&
    (entry.mediaRef.startsWith('r2://post-images/') || entry.mediaRef.startsWith('https://')) &&
    !/[?#]/.test(entry.mediaRef);
  if (keys.length !== RECOVERY_FIELDS.size || keys.some((key) => !RECOVERY_FIELDS.has(key)) ||
    !UUID.test(entry.ownerId ?? '') || !UUID.test(entry.operationId ?? '') || !SHA256.test(entry.sha256 ?? '') ||
    !safeMediaRef || entry.artifactFingerprint !== `${entry.operationId}:${entry.sha256}` ||
    !['uploaded', 'cleanup_pending'].includes(entry.status ?? '') ||
    !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt) ||
    (entry.createdAt ?? -1) < 0 || (entry.updatedAt ?? -1) < (entry.createdAt ?? 0)) {
    throw new Error('Journey share recovery entry is invalid.');
  }
}

function recoveryIdentity(ownerId: string, operationId: string): string {
  return `${ownerId}:${operationId}`;
}
