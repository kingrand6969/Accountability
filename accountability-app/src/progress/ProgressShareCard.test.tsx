import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Image, Text, View } from 'react-native';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  createProgressShareRenderModel,
  progressShareRenderModelFingerprint,
  ProgressShareCard,
  PROGRESS_SHARE_ASPECT_RATIO,
  type ProgressShareSnapshot,
} from './ProgressShareCard';
import type { ShareStudioResult } from '../share/shareStudioDraft';

jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});

const snapshot: ProgressShareSnapshot = Object.freeze({
  ownerId: '11111111-1111-4111-8111-111111111111',
  period: 'week',
  openedAt: '2026-08-22T08:00:00.000Z',
  workouts: 4,
  activeDays: 3,
  tasksDone: 8,
  weightKg: 72.4,
  bmi: 22.3,
  bodyMeasurement: Object.freeze({ id: 'measurement-1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 72.4, heightCm: 180 }),
  context: Object.freeze({
    title: 'My weekly progress',
    date: '22 Aug 2026',
    metrics: Object.freeze([
      Object.freeze({ label: 'Workouts', value: '4', sensitivity: 'standard' as const }),
      Object.freeze({ label: 'Active days', value: '3', sensitivity: 'standard' as const }),
      Object.freeze({ label: 'Tasks done', value: '8', sensitivity: 'standard' as const }),
      Object.freeze({ label: 'Current weight', value: '72.4 kg', sensitivity: 'body' as const }),
      Object.freeze({ label: 'BMI', value: '22.3', sensitivity: 'body' as const }),
    ]),
  }),
  privatePhotos: Object.freeze([
    Object.freeze({ id: 'before', storagePath: 'owner/private-before.jpg', capturedAt: '2026-07-01T08:00:00.000Z', localUri: 'file:///private-before.jpg' }),
    Object.freeze({ id: 'latest', storagePath: 'owner/private-latest.jpg', capturedAt: '2026-08-22T08:00:00.000Z', localUri: 'file:///private-latest.jpg' }),
  ]),
});

function draft(overrides: Partial<ShareStudioResult> = {}): ShareStudioResult {
  return {
    ownerId: snapshot.ownerId,
    operationId: '22222222-2222-4222-8222-222222222222',
    context: {
      title: snapshot.context.title,
      date: snapshot.context.date,
      metrics: snapshot.context.metrics.slice(0, 3),
    },
    caption: 'Small steps, repeated.',
    showPublicly: false,
    includeBodyStats: false,
    visibility: { audience: 'buddies', showOnCard: false },
    media: { kind: 'card' },
    ...overrides,
  };
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

function textOf(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).flatMap((node) =>
    Array.isArray(node.props.children) ? node.props.children : [node.props.children],
  ).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').join(' ');
}

describe('ProgressShareCard', () => {
  test('renders only the exact reviewed context and keeps hidden body stats out', () => {
    const model = createProgressShareRenderModel(snapshot, draft());
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ProgressShareCard model={model} />); });
    mounted.push(renderer);

    expect(textOf(renderer)).toContain('My weekly progress');
    expect(textOf(renderer)).toContain('4 Workouts');
    expect(textOf(renderer)).not.toMatch(/72\.4|22\.3|weight|BMI/i);
    expect(renderer.root.findByProps({ testID: 'progress-share-card' }).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ aspectRatio: PROGRESS_SHARE_ASPECT_RATIO })]),
    );
  });

  test('uses the same frozen render model for preview and publishing with exact opted-in values', () => {
    const reviewed = draft({
      includeBodyStats: true,
      context: {
        ...snapshot.context,
        metrics: [
          { label: 'Current weight', value: '72.4 kg', sensitivity: 'body' },
          { label: 'BMI', value: '22.3', sensitivity: 'body' },
          { label: 'Workouts', value: '4', sensitivity: 'standard' },
        ],
      },
    });
    const previewModel = createProgressShareRenderModel(snapshot, reviewed);
    const publishedModel = createProgressShareRenderModel(snapshot, reviewed);
    expect(publishedModel).toEqual(previewModel);
    expect(publishedModel.metrics).toEqual(reviewed.context.metrics);
  });

  test('shows the frozen private comparison for Card and only the chosen share photo for Selfie or Gallery', () => {
    const card = createProgressShareRenderModel(snapshot, draft());
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ProgressShareCard model={card} />); });
    mounted.push(renderer);
    expect(renderer.root.findAllByType(Image).map((node) => node.props.source.uri)).toEqual([
      'file:///private-before.jpg',
      'file:///private-latest.jpg',
    ]);

    const photoDraft = draft({ media: {
      kind: 'photo', source: 'selfie', uri: 'file:///new-selfie.jpg', width: 1200, height: 1500,
      capturedAt: '2026-08-22T08:30:00.000Z', release: jest.fn(async () => {}),
    } });
    const photoModel = createProgressShareRenderModel(snapshot, photoDraft);
    act(() => renderer.update(<ProgressShareCard model={photoModel} />));
    expect(renderer.root.findAllByType(Image).map((node) => node.props.source.uri)).toEqual(['file:///new-selfie.jpg']);
    expect(renderer.root.findAllByType(View).some((node) => node.props.testID === 'progress-before-after')).toBe(false);
  });

  test('describes Before and Latest photo meaning and dates in the parent image label', () => {
    const model = createProgressShareRenderModel(snapshot, draft());
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ProgressShareCard model={model} />); });
    mounted.push(renderer);

    const label = renderer.root.findByProps({ testID: 'progress-share-card' }).props.accessibilityLabel as string;
    expect(label).toMatch(/Before photo.*Jul.*1.*2026/i);
    expect(label).toMatch(/Latest photo.*Aug.*22.*2026/i);
  });

  test('reports loading/error/ready only for the current render fingerprint and ignores stale image completion', () => {
    const onMediaStateChange = jest.fn();
    const firstModel = createProgressShareRenderModel(snapshot, draft());
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ProgressShareCard model={firstModel} onMediaStateChange={onMediaStateChange} />); });
    mounted.push(renderer);
    const firstFingerprint = progressShareRenderModelFingerprint(firstModel);
    expect(onMediaStateChange).toHaveBeenLastCalledWith({ fingerprint: firstFingerprint, status: 'loading' });
    const oldBefore = renderer.root.findAllByType(Image)[0];
    const oldLatest = renderer.root.findAllByType(Image)[1];
    const staleLatestLoad = oldLatest.props.onLoad as () => void;
    act(() => oldBefore.props.onLoad());
    expect(onMediaStateChange).not.toHaveBeenLastCalledWith({ fingerprint: firstFingerprint, status: 'ready' });

    const nextDraft = draft({ media: {
      kind: 'photo', source: 'gallery', uri: 'file:///replacement.jpg', width: 1200, height: 1500,
      capturedAt: '2026-08-22T09:00:00.000Z', release: jest.fn(async () => {}),
    } });
    const nextModel = createProgressShareRenderModel(snapshot, nextDraft);
    const nextFingerprint = progressShareRenderModelFingerprint(nextModel);
    act(() => renderer.update(<ProgressShareCard model={nextModel} onMediaStateChange={onMediaStateChange} />));
    expect(onMediaStateChange).toHaveBeenLastCalledWith({ fingerprint: nextFingerprint, status: 'loading' });
    act(() => staleLatestLoad());
    expect(onMediaStateChange).not.toHaveBeenLastCalledWith({ fingerprint: nextFingerprint, status: 'ready' });

    const replacement = renderer.root.findByType(Image);
    act(() => replacement.props.onError());
    expect(onMediaStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ fingerprint: nextFingerprint, status: 'error' }));
    act(() => replacement.props.onLoad());
    expect(onMediaStateChange).not.toHaveBeenLastCalledWith({ fingerprint: nextFingerprint, status: 'ready' });
  });

  test('does not return a ready identical render fingerprint to loading on a parent rerender', () => {
    const onMediaStateChange = jest.fn();
    const firstModel = createProgressShareRenderModel(snapshot, draft());
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<ProgressShareCard model={firstModel} onMediaStateChange={onMediaStateChange} />); });
    mounted.push(renderer);
    const images = renderer.root.findAllByType(Image);
    act(() => { images[0].props.onLoad(); images[1].props.onLoad(); });
    expect(onMediaStateChange).toHaveBeenLastCalledWith({ fingerprint: progressShareRenderModelFingerprint(firstModel), status: 'ready' });
    const callsAfterReady = onMediaStateChange.mock.calls.length;
    const identicalModel = createProgressShareRenderModel(snapshot, draft());
    act(() => renderer.update(<ProgressShareCard model={identicalModel} onMediaStateChange={onMediaStateChange} />));
    expect(onMediaStateChange).toHaveBeenCalledTimes(callsAfterReady);
  });
});
