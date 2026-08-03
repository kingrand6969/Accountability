import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { colors, font, radius, spacing } from '../ui/theme';

type Props = {
  visible: boolean;
  sending: boolean;
  ownerId?: string;
  postId?: string;
  generation?: number;
  onClose(): void;
  onSend(uri: string, durationMs: number): Promise<void>;
};

export type RecorderOperationToken = {
  ownerId: string;
  postId: string;
  generation: number;
  operation: number;
};
type RecorderView = Omit<RecorderOperationToken, 'operation'> & { visible: boolean };
type RecorderLock = 'start' | 'send';

export class RecorderLifecycleController {
  private view: RecorderView;
  private operation = 0;
  private locks: Partial<Record<RecorderLock, RecorderOperationToken>> = {};
  private origin: RecorderOperationToken | null = null;
  private mounted = true;

  constructor(view: RecorderView) {
    this.view = { ...view };
  }

  update(view: RecorderView) {
    if (view.visible !== this.view.visible || view.ownerId !== this.view.ownerId
      || view.postId !== this.view.postId || view.generation !== this.view.generation) {
      this.invalidate();
      this.view = { ...view };
    }
  }

  beginStart() { return this.begin('start'); }
  beginSend() { return this.begin('send'); }

  private begin(kind: RecorderLock) {
    if (!this.mounted || !this.view.visible || this.locks[kind]) return null;
    const token = {
      ownerId: this.view.ownerId,
      postId: this.view.postId,
      generation: this.view.generation,
      operation: ++this.operation,
    };
    this.locks[kind] = token;
    return token;
  }

  owns(token: RecorderOperationToken, kind: RecorderLock) {
    const current = this.locks[kind];
    return !!current && this.mounted && this.view.visible
      && recorderCompletionBelongsToView(token, current, true)
      && token.ownerId === this.view.ownerId && token.postId === this.view.postId
      && token.generation === this.view.generation;
  }

  release(token: RecorderOperationToken, kind: RecorderLock) {
    if (!this.owns(token, kind)) return false;
    delete this.locks[kind];
    if (kind === 'start' && this.origin?.operation === token.operation) this.origin = null;
    return true;
  }

  markRecording(token: RecorderOperationToken) {
    if (!this.owns(token, 'start')) return false;
    this.origin = token;
    return true;
  }

  recordingOrigin() { return this.origin; }

  finishRecording(token: RecorderOperationToken) {
    if (!this.owns(token, 'start') || this.origin?.operation !== token.operation) return false;
    this.origin = null;
    delete this.locks.start;
    return true;
  }

  invalidate() {
    this.operation += 1;
    this.locks = {};
    this.origin = null;
  }

  unmount() {
    this.mounted = false;
    this.invalidate();
  }
}

export async function runOwnedRecorderStep(
  controller: RecorderLifecycleController,
  token: RecorderOperationToken,
  kind: RecorderLock,
  operation: () => Promise<void>,
  releaseOnError = true,
): Promise<{ status: 'success' | 'error' | 'stale'; error?: string }> {
  if (!controller.owns(token, kind)) return { status: 'stale' };
  try {
    await operation();
    return controller.owns(token, kind) ? { status: 'success' } : { status: 'stale' };
  } catch (cause) {
    if (!controller.owns(token, kind)) return { status: 'stale' };
    if (releaseOnError) controller.release(token, kind);
    return { status: 'error', error: String((cause as Error).message ?? cause) };
  }
}

