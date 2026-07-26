import { describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createActivitySynchronizer } from './activitySynchronizer';
import {
  getOwnerQueueSnapshot,
  recoverQueue,
  subscribeToQueue,
} from './offlineQueueStore';
import {
  ActivitySyncProvider,
  createSyncTriggerController,
  useActivitySync,
  type ActivitySyncSnapshot,
  type SyncTriggerControllerDependencies,
} from './ActivitySyncProvider';

let mockOwnerId: string | null = null;

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
  }),
}));
jest.mock('./activitySynchronizer', () => ({
  createActivitySynchronizer: jest.fn(() => ({ drain: jest.fn() })),
}));
jest.mock('./offlineQueueStore', () => ({
  recoverQueue: jest.fn(),
  getOwnerQueueSnapshot: jest.fn(),
  subscribeToQueue: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()) },
}));

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function queued(ownerId: string, id: string) {
  return { ownerId, id } as never;
}

async function settleMicrotasks() {
  for (let index = 0; index < 12; index += 1) {
    await Promise.resolve();
  }
}

function setup(
  overrides: Partial<SyncTriggerControllerDependencies> = {},
) {
  let queueListener: (() => void) | undefined;
  let networkListener:
    | ((state: {
        isConnected: boolean | null;
        isInternetReachable: boolean | null;
      }) => void)
    | undefined;
  let appStateListener: ((state: string) => void) | undefined;
  const unsubQueue = jest.fn();
  const unsubNetwork = jest.fn();
  const unsubAppState = jest.fn();
  const snapshots: ActivitySyncSnapshot[] = [];

  const dependencies: SyncTriggerControllerDependencies = {
    recoverQueue: jest.fn(async () => ({
      queuedCount: 0,
      issueCount: 0,
    })),
    getOwnerQueueSnapshot: jest.fn(async (_ownerId: string) => ({
      queued: [],
      summary: {
        currentOwnerCount: 0,
        otherOwnerCount: 0,
        totalQueuedCount: 0,
        issueCount: 0,
      },
    })),
    drain: jest.fn(async (_ownerId: string, _force?: boolean) => undefined),
    subscribeQueue: (listener) => {
      queueListener = listener;
      return unsubQueue;
    },
    subscribeNetwork: (listener) => {
      networkListener = listener;
      return unsubNetwork;
    },
    subscribeAppState: (listener) => {
      appStateListener = listener;
      return unsubAppState;
    },
    initialAppState: 'active',
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    ...overrides,
  };

  const controller = createSyncTriggerController(dependencies);
  return {
    controller,
    dependencies,
    snapshots,
    emitQueue: () => queueListener?.(),
    emitNetwork: (
      isConnected: boolean | null,
      isInternetReachable: boolean | null,
    ) => networkListener?.({ isConnected, isInternetReachable }),
    emitAppState: (state: string) => appStateListener?.(state),
    unsubQueue,
    unsubNetwork,
    unsubAppState,
  };
}

