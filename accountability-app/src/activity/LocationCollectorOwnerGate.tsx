import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { AppLaunchState } from '../ui/AppLaunchState';
import {
  reconcileLocationCollectorForOwner,
  type BootLocationReconciliationStatus as ReconciliationStatus,
} from './locationTask';

const SIGNED_OUT_KEY = '__signed_out__';

function ownerKey(ownerId: string | null) {
  return ownerId ?? SIGNED_OUT_KEY;
}

type Result = Readonly<{
  key: string;
  intent: Readonly<{ key: string }>;
  phase: 'ready' | 'error';
}>;

function reconciliationPhase(status: ReconciliationStatus): Result['phase'] {
  return status === 'running' || status === 'paused' || status === 'closing'
    ? 'ready'
    : 'error';
}

export function LocationCollectorOwnerGate({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { session, loading } = useAuth();
  const ownerId = session?.user.id ?? null;
  const key = ownerKey(ownerId);
  // A fresh committed key transition gets a distinct token even when an
  // account changes A -> B -> A before the first A promise has settled.
  const intent = useMemo(() => ({ key }), [key]);
  const [result, setResult] = useState<Result | null>(
    Platform.OS === 'web' ? { key, intent, phase: 'ready' } : null,
  );
  const inFlightRef = useRef(
    new Map<Readonly<{ key: string }>, Promise<ReconciliationStatus>>(),
  );

  const reconcile = useCallback((
    expectedOwnerId: string | null,
    expectedIntent: Readonly<{ key: string }>,
  ) => {
    const existing = inFlightRef.current.get(expectedIntent);
    if (existing) return existing;
    const request = Promise.resolve().then(() =>
      reconcileLocationCollectorForOwner(expectedOwnerId),
    );
    inFlightRef.current.set(expectedIntent, request);
    const clear = () => {
      if (inFlightRef.current.get(expectedIntent) === request) {
        inFlightRef.current.delete(expectedIntent);
      }
    };
    void request.then(clear, clear);
    return request;
  }, []);

  const begin = useCallback((
    expectedOwnerId: string | null,
    expectedIntent: Readonly<{ key: string }>,
  ) => {
    const expectedKey = ownerKey(expectedOwnerId);
    return reconcile(expectedOwnerId, expectedIntent).then((status) => {
      setResult((current) => current && current.intent !== expectedIntent
        ? current
        : {
            key: expectedKey,
            intent: expectedIntent,
            phase: reconciliationPhase(status),
          });
    });
  }, [reconcile]);

  // Issue the new owner intent during commit so an older async reconciliation
  // cannot activate its collector in the gap before a normal effect runs.
  useLayoutEffect(() => {
    if (!enabled || Platform.OS === 'web' || loading) return;
    let active = true;
    void reconcile(ownerId, intent)
      .then((status) => {
        if (!active) return;
        setResult({
          key,
          intent,
          phase: reconciliationPhase(status),
        });
      })
      .catch(() => {
        if (active) setResult({ key, intent, phase: 'error' });
      });
    return () => {
      active = false;
    };
  }, [enabled, intent, key, loading, ownerId, reconcile]);

  if (!enabled || Platform.OS === 'web') return children;
  if (
    !loading &&
    result?.key === key &&
    result.intent === intent &&
    result.phase === 'ready'
  ) return children;

  if (
    !loading &&
    result?.key === key &&
    result.intent === intent &&
    result.phase === 'error'
  ) {
    return (
      <AppLaunchState
        message="We could not verify activity tracking is safe"
        error
        actionLabel="Try again"
        onAction={() => {
          const expectedKey = key;
          const expectedIntent = intent;
          setResult(null);
          void begin(ownerId, expectedIntent).catch(() => {
            setResult((current) => current && current.intent !== expectedIntent
              ? current
              : {
                  key: expectedKey,
                  intent: expectedIntent,
                  phase: 'error',
                });
          });
        }}
      />
    );
  }

  return <AppLaunchState message="Checking activity tracking" />;
}
