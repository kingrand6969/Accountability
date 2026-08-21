import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Switch, Text, TextInput } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { CapturedProgressPhoto, ProgressPhotoSource } from '../progress/photoCapture';
import { ShareStudio, SHARE_CAPTION_LIMIT, type ShareStudioResult } from './ShareStudio';

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
    Object.freeze({ label: 'Volume', value: '8,420 kg' }),
    Object.freeze({ label: 'Duration', value: '52 min' }),
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
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ShareStudio
        visible
        expectedOwnerId="owner-a"
        context={context}
        choosePhoto={choosePhoto}
        onContinue={onContinue}
        onCancel={onCancel}
        {...overrides}
      />,
    );
  });
  mounted.push(renderer);
  return { renderer, choosePhoto, onContinue, onCancel };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('ShareStudio', () => {
  test('defaults to Card only and the privacy-preserving Buddies-only visibility', () => {
    const { renderer } = renderStudio();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Card only' }).props.accessibilityState.selected).toBe(true);
    expect(renderer.root.findByType(Switch).props.value).toBe(false);
    expect(textOf(renderer)).toContain('Buddies only');
    expect(textOf(renderer)).toContain('Show on Buddy Card too');
  });

  test('maps the one switch to Public and Buddy Card without separate audience controls', () => {
    const { renderer } = renderStudio();
    act(() => renderer.root.findByType(Switch).props.onValueChange(true));
    expect(textOf(renderer)).toContain('Public · also shown on your Buddy Card');
    expect(renderer.root.findAllByType(Switch)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Public audience' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Buddy Card audience' })).toHaveLength(0);
  });

  test('returns a frozen validated Card-only draft only after explicit Continue', async () => {
    const { renderer, onContinue } = renderStudio({ defaultCaption: '  Strong work  ' });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Continue sharing' }).props.onPress());
    expect(onContinue).toHaveBeenCalledTimes(1);
    const result = onContinue.mock.calls[0][0];
    expect(result).toEqual({
      ownerId: 'owner-a',
      context,
      caption: 'Strong work',
      showOnBuddyCard: false,
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
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Continue sharing' }).props.onPress());
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
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Continue sharing' }).props.onPress());
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
    const onContinue = jest.fn<(result: ShareStudioResult) => Promise<void>>().mockRejectedValue(new Error('Review unavailable'));
    const photo = captured('file:///callback-owned.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    const { renderer } = renderStudio({ choosePhoto, onContinue });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Continue sharing' }).props.onPress());
    expect(textOf(renderer)).toContain('Review unavailable');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Card only' }).props.accessibilityState.selected).toBe(true);
    expect(photo.release).not.toHaveBeenCalled();
  });

  test('single-flights Continue and transfers selected temp-media ownership to the callback', async () => {
    const pending = deferred<void>();
    const onContinue = jest.fn<(result: ShareStudioResult) => Promise<void>>().mockReturnValue(pending.promise);
    const photo = captured('file:///transfer.jpg');
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(photo);
    const { renderer } = renderStudio({ choosePhoto, onContinue });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    const button = renderer.root.findByProps({ accessibilityLabel: 'Continue sharing' });
    act(() => { button.props.onPress(); button.props.onPress(); });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Continue sharing' }).props.accessibilityState.busy).toBe(true);
    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    expect(photo.release).not.toHaveBeenCalled();
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
    for (const label of ['Card only', 'Take selfie', 'Choose photo', 'Back from Share Studio', 'Continue sharing']) {
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      const style = typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style;
      expect(StyleSheet.flatten(style).minHeight ?? StyleSheet.flatten(style).height).toBeGreaterThanOrEqual(48);
    }
    expect(renderer.root.findByType(TextInput).props.allowFontScaling).not.toBe(false);
  });
});
