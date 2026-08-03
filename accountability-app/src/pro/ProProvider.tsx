import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthProvider';
import { fetchProStatus } from './api';

type ProContextValue = {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const ProContext = createContext<ProContextValue>({
  isPro: false,
  loading: true,
  refresh: async () => {},
});

export function ProProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<{
    userId: string | null;
    isPro: boolean;
    loading: boolean;
  }>({ userId: null, isPro: false, loading: true });
  const refreshGeneration = useRef(0);

  // A status belonging to a previous account is never exposed during a switch.
  const isPro = status.userId === userId ? status.isPro : false;
  const loading = status.userId === userId ? status.loading : true;

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;
    const requestUserId = userId;
    if (!requestUserId) {
      await Promise.resolve();
      if (refreshGeneration.current === generation) {
        setStatus({ userId: null, isPro: false, loading: false });
      }
      return;
    }

    try {
      const next = await fetchProStatus();
      if (refreshGeneration.current === generation) {
        setStatus({ userId: requestUserId, isPro: next, loading: false });
      }
    } catch {
      if (refreshGeneration.current === generation) {
        setStatus((current) =>
          current.userId === requestUserId
            ? { ...current, loading: false }
            : { userId: requestUserId, isPro: false, loading: false },
        );
      }
    }
  }, [userId]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  return (
    <ProContext.Provider value={{ isPro, loading, refresh }}>
      {children}
    </ProContext.Provider>
  );
}

export function useIsPro() {
  return useContext(ProContext);
}
