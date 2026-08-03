import { useReducer, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { getHomeStats, type HomeStats } from '../home/api';
import { supabase } from '../lib/supabase';
import {
  createAsyncSerialQueue,
  createProofActionSession,
  endProofAction,
  initialProofActionState,
  isCurrentProofActionToken,
  isOwnedProofActionToken,
  proofActionReducer,
  rotateProofActionSession,
  tryBeginProofAction,
  type ProofAction,
  type ProofActionToken,
} from './proofActions';
import {
  appendPendingProofAction,
  buildProofFingerprint,
  clearPendingProofAction,
  createPendingProofAction,
  loadPendingProofActions,
  remainingPendingForAction,
  type DurableProofAction,
  type PendingProofActionV1,
} from './pendingProofActions';
import { withProofLoadTimeout } from './proofLoadTimeout';

export function useProofActionOrchestrator() {
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionState, dispatchAction] = useReducer(
    proofActionReducer,
    undefined,
    initialProofActionState,
  );
  const [pendingActions, setPendingActions] = useState<PendingProofActionV1[]>([]);
  const ownerIdRef = useRef<string | null>(null);
  const actionSessionRef = useRef(createProofActionSession());
  const captureQueueRef = useRef(createAsyncSerialQueue());
  const mountedRef = useRef(true);

  function beginAction(action: ProofAction): ProofActionToken | null {
    const token = tryBeginProofAction(actionSessionRef.current, action);
    if (!token) return null;
    dispatchAction({ type: 'begin', action });
    return token;
  }

  function endAction(token: ProofActionToken) {
    endProofAction(actionSessionRef.current, token);
  }

  function isCurrentAction(token: ProofActionToken): boolean {
    return mountedRef.current && isCurrentProofActionToken(actionSessionRef.current, token);
  }

  function mutateForToken(token: ProofActionToken, mutation: () => void) {
    if (isCurrentAction(token)) mutation();
  }

  function setActionOwner(ownerId: string | null) {
    if (ownerIdRef.current === ownerId && actionSessionRef.current.ownerId === ownerId) return;
    ownerIdRef.current = ownerId;
    rotateProofActionSession(actionSessionRef.current, ownerId);
    setStats(null);
    setLoadError(false);
    setPendingActions([]);
    for (const action of ['post-feed', 'share-external', 'save-phone', 'save-memories'] as const) {
      dispatchAction({ type: 'reset', action });
    }
  }

  async function loadOwnerView(ownerId: string) {
    const generation = actionSessionRef.current.generation;
    setLoadError(false);
    const loadResult = await withProofLoadTimeout(Promise.all([
      getHomeStats().catch(() => null),
      loadPendingProofActions(ownerId, AsyncStorage).catch(() => []),
    ]));
    if (
      !mountedRef.current ||
      ownerIdRef.current !== ownerId ||
      actionSessionRef.current.ownerId !== ownerId ||
      actionSessionRef.current.generation !== generation
    ) return;
    if (loadResult.status === 'timeout') {
      setLoadError(true);
      return;
    }
    const [nextStats, pending] = loadResult.value;
    if (!nextStats) {
      setLoadError(true);
      return;
    }
    setStats(nextStats);
    setPendingActions(pending);
    for (const entry of pending) {
      dispatchAction({
        type: 'unresolved',
        action: entry.action,
        operationId: entry.operationId,
        message: entry.action === 'save-memories'
          ? 'Check Memories or discard the pending save.'
          : 'Check Feed or discard the pending post.',
      });
    }
  }

  async function retryLoad() {
    const ownerId = ownerIdRef.current;
    if (ownerId) await loadOwnerView(ownerId);
  }

  function markLoadError() {
    setLoadError(true);
  }

  async function journalDurableAction(
    token: ProofActionToken,
    action: DurableProofAction,
    image: string,
    headline: string,
    isFileUri = false,
  ): Promise<PendingProofActionV1> {
    const ownerId = token.ownerId;
    if (!ownerId) throw new Error('Not signed in.');
    if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
    const imageBytes = isFileUri ? await new File(image).bytes() : base64ToBytes(image);
    if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
    const imageSha256 = arrayBufferToHex(
      await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        imageBytes.buffer.slice(
          imageBytes.byteOffset,
          imageBytes.byteOffset + imageBytes.byteLength,
        ) as ArrayBuffer,
      ),
    );
    if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
    const fingerprintResult = await buildProofFingerprint(
      { ownerId, action, imageSha256, headline },
      (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
    );
    if (!await requireCurrentActionOwner(token)) throw new Error('Account changed.');
    const entry = createPendingProofAction({
      operationId: Crypto.randomUUID(),
      ownerId,
      action,
      fingerprint: fingerprintResult.fingerprint,
      imageSha256,
      headline,
    });
    const recorded = await appendPendingProofAction(entry, AsyncStorage);
    if (!await requireCurrentActionOwner(token)) {
      await clearPendingProofAction(recorded.ownerId, recorded.operationId, AsyncStorage);
      throw new Error('Account changed.');
    }
    return recorded;
  }

  async function confirmDurableAction(entry: PendingProofActionV1) {
    await clearPendingProofAction(entry.ownerId, entry.operationId, AsyncStorage);
    if (ownerIdRef.current === entry.ownerId) {
      setPendingActions((current) =>
        current.filter((item) => item.operationId !== entry.operationId));
    }
  }

  function retainAmbiguous(token: ProofActionToken, entry: PendingProofActionV1, text: string) {
    mutateForToken(token, () => {
      setPendingActions((current) =>
        current.some((item) => item.operationId === entry.operationId)
          ? current
          : [...current, entry]);
      dispatchAction({
        type: 'ambiguous',
        action: entry.action,
        operationId: entry.operationId,
        message: text,
      });
      Alert.alert(
        entry.action === 'save-memories' ? 'Save status uncertain' : 'Post status uncertain',
        text,
      );
    });
  }

  async function discardPending(entry: PendingProofActionV1) {
    if (ownerIdRef.current !== entry.ownerId) return;
    await clearPendingProofAction(entry.ownerId, entry.operationId, AsyncStorage);
    if (ownerIdRef.current !== entry.ownerId) return;
    setPendingActions((current) => {
      const remaining = current.filter((item) => item.operationId !== entry.operationId);
      const sameAction = remainingPendingForAction(current, entry.operationId, entry.action);
      dispatchAction(sameAction
        ? {
            type: 'unresolved',
            action: entry.action,
            operationId: sameAction.operationId,
            message: entry.action === 'save-memories'
              ? 'Check Memories or discard the pending save.'
              : 'Check Feed or discard the pending post.',
          }
        : { type: 'reset', action: entry.action });
      return remaining;
    });
  }

  async function requireCurrentActionOwner(token: ProofActionToken): Promise<boolean> {
    return isOwnedProofActionToken(
      actionSessionRef.current,
      token,
      async () => {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
      },
    );
  }

  return {
    stats,
    loadError,
    actionState,
    dispatchAction,
    pendingActions,
    ownerIdRef,
    captureQueueRef,
    mountedRef,
    setActionOwner,
    loadOwnerView,
    retryLoad,
    markLoadError,
    beginAction,
    endAction,
    isCurrentAction,
    mutateForToken,
    journalDurableAction,
    confirmDurableAction,
    retainAmbiguous,
    discardPending,
    requireCurrentActionOwner,
  };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function arrayBufferToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
