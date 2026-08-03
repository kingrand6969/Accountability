import type { DraftFileAdapter, DraftStorage } from './composeDraft';

const CANONICAL_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

type DeletionCleanupDependencies = {
  getAuthenticatedUserId(): Promise<string | null>;
  cleanupOwnerDrafts(
    ownerId: string,
    storage: DraftStorage,
    fileAdapter: DraftFileAdapter,
  ): Promise<unknown>;
  draftStorage: DraftStorage;
  fileAdapter: DraftFileAdapter;
  deleteMyAccount(): Promise<void>;
  clearPendingDeletionState(): void;
};

export type AccountDeletionAttemptState = { current: boolean };

export function tryBeginAccountDeletionAttempt(state: AccountDeletionAttemptState): boolean {
  if (state.current) return false;
  state.current = true;
  return true;
}

export function endAccountDeletionAttempt(state: AccountDeletionAttemptState): void {
  state.current = false;
}

export type AccountDeletionCleanupResult =
  | { status: 'cleaned'; ownerId: string }
  | { status: 'cleanup-failed'; ownerId: string; error: string }
  | { status: 'auth-mismatch' };

function isCanonicalUuid(value: string | null): value is string {
  return value !== null && CANONICAL_UUID.test(value);
}

class OwnerChangedDuringCleanup extends Error {}

async function requireCurrentOwner(
  capturedOwnerId: string,
  dependencies: DeletionCleanupDependencies,
): Promise<boolean> {
  const currentOwnerId = await dependencies.getAuthenticatedUserId();
  if (isCanonicalUuid(currentOwnerId) && currentOwnerId === capturedOwnerId) return true;
  dependencies.clearPendingDeletionState();
  return false;
}

async function deleteIfOwnerIsCurrent(
  capturedOwnerId: string,
  dependencies: DeletionCleanupDependencies,
): Promise<AccountDeletionCleanupResult> {
  if (!await requireCurrentOwner(capturedOwnerId, dependencies)) return { status: 'auth-mismatch' };
  await dependencies.deleteMyAccount();
  return { status: 'cleaned', ownerId: capturedOwnerId };
}

function guardedCleanupDependencies(
  capturedOwnerId: string,
  dependencies: DeletionCleanupDependencies,
): { storage: DraftStorage; adapter: DraftFileAdapter } {
  const guard = async () => {
    if (!await requireCurrentOwner(capturedOwnerId, dependencies)) {
      throw new OwnerChangedDuringCleanup();
    }
  };
  return {
    storage: {
      getItem: (key) => dependencies.draftStorage.getItem(key),
      setItem: (key, value) => dependencies.draftStorage.setItem(key, value),
      removeItem: async (key) => {
        await guard();
        await dependencies.draftStorage.removeItem(key);
      },
    },
    adapter: {
      ...dependencies.fileAdapter,
      deleteIfExists: async (path) => {
        await guard();
        await dependencies.fileAdapter.deleteIfExists(path);
      },
      deleteDirectoryIfExists: async (path) => {
        await guard();
        await dependencies.fileAdapter.deleteDirectoryIfExists(path);
      },
    },
  };
}

async function cleanupThenDelete(
  capturedOwnerId: string,
  dependencies: DeletionCleanupDependencies,
  ownerAlreadyChecked = false,
): Promise<AccountDeletionCleanupResult> {
  if (!ownerAlreadyChecked && !await requireCurrentOwner(capturedOwnerId, dependencies)) {
    return { status: 'auth-mismatch' };
  }
  try {
    const guarded = guardedCleanupDependencies(capturedOwnerId, dependencies);
    await dependencies.cleanupOwnerDrafts(capturedOwnerId, guarded.storage, guarded.adapter);
  } catch (error) {
    if (error instanceof OwnerChangedDuringCleanup) return { status: 'auth-mismatch' };
    return {
      status: 'cleanup-failed',
      ownerId: capturedOwnerId,
      error: 'Draft cleanup could not be completed.',
    };
  }
  return deleteIfOwnerIsCurrent(capturedOwnerId, dependencies);
}

export async function prepareAccountDeletionDraftCleanup(
  dependencies: DeletionCleanupDependencies,
): Promise<AccountDeletionCleanupResult> {
  const capturedOwnerId = await dependencies.getAuthenticatedUserId();
  if (!isCanonicalUuid(capturedOwnerId)) {
    dependencies.clearPendingDeletionState();
    return { status: 'auth-mismatch' };
  }
  return cleanupThenDelete(capturedOwnerId, dependencies);
}

export async function retryAccountDeletionDraftCleanup(
  capturedOwnerId: string,
  dependencies: DeletionCleanupDependencies,
): Promise<AccountDeletionCleanupResult> {
  if (!isCanonicalUuid(capturedOwnerId)) {
    dependencies.clearPendingDeletionState();
    return { status: 'auth-mismatch' };
  }
  if (!await requireCurrentOwner(capturedOwnerId, dependencies)) {
    return { status: 'auth-mismatch' };
  }
  return cleanupThenDelete(capturedOwnerId, dependencies, true);
}

export async function continueAccountDeletionAfterCleanupFailure(
  capturedOwnerId: string,
  dependencies: DeletionCleanupDependencies,
): Promise<{ status: 'continued'; ownerId: string } | { status: 'auth-mismatch' }> {
  if (!isCanonicalUuid(capturedOwnerId)) {
    dependencies.clearPendingDeletionState();
    return { status: 'auth-mismatch' };
  }
  if (!await requireCurrentOwner(capturedOwnerId, dependencies)) {
    return { status: 'auth-mismatch' };
  }
  await dependencies.deleteMyAccount();
  return { status: 'continued', ownerId: capturedOwnerId };
}
