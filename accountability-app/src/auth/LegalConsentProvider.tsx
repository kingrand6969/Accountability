import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthProvider';
import {
  acceptCurrentLegalTerms,
  getLegalConsentVersion,
  isLegalConsentCurrent,
  subscribeToLegalConsentChanges,
} from './consent';

export type LegalConsentStatus = 'signed-out' | 'loading' | 'current' | 'required' | 'error';

type LegalConsentContextValue = Readonly<{
  status: LegalConsentStatus;
  acceptedVersion: string | null;
  accepting: boolean;
  error: string | null;
  accept: () => Promise<void>;
  retry: () => void;
}>;

type OwnerConsentState = Readonly<{
  ownerId: string | null;
  status: LegalConsentStatus;
  acceptedVersion: string | null;
  accepting: boolean;
  error: string | null;
}>;

const SIGNED_OUT_STATE: OwnerConsentState = {
  ownerId: null,
  status: 'signed-out',
  acceptedVersion: null,
  accepting: false,
  error: null,
};

const LegalConsentContext = createContext<LegalConsentContextValue>({
  ...SIGNED_OUT_STATE,
  accept: async () => {},
  retry: () => {},
});

export function LegalConsentProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const generationRef = useRef(0);
  const [state, setState] = useState<OwnerConsentState>(SIGNED_OUT_STATE);

  const load = useCallback(async () => {
    const generation = ++generationRef.current;
    if (!ownerId) {
      setState(SIGNED_OUT_STATE);
      return;
    }

    setState({
      ownerId,
      status: 'loading',
      acceptedVersion: null,
      accepting: false,
      error: null,
    });
    try {
      const acceptedVersion = await getLegalConsentVersion(ownerId);
      if (generation !== generationRef.current) return;
      setState({
        ownerId,
        status: isLegalConsentCurrent(acceptedVersion) ? 'current' : 'required',
        acceptedVersion,
        accepting: false,
        error: null,
      });
    } catch {
      if (generation !== generationRef.current) return;
      setState({
        ownerId,
        status: 'error',
        acceptedVersion: null,
        accepting: false,
        error: 'We could not check your legal agreement status. Check your connection and try again.',
      });
    }
  }, [ownerId]);

  useEffect(() => subscribeToLegalConsentChanges((changedOwnerId) => {
    if (ownerId !== changedOwnerId) return;
    void load();
  }), [load, ownerId]);

  useEffect(() => {
    const scheduledGeneration = generationRef.current;
    queueMicrotask(() => {
      if (scheduledGeneration === generationRef.current) void load();
    });
    return () => {
      generationRef.current += 1;
    };
  }, [load]);

  const accept = useCallback(async () => {
    if (!ownerId) return;
    const generation = ++generationRef.current;
    setState((current) => ({
      ownerId,
      status: current.ownerId === ownerId ? current.status : 'loading',
      acceptedVersion: current.ownerId === ownerId ? current.acceptedVersion : null,
      accepting: true,
      error: null,
    }));
    try {
      await acceptCurrentLegalTerms();
      const acceptedVersion = await getLegalConsentVersion(ownerId);
      if (generation !== generationRef.current) return;
      if (!isLegalConsentCurrent(acceptedVersion)) {
        throw new Error('Consent refresh did not return the current version.');
      }
      setState({
        ownerId,
        status: 'current',
        acceptedVersion,
        accepting: false,
        error: null,
      });
    } catch {
      if (generation !== generationRef.current) return;
      setState((current) => ({
        ownerId,
        status: 'required',
        acceptedVersion: current.ownerId === ownerId ? current.acceptedVersion : null,
        accepting: false,
        error: 'We could not save your acceptance. Check your connection and try again.',
      }));
    }
  }, [ownerId]);

  const value = useMemo<LegalConsentContextValue>(() => {
    const visibleState = ownerId && state.ownerId !== ownerId
      ? {
          status: 'loading' as const,
          acceptedVersion: null,
          accepting: false,
          error: null,
        }
      : state;
    return {
      status: visibleState.status,
      acceptedVersion: visibleState.acceptedVersion,
      accepting: visibleState.accepting,
      error: visibleState.error,
      accept,
      retry: () => { void load(); },
    };
  }, [accept, load, ownerId, state]);

  return <LegalConsentContext.Provider value={value}>{children}</LegalConsentContext.Provider>;
}

export function useLegalConsent(): LegalConsentContextValue {
  return useContext(LegalConsentContext);
}
