import { describe, expect, it, jest } from '@jest/globals';
import {
  createSyncTriggerController,
  type ActivitySyncSnapshot,
  type SyncTriggerControllerDependencies,
} from './ActivitySyncProvider';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: null }),
}));
jest.mock('./activitySynchronizer', () => ({
  createActivitySynchronizer: () => ({ drain: jest.fn() }),
}));
jest.mock('./offlineQueueStore', () => ({
  recoverQueue: jest.fn(),
  listQueuedActivities: jest.fn(),
  listQueueIssues: jest.fn(),
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
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function queued(ownerId: string, id: string) {
  return { ownerId, id } as never;
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
    listQueuedActivities: jest.fn(async (_ownerId: string) => []),
    listQueueIssues: jest.fn(async () => []),
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
    expect(harness.dependencies.listQueuedActivities).toHaveBeenCalledWith(
      OWNER_A,
    );
    expect(harness.dependencies.listQueueIssues).toHaveBeenCalledTimes(1);
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
    await Promise.resolve();

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
    const list = jest.fn(async (ownerId: string) =>
      ownerId === OWNER_A
        ? [queued(OWNER_A, 'a')]
        : [queued(OWNER_B, 'b')],
    );
    const harness = setup({ listQueuedActivities: list });
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
    expect(list).toHaveBeenLastCalledWith(OWNER_B);
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

  it('refreshes owner-only details and reports other-account work as a redacted approximate count', async () => {
    const harness = setup({
      recoverQueue: jest.fn(async () => ({
        queuedCount: 3,
        issueCount: 2,
      })),
      listQueuedActivities: jest.fn(async (_ownerId: string) => [
        queued(OWNER_A, 'current'),
      ]),
      listQueueIssues: jest.fn(
        async () =>
          [
            { id: 'redacted-one' },
            { id: 'redacted-two' },
          ] as never,
      ),
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
    expect(harness.dependencies.listQueuedActivities).not.toHaveBeenCalledWith(
      OWNER_B,
    );
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
