export const PROOF_ACTIONS = [
  'post-feed',
  'share-external',
  'save-phone',
  'save-memories',
] as const;

export type ProofAction = (typeof PROOF_ACTIONS)[number];
export type ProofActionStatus =
  | 'idle'
  | 'working'
  | 'success'
  | 'error'
  | 'ambiguous'
  | 'unavailable'
  | 'unresolved';

export type ProofActionItem = Readonly<{
  status: ProofActionStatus;
  message?: string;
  operationId?: string;
}>;

export type ProofActionState = Readonly<Record<ProofAction, ProofActionItem>>;

export type ProofActionEvent =
  | { type: 'begin'; action: ProofAction; operationId?: string }
  | { type: 'success'; action: ProofAction }
  | { type: 'error'; action: ProofAction; message: string }
  | { type: 'ambiguous'; action: ProofAction; operationId: string; message: string }
  | { type: 'unresolved'; action: ProofAction; operationId: string; message: string }
  | { type: 'unavailable'; action: ProofAction; message: string }
  | { type: 'reset'; action: ProofAction };

export function initialProofActionState(): ProofActionState {
  return Object.fromEntries(
    PROOF_ACTIONS.map((action) => [action, { status: 'idle' }]),
  ) as unknown as ProofActionState;
}

export function proofActionReducer(
  state: ProofActionState,
  event: ProofActionEvent,
): ProofActionState {
  const current = state[event.action];
  if (event.type === 'begin' && current.status === 'working') return state;

  let next: ProofActionItem;
  switch (event.type) {
    case 'begin':
      next = { status: 'working', operationId: event.operationId };
      break;
    case 'success':
      next = { status: 'success' };
      break;
    case 'error':
      next = { status: 'error', message: event.message };
      break;
    case 'ambiguous':
      next = {
        status: 'ambiguous',
        operationId: event.operationId,
        message: event.message,
      };
      break;
    case 'unresolved':
      next = {
        status: 'unresolved',
        operationId: event.operationId,
        message: event.message,
      };
      break;
    case 'unavailable':
      next = { status: 'unavailable', message: event.message };
      break;
    case 'reset':
      next = { status: 'idle' };
      break;
  }
  return { ...state, [event.action]: next };
}

export type ShareAvailability =
  | { status: 'available' }
  | { status: 'unavailable'; message: string };

export function shareAvailability(
  platform: string,
  available: boolean,
): ShareAvailability {
  if (platform === 'web') {
    return {
      status: 'unavailable',
      message: 'Open this Daily Proof on your phone to share the image.',
    };
  }
  if (!available) {
    return {
      status: 'unavailable',
      message: 'Image sharing is not available on this device.',
    };
  }
  return { status: 'available' };
}

export function isProofActionBusy(state: ProofActionState, action: ProofAction): boolean {
  return state[action].status === 'working';
}

export function canRetryProofAction(item: ProofActionItem): boolean {
  return item.status === 'error' || item.status === 'unavailable';
}

export function safeProofActionMessage(kind: 'capture' | 'permission' | 'dispatch'): string {
  if (kind === 'capture') return 'Could not prepare the Daily Proof image. Please try again.';
  if (kind === 'permission') return 'Photo access is needed to save this Daily Proof.';
  return 'This action could not be completed. Please try again.';
}

export type ProofActionToken = Readonly<{
  ownerId: string | null;
  generation: number;
  action: ProofAction;
  nonce: number;
}>;

export type ProofActionSession = {
  ownerId: string | null;
  generation: number;
  nonce: number;
  flights: Map<ProofAction, ProofActionToken>;
};

export function createProofActionSession(ownerId: string | null = null): ProofActionSession {
  return { ownerId, generation: 0, nonce: 0, flights: new Map() };
}

export function rotateProofActionSession(
  session: ProofActionSession,
  ownerId: string | null,
): void {
  session.ownerId = ownerId;
  session.generation += 1;
  // Replace rather than clear: an old generation's finally block retains a
  // reference only to its token and can never remove a new generation's lock.
  session.flights = new Map();
}

export function tryBeginProofAction(
  session: ProofActionSession,
  action: ProofAction,
): ProofActionToken | null {
  if (session.flights.has(action)) return null;
  const token: ProofActionToken = {
    ownerId: session.ownerId,
    generation: session.generation,
    action,
    nonce: ++session.nonce,
  };
  session.flights.set(action, token);
  return token;
}

export function isCurrentProofActionToken(
  session: ProofActionSession,
  token: ProofActionToken,
): boolean {
  return session.ownerId === token.ownerId &&
    session.generation === token.generation &&
    session.flights.get(token.action) === token;
}

export function endProofAction(
  session: ProofActionSession,
  token: ProofActionToken,
): void {
  if (isCurrentProofActionToken(session, token)) {
    session.flights.delete(token.action);
  }
}

export async function isOwnedProofActionToken(
  session: ProofActionSession,
  token: ProofActionToken,
  getAuthenticatedOwnerId: () => Promise<string | null>,
): Promise<boolean> {
  if (!token.ownerId || !isCurrentProofActionToken(session, token)) return false;
  const authenticatedOwnerId = await getAuthenticatedOwnerId();
  return authenticatedOwnerId === token.ownerId &&
    isCurrentProofActionToken(session, token);
}

export type AsyncSerialQueue = {
  run<T>(work: () => Promise<T>): Promise<T>;
};

export function createAsyncSerialQueue(): AsyncSerialQueue {
  let tail: Promise<void> = Promise.resolve();
  return {
    async run<T>(work: () => Promise<T>): Promise<T> {
      const prior = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => { release = resolve; });
      await prior.catch(() => {});
      try {
        return await work();
      } finally {
        release();
      }
    },
  };
}
