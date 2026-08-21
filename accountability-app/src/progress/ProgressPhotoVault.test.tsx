import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Image, KeyboardAvoidingView, Modal, ScrollView, StyleSheet, Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { CapturedProgressPhoto, ProgressPhotoSource } from './photoCapture';
import { ProgressPhotoVault } from './ProgressPhotoVault';
import type { ProgressPhoto } from './types';

jest.mock('./api', () => ({ saveProgressPhoto: jest.fn() }));
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});

const NOW = new Date(2026, 7, 22, 16, 30, 0, 0);
const CAPTURED: CapturedProgressPhoto = {
  uri: 'file:///private-preview.jpg',
  width: 1200,
  height: 1600,
  capturedAt: '2026-08-19T02:00:00.000Z',
};

function photo(id: string, capturedAt: string, weightKg: number | null = null): ProgressPhoto {
  return { id, capturedAt, weightKg, storagePath: `owner-a/${id}.jpg` };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function textOf(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).flatMap((node) =>
    Array.isArray(node.props.children) ? node.props.children : [node.props.children],
  ).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').join(' ');
}

type VaultOverrides = Partial<React.ComponentProps<typeof ProgressPhotoVault>>;

function renderVault(overrides: VaultOverrides = {}) {
  const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(CAPTURED);
  const savePhoto = jest.fn<NonNullable<React.ComponentProps<typeof ProgressPhotoVault>['savePhoto']>>().mockResolvedValue(
    photo('saved-private', '2026-08-19T12:00:00.000Z'),
  );
  const onSaved = jest.fn();
  const resolvePhoto = jest.fn<NonNullable<React.ComponentProps<typeof ProgressPhotoVault>['resolvePhoto']>>().mockResolvedValue({ localUri: 'file:///private-cache/opaque.jpg' });
  const createOperationId = jest.fn(() => '11111111-1111-4111-8111-111111111111');
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      <ProgressPhotoVault
        photos={[]}
        expectedOwnerId="owner-a"
        choosePhoto={choosePhoto}
        savePhoto={savePhoto}
        now={() => NOW}
        onSaved={onSaved}
        resolvePhoto={resolvePhoto}
        createOperationId={createOperationId}
        {...overrides}
      />,
    );
  });
  mounted.push(renderer);
  return { renderer, choosePhoto, savePhoto, onSaved, resolvePhoto, createOperationId };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
const photoSources: [string, ProgressPhotoSource][] = [
  ['Take selfie', 'front-camera'],
  ['Take photo', 'rear-camera'],
  ['Choose from gallery', 'gallery'],
];

afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

beforeEach(() => { jest.clearAllMocks(); });

