/* eslint-disable @typescript-eslint/no-require-imports -- route loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Modal, StyleSheet, Text, TextInput } from 'react-native';
import { Polyline } from 'react-native-svg';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import type { BodyMeasurement, ProgressPhoto } from './types';

let mockOwnerId: string | null = 'owner-a';
let mockFocusEpoch = 0;
let mockFocused = true;
const mockListMeasurements = jest.fn<(owner: string, limit: number) => Promise<BodyMeasurement[]>>();
const mockListPhotos = jest.fn<(owner: string) => Promise<ProgressPhoto[]>>();
const mockAddMeasurement = jest.fn<(...args: unknown[]) => Promise<BodyMeasurement>>();
const mockGetInsights = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: mockOwnerId ? { user: { id: mockOwnerId } } : null }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => ({ replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(() => mockFocused ? effect() : undefined, [effect, mockFocusEpoch, mockFocused]);
    },
  };
});
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('./api', () => ({
  listMeasurements: (owner: string, limit: number) => mockListMeasurements(owner, limit),
  listProgressPhotos: (owner: string) => mockListPhotos(owner),
  addMeasurement: (...args: unknown[]) => mockAddMeasurement(...args),
}));
jest.mock('../insights/api', () => ({ getInsights: (...args: unknown[]) => mockGetInsights(...args) }));
jest.mock('./publishProgressPost', () => ({
  clearProgressPublishArtifacts: jest.fn(),
  progressSnapshotInput: jest.fn(),
  prepareProgressShareSnapshot: jest.fn(),
  publishProgressPost: jest.fn(),
}));
jest.mock('../share/ShareStudio', () => ({ ShareStudio: () => null }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

const measurement = (id: string, weightKg: number, heightCm = 180, day = 20): BodyMeasurement => ({
  id,
  weightKg,
  heightCm,
  recordedAt: `2026-08-${String(day).padStart(2, '0')}T10:30:00.000Z`,
});
const measurementAt = (id: string, weightKg: number, recordedAt: Date): BodyMeasurement => ({
  id, weightKg, heightCm: 180, recordedAt: recordedAt.toISOString(),
});
const photo = (id: string): ProgressPhoto => ({
  id,
  storagePath: `owner-a/${id}-private.jpg`,
  capturedAt: '2026-08-19T10:30:00.000Z',
  weightKg: 72,
});
const insights = { workouts: 3, activeSeconds: 5400, tasksDone: 7 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

function textOf(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAllByType(Text).flatMap((node) =>
    Array.isArray(node.props.children) ? node.props.children : [node.props.children],
  ).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').join(' ').replace(/\s+/g, ' ');
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
const ProgressRoute = require('../app/journey-progress').default as React.ComponentType;

afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
  jest.useRealTimers();
});

describe('Journey progress owner lifecycle', () => {
  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockFocusEpoch = 0;
    mockFocused = true;
    mockListMeasurements.mockReset().mockResolvedValue([]);
    mockListPhotos.mockReset().mockResolvedValue([]);
    mockAddMeasurement.mockReset();
    mockGetInsights.mockReset().mockResolvedValue(insights);
  });
  test('shows an accessible initial loader, then truthful empty progress', async () => {
    mockListMeasurements.mockReturnValueOnce(new Promise(() => {}));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Loading journey progress' }).props.accessibilityRole).toBe('progressbar');

    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    mockListMeasurements.mockResolvedValueOnce([]);
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(textOf(renderer)).toContain('No body check-ins yet');
    expect(textOf(renderer)).toContain('No private progress photos yet');
    expect(textOf(renderer)).not.toContain('0.0 kg');
  });

  test('passes the immutable captured owner to insights', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(mockGetInsights).toHaveBeenCalledWith('week', 'owner-a');
  });

  test('refreshes the mounted chart clock after refocus crosses local midnight', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 22, 23, 59, 0, 0));
    mockListMeasurements
      .mockResolvedValueOnce([measurementAt('before-midnight', 74, new Date(2026, 7, 22, 23, 50, 0, 0))])
      .mockResolvedValueOnce([measurementAt('after-midnight', 73, new Date(2026, 7, 23, 0, 1, 0, 0))]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel?.includes('one check-in at 74.0 kg'))).not.toHaveLength(0);

    jest.setSystemTime(new Date(2026, 7, 23, 0, 5, 0, 0));
    mockFocusEpoch += 1;
    await act(async () => renderer.update(<ProgressRoute />));
    await flush();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel?.includes('one check-in at 73.0 kg'))).not.toHaveLength(0);
  });

  test('recovers under replayed StrictMode effects', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<React.StrictMode><ProgressRoute /></React.StrictMode>);
      mounted.push(renderer);
    });
    await flush();
    expect(textOf(renderer)).toContain('No body check-ins yet');
  });

  test('shows a truthful initial error and Retry recovers all data', async () => {
    mockListMeasurements.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([measurement('m1', 72)]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(textOf(renderer)).toContain('Your progress couldn’t load. Check your connection and try again.');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Journey progress failed to load' }).props.accessibilityRole).toBe('alert');
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Retry loading journey progress' });
    expect(StyleSheet.flatten(retry.props.style).minHeight).toBeGreaterThanOrEqual(48);
    act(() => retry.props.onPress());
    await flush();
    expect(textOf(renderer)).toContain('72.0 kg');
    expect(textOf(renderer)).toContain('22.2');
  });

  test('preserves cached data when a same-owner refresh fails', async () => {
    mockListMeasurements.mockResolvedValueOnce([measurement('m1', 72)]).mockRejectedValueOnce(new Error('offline'));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    mockFocusEpoch += 1;
    await act(async () => renderer.update(<ProgressRoute />));
    await flush();
    expect(textOf(renderer)).toContain('72.0 kg');
    expect(textOf(renderer)).toContain('Your progress couldn’t refresh. Your saved progress is still shown.');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Journey progress refresh failed' }).props.accessibilityRole).toBe('alert');
    const retry = renderer.root.findByProps({ accessibilityLabel: 'Retry refreshing journey progress' });
    expect(StyleSheet.flatten(retry.props.style).minHeight).toBeGreaterThanOrEqual(48);
  });

  test('cached refresh Retry replaces data and clears its notice', async () => {
    mockListMeasurements
      .mockResolvedValueOnce([measurement('cached', 72)])
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([measurement('fresh', 71)]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    mockFocusEpoch += 1;
    await act(async () => renderer.update(<ProgressRoute />));
    await flush();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry refreshing journey progress' }).props.onPress());
    await flush();
    expect(textOf(renderer)).toContain('71.0 kg');
    expect(textOf(renderer)).not.toContain('Your progress couldn’t refresh');
  });

  test.each(['resolve', 'reject'] as const)('drops a deferred Retry %s after blur', async (outcome) => {
    const retry = deferred<BodyMeasurement[]>();
    mockListMeasurements.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retry.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry loading journey progress' }).props.onPress());

    mockFocused = false;
    mockFocusEpoch += 1;
    await act(async () => renderer.update(<ProgressRoute />));
    if (outcome === 'resolve') retry.resolve([measurement('stale-retry', 63)]);
    else retry.reject(new Error('stale retry failure'));
    await flush();

    expect(textOf(renderer)).not.toContain('63.0 kg');
    expect(textOf(renderer)).not.toContain('Your progress couldn’t load');
  });

  test.each(['resolve', 'reject'] as const)('drops a deferred Retry %s after unmount', async (outcome) => {
    const retry = deferred<BodyMeasurement[]>();
    mockListMeasurements.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(retry.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry loading journey progress' }).props.onPress());
    act(() => renderer.unmount());
    mounted.splice(mounted.indexOf(renderer), 1);
    if (outcome === 'resolve') retry.resolve([measurement('stale-unmounted', 62)]);
    else retry.reject(new Error('stale unmounted failure'));
    await flush();
    expect(mockListMeasurements).toHaveBeenCalledTimes(2);
  });

  test('clears account A synchronously and drops its stale completion and error for B', async () => {
    const measurementsA = deferred<BodyMeasurement[]>();
    const photosA = deferred<ProgressPhoto[]>();
    mockListMeasurements.mockReturnValueOnce(measurementsA.promise).mockResolvedValueOnce([measurement('b', 88)]);
    mockListPhotos.mockReturnValueOnce(photosA.promise).mockResolvedValueOnce([]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(<ProgressRoute />));
    await flush();
    expect(textOf(renderer)).toContain('88.0 kg');
    measurementsA.resolve([measurement('a', 61)]);
    photosA.reject(new Error('stale'));
    await flush();
    expect(textOf(renderer)).not.toContain('61.0 kg');
    expect(textOf(renderer)).not.toContain('couldn’t load');
    expect(mockListMeasurements).toHaveBeenLastCalledWith('owner-b', 52);
  });

  test('removes cached account A body and photo metadata before account B resolves', async () => {
    mockListMeasurements.mockResolvedValueOnce([measurement('account-a', 61)]);
    mockListPhotos.mockResolvedValueOnce([photo('account-a-photo')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(textOf(renderer)).toContain('61.0 kg');
    expect(textOf(renderer)).toContain('8/19/2026');

    mockOwnerId = 'owner-b';
    mockListMeasurements.mockReturnValueOnce(new Promise(() => {}));
    mockListPhotos.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => renderer.update(<ProgressRoute />));
    expect(textOf(renderer)).not.toContain('61.0 kg');
    expect(textOf(renderer)).not.toContain('8/19/2026');
  });

  test('saves one check-in against its captured owner, closes, and refreshes', async () => {
    mockListMeasurements.mockResolvedValueOnce([]).mockResolvedValueOnce([measurement('saved', 75, 180, 22)]);
    mockAddMeasurement.mockResolvedValueOnce(measurement('saved', 75, 180, 22));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Add body check-in' }).props.onPress());
    const inputs = renderer.root.findAllByType(TextInput);
    act(() => inputs.find((input) => input.props.accessibilityLabel === 'Weight in kilograms')?.props.onChangeText('75'));
    act(() => inputs.find((input) => input.props.accessibilityLabel === 'Height in centimetres')?.props.onChangeText('180'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());
    await flush();
    expect(mockAddMeasurement).toHaveBeenCalledTimes(1);
    expect(mockAddMeasurement.mock.calls[0][1]).toBe('owner-a');
    expect(mockListMeasurements).toHaveBeenCalledTimes(2);
    const currentWeight = renderer.root.findAllByType(Text).find((node) =>
      Array.isArray(node.props.children) && node.props.children.join('') === '75.0 kg',
    );
    expect(currentWeight).toBeTruthy();
  });

  test('does not refresh or reveal a save from the previous owner', async () => {
    const save = deferred<BodyMeasurement>();
    mockAddMeasurement.mockReturnValueOnce(save.promise);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Add body check-in' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Weight in kilograms' }).props.onChangeText('75'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.onChangeText('180'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());

    mockOwnerId = 'owner-b';
    await act(async () => renderer.update(<ProgressRoute />));
    await flush();
    save.resolve(measurement('saved-a', 75));
    await flush();
    expect(mockAddMeasurement.mock.calls[0][1]).toBe('owner-a');
    expect(textOf(renderer)).not.toContain('75.0 kg');
    expect(mockListMeasurements).toHaveBeenCalledTimes(2);
  });

  test('drops a deferred post-save refresh after blur', async () => {
    const refresh = deferred<BodyMeasurement[]>();
    mockListMeasurements.mockResolvedValueOnce([]).mockReturnValueOnce(refresh.promise);
    mockAddMeasurement.mockResolvedValueOnce(measurement('saved', 75));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Add body check-in' }).props.onPress());
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Weight in kilograms' }).props.onChangeText('75'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.onChangeText('180'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());
    await flush();
    mockFocused = false;
    mockFocusEpoch += 1;
    await act(async () => renderer.update(<ProgressRoute />));
    refresh.resolve([measurement('stale-refresh', 75)]);
    await flush();
    expect(textOf(renderer)).not.toContain('75.0 kg');
  });

  test('renders private photo metadata without exposing its storage path', async () => {
    mockListPhotos.mockResolvedValueOnce([photo('secret-file')]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(textOf(renderer)).toContain('Private · Only you can see this');
    expect(textOf(renderer)).not.toContain('owner-a/secret-file-private.jpg');
  });
});

describe('Weight trend semantics', () => {
  const { WeightTrendChart } = require('./WeightTrendChart') as typeof import('./WeightTrendChart');
  test('switches between seven-day and thirty-day chronological windows without interpolation', () => {
    const points = [measurement('old', 80, 180, 1), measurement('recent', 75, 180, 20), measurement('latest', 74, 180, 21)];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={points} now={new Date(2026, 7, 22, 23)} />); });
    mounted.push(renderer);
    expect(renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('started at 75.0 kg, current 74.0 kg, change -1.0 kg'))).not.toHaveLength(0);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Show monthly weight trend' }).props.onPress());
    expect(renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('started at 80.0 kg, current 74.0 kg, change -6.0 kg'))).not.toHaveLength(0);
  });

  test('states empty and single-point limitations truthfully', () => {
    let empty!: TestRenderer.ReactTestRenderer;
    act(() => { empty = TestRenderer.create(<WeightTrendChart measurements={[]} now={new Date(2026, 7, 22, 23)} />); });
    mounted.push(empty);
    expect(textOf(empty)).toContain('Add a body check-in to begin your weight trend.');

    let single!: TestRenderer.ReactTestRenderer;
    act(() => { single = TestRenderer.create(<WeightTrendChart measurements={[measurement('only', 74)]} now={new Date(2026, 7, 22, 23)} />); });
    mounted.push(single);
    expect(textOf(single)).toContain('One check-in recorded. Add another to see a trend.');
    const onePointSummary = single.root.findAll((node) => typeof node.props.accessibilityLabel === 'string')
      .map((node) => node.props.accessibilityLabel as string)
      .find((label) => label.startsWith('Weight trend:'));
    expect(onePointSummary).toContain('one check-in at 74.0 kg');
    expect(onePointSummary).toContain('Aug');
    expect(onePointSummary).not.toContain('started');
    expect(onePointSummary).not.toContain('change');

    const noDataSummary = empty.root.findAll((node) => typeof node.props.accessibilityLabel === 'string')
      .map((node) => node.props.accessibilityLabel as string)
      .find((label) => label.startsWith('Weight trend'));
    expect(noDataSummary).toBe('Weight trend has no check-ins yet.');
  });

  test('gives both period controls 48-point targets', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={[]} now={new Date(2026, 7, 22, 23)} />); });
    mounted.push(renderer);
    for (const label of ['Show weekly weight trend', 'Show monthly weight trend']) {
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      expect(StyleSheet.flatten(control.props.style).minHeight).toBeGreaterThanOrEqual(48);
    }
  });

  test('excludes stale-only and future points from the injected local-calendar week', () => {
    const now = new Date(2026, 7, 22, 15, 0, 0, 0);
    const measurements = [
      measurementAt('stale', 80, new Date(2026, 7, 15, 23, 59, 59, 999)),
      measurementAt('future', 70, new Date(2026, 7, 22, 15, 0, 0, 1)),
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={measurements} now={now} />); });
    mounted.push(renderer);
    expect(textOf(renderer)).toContain('Weight trend has no check-ins yet.');
    expect(textOf(renderer)).not.toContain('started at 80.0 kg');
  });

  test('includes exact start and now boundaries but excludes next-day window end', () => {
    const now = new Date(2026, 7, 22, 15, 0, 0, 0);
    const measurements = [
      measurementAt('start', 80, new Date(2026, 7, 16, 0, 0, 0, 0)),
      measurementAt('now', 75, now),
      measurementAt('end', 60, new Date(2026, 7, 23, 0, 0, 0, 0)),
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={measurements} now={now.getTime()} />); });
    mounted.push(renderer);
    const summary = renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string')
      .map((node) => node.props.accessibilityLabel as string).find((label) => label.startsWith('Weight trend:'));
    expect(summary).toContain('started at 80.0 kg');
    expect(summary).toContain('current 75.0 kg');
    expect(summary).not.toContain('60.0 kg');
  });

  test('spaces irregular timestamps by elapsed time rather than point index', () => {
    const now = new Date(2026, 7, 22, 12, 0, 0, 0);
    const measurements = [
      measurementAt('a', 80, new Date(2026, 7, 16, 0, 0, 0, 0)),
      measurementAt('b', 79, new Date(2026, 7, 17, 0, 0, 0, 0)),
      measurementAt('c', 78, new Date(2026, 7, 21, 0, 0, 0, 0)),
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={measurements} now={now} />); });
    mounted.push(renderer);
    const xs = renderer.root.findByType(Polyline).props.points.split(' ').map((point: string) => Number(point.split(',')[0]));
    expect(xs[1] - xs[0]).toBeLessThan(xs[2] - xs[1]);
  });

  test('uses calendar dates across month and daylight-saving transition days', () => {
    const now = new Date(2026, 2, 8, 12, 0, 0, 0);
    const measurements = [
      measurementAt('calendar-start', 82, new Date(2026, 2, 2, 0, 0, 0, 0)),
      measurementAt('before', 90, new Date(2026, 2, 1, 23, 59, 59, 999)),
      measurementAt('today', 81, new Date(2026, 2, 8, 11, 0, 0, 0)),
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={measurements} now={now} />); });
    mounted.push(renderer);
    expect(textOf(renderer)).toContain('started at 82.0 kg');
    expect(textOf(renderer)).toContain('current 81.0 kg');
    expect(textOf(renderer)).not.toContain('90.0 kg');
  });

  test('uses today plus the previous 29 local dates for Monthly', () => {
    const now = new Date(2026, 7, 22, 12, 0, 0, 0);
    const measurements = [
      measurementAt('monthly-start', 84, new Date(2026, 6, 24, 0, 0, 0, 0)),
      measurementAt('monthly-stale', 91, new Date(2026, 6, 23, 23, 59, 59, 999)),
      measurementAt('monthly-current', 82, now),
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={measurements} now={now} />); });
    mounted.push(renderer);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Show monthly weight trend' }).props.onPress());
    expect(textOf(renderer)).toContain('started at 84.0 kg');
    expect(textOf(renderer)).toContain('current 82.0 kg');
    expect(textOf(renderer)).not.toContain('91.0 kg');
  });
});

describe('Body check-in interaction safety', () => {
  const { BodyCheckInSheet } = require('./BodyCheckInSheet') as typeof import('./BodyCheckInSheet');

  function renderSheet(onSave = jest.fn<() => Promise<void>>().mockResolvedValue(undefined), latestHeightCm?: number) {
    const onCancel = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<BodyCheckInSheet visible latestHeightCm={latestHeightCm} onCancel={onCancel} onSave={onSave} />); });
    mounted.push(renderer);
    return { renderer, onCancel, onSave };
  }

  test('validates weight and height before saving', () => {
    const { renderer, onSave } = renderSheet();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());
    expect(textOf(renderer)).toContain('Enter valid weight and height values.');
    expect(onSave).not.toHaveBeenCalled();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Weight in kilograms' }).props.onChangeText('10'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.onChangeText('180'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());
    expect(textOf(renderer)).toContain('Enter valid weight and height values.');

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Weight in kilograms' }).props.onChangeText('75'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.onChangeText('70'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());
    expect(textOf(renderer)).toContain('Enter valid weight and height values.');

    expect(onSave).not.toHaveBeenCalled();
  });

  test('single-flights Save and blocks both Cancel and Back until it settles', async () => {
    const pending = deferred<void>();
    const onSave = jest.fn<() => Promise<void>>().mockReturnValue(pending.promise);
    const { renderer, onCancel } = renderSheet(onSave);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Weight in kilograms' }).props.onChangeText('75'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.onChangeText('180'));
    const save = renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' });
    act(() => { save.props.onPress(); save.props.onPress(); });
    const modal = renderer.root.findByType(Modal);
    const cancel = renderer.root.findByProps({ accessibilityLabel: 'Cancel body check-in' });
    act(() => { cancel.props.onPress(); modal.props.onRequestClose(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.accessibilityState.busy).toBe(true);

    pending.resolve();
    await flush();
    act(() => renderer.root.findByType(Modal).props.onRequestClose());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test('Cancel and Back close without saving while idle', () => {
    const { renderer, onCancel, onSave } = renderSheet();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Cancel body check-in' }).props.onPress());
    act(() => renderer.root.findByType(Modal).props.onRequestClose());
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onSave).not.toHaveBeenCalled();
  });

  test('recovers save error state under replayed StrictMode effects', async () => {
    const onSave = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('offline'));
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <React.StrictMode><BodyCheckInSheet visible onCancel={jest.fn()} onSave={onSave} /></React.StrictMode>,
      );
      mounted.push(renderer);
    });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Weight in kilograms' }).props.onChangeText('75'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.onChangeText('180'));
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Save body check-in' }).props.onPress());
    await flush();
    expect(textOf(renderer)).toContain('Your body check-in couldn’t save. Try again.');
  });

  test('gives modal inputs and direct controls 48-point targets and wraps actions', () => {
    const { renderer } = renderSheet(undefined, 180);
    for (const label of ['Weight in kilograms', 'Check-in date', 'Edit height', 'Cancel body check-in', 'Save body check-in']) {
      const control = renderer.root.findByProps({ accessibilityLabel: label });
      const renderedStyle = typeof control.props.style === 'function' ? control.props.style({ pressed: false }) : control.props.style;
      expect(StyleSheet.flatten(renderedStyle).minHeight).toBeGreaterThanOrEqual(48);
    }
    const cancel = renderer.root.findByProps({ accessibilityLabel: 'Cancel body check-in' });
    expect(StyleSheet.flatten(cancel.parent?.props.style).flexWrap).toBe('wrap');
    const { renderer: firstCheckIn } = renderSheet();
    expect(StyleSheet.flatten(firstCheckIn.root.findByProps({ accessibilityLabel: 'Height in centimetres' }).props.style).minHeight).toBeGreaterThanOrEqual(48);
  });
});

describe('Journey progress navigation contracts', () => {
  const tabsSource = fs.readFileSync(path.join(__dirname, '../journey/JourneyTabs.tsx'), 'utf8');
  const layoutSource = fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8');

  test('keeps four readable tabs in the approved order and routes Progress correctly', () => {
    const momentum = tabsSource.indexOf("key: 'momentum'");
    const progress = tabsSource.indexOf("key: 'progress'");
    const journeyPath = tabsSource.indexOf("key: 'path'");
    const journal = tabsSource.indexOf("key: 'journal'");
    expect(momentum).toBeGreaterThan(-1);
    expect(progress).toBeGreaterThan(momentum);
    expect(journeyPath).toBeGreaterThan(progress);
    expect(journal).toBeGreaterThan(journeyPath);
    expect(tabsSource).toContain("route: '/journey-progress'");
    expect(tabsSource).toContain('minHeight: 48');
    expect(tabsSource).toContain("fontScale >= 1.25 && tab.key === 'momentum'");
    expect(tabsSource).toContain('accessibilityLabel={`${tab.label} journey tab`}');
  });

  test('registers the headerless route inside the authenticated onboarding guard', () => {
    const guard = layoutSource.indexOf(
      "<Stack.Protected guard={!!session && consent.status === 'current' && onboarded === true}>",
    );
    const guardEnd = layoutSource.indexOf('</Stack.Protected>', guard);
    expect(layoutSource.slice(guard, guardEnd)).toContain('<Stack.Screen name="journey-progress" options={{ headerShown: false }} />');
  });

  test('keeps direct route controls at 48 points and body content wrapping for large text', async () => {
    mockOwnerId = 'owner-a';
    mockFocused = true;
    mockListMeasurements.mockReset().mockResolvedValue([measurement('layout', 74)]);
    mockListPhotos.mockReset().mockResolvedValue([]);
    mockGetInsights.mockReset().mockResolvedValue(insights);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    const checkIn = renderer.root.findByProps({ accessibilityLabel: 'Add body check-in' });
    expect(StyleSheet.flatten(checkIn.props.style).minHeight).toBeGreaterThanOrEqual(48);
    for (const label of ['Momentum journey tab', 'Progress journey tab', 'Path journey tab', 'Journal journey tab']) {
      const tab = renderer.root.findByProps({ accessibilityLabel: label });
      const renderedStyle = typeof tab.props.style === 'function' ? tab.props.style({ pressed: false }) : tab.props.style;
      expect(StyleSheet.flatten(renderedStyle).minHeight).toBeGreaterThanOrEqual(48);
    }
    const wrappingLayouts = renderer.root.findAll((node) =>
      StyleSheet.flatten(node.props.style)?.flexWrap === 'wrap',
    );
    expect(wrappingLayouts.length).toBeGreaterThanOrEqual(2);
  });
});
