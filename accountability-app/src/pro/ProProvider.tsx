import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);
  const userId = session?.user.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) {
      setIsPro(false);
      setLoading(false);
      return;
    }
    try {
      setIsPro(await fetchProStatus());
    } catch {
      // Keep the previous value on transient errors (same user only).
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // New user (or sign-out) — never carry Pro status across accounts.
    setIsPro(false);
    setLoading(true);
    refresh();
  }, [userId, refresh]);

  return (
    <ProContext.Provider value={{ isPro, loading, refresh }}>
      {children}
    </ProContext.Provider>
  );
}

export function useIsPro() {
  return useContext(ProContext);
}