describe('ProgressPhotoVault', () => {
  test.each(photoSources)('offers %s as an explicit private source', async (label, source) => {
    const { renderer, choosePhoto } = renderVault();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: label }).props.onPress());
    expect(choosePhoto).toHaveBeenCalledWith(source);
    expect(renderer.root.findByType(Image).props.source).toEqual({ uri: CAPTURED.uri });
    expect(textOf(renderer)).toContain('Review private photo');
  });

  test('capture alone never saves or publishes and cancellation leaves the vault unchanged', async () => {
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>()
      .mockResolvedValueOnce(CAPTURED)
      .mockResolvedValueOnce(null);
    const { renderer, savePhoto } = renderVault({ choosePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    expect(savePhoto).not.toHaveBeenCalled();
    expect(textOf(renderer)).toContain('Not saved yet');
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Cancel private photo' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Choose from gallery' }).props.onPress());
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    expect(savePhoto).not.toHaveBeenCalled();
    expect(textOf(renderer)).not.toContain('Feed');
  });

  test('lets the member edit the date and only explicit Save calls the private API', async () => {
    const { renderer, savePhoto, onSaved } = renderVault();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take photo' }).props.onPress());
    const date = renderer.root.findByProps({ accessibilityLabel: 'Progress photo date' });
    expect(date.props.value).toBe('2026-08-19');
    act(() => date.props.onChangeText('2026-08-18'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(savePhoto).toHaveBeenCalledWith({
      localUri: CAPTURED.uri,
      capturedAt: new Date(2026, 7, 18, 12, 0, 0, 0).toISOString(),
      weightKg: null,
    }, 'owner-a', '11111111-1111-4111-8111-111111111111');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'saved-private' }));
  });

  test('rejects an invalid or future edited date without saving', async () => {
    const { renderer, savePhoto } = renderVault();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    const date = renderer.root.findByProps({ accessibilityLabel: 'Progress photo date' });
    act(() => date.props.onChangeText('2026-08-23'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(textOf(renderer)).toContain('Photo date cannot be in the future.');
    expect(savePhoto).not.toHaveBeenCalled();
  });

  test('keeps one UUIDv4 operation identity across a failed Save retry and resets it for a new capture', async () => {
    const savePhoto = jest.fn<NonNullable<React.ComponentProps<typeof ProgressPhotoVault>['savePhoto']>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(photo('saved', '2026-08-19T12:00:00.000Z'));
    const createOperationId = jest.fn<() => string>()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const { renderer } = renderVault({ savePhoto, createOperationId });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(textOf(renderer)).toContain('couldn’t save');
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(savePhoto.mock.calls.map((call) => call[2])).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect(createOperationId).toHaveBeenCalledTimes(1);

    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take photo' }).props.onPress());
    expect(createOperationId).toHaveBeenCalledTimes(2);
  });

  test('saves optional weight canonically, treats empty as null, and rejects invalid bounds', async () => {
    const { renderer, savePhoto } = renderVault();
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    const weight = renderer.root.findByProps({ accessibilityLabel: 'Progress photo weight in kilograms' });
    act(() => weight.props.onChangeText('72.30'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(savePhoto.mock.calls[0][0]).toEqual(expect.objectContaining({ weightKg: 72.3 }));

    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take photo' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Progress photo weight in kilograms' }).props.onChangeText(''));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(savePhoto.mock.calls[1][0]).toEqual(expect.objectContaining({ weightKg: null }));

    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Choose from gallery' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Progress photo weight in kilograms' }).props.onChangeText('501'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    expect(textOf(renderer)).toContain('Weight must be between 20 and 500 kg');
    expect(savePhoto).toHaveBeenCalledTimes(2);
  });

  test('reports permission denial truthfully and preserves any existing vault records', async () => {
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>()
      .mockRejectedValue(Object.assign(new Error('denied'), { name: 'PhotoPermissionDeniedError', permissionKind: 'camera' }));
    const existing = photo('existing', '2026-08-01T12:00:00.000Z');
    const { renderer } = renderVault({ photos: [existing], choosePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    expect(textOf(renderer)).toContain('Camera access is off. Enable it in Settings to take a progress photo.');
    expect(textOf(renderer)).toContain('Before');
    expect(textOf(renderer)).not.toContain(existing.storagePath);
  });

  test('single-flights Save and blocks modal Cancel and Back until it settles', async () => {
    const pending = deferred<ProgressPhoto>();
    const savePhoto = jest.fn<NonNullable<React.ComponentProps<typeof ProgressPhotoVault>['savePhoto']>>().mockReturnValue(pending.promise);
    const { renderer } = renderVault({ savePhoto });
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    const save = renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' });
    act(() => { save.props.onPress(); save.props.onPress(); });
    const cancel = renderer.root.findByProps({ accessibilityLabel: 'Cancel private photo' });
    const modal = renderer.root.findByType(Modal);
    act(() => { cancel.props.onPress(); modal.props.onRequestClose(); });
    expect(savePhoto).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.accessibilityState.busy).toBe(true);
    expect(renderer.root.findAllByType(Modal)).toHaveLength(1);

    pending.resolve(photo('saved', '2026-08-19T12:00:00.000Z'));
    await flush();
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  });

  test('drops capture and save completions after an account switch', async () => {
    const capture = deferred<CapturedProgressPhoto | null>();
    const choosePhoto = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockReturnValue(capture.promise);
    const { renderer, savePhoto, onSaved, createOperationId, resolvePhoto } = renderVault({ choosePhoto });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[]} expectedOwnerId="owner-b" choosePhoto={choosePhoto} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} createOperationId={createOperationId} resolvePhoto={resolvePhoto} />,
    ));
    capture.resolve(CAPTURED);
    await flush();
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    expect(savePhoto).not.toHaveBeenCalled();

    const saved = deferred<ProgressPhoto>();
    savePhoto.mockReturnValue(saved.promise);
    const immediate = jest.fn<(source: ProgressPhotoSource) => Promise<CapturedProgressPhoto | null>>().mockResolvedValue(CAPTURED);
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[]} expectedOwnerId="owner-a" choosePhoto={immediate} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} createOperationId={createOperationId} resolvePhoto={resolvePhoto} />,
    ));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save private progress photo' }).props.onPress());
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[]} expectedOwnerId="owner-b" choosePhoto={immediate} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} createOperationId={createOperationId} resolvePhoto={resolvePhoto} />,
    ));
    saved.resolve(photo('owner-a-saved', '2026-08-19T12:00:00.000Z'));
    await flush();
    expect(onSaved).not.toHaveBeenCalled();
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[]} expectedOwnerId="owner-a" choosePhoto={immediate} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} createOperationId={createOperationId} resolvePhoto={resolvePhoto} />,
    ));
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.accessibilityState.disabled).toBe(false);
  });

  test('renders only earliest Before and newest Latest as owner-resolved private images', async () => {
    const photos = Array.from({ length: 80 }, (_, index) =>
      photo(`photo-${index}`, new Date(Date.UTC(2026, 0, 1 + index)).toISOString(), index === 0 ? 80 : index === 79 ? 72 : null),
    );
    const { renderer, resolvePhoto } = renderVault({ photos });
    expect(textOf(renderer)).toContain('Loading private photo');
    await flush();
    const previewLabels = new Set(renderer.root.findAll((node) => /^Private (Before|Latest) progress photo from /.test(node.props.accessibilityLabel ?? ''))
      .map((node) => node.props.accessibilityLabel as string));
    expect(previewLabels.size).toBe(2);
    expect(textOf(renderer)).toContain('Before');
    expect(textOf(renderer)).toContain('Latest');
    expect(textOf(renderer).replace(/\s+/g, ' ')).toContain('80.0 kg');
    expect(textOf(renderer).replace(/\s+/g, ' ')).toContain('72.0 kg');
    for (const item of photos) expect(textOf(renderer)).not.toContain(item.storagePath);
    expect(resolvePhoto).toHaveBeenCalledTimes(2);
    expect(resolvePhoto).toHaveBeenCalledWith(photos[0].storagePath, 'owner-a');
    expect(resolvePhoto).toHaveBeenCalledWith(photos[79].storagePath, 'owner-a');
    expect(renderer.root.findAllByType(Image).map((image) => image.props.source)).toEqual([
      { uri: 'file:///private-cache/opaque.jpg' },
      { uri: 'file:///private-cache/opaque.jpg' },
    ]);
  });

  test('shows a truthful private-image error and drops stale resolver completion after owner switch', async () => {
    const pending = deferred<{ localUri: string }>();
    const resolvePhoto = jest.fn<NonNullable<React.ComponentProps<typeof ProgressPhotoVault>['resolvePhoto']>>()
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new Error('denied'));
    const first = photo('first', '2026-08-01T12:00:00.000Z');
    const { renderer, choosePhoto, savePhoto, onSaved, createOperationId } = renderVault({ photos: [first], resolvePhoto });
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[{ ...first, storagePath: 'owner-b/first.jpg' }]} expectedOwnerId="owner-b" choosePhoto={choosePhoto} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} resolvePhoto={resolvePhoto} createOperationId={createOperationId} />,
    ));
    await flush();
    expect(textOf(renderer)).toContain('Private photo couldn’t load');
    pending.resolve({ localUri: 'file:///private-cache/stale-a.jpg' });
    await flush();
    expect(renderer.root.findAllByType(Image).map((image) => image.props.source)).not.toContainEqual({ uri: 'file:///private-cache/stale-a.jpg' });
  });

  test('does not briefly reuse a resolved image after leaving and returning to the same owner', async () => {
    const away = deferred<{ localUri: string }>();
    const returning = deferred<{ localUri: string }>();
    const resolvePhoto = jest.fn<NonNullable<React.ComponentProps<typeof ProgressPhotoVault>['resolvePhoto']>>()
      .mockResolvedValueOnce({ localUri: 'file:///private-cache/old-session-a.jpg' })
      .mockReturnValueOnce(away.promise)
      .mockReturnValueOnce(returning.promise);
    const first = photo('first', '2026-08-01T12:00:00.000Z');
    const { renderer, choosePhoto, savePhoto, onSaved, createOperationId } = renderVault({ photos: [first], resolvePhoto });
    await flush();
    expect(renderer.root.findAllByType(Image).map((image) => image.props.source)).toContainEqual({ uri: 'file:///private-cache/old-session-a.jpg' });
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[{ ...first, storagePath: 'owner-b/first.jpg' }]} expectedOwnerId="owner-b" choosePhoto={choosePhoto} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} resolvePhoto={resolvePhoto} createOperationId={createOperationId} />,
    ));
    await act(async () => renderer.update(
      <ProgressPhotoVault photos={[first]} expectedOwnerId="owner-a" choosePhoto={choosePhoto} savePhoto={savePhoto} now={() => NOW} onSaved={onSaved} resolvePhoto={resolvePhoto} createOperationId={createOperationId} />,
    ));
    expect(textOf(renderer)).toContain('Loading private photo');
    expect(renderer.root.findAllByType(Image).map((image) => image.props.source)).not.toContainEqual({ uri: 'file:///private-cache/old-session-a.jpg' });
  });

  test('gives actions and modal fields 48-point targets with wrapping controls', async () => {
    const { renderer } = renderVault();
    for (const label of ['Take selfie', 'Take photo', 'Choose from gallery']) {
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      const style = typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style;
      expect(StyleSheet.flatten(style).minHeight).toBeGreaterThanOrEqual(48);
    }
    const actions = renderer.root.findByProps({ testID: 'progress-photo-source-actions' });
    expect(StyleSheet.flatten(actions.props.style).flexWrap).toBe('wrap');
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Take selfie' }).props.onPress());
    for (const label of ['Progress photo date', 'Progress photo weight in kilograms', 'Cancel private photo', 'Save private progress photo']) {
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      const style = typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style;
      expect(StyleSheet.flatten(style).minHeight).toBeGreaterThanOrEqual(48);
    }
    expect(renderer.root.findByProps({ accessibilityLabel: 'Progress photo date' }).props.maxLength).toBe(10);
    expect(renderer.root.findByType(KeyboardAvoidingView).props.behavior).toBeTruthy();
    const modalScroll = renderer.root.findAllByType(ScrollView).find((node) => node.props.testID === 'progress-photo-modal-scroll');
    expect(modalScroll?.props.keyboardShouldPersistTaps).toBe('handled');
    expect(StyleSheet.flatten(modalScroll?.props.contentContainerStyle).flexGrow).toBe(1);
  });
});
