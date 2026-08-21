/* eslint-disable @typescript-eslint/no-require-imports -- route loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import type { ShareStudioResult } from '../share/shareStudioDraft';
import { createProgressShareRenderModel, type ProgressShareSnapshot } from './ProgressShareCard';
import type { BodyMeasurement, ProgressPhoto } from './types';

let mockOwnerId: string | null = 'owner-a';
let mockFocused = true;
let mockFocusEpoch = 0;
const mockListMeasurements = jest.fn<(owner: string, limit: number) => Promise<BodyMeasurement[]>>();
const mockListPhotos = jest.fn<(owner: string) => Promise<ProgressPhoto[]>>();
const mockGetInsights = jest.fn<(period: string, owner: string) => Promise<Record<string, unknown>>>();
const mockProgressSnapshotInput = jest.fn<(...args: unknown[]) => unknown>();
const mockPrepare = jest.fn<() => Promise<ProgressShareSnapshot>>();
const mockPublish = jest.fn<(...args: unknown[]) => Promise<string>>();
const mockCancelPublish = jest.fn<(...args: unknown[]) => Promise<{ status: 'cancelled' } | { status: 'published'; postId: string }>>();
const mockClearArtifacts = jest.fn();
const mockCaptureRef = jest.fn<(ref: unknown, options: unknown) => Promise<string>>().mockResolvedValue('jpeg-base64');
let mockLastStudioProps: Record<string, unknown> | null = null;

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: mockOwnerId ? { user: { id: mockOwnerId } } : null }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useFocusEffect: (effect: () => void | (() => void)) => ReactModule.useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocused, mockFocusEpoch]),
    useRouter: () => ({ replace: jest.fn() }),
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});
jest.mock('./api', () => ({
  listMeasurements: (owner: string, limit: number) => mockListMeasurements(owner, limit),
  listProgressPhotos: (owner: string) => mockListPhotos(owner),
  addMeasurement: jest.fn(),
}));
jest.mock('../insights/api', () => ({ getInsights: (period: string, owner: string) => mockGetInsights(period, owner) }));
jest.mock('react-native-view-shot', () => ({ captureRef: (ref: unknown, options: unknown) => mockCaptureRef(ref, options) }));
jest.mock('./publishProgressPost', () => ({
  cancelProgressPublish: (input: unknown, dependencies: unknown) => mockCancelPublish(input, dependencies),
  clearProgressPublishArtifacts: (...args: unknown[]) => mockClearArtifacts(...args),
  progressSnapshotInput: (owner: unknown, period: unknown, openedAt: unknown, insights: unknown, latest: unknown, photos: unknown) => mockProgressSnapshotInput(owner, period, openedAt, insights, latest, photos),
  prepareProgressShareSnapshot: (..._args: unknown[]) => mockPrepare(),
  publishProgressPost: (input: unknown, dependencies: unknown) => mockPublish(input, dependencies),
}));
jest.mock('../share/ShareStudio', () => ({
  ShareStudio: (props: any) => {
    const ReactModule = require('react') as typeof React;
    const Native = require('react-native') as typeof import('react-native');
    mockLastStudioProps = props;
    if (!props.visible) return null;
    const preview = props.renderDestinationPreview;
    return ReactModule.createElement(Native.View, { accessibilityLabel: 'Journey Share Studio' },
      preview?.({
        context: props.context,
        media: { kind: 'card' }, caption: '', showPublicly: false, includeBodyStats: false,
      }),
      ReactModule.createElement(Native.Pressable, { accessibilityRole: 'button', accessibilityLabel: 'Mock publish progress', onPress: () => props.onContinue({
        ownerId: props.expectedOwnerId,
        operationId: '22222222-2222-4222-8222-222222222222',
        context: props.context,
        caption: '', showPublicly: false, includeBodyStats: false,
        visibility: { audience: 'buddies', showOnCard: false }, media: { kind: 'card' },
      }) }),
    );
  },
}));

const snapshot: ProgressShareSnapshot = {
  ownerId: 'owner-a', period: 'week', openedAt: '2026-08-22T08:00:00.000Z',
  workouts: 4, activeDays: 3, tasksDone: 8, weightKg: 72.4, bmi: 22.3,
  bodyMeasurement: { id: 'measurement-1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 72.4, heightCm: 180 },
  context: {
    title: 'My weekly progress', date: '22 Aug 2026', metrics: [
      { label: 'Workouts', value: '4', sensitivity: 'standard' },
      { label: 'Current weight', value: '72.4 kg', sensitivity: 'body' },
    ],
  },
  privatePhotos: [],
};

const mounted: TestRenderer.ReactTestRenderer[] = [];
const Route = require('../app/journey-progress').default as React.ComponentType;
afterEach(() => { for (const renderer of mounted.splice(0)) act(() => renderer.unmount()); });

async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

describe('Journey Progress Share Studio integration', () => {
  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockFocused = true;
    mockFocusEpoch = 0;
    mockLastStudioProps = null;
    jest.clearAllMocks();
    mockListMeasurements.mockResolvedValue([{ id: 'm1', recordedAt: '2026-08-22T07:00:00.000Z', weightKg: 72.4, heightCm: 180 }]);
    mockListPhotos.mockResolvedValue([]);
    mockGetInsights.mockResolvedValue({ workouts: 4, activeSeconds: 3600, tasksDone: 8, daysActive: 3 });
    mockPrepare.mockResolvedValue(snapshot);
    mockProgressSnapshotInput.mockImplementation((...args) => ({ args }));
    mockPublish.mockResolvedValue('post-id');
    mockCancelPublish.mockResolvedValue({ status: 'cancelled' });
    mockCaptureRef.mockResolvedValue('jpeg-base64');
  });

  test('shows a visible 48-point Share progress action and opens a frozen owner snapshot', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    const share = renderer.root.findByProps({ accessibilityLabel: 'Share progress' });
    const shareStyle = typeof share.props.style === 'function' ? share.props.style({ pressed: false }) : share.props.style;
    expect(StyleSheet.flatten(shareStyle).minHeight).toBeGreaterThanOrEqual(48);

    await act(async () => { await share.props.onPress(); });
    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockGetInsights).toHaveBeenLastCalledWith('week', 'owner-a');
    expect(mockGetInsights).toHaveBeenCalledTimes(2);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Journey Share Studio' })).toBeTruthy();
    expect(mockLastStudioProps).toMatchObject({ expectedOwnerId: 'owner-a', context: snapshot.context });
  });

  test('publishes the reviewed snapshot through the route capture boundary and closes only after success', async () => {
    mockPublish.mockImplementation(async (_input, overrides) => {
      const input = _input as { snapshot: ProgressShareSnapshot; draft: ShareStudioResult };
      const dependencies = overrides as { captureCard: (model: unknown, options: unknown) => Promise<string> };
      await dependencies.captureCard(createProgressShareRenderModel(input.snapshot, input.draft), { width: 1080, height: 1350, format: 'jpg', quality: 0.95 });
      return 'post-id';
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    await act(async () => { await renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });
    await act(async () => { await renderer.root.findByProps({ accessibilityLabel: 'Mock publish progress' }).props.onPress(); });

    expect(mockCaptureRef).toHaveBeenCalledWith(expect.anything(), {
      format: 'jpg', quality: 0.95, result: 'base64', width: 1080, height: 1350,
    });
    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({ snapshot, draft: expect.objectContaining({ operationId: '22222222-2222-4222-8222-222222222222' }) }),
      expect.objectContaining({ captureCard: expect.any(Function) }),
    );
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Journey Share Studio' })).toHaveLength(0);
  });

  test('refuses capture when the publisher supplies a render model other than the mounted reviewed fingerprint', async () => {
    mockPublish.mockImplementation(async (_input, overrides) => {
      const dependencies = overrides as { captureCard: (model: unknown, options: unknown) => Promise<string> };
      await dependencies.captureCard({ title: 'mismatch' }, { width: 1080, height: 1350, format: 'jpg', quality: 0.95 });
      return 'post-id';
    });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    await act(async () => { await renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });
    await expect(renderer.root.findByProps({ accessibilityLabel: 'Mock publish progress' }).props.onPress()).rejects.toThrow(/reviewed|ready/i);
    expect(mockCaptureRef).not.toHaveBeenCalled();
  });

  test('fetches truthful monthly totals before freezing a Monthly review', async () => {
    const monthly = { workouts: 12, activeSeconds: 7200, tasksDone: 23, daysActive: 9 };
    mockGetInsights.mockResolvedValueOnce({ workouts: 4, activeSeconds: 3600, tasksDone: 8, daysActive: 3 });
    mockGetInsights.mockResolvedValueOnce(monthly);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Show monthly weight trend' }).props.onPress());
    await act(async () => { await renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });

    expect(mockGetInsights).toHaveBeenLastCalledWith('month', 'owner-a');
    expect(mockProgressSnapshotInput.mock.calls.at(-1)?.[1]).toBe('month');
    expect(mockProgressSnapshotInput.mock.calls.at(-1)?.[3]).toBe(monthly);
  });

  test('drops fresh period totals when the Journey focus lease ends before Share Studio opens', async () => {
    let resolveInsights!: (value: Record<string, unknown>) => void;
    const pendingInsights = new Promise<Record<string, unknown>>((resolve) => { resolveInsights = resolve; });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    mockGetInsights.mockReturnValueOnce(pendingInsights);
    act(() => { void renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });
    mockFocused = false;
    mockFocusEpoch += 1;
    await act(async () => renderer.update(<Route />));
    resolveInsights({ workouts: 4, activeSeconds: 3600, tasksDone: 8, daysActive: 3 });
    await flush();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Journey Share Studio' })).toHaveLength(0);
    expect(mockPrepare).not.toHaveBeenCalled();
  });

  test('drops a prepared Account A snapshot when the signed-in owner changes', async () => {
    let resolve!: (value: ProgressShareSnapshot) => void;
    mockPrepare.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    act(() => { void renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });
    mockOwnerId = 'owner-b';
    mockListMeasurements.mockResolvedValue([]);
    await act(async () => { renderer.update(<Route />); });
    resolve(snapshot);
    await flush();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Journey Share Studio' })).toHaveLength(0);
    expect(mockClearArtifacts).toHaveBeenCalledWith('owner-a');
  });

  test('explicit cancel reconciles and cleans an ambiguous owner-bound operation artifact', async () => {
    mockPublish.mockRejectedValueOnce(new Error('lost response'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    await act(async () => { await renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });
    await expect(renderer.root.findByProps({ accessibilityLabel: 'Mock publish progress' }).props.onPress()).rejects.toThrow('lost response');
    await act(async () => { await (mockLastStudioProps!.onCancel as () => Promise<void>)(); });
    expect(mockCancelPublish).toHaveBeenCalledWith({ snapshot, draft: expect.objectContaining({
      ownerId: 'owner-a', operationId: '22222222-2222-4222-8222-222222222222',
    }) }, undefined);
    expect(mockClearArtifacts).not.toHaveBeenCalledWith('owner-a', '22222222-2222-4222-8222-222222222222');
  });

  test('keeps the Share Studio open with a recovery action when cancel cleanup is ambiguous', async () => {
    mockPublish.mockRejectedValueOnce(new Error('lost response'));
    mockCancelPublish.mockRejectedValueOnce(new Error('Cancel cleanup could not be confirmed.'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Route />); mounted.push(renderer); });
    await flush();
    await act(async () => { await renderer.root.findByProps({ accessibilityLabel: 'Share progress' }).props.onPress(); });
    await expect(renderer.root.findByProps({ accessibilityLabel: 'Mock publish progress' }).props.onPress()).rejects.toThrow('lost response');
    await act(async () => { await (mockLastStudioProps!.onCancel as () => Promise<void>)(); });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Journey Share Studio' }).length).toBeGreaterThan(0);
    expect(mockCancelPublish).toHaveBeenCalledTimes(1);
  });
});
