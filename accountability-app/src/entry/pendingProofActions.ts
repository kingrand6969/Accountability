export type DurableProofAction = 'post-feed' | 'save-memories';
export type PendingDestination = 'posts' | 'memories';

export type PendingProofActionV1 = {
  version: 1;
  operationId: string;
  ownerId: string;
  action: DurableProofAction;
  fingerprint: string;
  dispatchedAt: string;
  expiresAt: string;
  match: {
    destination: PendingDestination;
    imageSha256: string;
    normalizedHeadline: string;
  };
};

export type PendingProofStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const PROOF_RECONCILIATION_WINDOW_MS = 15 * 60 * 1000;
const KEY_PREFIX = 'pending-proof-actions:v1:';
const keyLocks = new Map<string, Promise<void>>();

export function pendingProofActionsKey(ownerId: string): string {
  if (!ownerId.trim()) throw new Error('A signed-in owner is required.');
  return `${KEY_PREFIX}${ownerId}`;
}

export function normalizeProofHeadline(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export async function buildProofFingerprint(
  input: {
    ownerId: string;
    action: DurableProofAction;
    imageSha256: string;
    headline: string;
  },
  sha256Utf8: (value: string) => Promise<string>,
): Promise<{ fingerprint: string; normalizedHeadline: string }> {
  const normalizedHeadline = normalizeProofHeadline(input.headline);
  const fingerprint = await sha256Utf8(
    `1|${input.ownerId}|${input.action}|${input.imageSha256}|${normalizedHeadline}`,
  );
  return { fingerprint, normalizedHeadline };
}

export function createPendingProofAction(input: {
  operationId: string;
  ownerId: string;
  action: DurableProofAction;
  fingerprint: string;
  imageSha256: string;
  headline: string;
  now?: Date;
}): PendingProofActionV1 {
  const now = input.now ?? new Date();
  return {
    version: 1,
    operationId: input.operationId,
    ownerId: input.ownerId,
    action: input.action,
    fingerprint: input.fingerprint,
    dispatchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROOF_RECONCILIATION_WINDOW_MS).toISOString(),
    match: {
      destination: input.action === 'post-feed' ? 'posts' : 'memories',
      imageSha256: input.imageSha256,
      normalizedHeadline: normalizeProofHeadline(input.headline),
    },
  };
}

export async function loadPendingProofActions(
  ownerId: string,
  storage: PendingProofStorage,
): Promise<PendingProofActionV1[]> {
  const raw = await storage.getItem(pendingProofActionsKey(ownerId));
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is PendingProofActionV1 =>
      isPendingProofAction(value, ownerId));
  } catch {
    return [];
  }
}

export async function appendPendingProofAction(
  entry: PendingProofActionV1,
  storage: PendingProofStorage,
  now = new Date(),
): Promise<PendingProofActionV1> {
  return withKeyLock(pendingProofActionsKey(entry.ownerId), async () => {
    const entries = await loadPendingProofActions(entry.ownerId, storage);
    const reusable = entries.find((candidate) =>
      candidate.action === entry.action &&
      candidate.fingerprint === entry.fingerprint &&
      candidate.match.imageSha256 === entry.match.imageSha256 &&
      candidate.match.normalizedHeadline === entry.match.normalizedHeadline &&
      Date.parse(candidate.expiresAt) >= now.getTime());
    if (reusable) return reusable;
    await storage.setItem(
      pendingProofActionsKey(entry.ownerId),
      JSON.stringify([...entries, entry]),
    );
    return entry;
  });
}

export async function clearPendingProofAction(
  ownerId: string,
  operationId: string,
  storage: PendingProofStorage,
): Promise<void> {
  await withKeyLock(pendingProofActionsKey(ownerId), async () => {
    const entries = await loadPendingProofActions(ownerId, storage);
    const remaining = entries.filter((entry) => entry.operationId !== operationId);
    if (remaining.length === 0) {
      await storage.removeItem(pendingProofActionsKey(ownerId));
    } else {
      await storage.setItem(pendingProofActionsKey(ownerId), JSON.stringify(remaining));
    }
  });
}

export const discardPendingProofAction = clearPendingProofAction;

export function remainingPendingForAction(
  entries: readonly PendingProofActionV1[],
  discardedOperationId: string,
  action: DurableProofAction,
): PendingProofActionV1 | null {
  return entries.find(
    (entry) => entry.operationId !== discardedOperationId && entry.action === action,
  ) ?? null;
}

export type DurableDispatchResult =
  | { status: 'success'; entry: PendingProofActionV1 }
  | { status: 'ambiguous'; entry: PendingProofActionV1 };

/**
 * The journal write is the commit point before a remote destination dispatch.
 * A rejected dispatch is deliberately ambiguous: the remote side may have
 * accepted the request before the response was lost.
 */
export async function dispatchPendingProofAction(
  entry: PendingProofActionV1,
  storage: PendingProofStorage,
  dispatch: () => Promise<void>,
  now = new Date(),
): Promise<DurableDispatchResult> {
  const recorded = await appendPendingProofAction(entry, storage, now);
  try {
    await dispatch();
  } catch {
    return { status: 'ambiguous', entry: recorded };
  }
  await clearPendingProofAction(recorded.ownerId, recorded.operationId, storage);
  return { status: 'success', entry: recorded };
}

export type PendingReconciliation =
  | { status: 'matched'; entry: PendingProofActionV1 }
  | { status: 'unresolved'; entry: PendingProofActionV1; expired: boolean };

export function reconcilePendingProofAction(
  entry: PendingProofActionV1,
  candidate: {
    destination: PendingDestination;
    imageSha256: string;
    headline: string;
    createdAt: string;
  } | null,
  now = new Date(),
): PendingReconciliation {
  const expired = Date.parse(entry.expiresAt) < now.getTime();
  if (entry.action === 'save-memories' || expired || !candidate) {
    return { status: 'unresolved', entry, expired };
  }
  const exact =
    candidate.destination === entry.match.destination &&
    candidate.imageSha256 === entry.match.imageSha256 &&
    normalizeProofHeadline(candidate.headline) === entry.match.normalizedHeadline &&
    Date.parse(candidate.createdAt) >= Date.parse(entry.dispatchedAt) &&
    Date.parse(candidate.createdAt) <= Date.parse(entry.expiresAt);
  return exact
    ? { status: 'matched', entry }
    : { status: 'unresolved', entry, expired: false };
}

function isPendingProofAction(
  value: unknown,
  ownerId: string,
): value is PendingProofActionV1 {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PendingProofActionV1>;
  return item.version === 1 &&
    item.ownerId === ownerId &&
    (item.action === 'post-feed' || item.action === 'save-memories') &&
    typeof item.operationId === 'string' &&
    typeof item.fingerprint === 'string' &&
    typeof item.dispatchedAt === 'string' &&
    typeof item.expiresAt === 'string' &&
    Number.isFinite(Date.parse(item.dispatchedAt)) &&
    Number.isFinite(Date.parse(item.expiresAt)) &&
    !!item.match &&
    (item.match.destination === 'posts' || item.match.destination === 'memories') &&
    typeof item.match.imageSha256 === 'string' &&
    typeof item.match.normalizedHeadline === 'string';
}

async function withKeyLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const prior = keyLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = prior.catch(() => {}).then(() => gate);
  keyLocks.set(key, queued);
  await prior.catch(() => {});
  try {
    return await work();
  } finally {
    release();
    if (keyLocks.get(key) === queued) keyLocks.delete(key);
  }
}
