import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, jest, test } from '@jest/globals';
import type { DraftFileAdapter } from './composeDraft';
import {
  continueAccountDeletionAfterCleanupFailure,
  endAccountDeletionAttempt,
  prepareAccountDeletionDraftCleanup,
  retryAccountDeletionDraftCleanup,
  tryBeginAccountDeletionAttempt,
} from './accountDraftCleanup';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function harness(
  authSequence: (string | null)[],
  cleanup: (ownerId: string, storage: object, adapter: object) => Promise<unknown> = async () => undefined,
) {
  const order: string[] = [];
  const getAuthenticatedUserId = jest.fn(async () => {
    order.push('get-auth-user');
    return authSequence.shift() ?? null;
  });
  const deleteMyAccount = jest.fn(async () => { order.push('delete-account'); });
  const clearPendingDeletionState = jest.fn();
  const cleanupOwnerDrafts = jest.fn(async (ownerId: string, storage: object, adapter: object) => {
    order.push(`cleanup:${ownerId}`);
    return cleanup(ownerId, storage, adapter);
  });
  const draftStorage = {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  };
  const fileAdapter = {
    deleteIfExists: jest.fn(async () => undefined),
    deleteDirectoryIfExists: jest.fn(async () => undefined),
  };
  return {
    order,
    deps: {
      getAuthenticatedUserId,
      cleanupOwnerDrafts,
      draftStorage,
      fileAdapter: fileAdapter as unknown as DraftFileAdapter,
      deleteMyAccount,
      clearPendingDeletionState,
    },
  };
}

