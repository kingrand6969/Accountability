import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { createActivitySynchronizer } from './activitySynchronizer';
import {
  getOwnerQueueSnapshot,
  recoverQueue,
  subscribeToQueue,
  type OwnerQueueSnapshot,
  type QueueRecoverySummary,
} from './offlineQueueStore';
import type { QueuedActivity } from './offlineQueueTypes';

export type ActivitySyncStatus = 'recovering' | 'idle' | 'syncing' | 'error';

export type ActivitySyncSnapshot = {
  ownerId: string | null;
  queued: QueuedActivity[];
  issueCount: number;
  otherAccountPendingCount: number;
  status: ActivitySyncStatus;
  recoveryError: string | null;
  syncError: string | null;
  error: string | null;
};

type NetworkState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

type Unsubscribe = () => void;

export type SyncTriggerControllerDependencies = {
  recoverQueue: () => Promise<QueueRecoverySummary>;
  getOwnerQueueSnapshot: (ownerId: string) => Promise<OwnerQueueSnapshot>;
  drain: (ownerId: string, force?: boolean) => Promise<void>;
  subscribeQueue: (listener: () => void) => Unsubscribe;
  subscribeNetwork: (
    listener: (state: NetworkState) => void,
  ) => Unsubscribe;
  subscribeAppState: (listener: (state: string) => void) => Unsubscribe;
  initialAppState: string;
  onSnapshot: (snapshot: ActivitySyncSnapshot) => void;
};

export type SyncTriggerController = {
  start: (initialOwnerId: string | null) => Promise<void>;
  onSession: (ownerId: string | null) => void;
  retryNow: () => Promise<void>;
  refreshQueue: () => Promise<void>;
  dispose: () => void;
};

const EMPTY_SNAPSHOT: ActivitySyncSnapshot = {
  ownerId: null,
  queued: [],
  issueCount: 0,
  otherAccountPendingCount: 0,
  status: 'recovering',
  recoveryError: null,
  syncError: null,
  error: null,
};

const LOAD_ERROR = 'Offline activities could not be loaded. Try again.';
const SYNC_ERROR = 'Activity upload could not be completed. Try again.';
const RECOVERY_ERROR = 'Offline activity recovery failed. Try again.';

