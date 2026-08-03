import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  deriveEncouragementViewState,
  encouragementActionVisibility,
  encouragementSheetVisible,
  encouragementOperationOwnsCompletion,
  createEncouragementOperationToken,
  VoiceRowActionController,
  SingleThankCoordinator,
} from './EncouragementSheet';
import {
  RecorderLifecycleController,
  armRecorderAutoStop,
  recorderCompletionBelongsToView,
  recorderPermissionState,
  recorderPermissionMessage,
  runOwnedRecorderStep,
  safelyStopInterruptedRecording,
} from './VoiceEncouragementRecorder';

jest.mock('expo-audio', () => ({
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  RecordingPresets: { LOW_QUALITY: {} },
  setAudioModeAsync: jest.fn(),
  useAudioPlayer: () => ({ pause: jest.fn(), play: jest.fn(), replace: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
  useAudioRecorder: () => ({}),
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0 }),
}));
jest.mock('./Avatar', () => ({ Avatar: () => null }));
jest.mock('../media/useResolvedMediaUrl', () => ({ useResolvedMediaUrl: () => null }));

const sheetSource = readFileSync(require.resolve('./EncouragementSheet'), 'utf8');
const recorderSource = readFileSync(require.resolve('./VoiceEncouragementRecorder'), 'utf8');
const barSource = readFileSync(require.resolve('./EncouragementBar'), 'utf8');

