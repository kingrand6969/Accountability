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
  listQueueIssues,
  listQueuedActivities,
  recoverQueue,
  subscribeToQueue,
  type QueueIssue,
  type QueueRecoverySummary,
} from './offlineQueueStore';
import type { QueuedActivity } from './offlineQueueTypes';

export type ActivitySyncStatus = 'idle' | 'syncing' | 'error';

export type ActivitySyncSnapshot = {
  queued: QueuedActivity[];
  issueCount: number;
  otherAccountPendingCount: number;
  status: ActivitySyncStatus;
  error: string | null;
};

type NetworkState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

type Unsubscribe = () => void;

export type SyncTriggerControllerDependencies = {
  recoverQueue: () => Promise<QueueRecoverySummary>;
  listQueuedActivities: (ownerId: string) => Promise<QueuedActivity[]>;
  listQueueIssues: () => Promise<QueueIssue[]>;
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
  queued: [],
  issueCount: 0,
  otherAccountPendingCount: 0,
  status: 'idle',
  error: null,
};

const LOAD_ERROR = 'Offline activities could not be loaded. Try again.';
const SYNC_ERROR = 'Activity upload could not be completed. Try again.';

/**
 * Coordinates sync triggers without importing React Native APIs. The recovery
 * total is intentionally used only to derive an approximate, redacted count:
 * queue writes can race this snapshot, and the store never enumerates another
 * owner's entries for this provider.
 */
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
  let recoveredQueuedCount = 0;
  let snapshot: ActivitySyncSnapshot = { ...EMPTY_SNAPSHOT };
  const unsubscribers: Unsubscribe[] = [];

  const publish = (patch: Partial<ActivitySyncSnapshot>) => {
    if (!active) return;
    snapshot = {
      ...snapshot,
      ...patch,
      queued: patch.queued ? [...patch.queued] : snapshot.queued,
    };
    dependencies.onSnapshot(snapshot);
  };

  const publishSignedOut = () => {
    publish({
      queued: [],
      issueCount: 0,
      otherAccountPendingCount: 0,
      status: 'idle',
      error: null,
    });
  };

  const refreshQueue = async (): Promise<void> => {
    if (!active) return;
    const expectedOwner = ownerId;
    const expectedRevision = ownerRevision;
    if (!expectedOwner) {
      publishSignedOut();
      return;
    }

    try {
      const [listed, issues] = await Promise.all([
        dependencies.listQueuedActivities(expectedOwner),
        dependencies.listQueueIssues(),
      ]);
      if (
        !active ||
        ownerId !== expectedOwner ||
        ownerRevision !== expectedRevision
      ) {
        return;
      }

      const currentOwnerEntries = listed.filter(
        (entry) => entry.ownerId === expectedOwner,
      );
      publish({
        queued: currentOwnerEntries,
        issueCount: issues.length,
        otherAccountPendingCount: Math.max(
          0,
          recoveredQueuedCount - currentOwnerEntries.length,
        ),
        error: null,
      });
    } catch {
      if (
        active &&
        ownerId === expectedOwner &&
        ownerRevision === expectedRevision
      ) {
        publish({ status: 'error', error: LOAD_ERROR });
      }
    }
  };

  const triggerDrain = async (
    expectedOwner: string,
    force: boolean,
  ): Promise<void> => {
    if (!active || ownerId !== expectedOwner) return;
    const expectedOwnerRevision = ownerRevision;
    const expectedDrainRevision = ++drainRevision;
    publish({ status: 'syncing', error: null });

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
        drainRevision === expectedDrainRevision &&
        snapshot.status !== 'error'
      ) {
        publish({ status: 'idle', error: null });
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
        publish({ status: 'error', error: SYNC_ERROR });
      }
    }
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
    ownerId = nextOwnerId;
    ownerRevision += 1;
    drainRevision += 1;
    publishSignedOut();

    if (nextOwnerId) {
      void triggerDrain(nextOwnerId, false);
    }
  };

  const start = async (initialOwnerId: string | null): Promise<void> => {
    if (!active || started) return;
    started = true;
    ownerId = initialOwnerId;
    ownerRevision += 1;
    const startupOwner = initialOwnerId;

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
          void triggerDrain(ownerId, false);
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
          void triggerDrain(ownerId, false);
        }
      }),
    );

    try {
      const recovery = await dependencies.recoverQueue();
      if (!active) return;
      recoveredQueuedCount = recovery.queuedCount;
    } catch {
      if (active) publish({ status: 'error', error: LOAD_ERROR });
    }

    if (!active) return;
    if (startupOwner && ownerId === startupOwner) {
      await triggerDrain(startupOwner, false);
    } else if (ownerId === startupOwner) {
      await refreshQueue();
    }
  };

  return {
    start,
    onSession,
    retryNow: async () => {
      if (!active) return;
      const currentOwner = ownerId;
      if (!currentOwner) {
        publishSignedOut();
        return;
      }
      await triggerDrain(currentOwner, true);
    },
    refreshQueue,
    dispose: () => {
      if (!active) return;
      active = false;
      ownerId = null;
      ownerRevision += 1;
      drainRevision += 1;
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

export type ActivitySyncContextValue = ActivitySyncSnapshot & {
  /**
   * True because the redacted aggregate is derived from a startup recovery
   * count and may race later queue writes.
   */
  otherAccountPendingIsApproximate: true;
  retryNow: () => Promise<void>;
  refreshQueue: () => Promise<void>;
};

const ActivitySyncContext = createContext<ActivitySyncContextValue | null>(
  null,
);

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
        listQueuedActivities,
        listQueueIssues,
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

  const value = useMemo<ActivitySyncContextValue>(
    () => ({
      ...snapshot,
      otherAccountPendingIsApproximate: true,
      retryNow: () => getController().retryNow(),
      refreshQueue: () => getController().refreshQueue(),
    }),
    [getController, snapshot],
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