export function createSyncTriggerController(
  dependencies: SyncTriggerControllerDependencies,
): SyncTriggerController {
  let active = true;
  let started = false;
  let ownerId: string | null = null;
  let ownerRevision = 0;
  let drainRevision = 0;
  let appState = dependencies.initialAppState;
  let online: boolean | null = null;
  let queued: QueuedActivity[] = [];
  let issueCount = 0;
  let otherAccountPendingCount = 0;
  let recoveryState: 'pending' | 'healthy' | 'error' = 'pending';
  let operationState: 'idle' | 'syncing' = 'idle';
  let recoveryError: string | null = null;
  let syncError: string | null = null;
  let recoveryPromise: Promise<boolean> | null = null;
  let refreshPromise: Promise<void> | null = null;
  let refreshRerunRequested = false;
  let pendingDrain: { ownerId: string; force: boolean } | null = null;
  let flushPromise: Promise<void> | null = null;
  const unsubscribers: Unsubscribe[] = [];
  let resolveDisposed!: () => void;
  const disposedPromise = new Promise<'disposed'>((resolve) => {
    resolveDisposed = () => resolve('disposed');
  });

  const publish = () => {
    if (!active) return;
    const error = recoveryError ?? syncError;
    const status: ActivitySyncStatus = error
      ? 'error'
      : recoveryState === 'pending'
        ? 'recovering'
        : operationState === 'syncing'
          ? 'syncing'
          : 'idle';
    dependencies.onSnapshot({
      ownerId,
      queued: [...queued],
      issueCount,
      otherAccountPendingCount,
      status,
      recoveryError,
      syncError,
      error,
    });
  };

  const clearOwnerDetails = () => {
    queued = [];
    issueCount = 0;
    otherAccountPendingCount = 0;
    operationState = 'idle';
    syncError = null;
    publish();
  };

  const refreshOnce = async (): Promise<void> => {
    const expectedOwner = ownerId;
    const expectedRevision = ownerRevision;
    if (!expectedOwner) {
      clearOwnerDetails();
      return;
    }

    try {
      const view = await dependencies.getOwnerQueueSnapshot(expectedOwner);
      if (
        !active ||
        ownerId !== expectedOwner ||
        ownerRevision !== expectedRevision
      ) {
        return;
      }

      queued = view.queued.filter(
        (entry) => entry.ownerId === expectedOwner,
      );
      issueCount = view.summary.issueCount;
      otherAccountPendingCount = view.summary.otherOwnerCount;
      syncError = null;
      publish();
    } catch {
      if (
        active &&
        ownerId === expectedOwner &&
        ownerRevision === expectedRevision
      ) {
        syncError = LOAD_ERROR;
        publish();
      }
    }
  };

  const refreshQueue = (): Promise<void> => {
    if (!active) return Promise.resolve();
    if (refreshPromise) {
      refreshRerunRequested = true;
      return refreshPromise;
    }

    const run = async () => {
      do {
        refreshRerunRequested = false;
        await refreshOnce();
      } while (active && refreshRerunRequested);
    };
    const pending = run().finally(() => {
      if (refreshPromise === pending) refreshPromise = null;
    });
    refreshPromise = pending;
    return pending;
  };

  const triggerDrain = async (
    expectedOwner: string,
    force: boolean,
  ): Promise<void> => {
    if (
      !active ||
      recoveryState !== 'healthy' ||
      ownerId !== expectedOwner
    ) {
      return;
    }
    const expectedOwnerRevision = ownerRevision;
    const expectedDrainRevision = ++drainRevision;
    operationState = 'syncing';
    syncError = null;
    publish();

    try {
      await dependencies.drain(expectedOwner, force);
      if (
        !active ||
        ownerId !== expectedOwner ||
        ownerRevision !== expectedOwnerRevision
      ) {
        return;
      }
      await refreshQueue();
      if (
        active &&
        ownerId === expectedOwner &&
        ownerRevision === expectedOwnerRevision &&
        drainRevision === expectedDrainRevision
      ) {
        operationState = 'idle';
        publish();
      }
    } catch {
      if (
        active &&
        ownerId === expectedOwner &&
        ownerRevision === expectedOwnerRevision &&
        drainRevision === expectedDrainRevision
      ) {
        await refreshQueue();
      }
      if (
        active &&
        ownerId === expectedOwner &&
        ownerRevision === expectedOwnerRevision &&
        drainRevision === expectedDrainRevision
      ) {
        operationState = 'idle';
        syncError = SYNC_ERROR;
        publish();
      }
    }
  };

  const flushPendingDrain = (): Promise<void> => {
    if (!active || recoveryState !== 'healthy') return Promise.resolve();
    if (flushPromise) return flushPromise;

    const run = async () => {
      while (active && recoveryState === 'healthy' && pendingDrain) {
        const request = pendingDrain;
        pendingDrain = null;
        if (ownerId !== request.ownerId) continue;
        await triggerDrain(request.ownerId, request.force);
      }
    };
    const pending = run().finally(() => {
      if (flushPromise === pending) flushPromise = null;
    });
    flushPromise = pending;
    return pending;
  };

  const requestDrain = (requestedOwner: string, force: boolean) => {
    if (!active || ownerId !== requestedOwner) return;
    pendingDrain = {
      ownerId: requestedOwner,
      force:
        force ||
        (pendingDrain?.ownerId === requestedOwner &&
          pendingDrain.force),
    };
    if (recoveryState === 'healthy') void flushPendingDrain();
  };

  const runRecovery = (force: boolean): Promise<boolean> => {
    if (!active) return Promise.resolve(false);
    if (recoveryPromise) return recoveryPromise;
    if (!force && recoveryState === 'healthy') return Promise.resolve(true);
    if (!force && recoveryState === 'error') return Promise.resolve(false);

    recoveryState = 'pending';
    recoveryError = null;
    publish();
    const attempt = Promise.resolve()
      .then(() => dependencies.recoverQueue())
      .then(
        () => 'success' as const,
        () => 'failure' as const,
      );
    const pending = Promise.race([attempt, disposedPromise]).then((result) => {
      if (!active || result === 'disposed') return false;
      if (result === 'failure') {
        recoveryState = 'error';
        recoveryError = RECOVERY_ERROR;
        operationState = 'idle';
        publish();
        return false;
      }
      recoveryState = 'healthy';
      recoveryError = null;
      publish();
      return true;
    }).finally(() => {
      if (recoveryPromise === pending) recoveryPromise = null;
    });
    recoveryPromise = pending;
    return pending;
  };

  const safeSubscribe = (subscribe: () => Unsubscribe) => {
    try {
      const unsubscribe = subscribe();
      if (typeof unsubscribe === 'function') {
        unsubscribers.push(unsubscribe);
      }
    } catch {
      // A missing platform event source must not prevent startup recovery.
    }
  };

  const onSession = (nextOwnerId: string | null) => {
    if (!active || ownerId === nextOwnerId) return;
    const force = pendingDrain?.force === true;
    ownerId = nextOwnerId;
    ownerRevision += 1;
    drainRevision += 1;
    pendingDrain = nextOwnerId
      ? { ownerId: nextOwnerId, force }
      : null;
    clearOwnerDetails();
    if (nextOwnerId && recoveryState === 'healthy') {
      void flushPendingDrain();
    }
  };

  const start = async (initialOwnerId: string | null): Promise<void> => {
    if (!active || started) return;
    started = true;
    ownerId = initialOwnerId;
    ownerRevision += 1;
    clearOwnerDetails();
    if (initialOwnerId) requestDrain(initialOwnerId, false);

    safeSubscribe(() =>
      dependencies.subscribeQueue(() => {
        if (active) void refreshQueue();
      }),
    );
    safeSubscribe(() =>
      dependencies.subscribeNetwork((state) => {
        if (!active) return;
        const nextOnline =
          state.isConnected === true &&
          state.isInternetReachable !== false;
        const wasOnline = online;
        online = nextOnline;
        if (wasOnline === false && nextOnline && ownerId) {
          requestDrain(ownerId, false);
        }
      }),
    );
    safeSubscribe(() =>
      dependencies.subscribeAppState((nextState) => {
        if (!active) return;
        const previousState = appState;
        appState = nextState;
        if (
          previousState !== 'active' &&
          nextState === 'active' &&
          ownerId
        ) {
          requestDrain(ownerId, false);
        }
      }),
    );

    const recovered = await runRecovery(false);
    if (!active || !recovered) return;
    await refreshQueue();
    await flushPendingDrain();
  };

  return {
    start,
    onSession,
    retryNow: async () => {
      if (!active) return;
      const currentOwner = ownerId;
      if (!currentOwner) {
        clearOwnerDetails();
        return;
      }
      pendingDrain = { ownerId: currentOwner, force: true };
      const recovered = await runRecovery(true);
      if (!active || !recovered) return;
      await refreshQueue();
      await flushPendingDrain();
    },
    refreshQueue,
    dispose: () => {
      if (!active) return;
      active = false;
      ownerId = null;
      ownerRevision += 1;
      drainRevision += 1;
      pendingDrain = null;
      resolveDisposed();
      for (const unsubscribe of unsubscribers.splice(0)) {
        try {
          unsubscribe();
        } catch {
          // Cleanup is best effort across native and web event adapters.
        }
      }
    },
  };
}