describe('Group 3 encouragement contract', () => {
  test('derives every sheet lifecycle state without fabricating supporters', () => {
    expect(deriveEncouragementViewState({ loading: true, online: true, rowCount: 0 })).toBe('loading');
    expect(deriveEncouragementViewState({ loading: false, online: true, rowCount: 0 })).toBe('empty');
    expect(deriveEncouragementViewState({ loading: false, online: true, rowCount: 0, error: true })).toBe('retryable-error');
    expect(deriveEncouragementViewState({ loading: false, online: false, rowCount: 0 })).toBe('offline');
    expect(deriveEncouragementViewState({ loading: false, online: true, rowCount: 2, redacted: true })).toBe('privacy-redacted');
    expect(deriveEncouragementViewState({ loading: false, online: true, rowCount: 4 })).toBe('populated');
    expect(sheetSource).not.toContain('Way to get after it!');
    expect(sheetSource).not.toContain('Love the early start!');
  });

  test('redacted state renders no identity message or playable media rows', () => {
    expect(sheetSource).toContain("state === 'privacy-redacted'");
    expect(sheetSource).toContain('Encouragement is private or no longer available.');
    expect(sheetSource).toContain("state === 'populated' ? comments.map");
    expect(sheetSource).toContain("state === 'populated' ? voices.map");
  });

  test('keeps canonical open/close, supporter count, Reply, record, and one honest thank action', () => {
    expect(encouragementSheetVisible(true, false)).toBe(true);
    expect(encouragementSheetVisible(true, true)).toBe(false);
    expect(sheetSource).toContain('visible={modalVisible}');
    expect(sheetSource).toContain('onRequestClose={onClose}');
    expect(sheetSource).toContain('supporterCount');
    expect(sheetSource).toContain('Reply');
    expect(sheetSource).toContain('onRecordVoice');
    expect(sheetSource.match(/onThankEveryone/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sheetSource).toContain('Thank everyone');
    expect(sheetSource).not.toContain('private message');
  });

  test('matches the approved cream sheet geometry and compact visual hierarchy', () => {
    expect(sheetSource).toContain("height: '54%'");
    expect(sheetSource).toContain('backgroundColor: colors.cream');
    expect(sheetSource).toContain('fontFamily: font.serif');
    expect(sheetSource).toContain('voiceWave');
    expect(sheetSource).toContain('voiceDuration');
    expect(sheetSource).toContain('styles.reply');
    expect(sheetSource).toContain('styles.thank');
    expect(sheetSource).not.toContain('styles.handle');
    expect(sheetSource).not.toContain('styles.iconButton');
    expect(sheetSource).not.toContain('Voice Â· 10 sec');
    expect(sheetSource).not.toContain('supporterList');
  });

  test('makes microphone denial explicit and preserves cap, preview, retry, discard, and background interruption', () => {
    expect(recorderPermissionState(undefined)).toBe('unasked');
    expect(recorderPermissionState({ granted: true, canAskAgain: true })).toBe('granted');
    expect(recorderPermissionState({ granted: false, canAskAgain: true })).toBe('denied');
    expect(recorderPermissionState({ granted: false, canAskAgain: false })).toBe('blocked');
    expect(recorderPermissionMessage('denied')).toContain('write a text encouragement');
    expect(recorderPermissionMessage('blocked')).toContain('device settings');
    expect(recorderSource).toContain('forDuration: 10');
    expect(recorderSource).toContain('Math.min(10_000');
    expect(recorderSource).toContain('AppState.addEventListener');
    expect(recorderSource).toContain('Preview');
    expect(recorderSource).toContain('retry or discard');
    expect(recorderSource).toContain('Discard');
  });

  test('deferred recorder upload from an old account cannot close or unlock the new account', async () => {
    const initial = { visible: true, ownerId: 'a', postId: 'p', generation: 1 };
    const controller = new RecorderLifecycleController(initial);
    const stale = controller.beginSend()!;
    const upload = deferred<void>();
    const close = jest.fn();
    const completion = upload.promise.then(() => {
      if (controller.release(stale, 'send')) close();
    });
    controller.update({ ...initial, ownerId: 'b' });
    const current = controller.beginSend()!;
    upload.resolve();
    await completion;
    expect(close).not.toHaveBeenCalled();
    expect(controller.beginSend()).toBeNull();
    expect(controller.release(current, 'send')).toBe(true);
  });

  test('guards every deferred completion by mounted owner post and generation', () => {
    const token = { ownerId: 'owner-a', postId: 'post-a', generation: 7, operation: 3 };
    expect(recorderCompletionBelongsToView(token, token, true)).toBe(true);
    expect(recorderCompletionBelongsToView(token, { ...token, ownerId: 'owner-b' }, true)).toBe(false);
    expect(recorderCompletionBelongsToView(token, { ...token, postId: 'post-b' }, true)).toBe(false);
    expect(recorderCompletionBelongsToView(token, { ...token, generation: 8 }, true)).toBe(false);
    expect(recorderCompletionBelongsToView(token, token, false)).toBe(false);
    expect(recorderSource).toContain('mountedRef.current');
    expect(recorderSource).toContain('operationGeneration.current');
  });

  test('binds delete report and block to the exact row owner post and operation generation', () => {
    const view = { ownerId: 'recipient', postId: 'post-a', generation: 4 };
    const token = createEncouragementOperationToken(view, 'voice-a', 'sender', 'report', 2);
    expect(encouragementOperationOwnsCompletion(token, token, view, true)).toBe(true);
    expect(encouragementOperationOwnsCompletion(token, { ...token, rowId: 'voice-b' }, view, true)).toBe(false);
    expect(encouragementOperationOwnsCompletion(token, token, { ...view, postId: 'post-b' }, true)).toBe(false);
    expect(encouragementOperationOwnsCompletion(token, token, { ...view, generation: 5 }, true)).toBe(false);
    expect(encouragementOperationOwnsCompletion(token, token, view, false)).toBe(false);
  });

  test('shows sender-only Delete and recipient-only Report abuse and Block sender', () => {
    expect(encouragementActionVisibility('sender', 'sender', 'recipient')).toEqual({
      delete: true,
      report: false,
      block: false,
    });
    expect(encouragementActionVisibility('recipient', 'sender', 'recipient')).toEqual({
      delete: false,
      report: true,
      block: true,
    });
    expect(encouragementActionVisibility('sender', 'sender', 'sender')).toEqual({
      delete: true,
      report: false,
      block: false,
    });
    expect(sheetSource).toContain('Delete');
    expect(sheetSource).toContain('Report abuse');
    expect(sheetSource).toContain('Block sender');
    expect(sheetSource).toContain('confirm');
    expect(sheetSource).toContain('retry');
    expect(sheetSource).toContain('forbidden');
  });

  test('allows one public thank callback while the same-frame duplicate is pending', async () => {
    const coordinator = new SingleThankCoordinator();
    const callback = jest.fn(async () => undefined);
    const first = coordinator.run(callback);
    const duplicate = coordinator.run(callback);
    await Promise.all([first, duplicate]);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('recorder controller synchronously locks start/send and invalidates every lifecycle boundary', () => {
    const view = { visible: true, ownerId: 'a', postId: 'p', generation: 1 };
    const controller = new RecorderLifecycleController(view);
    const start = controller.beginStart();
    expect(start).not.toBeNull();
    expect(controller.beginStart()).toBeNull();
    expect(controller.owns(start!, 'start')).toBe(true);
    controller.markRecording(start!);
    expect(controller.recordingOrigin()).toEqual(start);
    const send = controller.beginSend();
    expect(send).not.toBeNull();
    expect(controller.beginSend()).toBeNull();
    controller.update({ ...view, postId: 'other' });
    expect(controller.owns(start!, 'start')).toBe(false);
    expect(controller.owns(send!, 'send')).toBe(false);
    expect(controller.recordingOrigin()).toBeNull();
  });

  test.each([
    { visible: false },
    { ownerId: 'b' },
    { postId: 'q' },
    { generation: 2 },
  ])('recorder stale completion cannot unlock the replacement view: %o', (change) => {
    const initial = { visible: true, ownerId: 'a', postId: 'p', generation: 1 };
    const controller = new RecorderLifecycleController(initial);
    const stale = controller.beginStart()!;
    controller.update({ ...initial, ...change });
    let current = controller.beginStart();
    if (change.visible === false) {
      expect(current).toBeNull();
      controller.update(initial);
      current = controller.beginStart();
    }
    expect(current).not.toBeNull();
    expect(controller.release(stale, 'start')).toBe(false);
    expect(controller.beginStart()).toBeNull();
  });

  test('row action controller rejects duplicate confirm and stale completion cannot unlock current row', () => {
    const view = { ownerId: 'recipient', postId: 'post-a', generation: 1 };
    const controller = new VoiceRowActionController(view, 'voice-a', 'sender');
    const stale = controller.begin('report');
    expect(stale).not.toBeNull();
    expect(controller.begin('report')).toBeNull();
    expect(controller.begin('block')).toBeNull();
    controller.update({ ...view, postId: 'post-b' }, 'voice-b', 'sender-b');
    const current = controller.begin('report');
    expect(current).not.toBeNull();
    expect(controller.complete(stale!, true)).toEqual({ apply: false, release: false });
    expect(controller.begin('report')).toBeNull();
    expect(controller.complete(current!, true)).toEqual({ apply: true, release: true });
  });

  test.each(['stop failed', 'audio restore failed'])(
    'owned recorder failure is caught, released, and retryable: %s',
    async (message) => {
      const view = { visible: true, ownerId: 'a', postId: 'p', generation: 1 };
      const controller = new RecorderLifecycleController(view);
      const token = controller.beginStart()!;
      const result = await runOwnedRecorderStep(
        controller,
        token,
        'start',
        async () => { throw new Error(message); },
      );
      expect(result).toEqual({ status: 'error', error: message });
      expect(controller.beginStart()).not.toBeNull();
    },
  );

  test('failed physical stop retains only its exact origin for retry or discard', async () => {
    const view = { visible: true, ownerId: 'a', postId: 'p', generation: 1 };
    const controller = new RecorderLifecycleController(view);
    const token = controller.beginStart()!;
    controller.markRecording(token);
    await expect(runOwnedRecorderStep(
      controller,
      token,
      'start',
      async () => { throw new Error('stop failed'); },
      false,
    )).resolves.toEqual({ status: 'error', error: 'stop failed' });
    expect(controller.owns(token, 'start')).toBe(true);
    expect(controller.recordingOrigin()).toEqual(token);
    controller.invalidate();
    expect(controller.recordingOrigin()).toBeNull();
  });

  test('background cancellation uses authoritative recording ref and upload disables conflicting controls', async () => {
    const recording = { current: true };
    const finalizing = { current: false };
    const stop = jest.fn(async () => undefined);
    await safelyStopInterruptedRecording(recording, finalizing, stop);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(recording.current).toBe(false);
    expect(recorderSource).not.toContain('origin && recorderState.isRecording');
    expect(recorderSource).toContain('if (uploadPendingRef.current) return');
    expect(recorderSource).toContain('disabled={uploadPending}');
    expect(recorderSource).toContain('sending || uploadPending');
  });

  test('10-second cap scheduler invokes stop exactly once', () => {
    jest.useFakeTimers();
    const stop = jest.fn();
    armRecorderAutoStop(stop);
    jest.advanceTimersByTime(9_949);
    expect(stop).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(stop).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('pending old interruption stop rejects replacement start until it settles', async () => {
    const recording = { current: true };
    const finalizing = { current: false };
    const stopped = deferred<void>();
    const physicalStop = jest.fn(() => stopped.promise);
    const startingApi = jest.fn();
    const interruption = safelyStopInterruptedRecording(recording, finalizing, physicalStop);
    const startReplacement = () => {
      if (finalizing.current) return false;
      startingApi();
      return true;
    };
    expect(finalizing.current).toBe(true);
    expect(startReplacement()).toBe(false);
    expect(startingApi).not.toHaveBeenCalled();
    stopped.resolve();
    await interruption;
    expect(finalizing.current).toBe(false);
    expect(startReplacement()).toBe(true);
    expect(startingApi).toHaveBeenCalledTimes(1);
    expect(recorderSource).toContain('interruptionPendingRef.current || finalizingRef.current');
    expect(recorderSource).toContain('accessibilityState={{ disabled: interruptionPending, busy: interruptionPending }}');
  });

  test.each(['close', 'account', 'post', 'generation', 'unmount'])(
    'deferred recorder preparation becomes stale on %s',
    async (boundary) => {
      const initial = { visible: true, ownerId: 'a', postId: 'p', generation: 1 };
      const controller = new RecorderLifecycleController(initial);
      const token = controller.beginStart()!;
      const operation = deferred<void>();
      const result = runOwnedRecorderStep(controller, token, 'start', () => operation.promise);
      if (boundary === 'close') controller.update({ ...initial, visible: false });
      else if (boundary === 'account') controller.update({ ...initial, ownerId: 'b' });
      else if (boundary === 'post') controller.update({ ...initial, postId: 'q' });
      else if (boundary === 'generation') controller.update({ ...initial, generation: 2 });
      else controller.unmount();
      operation.resolve();
      await expect(result).resolves.toEqual({ status: 'stale' });
    },
  );

  test('normal voice row hides safety actions behind one accessible overflow affordance', () => {
    expect(sheetSource).toContain('accessibilityLabel={`Voice options for ${name}`}');
    expect(sheetSource).toContain('{actionsExpanded ? (');
    expect(sheetSource).toContain('ellipsis-horizontal');
    expect(sheetSource).toContain('minWidth: 44');
  });

  test('deferred old-row action cannot show success or unlock the replacement row', async () => {
    const view = { ownerId: 'recipient', postId: 'post-a', generation: 1 };
    const controller = new VoiceRowActionController(view, 'voice-a', 'sender');
    const stale = controller.begin('block')!;
    const api = deferred<void>();
    const success = jest.fn();
    const completion = api.promise.then(() => {
      if (controller.complete(stale, true).apply) success();
    });
    controller.update({ ...view, generation: 2 }, 'voice-b', 'sender-b');
    const current = controller.begin('block')!;
    api.resolve();
    await completion;
    expect(success).not.toHaveBeenCalled();
    expect(controller.begin('block')).toBeNull();
    expect(controller.complete(current, true)).toEqual({ apply: true, release: true });
  });

  test('owned action controls expose 44-point disabled and busy semantics', () => {
    expect(sheetSource).toContain('minHeight: 44');
    expect(sheetSource).toContain('accessibilityState={{ disabled, busy }}');
    expect(sheetSource).toContain('disabled={disabled}');
  });

  test('never adds private voice references to public share presentation', () => {
    expect(barSource).not.toContain('voice_ref');
    expect(sheetSource).not.toContain('publicShare');
    expect(recorderSource).not.toContain('publicShare');
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
