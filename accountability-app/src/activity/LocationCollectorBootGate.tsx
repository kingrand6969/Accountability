import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { AppLaunchState } from '../ui/AppLaunchState';
import {
  reconcileLocationCollectorAtBoot,
  type BootLocationReconciliationStatus,
} from './locationTask';

type Phase = 'checking' | 'ready' | 'error';

export function LocationCollectorBootGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(
    Platform.OS === 'web' ? 'ready' : 'checking',
  );
  const inFlightRef = useRef<Promise<BootLocationReconciliationStatus> | null>(null);

  const reconcile = useCallback(() => {
    if (!inFlightRef.current) {
      const request = Promise.resolve().then(reconcileLocationCollectorAtBoot);
      inFlightRef.current = request;
      const clear = () => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      };
      void request.then(clear, clear);
    }
    return inFlightRef.current!;
  }, []);

  const apply = useCallback((status: BootLocationReconciliationStatus) => {
    setPhase(
      status === 'running' || status === 'paused' || status === 'closing'
        ? 'ready'
        : 'error',
    );
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    void reconcile()
      .then((status) => {
        if (active) apply(status);
      })
      .catch(() => {
        if (active) setPhase('error');
      });
    return () => {
      active = false;
    };
  }, [apply, reconcile]);

  if (phase === 'ready') return children;
  if (phase === 'checking') {
    return <AppLaunchState message="Checking activity tracking" />;
  }
  return (
    <AppLaunchState
      message="We could not verify activity tracking is safe"
      error
      actionLabel="Try again"
      onAction={() => {
        setPhase('checking');
        void reconcile()
          .then(apply)
          .catch(() => setPhase('error'));
      }}
    />
  );
}
