import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, TextInput } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { CapturedProgressPhoto, ProgressPhotoSource } from '../progress/photoCapture';
import { postVisibilityCopy } from '../progress/visibility';
import { resolveShareMediaCapabilities, ShareStudio, SHARE_CAPTION_LIMIT, type ShareStudioResult } from './ShareStudio';

jest.mock('@expo/vector-icons/Ionicons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return function MockIcon({ name }: { name: string }) { return React.createElement(Text, null, name); };
});
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});

const context = Object.freeze({
  title: 'Pull day complete',
  date: '22 Aug 2026',
  metrics: Object.freeze([
    Object.freeze({ label: 'Volume', value: '8,420 kg', sensitivity: 'standard' as const }),
    Object.freeze({ label: 'Duration', value: '52 min', sensitivity: 'standard' as const }),
  ]),
});

function captured(uri: string): CapturedProgressPhoto {
  return {
    uri,
    width: 1200,
    height: 1500,
    capturedAt: '2026-08-22T08:00:00.000Z',
    release: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});
beforeEach(() => { jest.clearAllMocks(); });

function textOf(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).flatMap((node) =>
    Array.isArray(node.props.children) ? node.props.children : [node.props.children],
  ).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').join(' ');
}

function renderStudio(overrides: Partial<React.ComponentProps<typeof ShareStudio>> = {}) {
  const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>()
    .mockResolvedValue(captured('file:///share-photo.jpg'));
  const onContinue = jest.fn<(result: ShareStudioResult) => void | Promise<void>>();
  const onCancel = jest.fn();
  const createOperationId = jest.fn(() => '11111111-1111-4111-8111-111111111111');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ShareStudio
        visible
        expectedOwnerId="owner-a"
        context={context}
        choosePhoto={choosePhoto}
        createOperationId={createOperationId}
        onContinue={onContinue}
        onCancel={onCancel}
        {...overrides}
      />,
    );
  });
  mounted.push(renderer);
  return { renderer, choosePhoto, onContinue, onCancel, createOperationId };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('ShareStudio', () => {
  test('defaults to Card only and the privacy-preserving Buddies-only visibility', () => {
    const { renderer } = renderStudio();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Card only' }).props.accessibilityState.selected).toBe(true);
    expect(renderer.root.findByProps({ testID: 'buddy-card-visibility-switch' }).props.value).toBe(false);
    expect(textOf(renderer)).toContain('Buddies only');
    expect(textOf(renderer)).toContain('Show on Buddy Card too');
  });

  test('maps the one switch to Public and Buddy Card without separate audience controls', () => {
    const { renderer } = renderStudio();
    const switchControl = renderer.root.findByProps({ testID: 'buddy-card-visibility-switch' });
    expect(switchControl.props.accessibilityLabel).toBe(postVisibilityCopy(false).accessibilityLabel);
    expect(switchControl.props.accessibilityHint).toBe(postVisibilityCopy(false).helper);
    expect(switchControl.props.accessibilityState.checked).toBe(false);
    act(() => switchControl.props.onValueChange(true));
    expect(textOf(renderer)).toContain('Public · also shown on your Buddy Card');
    expect(renderer.root.findByProps({ testID: 'buddy-card-visibility-switch' }).props.accessibilityHint).toBe(postVisibilityCopy(true).helper);
    expect(renderer.root.findByProps({ testID: 'buddy-card-visibility-switch' }).props.accessibilityState.checked).toBe(true);
    expect(renderer.root.findByProps({ testID: 'buddy-card-switch-label' }).props.children).toBe('Show on Buddy Card too');
    expect(renderer.root.findAllByType(Switch)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Public audience' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Buddy Card audience' })).toHaveLength(0);
    expect(textOf(renderer)).toContain('Turn on to make this post Public and show it on your Buddy Card.');
  });

  test('derives the primary action from the current visibility', () => {
    const { renderer } = renderStudio();
    expect(renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.accessibilityLabel).toBe('Post to buddies');
    expect(textOf(renderer)).toContain('Post to buddies');
    act(() => renderer.root.findByProps({ testID: 'buddy-card-visibility-switch' }).props.onValueChange(true));
    expect(renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.accessibilityLabel).toBe('Post publicly');
    expect(textOf(renderer)).toContain('Post publicly');
  });

  test('keeps slot-one weight private until Include body stats is explicitly enabled', async () => {
    const bodyContext = {
      title: 'Weekly progress',
      date: '22 Aug 2026',
      metrics: [
        { label: 'Current weight', value: '72.4 kg', sensitivity: 'body' as const },
        { label: 'Workouts', value: '4', sensitivity: 'standard' as const },
        { label: 'Consistency', value: '86%', sensitivity: 'standard' as const },
        { label: 'BMI', value: '23.1', sensitivity: 'body' as const },
      ],
    };
    const { renderer, onContinue } = renderStudio({ context: bodyContext });
    const bodySwitch = renderer.root.findByProps({ testID: 'include-body-stats-switch' });
    expect(bodySwitch.props.value).toBe(false);
    expect(textOf(renderer)).not.toContain('72.4 kg');
    expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'include-body-stats-target' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(JSON.stringify(onContinue.mock.calls[0][0])).not.toContain('72.4 kg');
    expect(onContinue.mock.calls[0][0].includeBodyStats).toBe(false);
    act(() => renderer.root.findByProps({ testID: 'include-body-stats-switch' }).props.onValueChange(true));
    expect(textOf(renderer)).toContain('72.4 kg');
    expect(textOf(renderer)).toContain('23.1');
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    const result = onContinue.mock.calls[1][0];
    expect(result.context.metrics).toHaveLength(3);
    expect(result.context.metrics[0]).toEqual(expect.objectContaining({ label: 'Current weight', value: '72.4 kg' }));
    expect(result.context.metrics[1]).toEqual(expect.objectContaining({ label: 'BMI', value: '23.1' }));
  });

  test('reserves a visible slot for opted-in body stats after three standard metrics', async () => {
    const bodyLastContext = {
      title: 'Monthly progress',
      date: '22 Aug 2026',
      metrics: [
        { label: 'Workouts', value: '12', sensitivity: 'standard' as const },
        { label: 'Consistency', value: '91%', sensitivity: 'standard' as const },
        { label: 'Training time', value: '9 hr', sensitivity: 'standard' as const },
        { label: 'Current weight', value: '71.8 kg', sensitivity: 'body' as const },
      ],
    };
    const { renderer, onContinue } = renderStudio({ context: bodyLastContext });
    expect(textOf(renderer)).not.toContain('71.8 kg');
    act(() => renderer.root.findByProps({ testID: 'include-body-stats-switch' }).props.onValueChange(true));
    expect(textOf(renderer)).toContain('71.8 kg');
    expect(renderer.root.findAllByType(Text).filter((node) => node.props.testID === 'share-card-metric-value')).toHaveLength(3);
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    const result = onContinue.mock.calls[0][0];
    expect(result.context.metrics).toHaveLength(3);
    expect(result.context.metrics).toContainEqual(expect.objectContaining({ label: 'Current weight', value: '71.8 kg' }));
    for (const metric of result.context.metrics) expect(textOf(renderer)).toContain(metric.value);
  });

  test('defensively treats weight and BMI labels as body stats even if mislabeled standard', () => {
    const bodyContext = {
      title: 'Progress',
      date: '22 Aug 2026',
      metrics: [
        { label: 'Weight', value: '72 kg', sensitivity: 'standard' as const },
        { label: 'BMI', value: '23', sensitivity: 'standard' as const },
        { label: 'Workouts', value: '4', sensitivity: 'standard' as const },
      ],
    };
    const { renderer } = renderStudio({ context: bodyContext });
    expect(textOf(renderer)).not.toContain('72 kg');
    expect(textOf(renderer)).not.toContain('23');
    expect(renderer.root.findByProps({ testID: 'include-body-stats-switch' })).toBeTruthy();
  });

  test('exposes only capability-supported media actions and keeps web defaults truthful', () => {
    expect(resolveShareMediaCapabilities('web')).toEqual({ card: true, selfie: false, gallery: true });
    expect(resolveShareMediaCapabilities('ios')).toEqual({ card: true, selfie: true, gallery: true });
    const { renderer } = renderStudio({ mediaCapabilities: { card: true, selfie: false, gallery: true } });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Take selfie' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Choose photo' })).toBeTruthy();
    expect(textOf(renderer)).toContain('Choose one from your photo library.');
  });

  test('cannot continue with Card only when that capability is unsupported', () => {
    const { renderer, onContinue } = renderStudio({ mediaCapabilities: { card: false, selfie: false, gallery: true } });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Card only' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.accessibilityState.disabled).toBe(true);
    expect(onContinue).not.toHaveBeenCalled();
  });

  test('returns a frozen validated Card-only draft only after explicit Continue', async () => {
    const { renderer, onContinue } = renderStudio({ defaultCaption: '  Strong work  ' });
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(onContinue).toHaveBeenCalledTimes(1);
    const result = onContinue.mock.calls[0][0];
    expect(result).toEqual({
      ownerId: 'owner-a',
      operationId: '11111111-1111-4111-8111-111111111111',
      context,
      caption: 'Strong work',
      showPublicly: false,
      includeBodyStats: false,
      visibility: { audience: 'buddies', showOnCard: false },
      media: { kind: 'card' },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.visibility)).toBe(true);
    expect(Object.isFrozen(result.media)).toBe(true);
  });

  test.each([
    ['Take selfie', 'front-camera' as const, 'selfie' as const],
    ['Choose photo', 'gallery' as const, 'gallery' as const],
  ])('uses %s as a derived share input', async (label, source, resultSource) => {
    const photo = captured(`file:///${resultSource}.jpg`);
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    const { renderer, onContinue } = renderStudio({ choosePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: label }).props.onPress());
    expect(choosePhoto).toHaveBeenCalledWith(source);
    expect(textOf(renderer)).toContain('Your original stays private');
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(onContinue.mock.calls[0][0].media).toEqual(expect.objectContaining({ kind: 'photo', source: resultSource, uri: photo.uri }));
  });

  test('picker cancellation, permission denial, and Back never continue', async () => {
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'PhotoPermissionDeniedError', permissionKind: 'camera' }));
    const { renderer, onContinue, onCancel } = renderStudio({ choosePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Choose photo' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    expect(textOf(renderer)).toContain('Camera access is off');
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Back from Share Studio' }).props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  test('enforces the caption limit while preserving multiline editable content', async () => {
    const { renderer, onContinue } = renderStudio();
    const caption = renderer.root.findByProps({ accessibilityLabel: 'Add a caption' });
    expect(caption.type).toBe(TextInput);
    expect(caption.props.multiline).toBe(true);
    expect(caption.props.maxLength).toBe(SHARE_CAPTION_LIMIT);
    act(() => caption.props.onChangeText('Line one\nLine two'));
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(onContinue.mock.calls[0][0].caption).toBe('Line one\nLine two');
  });

  test('releases temporary media on replace, Card only, cancel, unmount, and owner switch', async () => {
    const first = captured('file:///first.jpg');
    const second = captured('file:///second.jpg');
    const third = captured('file:///third.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>()
      .mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third);
    const { renderer, onContinue, onCancel } = renderStudio({ choosePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Choose photo' }).props.onPress());
    expect(first.release).toHaveBeenCalledTimes(1);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Card only' }).props.onPress());
    expect(second.release).toHaveBeenCalledTimes(1);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Back from Share Studio' }).props.onPress());
    expect(third.release).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();

    const switched = captured('file:///switch.jpg');
    choosePhoto.mockResolvedValue(switched);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.update(
      <ShareStudio visible expectedOwnerId="owner-b" context={context} choosePhoto={choosePhoto} onContinue={onContinue} onCancel={onCancel} />,
    ));
    expect(switched.release).toHaveBeenCalledTimes(1);
  });

  test('keeps replacement usable when cleanup rejects and never leaks the replacement', async () => {
    const first = { ...captured('file:///cleanup-rejects.jpg'), release: jest.fn<() => Promise<void>>().mockRejectedValue(new Error('locked')) };
    const second = captured('file:///replacement.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { renderer } = renderStudio({ choosePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Choose photo' }).props.onPress());
    expect(first.release).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Selected photo for share card preview' }).props.source).toEqual({ uri: second.uri });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Back from Share Studio' }).props.onPress());
    await flush();
    expect(second.release).toHaveBeenCalledTimes(1);
  });

  test('creates one UUIDv4 operation identity per open owner session', async () => {
    const createOperationId = jest.fn<() => string>()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const { renderer, onContinue, onCancel, choosePhoto } = renderStudio({ createOperationId });
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(onContinue.mock.calls[0][0].operationId).toBe('11111111-1111-4111-8111-111111111111');
    await act(async () => renderer.update(
      <ShareStudio visible expectedOwnerId="owner-b" context={context} choosePhoto={choosePhoto} createOperationId={createOperationId} onContinue={onContinue} onCancel={onCancel} />,
    ));
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(onContinue.mock.calls[1][0].operationId).toBe('22222222-2222-4222-8222-222222222222');
    expect(createOperationId).toHaveBeenCalledTimes(2);
  });

  test('does not allocate an operation identity until the Studio opens', async () => {
    const createOperationId = jest.fn(() => '11111111-1111-4111-8111-111111111111');
    const onContinue = jest.fn<(result: ShareStudioResult) => void>();
    const onCancel = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ShareStudio visible={false} expectedOwnerId="owner-a" context={context} createOperationId={createOperationId} onContinue={onContinue} onCancel={onCancel} />,
      );
    });
    mounted.push(renderer);
    expect(createOperationId).not.toHaveBeenCalled();
    await act(async () => renderer.update(
      <ShareStudio visible expectedOwnerId="owner-a" context={context} createOperationId={createOperationId} onContinue={onContinue} onCancel={onCancel} />,
    ));
    expect(createOperationId).toHaveBeenCalledTimes(1);
  });

  test('drops stale picker completion after an owner switch', async () => {
    const pending = deferred<CapturedProgressPhoto | null>();
    const stale = captured('file:///stale.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockReturnValue(pending.promise);
    const { renderer, onContinue, onCancel } = renderStudio({ choosePhoto });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.update(
      <ShareStudio visible expectedOwnerId="owner-b" context={context} choosePhoto={choosePhoto} onContinue={onContinue} onCancel={onCancel} />,
    ));
    pending.resolve(stale);
    await flush();
    expect(stale.release).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Card only' }).props.accessibilityState.selected).toBe(true);
  });

  test('remains usable through React Strict Mode effect replay', async () => {
    const photo = captured('file:///strict.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <React.StrictMode>
          <ShareStudio
            visible
            expectedOwnerId="owner-a"
            context={context}
            choosePhoto={choosePhoto}
            onContinue={jest.fn<(result: ShareStudioResult) => void>()}
            onCancel={jest.fn<() => void>()}
          />
        </React.StrictMode>,
      );
    });
    mounted.push(renderer);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    expect(renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.accessibilityState.selected).toBe(true);
  });

  test('Back stays responsive during a picker and releases its stale completion', async () => {
    const pending = deferred<CapturedProgressPhoto | null>();
    const stale = captured('file:///after-back.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockReturnValue(pending.promise);
    const { renderer, onCancel, onContinue } = renderStudio({ choosePhoto });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Back from Share Studio' }).props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
    pending.resolve(stale);
    await flush();
    expect(stale.release).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  test('does not reuse callback-owned media if Continue rejects', async () => {
    const onContinue = jest.fn<(result: ShareStudioResult) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Review unavailable'))
      .mockResolvedValueOnce(undefined);
    const photo = captured('file:///callback-owned.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    const { renderer } = renderStudio({ choosePhoto, onContinue });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(textOf(renderer)).toContain('Review unavailable');
    const firstDraft = onContinue.mock.calls[0][0];
    expect(firstDraft.operationId).toBe('11111111-1111-4111-8111-111111111111');
    expect(Object.isFrozen(firstDraft)).toBe(true);
    expect(Object.isFrozen(firstDraft.media)).toBe(true);
    expect(Object.isFrozen(firstDraft.visibility)).toBe(true);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.accessibilityState.selected).toBe(true);
    expect(photo.release).not.toHaveBeenCalled();
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(onContinue).toHaveBeenCalledTimes(2);
    expect(onContinue.mock.calls[1][0]).toBe(firstDraft);
    expect(photo.release).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Card only' }).props.accessibilityState.selected).toBe(true);
  });

  test('clears a stale callback error as soon as retry starts', async () => {
    const retry = deferred<void>();
    const onContinue = jest.fn<(result: ShareStudioResult) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockReturnValueOnce(retry.promise);
    const { renderer } = renderStudio({ onContinue });
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(textOf(renderer)).toContain('Network unavailable');
    act(() => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    expect(textOf(renderer)).not.toContain('Network unavailable');
    retry.resolve();
    await flush();
  });

  test('single-flights Continue while retaining media until success or unmount', async () => {
    const pending = deferred<void>();
    const onContinue = jest.fn<(result: ShareStudioResult) => Promise<void>>().mockReturnValue(pending.promise);
    const photo = captured('file:///transfer.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    const { renderer } = renderStudio({ choosePhoto, onContinue });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    const button = renderer.root.findByProps({ testID: 'share-studio-primary-action' });
    act(() => { button.props.onPress(); button.props.onPress(); });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.accessibilityState.busy).toBe(true);
    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    expect(photo.release).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush();
  });

  test('supports scrolling, keyboard avoidance, large text, and 48-point actions', () => {
    const { renderer } = renderStudio();
    expect(renderer.root.findByType(KeyboardAvoidingView)).toBeTruthy();
    const scroll = renderer.root.findByType(ScrollView);
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    expect(StyleSheet.flatten(scroll.props.contentContainerStyle).flexGrow).toBe(1);
    const preview = renderer.root.findByProps({ testID: 'share-card-preview' });
    expect(StyleSheet.flatten(preview.props.style).aspectRatio).toBe(4 / 5);
    expect(StyleSheet.flatten(preview.props.style).maxWidth).toBe(448);
    expect(StyleSheet.flatten(preview.props.style).maxHeight).toBeUndefined();
    for (const label of ['Card only', 'Take selfie', 'Choose photo', 'Back from Share Studio', 'Post to buddies']) {
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      const style = typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style;
      expect(StyleSheet.flatten(style).minHeight ?? StyleSheet.flatten(style).height).toBeGreaterThanOrEqual(48);
    }
    expect(renderer.root.findByType(TextInput).props.allowFontScaling).not.toBe(false);
    const switchTarget = renderer.root.findByProps({ testID: 'buddy-card-switch-target' });
    expect(StyleSheet.flatten(switchTarget.props.style).minHeight).toBeGreaterThanOrEqual(48);
    expect(renderer.root.findByProps({ testID: 'buddy-card-visibility-switch' }).props.hitSlop).toEqual(expect.objectContaining({ top: expect.any(Number), bottom: expect.any(Number) }));
  });

  test('uses a fixed high-contrast share-card palette in every app theme', () => {
    const { renderer } = renderStudio();
    expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'share-card-preview' }).props.style).backgroundColor).toBe('#081A3A');
    expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'share-card-shade' }).props.style).backgroundColor).toBe('rgba(0,0,0,0)');
    for (const id of ['share-card-date', 'share-card-title', 'share-card-metric-value', 'share-card-metric-label']) {
      expect(StyleSheet.flatten(renderer.root.findAllByProps({ testID: id })[0].props.style).color).toBe('#FFFFFF');
    }
  });

  test('labels a selected photo and constrains preview typography without clipping the card', async () => {
    const photo = captured('file:///accessible-selfie.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    const crowdedContext = {
      ...context,
      title: 'A deliberately long training title that must stay within the share card',
      metrics: [
        { label: 'Volume', value: '8,420 kg', sensitivity: 'standard' as const },
        { label: 'Duration', value: '52 min', sensitivity: 'standard' as const },
        { label: 'Sets', value: '18', sensitivity: 'standard' as const },
        { label: 'Sensitive body fat', value: '18%', sensitivity: 'body' as const },
      ],
    };
    const { renderer, onContinue } = renderStudio({ choosePhoto, context: crowdedContext });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    const image = renderer.root.findByProps({ accessibilityLabel: 'Selected selfie for share card preview' });
    expect(image.props.accessibilityRole).toBe('image');
    expect(StyleSheet.flatten(renderer.root.findByProps({ testID: 'share-card-shade' }).props.style).backgroundColor).toBe('rgba(0,0,0,0.72)');
    const title = renderer.root.findByProps({ testID: 'share-card-title' });
    expect(title.props.numberOfLines).toBeGreaterThanOrEqual(2);
    expect(title.props.maxFontSizeMultiplier).toBeLessThanOrEqual(1.5);
    expect(renderer.root.findAllByType(Text).filter((node) => node.props.testID === 'share-card-metric-value')).toHaveLength(3);
    expect(textOf(renderer)).not.toContain('Sensitive body fat');
    await act(async () => renderer.root.findByProps({ testID: 'share-studio-primary-action' }).props.onPress());
    const result = onContinue.mock.calls[0][0];
    expect(result.context.metrics).toHaveLength(3);
    expect(JSON.stringify(result)).not.toContain('Sensitive body fat');
    expect(Object.isFrozen(result.context)).toBe(true);
    expect(Object.isFrozen(result.context.metrics)).toBe(true);
  });
});
