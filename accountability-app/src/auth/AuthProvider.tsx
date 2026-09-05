import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearPrivateMediaCache } from '../media/privateMedia';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let authEventSeen = false;

    clearPrivateMediaCache();

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (alive && !authEventSeen) {
          clearPrivateMediaCache();
          setSession(data.session);
        }
      })
      .catch(() => {
        // A temporary storage/network failure must not leave the launch screen
        // mounted forever. The auth subscription can still recover later.
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      authEventSeen = true;
      if (!alive) return;
      clearPrivateMediaCache();
      setSession(next);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