describe('account deletion draft cleanup', () => {
  test('cleans only the canonical authenticated owner before deleting', async () => {
    const { deps, order } = harness([USER_A, USER_A, USER_A]);

    expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({ status: 'cleaned', ownerId: USER_A });
    expect(order).toEqual([
      'get-auth-user',
      'get-auth-user',
      `cleanup:${USER_A}`,
      'get-auth-user',
      'delete-account',
    ]);
    expect(deps.cleanupOwnerDrafts).toHaveBeenCalledWith(USER_A, expect.anything(), expect.anything());
    expect(deps.cleanupOwnerDrafts).not.toHaveBeenCalledWith(USER_B, expect.anything(), expect.anything());
  });

  test.each([null, '', USER_A.toUpperCase(), 'not-a-uuid'])(
    'rejects missing or non-canonical auth identity %p',
    async (identity) => {
      const { deps } = harness([identity]);
      expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({ status: 'auth-mismatch' });
      expect(deps.cleanupOwnerDrafts).not.toHaveBeenCalled();
      expect(deps.deleteMyAccount).not.toHaveBeenCalled();
      expect(deps.clearPendingDeletionState).toHaveBeenCalled();
    },
  );

  test.each([[USER_A, USER_B], [USER_A, null]])(
    'aborts when the account switches or signs out after cleanup',
    async (captured, current) => {
      const { deps } = harness([captured, captured, current]);
      expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({ status: 'auth-mismatch' });
      expect(deps.cleanupOwnerDrafts).toHaveBeenCalledWith(USER_A, expect.anything(), expect.anything());
      expect(deps.deleteMyAccount).not.toHaveBeenCalled();
      expect(deps.clearPendingDeletionState).toHaveBeenCalled();
    },
  );

  test.each([USER_B, null])('detects switch or signout while cleanup is in flight', async (nextOwner) => {
    let currentOwner: string | null = USER_A;
    const cleanupStarted = deferred<void>();
    const releaseCleanup = deferred<void>();
    const { deps } = harness([], async () => {
      cleanupStarted.resolve();
      await releaseCleanup.promise;
    });
    deps.getAuthenticatedUserId.mockImplementation(async () => currentOwner);

    const attempt = prepareAccountDeletionDraftCleanup(deps);
    await cleanupStarted.promise;
    currentOwner = nextOwner;
    releaseCleanup.resolve();

    expect(await attempt).toEqual({ status: 'auth-mismatch' });
    expect(deps.deleteMyAccount).not.toHaveBeenCalled();
    expect(deps.clearPendingDeletionState).toHaveBeenCalled();
  });

  test('detects a switch after cleanup and before the destructive boundary resolves', async () => {
    const boundary = deferred<string | null>();
    const { deps } = harness([]);
    deps.getAuthenticatedUserId
      .mockResolvedValueOnce(USER_A)
      .mockResolvedValueOnce(USER_A)
      .mockImplementationOnce(async () => boundary.promise);

    const attempt = prepareAccountDeletionDraftCleanup(deps);
    await Promise.resolve();
    boundary.resolve(USER_B);

    expect(await attempt).toEqual({ status: 'auth-mismatch' });
    expect(deps.deleteMyAccount).not.toHaveBeenCalled();
    expect(deps.clearPendingDeletionState).toHaveBeenCalled();
  });

  test.each([USER_A.toUpperCase(), 'not-a-uuid'])(
    'rejects noncanonical current identity at cleaned deletion boundary',
    async (current) => {
      const { deps } = harness([USER_A, USER_A, current]);
      expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({ status: 'auth-mismatch' });
      expect(deps.deleteMyAccount).not.toHaveBeenCalled();
      expect(deps.clearPendingDeletionState).toHaveBeenCalled();
    },
  );

  test('cleanup failure blocks automatic deletion and preserves the captured owner', async () => {
    const failure = new Error('disk unavailable');
    const { deps, order } = harness([USER_A, USER_A], async () => { throw failure; });
    expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({
      status: 'cleanup-failed',
      ownerId: USER_A,
      error: 'Draft cleanup could not be completed.',
    });
    expect(order).toEqual(['get-auth-user', 'get-auth-user', `cleanup:${USER_A}`]);
    expect(deps.deleteMyAccount).not.toHaveBeenCalled();
  });

  test('retry rechecks the captured owner before cleanup and at deletion boundary', async () => {
    const { deps } = harness([USER_A, USER_A]);
    expect(await retryAccountDeletionDraftCleanup(USER_A, deps)).toEqual({ status: 'cleaned', ownerId: USER_A });
    expect(deps.cleanupOwnerDrafts).toHaveBeenCalledWith(USER_A, expect.anything(), expect.anything());
    expect(deps.deleteMyAccount).toHaveBeenCalledTimes(1);
  });

  test.each([[USER_B], [null], ['INVALID']])(
    'retry clears pending state and never cleans a replacement owner',
    async (current) => {
      const { deps } = harness([current]);
      expect(await retryAccountDeletionDraftCleanup(USER_A, deps)).toEqual({ status: 'auth-mismatch' });
      expect(deps.cleanupOwnerDrafts).not.toHaveBeenCalled();
      expect(deps.deleteMyAccount).not.toHaveBeenCalled();
      expect(deps.clearPendingDeletionState).toHaveBeenCalled();
    },
  );

  test('malformed captured state is cleared before retry or continue', async () => {
    const retry = harness([USER_A]);
    const continued = harness([USER_A]);
    expect(await retryAccountDeletionDraftCleanup('INVALID', retry.deps)).toEqual({ status: 'auth-mismatch' });
    expect(await continueAccountDeletionAfterCleanupFailure('INVALID', continued.deps)).toEqual({
      status: 'auth-mismatch',
    });
    expect(retry.deps.clearPendingDeletionState).toHaveBeenCalled();
    expect(continued.deps.clearPendingDeletionState).toHaveBeenCalled();
    expect(retry.deps.getAuthenticatedUserId).not.toHaveBeenCalled();
    expect(continued.deps.getAuthenticatedUserId).not.toHaveBeenCalled();
  });

  test('continue after failure rechecks owner and deletes without claiming cleanup succeeded', async () => {
    const { deps } = harness([USER_A]);
    expect(await continueAccountDeletionAfterCleanupFailure(USER_A, deps)).toEqual({
      status: 'continued',
      ownerId: USER_A,
    });
    expect(deps.cleanupOwnerDrafts).not.toHaveBeenCalled();
    expect(deps.deleteMyAccount).toHaveBeenCalledTimes(1);
  });

  test.each([[USER_B], [null]])('continue aborts after switch or signout', async (current) => {
    const { deps } = harness([current]);
    expect(await continueAccountDeletionAfterCleanupFailure(USER_A, deps)).toEqual({ status: 'auth-mismatch' });
    expect(deps.deleteMyAccount).not.toHaveBeenCalled();
    expect(deps.clearPendingDeletionState).toHaveBeenCalled();
  });

  test.each([USER_A.toUpperCase(), 'not-a-uuid'])(
    'continue rejects a noncanonical current identity',
    async (current) => {
      const { deps } = harness([current]);
      expect(await continueAccountDeletionAfterCleanupFailure(USER_A, deps)).toEqual({
        status: 'auth-mismatch',
      });
      expect(deps.deleteMyAccount).not.toHaveBeenCalled();
      expect(deps.clearPendingDeletionState).toHaveBeenCalled();
    },
  );

  test.each([USER_B, null])(
    'retry and continue recheck identity changed while the failure dialog is open',
    async (current) => {
      const retry = harness([current]);
      const continued = harness([current]);
      expect(await retryAccountDeletionDraftCleanup(USER_A, retry.deps)).toEqual({
        status: 'auth-mismatch',
      });
      expect(await continueAccountDeletionAfterCleanupFailure(USER_A, continued.deps)).toEqual({
        status: 'auth-mismatch',
      });
      expect(retry.deps.cleanupOwnerDrafts).not.toHaveBeenCalled();
      expect(retry.deps.deleteMyAccount).not.toHaveBeenCalled();
      expect(continued.deps.deleteMyAccount).not.toHaveBeenCalled();
    },
  );

  test('checks current owner before cleanup starts', async () => {
    const { deps } = harness([USER_A, USER_B]);
    expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({ status: 'auth-mismatch' });
    expect(deps.cleanupOwnerDrafts).not.toHaveBeenCalled();
    expect(deps.deleteMyAccount).not.toHaveBeenCalled();
  });

  test('stops local destruction immediately when owner changes mid-cleanup', async () => {
    let currentOwner: string | null = USER_A;
    const removed: string[] = [];
    const { deps } = harness([], async (_ownerId, storage, adapter) => {
      const guardedStorage = storage as { removeItem(key: string): Promise<void> };
      const guardedAdapter = adapter as {
        deleteIfExists(path: string): Promise<void>;
        deleteDirectoryIfExists(path: string): Promise<void>;
      };
      await guardedStorage.removeItem('draft-a');
      currentOwner = USER_B;
      await guardedAdapter.deleteIfExists('/owner-a/media.jpg');
      removed.push('unexpected');
      await guardedAdapter.deleteDirectoryIfExists('/owner-a');
    });
    deps.getAuthenticatedUserId.mockImplementation(async () => currentOwner);

    expect(await prepareAccountDeletionDraftCleanup(deps)).toEqual({ status: 'auth-mismatch' });
    expect(deps.draftStorage.removeItem).toHaveBeenCalledTimes(1);
    expect(deps.fileAdapter.deleteIfExists).not.toHaveBeenCalled();
    expect(deps.fileAdapter.deleteDirectoryIfExists).not.toHaveBeenCalled();
    expect(removed).toEqual([]);
    expect(deps.deleteMyAccount).not.toHaveBeenCalled();
  });

  test('synchronous attempt guard suppresses overlapping cleanup and deletion', async () => {
    const state = { current: false };
    const release = deferred<void>();
    const { deps } = harness([USER_A, USER_A, USER_A], async () => release.promise);
    const run = () => {
      if (!tryBeginAccountDeletionAttempt(state)) return Promise.resolve();
      return prepareAccountDeletionDraftCleanup(deps).then(() => undefined);
    };
    const first = run();
    const second = run();
    release.resolve();
    await Promise.all([first, second]);
    expect(deps.cleanupOwnerDrafts).toHaveBeenCalledTimes(1);
    expect(deps.deleteMyAccount).toHaveBeenCalledTimes(1);
    endAccountDeletionAttempt(state);
    expect(tryBeginAccountDeletionAttempt(state)).toBe(true);
  });

  test('ordinary signout and auth switching do not invoke deletion cleanup', () => {
    const root = path.resolve(__dirname, '..');
    const profile = fs.readFileSync(path.join(root, 'app', 'edit-profile.tsx'), 'utf8');
    const authProvider = fs.readFileSync(path.join(root, 'auth', 'AuthProvider.tsx'), 'utf8');
    const signout = profile.slice(
      profile.indexOf('async function onSignOut'),
      profile.indexOf('async function getAuthenticatedUserId'),
    );
    expect(signout).not.toMatch(/prepareAccountDeletionDraftCleanup|cleanupOwnerDrafts|createExpoDraftFileAdapter/);
    expect(authProvider).not.toMatch(/prepareAccountDeletionDraftCleanup|cleanupOwnerDrafts|createExpoDraftFileAdapter/);
  });

  test('edit profile binds the final confirmation, production dependencies, and exact failure policy', () => {
    const profile = fs.readFileSync(
      path.resolve(__dirname, '..', 'app', 'edit-profile.tsx'),
      'utf8',
    );
    expect(profile).toMatch(
      /text: 'Delete forever'[\s\S]*?prepareAccountDeletionDraftCleanup\(deletionDependencies\(\)\)/,
    );
    expect(profile).toMatch(
      /supabase\.auth\.getUser\(\)[\s\S]*?cleanupOwnerDrafts,[\s\S]*?draftStorage: AsyncStorage/,
    );
    expect(profile).toMatch(/createExpoDraftFileAdapter\(\)/);
    expect(profile).toMatch(
      /fileAdapter: draftFileAdapter,[\s\S]*?deleteMyAccount,[\s\S]*?clearPendingDeletionState/,
    );
    expect(profile).toContain(
      "If you continue, this account's app-private local drafts may remain on this device.",
    );
    expect(profile).not.toContain('`${result.error}');
    expect(profile).toMatch(
      /text: 'Retry cleanup'[\s\S]*?retryAccountDeletionDraftCleanup\(result\.ownerId, deletionDependencies\(\)\)/,
    );
    expect(profile).toMatch(
      /text: 'Continue account deletion'[\s\S]*?continueAccountDeletionAfterCleanupFailure\([\s\S]*?result\.ownerId,[\s\S]*?deletionDependencies\(\)/,
    );
    expect(profile).toMatch(
      /text: 'Keep my account', style: 'cancel', onPress: resetDeletionAttempt/,
    );
    expect(profile).toMatch(/useRef\(false\)/);
    expect(profile).toMatch(/tryBeginAccountDeletionAttempt\(deletionAttempt\)/);
    expect(profile).toMatch(/endAccountDeletionAttempt\(deletionAttempt\)/);
  });
});