export function armRecorderAutoStop(
  stop: () => void,
  schedule: (callback: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
) {
  return schedule(stop, 9_950);
}

export async function safelyStopInterruptedRecording(
  recording: { current: boolean },
  finalizing: { current: boolean },
  stop: () => Promise<void>,
) {
  if (!recording.current || finalizing.current) return false;
  finalizing.current = true;
  try {
    await stop();
  } catch {
    // Interruption is best-effort; the invalidated token forbids UI mutation.
  } finally {
    recording.current = false;
    finalizing.current = false;
  }
  return true;
}

export function recorderCompletionBelongsToView(
  token: RecorderOperationToken,
  current: RecorderOperationToken,
  mounted: boolean,
) {
  return mounted
    && token.ownerId === current.ownerId
    && token.postId === current.postId
    && token.generation === current.generation
    && token.operation === current.operation;
}

export function recorderPermissionMessage(state: 'denied' | 'blocked') {
  return state === 'blocked'
    ? 'Microphone access is blocked. Enable it in device settings, or write a text encouragement instead.'
    : 'Microphone access was not allowed. You can write a text encouragement instead.';
}

export function recorderPermissionState(
  permission?: { granted: boolean; canAskAgain: boolean },
): 'unasked' | 'granted' | 'denied' | 'blocked' {
  if (!permission) return 'unasked';
  if (permission.granted) return 'granted';
  return permission.canAskAgain ? 'denied' : 'blocked';
}

export function VoiceEncouragementRecorder({
  visible,
  sending,
  ownerId = '',
  postId = '',
  generation = 0,
  onClose,
  onSend,
}: Props) {
  const recorder = useAudioRecorder(RecordingPresets.LOW_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 100);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const uploadPendingRef = useRef(false);
  const [interruptionPending, setInterruptionPending] = useState(false);
  const interruptionPendingRef = useRef(false);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingRef = useRef(false);
  const durationRef = useRef(0);
  const finalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const operationGeneration = useRef(0);
  const viewRef = useRef({ ownerId, postId, generation });
  const lifecycle = useRef(new RecorderLifecycleController({ visible, ownerId, postId, generation }));

  useEffect(() => {
    const oldOrigin = lifecycle.current.recordingOrigin();
    lifecycle.current.update({ visible, ownerId, postId, generation });
    viewRef.current = { ownerId, postId, generation };
    operationGeneration.current += 1;
    if (oldOrigin) {
      interruptionPendingRef.current = true;
      setInterruptionPending(true);
      void safelyStopInterruptedRecording(recordingRef, finalizingRef, () => recorder.stop()).finally(() => {
        interruptionPendingRef.current = false;
        if (mountedRef.current) setInterruptionPending(false);
      });
    }
    player.pause();
    queueMicrotask(() => {
      if (!mountedRef.current) return;
      setPreviewUri(null);
      setDurationMs(0);
      setError(null);
      setUploadPending(false);
      uploadPendingRef.current = false;
    });
  }, [generation, ownerId, player, postId, recorder, visible]);

  useEffect(() => {
    const controller = lifecycle.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGeneration.current += 1;
      const origin = controller.recordingOrigin();
      controller.unmount();
      if (origin) {
        interruptionPendingRef.current = true;
        void safelyStopInterruptedRecording(recordingRef, finalizingRef, () => recorder.stop()).finally(() => {
          interruptionPendingRef.current = false;
        });
      }
      player.pause();
    };
  }, [player, recorder]);

  useEffect(() => {
    recordingRef.current = recorderState.isRecording;
    durationRef.current = recorderState.durationMillis;
  }, [recorderState.durationMillis, recorderState.isRecording]);

  const stop = useCallback(async () => {
    if (finalizingRef.current) return;
    const token = lifecycle.current.recordingOrigin();
    if (!token) return;
    finalizingRef.current = true;
    if (stopTimer.current) clearTimeout(stopTimer.current);
    try {
      if (recordingRef.current) {
        const stopped = await runOwnedRecorderStep(
          lifecycle.current,
          token,
          'start',
          () => recorder.stop(),
          false,
        );
        if (stopped.status !== 'success') {
          if (stopped.status === 'error') setError(`${stopped.error} You can retry or discard.`);
          return;
        }
      }
      const uri = recorder.uri;
      const duration = Math.min(10_000, Math.max(250, durationRef.current));
      if (!uri) {
        lifecycle.current.release(token, 'start');
        setError('The recording could not be prepared. Please try again.');
        return;
      }
      recordingRef.current = false;
      const restored = await runOwnedRecorderStep(
        lifecycle.current,
        token,
        'start',
        () => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }),
      );
      if (restored.status !== 'success') {
        if (restored.status === 'error') setError(`${restored.error} You can retry or discard.`);
        return;
      }
      lifecycle.current.finishRecording(token);
      setPreviewUri(uri);
      setDurationMs(duration);
      player.replace(uri);
    } catch (cause) {
      if (lifecycle.current.owns(token, 'start')) {
        lifecycle.current.release(token, 'start');
        setError(`${String((cause as Error).message ?? cause)} You can retry or discard.`);
      }
    } finally {
      finalizingRef.current = false;
    }
  }, [player, recorder]);

  async function start() {
    if (interruptionPendingRef.current || finalizingRef.current) return;
    const token = lifecycle.current.beginStart();
    if (!token) return;
    setError(null);
    setPreviewUri(null);
    const owns = () => lifecycle.current.owns(token, 'start');
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!owns()) return;
      if (!permission.granted) {
        lifecycle.current.release(token, 'start');
        const state = recorderPermissionState(permission);
        setError(recorderPermissionMessage(state === 'blocked' ? 'blocked' : 'denied'));
        return;
      }
      const mode = await runOwnedRecorderStep(
        lifecycle.current,
        token,
        'start',
        () => setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }),
      );
      if (mode.status !== 'success') {
        if (mode.status === 'error') setError(`${mode.error} You can retry or discard.`);
        return;
      }
      const prepared = await runOwnedRecorderStep(
        lifecycle.current,
        token,
        'start',
        () => recorder.prepareToRecordAsync(),
      );
      if (prepared.status !== 'success') {
        if (prepared.status === 'error') setError(`${prepared.error} You can retry or discard.`);
        return;
      }
      recorder.record({ forDuration: 10 });
      if (!lifecycle.current.markRecording(token)) return;
      recordingRef.current = true;
      durationRef.current = 0;
      stopTimer.current = armRecorderAutoStop(() => { void stop(); });
    } catch (cause) {
      if (owns()) {
        lifecycle.current.release(token, 'start');
        setError(String((cause as Error).message ?? cause));
      }
    }
  }

  function discard() {
    if (uploadPendingRef.current) return;
    lifecycle.current.invalidate();
    lifecycle.current.update({ visible, ownerId, postId, generation });
    player.pause();
    setPreviewUri(null);
    setDurationMs(0);
    setError(null);
  }

  async function send() {
    if (!previewUri || sending || uploadPendingRef.current) return;
    const token = lifecycle.current.beginSend();
    if (!token) return;
    uploadPendingRef.current = true;
    setUploadPending(true);
    try {
      await onSend(previewUri, durationMs);
      if (!lifecycle.current.release(token, 'send')) return;
      setUploadPending(false);
      uploadPendingRef.current = false;
      lifecycle.current.invalidate();
      player.pause();
      setPreviewUri(null);
      setDurationMs(0);
      setError(null);
      onClose();
    } catch (cause) {
      if (lifecycle.current.release(token, 'send')) {
        setUploadPending(false);
        uploadPendingRef.current = false;
        setError(`${String((cause as Error).message ?? cause)} You can retry or discard.`);
      }
    }
  }

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        const origin = lifecycle.current.recordingOrigin();
        lifecycle.current.invalidate();
        if (origin) {
          interruptionPendingRef.current = true;
          setInterruptionPending(true);
          void safelyStopInterruptedRecording(recordingRef, finalizingRef, () => recorder.stop()).finally(() => {
            interruptionPendingRef.current = false;
            if (mountedRef.current) setInterruptionPending(false);
          });
        }
        player.pause();
        setPreviewUri(null);
        setDurationMs(0);
        setError(null);
        setUploadPending(false);
        uploadPendingRef.current = false;
      }
    });
    return () => {
      subscription.remove();
      if (stopTimer.current) clearTimeout(stopTimer.current);
    };
  }, [player, recorder, recorderState.isRecording, stop]);

  const seconds = Math.min(10, Math.ceil(recorderState.durationMillis / 1000));
  const previewSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const bars = [8, 16, 11, 22, 14, 26, 18, 10, 20, 13, 24, 9];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close recorder" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Voice encouragement</Text>
              <Text style={styles.subtitle}>A natural, private message · up to 10 seconds</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={onClose} accessibilityLabel="Close recorder">
              <Ionicons name="close" size={22} color={colors.navy} />
            </Pressable>
          </View>

          <View
            style={styles.waveform}
            accessibilityLabel={
              recorderState.isRecording
                ? `Recording, ${seconds} of 10 seconds`
                : previewUri
                  ? `Voice preview, ${previewSeconds} seconds`
                  : 'Ready to record'
            }
          >
            {bars.map((height, index) => (
              <View
                key={index}
                style={[
                  styles.bar,
                  { height: recorderState.isRecording ? height : Math.max(7, height * 0.7) },
                ]}
              />
            ))}
          </View>

          <Text style={styles.timer}>
            {recorderState.isRecording
              ? `0:${String(seconds).padStart(2, '0')} / 0:10`
              : previewUri
                ? `0:${String(previewSeconds).padStart(2, '0')}`
                : '0:00'}
          </Text>

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          {!previewUri ? (
            <Pressable
              onPress={recorderState.isRecording ? stop : start}
              disabled={interruptionPending}
              style={({ pressed }) => [styles.record, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={recorderState.isRecording ? 'Stop recording' : 'Start recording'}
              accessibilityState={{ disabled: interruptionPending, busy: interruptionPending }}
            >
              {interruptionPending
                ? <ActivityIndicator color="#fff" />
                : <Ionicons name={recorderState.isRecording ? 'stop' : 'mic'} size={24} color="#fff" />}
              <Text style={styles.recordText}>
                {recorderState.isRecording ? 'Stop and preview' : 'Start recording'}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.previewActions}>
              <Pressable
                onPress={() => (playerStatus.playing ? player.pause() : player.play())}
                disabled={uploadPending}
                style={styles.previewButton}
                accessibilityRole="button"
                accessibilityLabel={playerStatus.playing ? 'Pause preview' : 'Play preview'}
              >
                <Ionicons name={playerStatus.playing ? 'pause' : 'play'} size={20} color={colors.primary} />
                <Text style={styles.previewText}>{playerStatus.playing ? 'Pause' : 'Preview'}</Text>
              </Pressable>
              <Pressable disabled={uploadPending} onPress={discard} style={styles.previewButton} accessibilityLabel="Delete and re-record">
                <Ionicons name="refresh" size={20} color={colors.navy} />
                <Text style={styles.previewText}>Discard</Text>
              </Pressable>
              <Pressable
                onPress={send}
                disabled={sending || uploadPending}
                style={[styles.send, (sending || uploadPending) && styles.disabled]}
                accessibilityRole="button"
                accessibilityState={{ busy: sending || uploadPending, disabled: sending || uploadPending }}
              >
                {sending || uploadPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Send</Text>}
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8,26,58,0.52)' },
  sheet: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xl,
    paddingBottom: 32,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.navy, fontFamily: font.bold, fontSize: 23 },
  subtitle: { color: colors.textMuted, fontFamily: font.medium, fontSize: 12.5, marginTop: 2 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  waveform: {
    height: 72,
    marginTop: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.primary },
  timer: { textAlign: 'center', color: colors.navy, fontFamily: font.bold, fontSize: 16 },
  error: { color: colors.danger, fontFamily: font.medium, textAlign: 'center', marginTop: spacing.md },
  record: {
    minHeight: 52,
    marginTop: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  recordText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  previewActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  previewButton: {
    minHeight: 48,
    minWidth: 86,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  previewText: { color: colors.navy, fontFamily: font.semibold, fontSize: 12.5 },
  send: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.76 },
});