export type ActivitySyncContextValue = Omit<
  ActivitySyncSnapshot,
  'ownerId'
> & {
  otherAccountPendingIsApproximate: false;
  retryNow: () => Promise<void>;
  refreshQueue: () => Promise<void>;
};

const ActivitySyncContext = createContext<ActivitySyncContextValue | null>(
  null,
);

export function snapshotForOwner(
  snapshot: ActivitySyncSnapshot,
  currentOwnerId: string | null,
): ActivitySyncSnapshot {
  if (snapshot.ownerId === currentOwnerId) return snapshot;
  return {
    ...EMPTY_SNAPSHOT,
    ownerId: currentOwnerId,
    status: 'idle',
  };
}

export function ActivitySyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const [snapshot, setSnapshot] =
    useState<ActivitySyncSnapshot>(EMPTY_SNAPSHOT);
  const synchronizerRef =
    useRef<ReturnType<typeof createActivitySynchronizer> | null>(null);
  if (!synchronizerRef.current) {
    synchronizerRef.current = createActivitySynchronizer();
  }

  const controllerRef = useRef<SyncTriggerController | null>(null);
  const getController = useCallback(() => {
    if (!controllerRef.current) {
      controllerRef.current = createSyncTriggerController({
        recoverQueue,
        getOwnerQueueSnapshot,
        drain: (currentOwnerId, force) =>
          synchronizerRef.current!.drain(currentOwnerId, force),
        subscribeQueue: subscribeToQueue,
        subscribeNetwork: (listener) =>
          NetInfo.addEventListener((state) => listener(state)),
        subscribeAppState: (listener) => {
          const subscription = AppState.addEventListener(
            'change',
            listener as (state: AppStateStatus) => void,
          );
          return () => subscription.remove();
        },
        initialAppState: AppState.currentState ?? 'active',
        onSnapshot: setSnapshot,
      });
    }
    return controllerRef.current;
  }, []);

  useEffect(() => {
    const controller = getController();
    void controller.start(ownerId);
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
    // The controller receives later authentication changes below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getController]);

  useEffect(() => {
    getController().onSession(ownerId);
  }, [getController, ownerId]);

  const visibleSnapshot = snapshotForOwner(snapshot, ownerId);
  const value = useMemo<ActivitySyncContextValue>(
    () => {
      const { ownerId: _snapshotOwnerId, ...visible } = visibleSnapshot;
      return {
        ...visible,
        otherAccountPendingIsApproximate: false,
        retryNow: () => getController().retryNow(),
        refreshQueue: () => getController().refreshQueue(),
      };
    },
    [getController, visibleSnapshot],
  );

  return (
    <ActivitySyncContext.Provider value={value}>
      {children}
    </ActivitySyncContext.Provider>
  );
}

export function useActivitySync(): ActivitySyncContextValue {
  const value = useContext(ActivitySyncContext);
  if (!value) {
    throw new Error(
      'useActivitySync must be used within an ActivitySyncProvider.',
    );
  }
  return value;
}