describe('createSyncTriggerController', () => {
  it('recovers once at startup, refreshes the current owner, and starts one drain', async () => {
    const harness = setup();

    await harness.controller.start(OWNER_A);
    await harness.controller.start(OWNER_A);

    expect(harness.dependencies.recoverQueue).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.getOwnerQueueSnapshot).toHaveBeenCalledWith(
      OWNER_A,
    );
    expect(harness.dependencies.drain).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.drain).toHaveBeenCalledWith(OWNER_A, false);
  });

  it('deduplicates repeated network and app-state values but drains on recovery transitions', async () => {
    const harness = setup();
    await harness.controller.start(OWNER_A);
    jest.mocked(harness.dependencies.drain).mockClear();

    harness.emitNetwork(false, false);
    harness.emitNetwork(false, false);
    harness.emitNetwork(true, null);
    harness.emitNetwork(true, true);
    harness.emitNetwork(true, true);
    harness.emitAppState('background');
    harness.emitAppState('background');
    harness.emitAppState('active');
    harness.emitAppState('active');
    await settleMicrotasks();

    expect(harness.dependencies.drain).toHaveBeenCalledTimes(2);
    expect(harness.dependencies.drain).toHaveBeenNthCalledWith(
      1,
      OWNER_A,
      false,
    );
    expect(harness.dependencies.drain).toHaveBeenNthCalledWith(
      2,
      OWNER_A,
      false,
    );
  });

  it('drains once for a changed authenticated owner and clears private state on signout', async () => {
    const readSnapshot = jest.fn(async (ownerId: string) => {
      const current = ownerId === OWNER_A
        ? [queued(OWNER_A, 'a')]
        : [queued(OWNER_B, 'b')];
      return {
        queued: current,
        summary: {
          currentOwnerCount: current.length,
          otherOwnerCount: 0,
          totalQueuedCount: current.length,
          issueCount: 0,
        },
      };
    });
    const harness = setup({ getOwnerQueueSnapshot: readSnapshot });
    await harness.controller.start(OWNER_A);

    harness.controller.onSession(OWNER_A);
    harness.controller.onSession(OWNER_B);
    harness.controller.onSession(OWNER_B);
    await harness.controller.refreshQueue();
    harness.controller.onSession(null);
    harness.emitNetwork(false, false);
    harness.emitNetwork(true, true);
    await Promise.resolve();

    expect(harness.dependencies.drain).toHaveBeenCalledTimes(2);
    expect(harness.dependencies.drain).toHaveBeenLastCalledWith(
      OWNER_B,
      false,
    );
    expect(readSnapshot).toHaveBeenLastCalledWith(OWNER_B);
    expect(harness.snapshots.at(-1)).toMatchObject({
      queued: [],
      issueCount: 0,
      otherAccountPendingCount: 0,
      error: null,
    });
  });

  it('forces manual retry for only the current owner and safely no-ops signed out', async () => {
    const harness = setup();
    await harness.controller.start(OWNER_A);
    jest.mocked(harness.dependencies.drain).mockClear();

    await harness.controller.retryNow();
    harness.controller.onSession(null);
    await harness.controller.retryNow();

    expect(harness.dependencies.drain).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.drain).toHaveBeenCalledWith(OWNER_A, true);
    expect(harness.snapshots.at(-1)?.error).toBeNull();
  });

  it('exposes a safe retry error without retaining the thrown error', async () => {
    const secretError = new Error('token=secret-value');
    const harness = setup({
      drain: jest.fn(async () => {
        throw secretError;
      }),
    });
    await harness.controller.start(OWNER_A);

    const snapshot = harness.snapshots.at(-1);
    expect(snapshot).toMatchObject({
      status: 'error',
      error: 'Activity upload could not be completed. Try again.',
    });
    expect(JSON.stringify(snapshot)).not.toContain('secret-value');
  });

  it('refreshes owner-only details and reports a live redacted other-account count', async () => {
    const harness = setup({
      getOwnerQueueSnapshot: jest.fn(async (_ownerId: string) => ({
        queued: [queued(OWNER_A, 'current')],
        summary: {
          currentOwnerCount: 1,
          otherOwnerCount: 2,
          totalQueuedCount: 3,
          issueCount: 2,
        },
      })),
    });

    await harness.controller.start(OWNER_A);
    harness.emitQueue();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.snapshots.at(-1)).toMatchObject({
      queued: [{ ownerId: OWNER_A, id: 'current' }],
      issueCount: 2,
      otherAccountPendingCount: 2,
    });
    expect(harness.dependencies.getOwnerQueueSnapshot).not.toHaveBeenCalledWith(
      OWNER_B,
    );
  });

  it('holds every automatic trigger behind recovery and drains only the latest owner', async () => {
    const recovery = deferred<{ queuedCount: number; issueCount: number }>();
    const harness = setup({ recoverQueue: () => recovery.promise });
    const starting = harness.controller.start(OWNER_A);

    harness.emitNetwork(false, false);
    harness.emitNetwork(true, true);
    harness.emitAppState('background');
    harness.emitAppState('active');
    harness.controller.onSession(OWNER_B);
    await Promise.resolve();

    expect(harness.dependencies.drain).not.toHaveBeenCalled();

    recovery.resolve({ queuedCount: 0, issueCount: 0 });
    await starting;

    expect(harness.dependencies.drain).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.drain).toHaveBeenCalledWith(OWNER_B, false);
  });

  it('keeps recovery failure authoritative until manual retry recovers and force-drains the current owner', async () => {
    const recoveryFailure = new Error('storage-key=private');
    const recover = jest
      .fn<SyncTriggerControllerDependencies['recoverQueue']>()
      .mockRejectedValueOnce(recoveryFailure)
      .mockResolvedValue({ queuedCount: 0, issueCount: 0 });
    const harness = setup({ recoverQueue: recover });

    await harness.controller.start(OWNER_A);
    await harness.controller.refreshQueue();

    expect(harness.dependencies.drain).not.toHaveBeenCalled();
    expect(harness.snapshots.at(-1)).toMatchObject({
      ownerId: OWNER_A,
      status: 'error',
      recoveryError: 'Offline activity recovery failed. Try again.',
      error: 'Offline activity recovery failed. Try again.',
    });
    expect(JSON.stringify(harness.snapshots.at(-1))).not.toContain('private');

    await harness.controller.retryNow();

    expect(recover).toHaveBeenCalledTimes(2);
    expect(harness.dependencies.drain).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.drain).toHaveBeenCalledWith(OWNER_A, true);
    expect(harness.snapshots.at(-1)).toMatchObject({
      ownerId: OWNER_A,
      status: 'idle',
      recoveryError: null,
      error: null,
    });
  });

  it('never transfers an A forced retry to B while recovery is pending', async () => {
    const retryRecovery =
      deferred<{ queuedCount: number; issueCount: number }>();
    const recover = jest
      .fn<SyncTriggerControllerDependencies['recoverQueue']>()
      .mockResolvedValueOnce({ queuedCount: 0, issueCount: 0 })
      .mockImplementationOnce(() => retryRecovery.promise);
    const harness = setup({ recoverQueue: recover });
    await harness.controller.start(OWNER_A);
    jest.mocked(harness.dependencies.drain).mockClear();

    const retrying = harness.controller.retryNow();
    harness.controller.onSession(OWNER_B);
    await settleMicrotasks();
    expect(harness.dependencies.drain).not.toHaveBeenCalled();

    retryRecovery.resolve({ queuedCount: 0, issueCount: 0 });
    await retrying;
    await settleMicrotasks();

    expect(harness.dependencies.drain).toHaveBeenCalledTimes(1);
    expect(harness.dependencies.drain).toHaveBeenCalledWith(OWNER_B, false);
    expect(harness.dependencies.drain).not.toHaveBeenCalledWith(
      OWNER_A,
      true,
    );
  });

  it('drops an A forced retry when the session signs out during recovery', async () => {
    const retryRecovery =
      deferred<{ queuedCount: number; issueCount: number }>();
    const recover = jest
      .fn<SyncTriggerControllerDependencies['recoverQueue']>()
      .mockResolvedValueOnce({ queuedCount: 0, issueCount: 0 })
      .mockImplementationOnce(() => retryRecovery.promise);
    const harness = setup({ recoverQueue: recover });
    await harness.controller.start(OWNER_A);
    jest.mocked(harness.dependencies.drain).mockClear();

    const retrying = harness.controller.retryNow();
    harness.controller.onSession(null);
    retryRecovery.resolve({ queuedCount: 0, issueCount: 0 });
    await retrying;
    await settleMicrotasks();

    expect(harness.dependencies.drain).not.toHaveBeenCalled();
  });

  it('coalesces rapid refresh requests into one in-flight read and one trailing read', async () => {
    const harness = setup();
    await harness.controller.start(OWNER_A);
    const firstRead = deferred<{
      queued: never[];
      summary: {
        currentOwnerCount: number;
        otherOwnerCount: number;
        totalQueuedCount: number;
        issueCount: number;
      };
    }>();
    const readSnapshot = jest
      .fn<SyncTriggerControllerDependencies['getOwnerQueueSnapshot']>()
      .mockImplementationOnce(() => firstRead.promise)
      .mockResolvedValue({
        queued: [queued(OWNER_A, 'latest')],
        summary: {
          currentOwnerCount: 1,
          otherOwnerCount: 2,
          totalQueuedCount: 3,
          issueCount: 1,
        },
      });
    harness.dependencies.getOwnerQueueSnapshot = readSnapshot;

    harness.emitQueue();
    const waitingA = harness.controller.refreshQueue();
    const waitingB = harness.controller.refreshQueue();
    for (let index = 0; index < 20; index += 1) harness.emitQueue();
    await Promise.resolve();

    expect(readSnapshot).toHaveBeenCalledTimes(1);

    firstRead.resolve({
      queued: [],
      summary: {
        currentOwnerCount: 0,
        otherOwnerCount: 1,
        totalQueuedCount: 1,
        issueCount: 0,
      },
    });
    await Promise.all([waitingA, waitingB]);

    expect(readSnapshot).toHaveBeenCalledTimes(2);
    expect(harness.snapshots.at(-1)).toMatchObject({
      ownerId: OWNER_A,
      queued: [{ id: 'latest', ownerId: OWNER_A }],
      issueCount: 1,
      otherAccountPendingCount: 2,
      status: 'idle',
      error: null,
    });
  });

  it('unsubscribes once and ignores late async work after disposal', async () => {
    const recovery = deferred<{ queuedCount: number; issueCount: number }>();
    const harness = setup({ recoverQueue: () => recovery.promise });
    const starting = harness.controller.start(OWNER_A);
    const snapshotsBeforeDispose = harness.snapshots.length;

    harness.controller.dispose();
    harness.controller.dispose();
    recovery.resolve({ queuedCount: 1, issueCount: 0 });
    await starting;
    harness.emitQueue();
    harness.emitNetwork(true, true);
    harness.emitAppState('active');
    await Promise.resolve();

    expect(harness.unsubQueue).toHaveBeenCalledTimes(1);
    expect(harness.unsubNetwork).toHaveBeenCalledTimes(1);
    expect(harness.unsubAppState).toHaveBeenCalledTimes(1);
    expect(harness.snapshots).toHaveLength(snapshotsBeforeDispose);
    expect(harness.dependencies.drain).not.toHaveBeenCalled();
  });
});

describe('ActivitySyncProvider owner render boundary', () => {
  it('commits an empty value before effects on A-to-B and A-to-signout renders', async () => {
    const commits: Array<{
      queuedIds: string[];
      status: string;
      error: string | null;
    }> = [];
    const mockDrain = jest.fn(async () => undefined);
    jest.mocked(createActivitySynchronizer).mockReturnValue({
      drain: mockDrain,
    } as never);
    jest.mocked(recoverQueue).mockResolvedValue({
      queuedCount: 2,
      issueCount: 0,
    });
    jest.mocked(getOwnerQueueSnapshot).mockImplementation(
      async (ownerId: string) => ({
        queued: [queued(ownerId, ownerId === OWNER_A ? 'a-private' : 'b-private')],
        summary: {
          currentOwnerCount: 1,
          otherOwnerCount: 1,
          totalQueuedCount: 2,
          issueCount: 0,
        },
      }),
    );
    jest.mocked(subscribeToQueue).mockReturnValue(jest.fn());

    function Probe() {
      const value = useActivitySync();
      commits.push({
        queuedIds: value.queued.map((entry) => entry.id),
        status: value.status,
        error: value.error,
      });
      return null;
    }

    const tree = () =>
      createElement(
        ActivitySyncProvider,
        null,
        createElement(Probe),
      );
    mockOwnerId = OWNER_A;
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(tree());
    });
    expect(commits.some((commit) => commit.queuedIds.includes('a-private'))).toBe(
      true,
    );

    const beforeSwitch = commits.length;
    mockOwnerId = OWNER_B;
    await act(async () => {
      renderer.update(tree());
    });
    const switchCommits = commits.slice(beforeSwitch);
    expect(switchCommits[0]?.queuedIds).toEqual([]);
    expect(switchCommits.every((commit) => !commit.queuedIds.includes('a-private'))).toBe(
      true,
    );

    const beforeSignout = commits.length;
    mockOwnerId = null;
    await act(async () => {
      renderer.update(tree());
    });
    const signoutCommits = commits.slice(beforeSignout);
    expect(signoutCommits[0]?.queuedIds).toEqual([]);
    expect(signoutCommits.every((commit) => commit.queuedIds.length === 0)).toBe(
      true,
    );

    await act(async () => {
      renderer.unmount();
    });
  });
});
