/* eslint-disable @typescript-eslint/no-require-imports -- route loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

import type { BodyMeasurement, ProgressPhoto } from './types';

let mockOwnerId: string | null = 'owner-a';
let mockFocusEpoch = 0;
const mockListMeasurements = jest.fn<(owner: string, limit: number) => Promise<BodyMeasurement[]>>();
const mockListPhotos = jest.fn<(owner: string) => Promise<ProgressPhoto[]>>();
const mockAddMeasurement = jest.fn<(...args: unknown[]) => Promise<BodyMeasurement>>();
const mockGetInsights = jest.fn<() => Promise<Record<string, unknown>>>();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ session: mockOwnerId ? { user: { id: mockOwnerId } } : null }),
}));
jest.mock('expo-router', () => {
  const ReactModule = require('react') as typeof React;
  return {
    useRouter: () => ({ replace: jest.fn() }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      ReactModule.useEffect(effect, [effect, mockFocusEpoch]);
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
jest.mock('../journey/JourneyTabs', () => ({
  JourneyTabs: ({ active }: { active: string }) => {
    const ReactModule = require('react') as typeof React;
    const { Text: NativeText } = require('react-native') as typeof import('react-native');
    return ReactModule.createElement(NativeText, null, `Tab ${active}`);
  },
}));
jest.mock('./api', () => ({
  listMeasurements: (owner: string, limit: number) => mockListMeasurements(owner, limit),
  listProgressPhotos: (owner: string) => mockListPhotos(owner),
  addMeasurement: (...args: unknown[]) => mockAddMeasurement(...args),
}));
jest.mock('../insights/api', () => ({ getInsights: () => mockGetInsights() }));

const measurement = (id: string, weightKg: number, heightCm = 180, day = 20): BodyMeasurement => ({
  id,
  weightKg,
  heightCm,
  recordedAt: `2026-08-${String(day).padStart(2, '0')}T10:30:00.000Z`,
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
  ).filter((value): value is string | number => typeof value === 'string' || typeof value === 'number').join(' ');
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
const ProgressRoute = require('../app/journey-progress').default as React.ComponentType;

describe('Journey progress owner lifecycle', () => {
  beforeEach(() => {
    mockOwnerId = 'owner-a';
    mockFocusEpoch = 0;
    mockListMeasurements.mockReset().mockResolvedValue([]);
    mockListPhotos.mockReset().mockResolvedValue([]);
    mockAddMeasurement.mockReset();
    mockGetInsights.mockReset().mockResolvedValue(insights);
  });
  afterEach(() => {
    for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
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

  test('shows a truthful initial error and Retry recovers all data', async () => {
    mockListMeasurements.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([measurement('m1', 72)]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<ProgressRoute />); mounted.push(renderer); });
    await flush();
    expect(textOf(renderer)).toContain('Your progress couldn’t load. Check your connection and try again.');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Journey progress failed to load' }).props.accessibilityRole).toBe('alert');
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry loading journey progress' }).props.onPress());
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
    expect(textOf(renderer)).toContain('75.0 kg');
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
    act(() => { renderer = TestRenderer.create(<WeightTrendChart measurements={points} />); });
    mounted.push(renderer);
    expect(renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('started at 75.0 kg, current 74.0 kg, change -1.0 kg'))).not.toHaveLength(0);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Show monthly weight trend' }).props.onPress());
    expect(renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.includes('started at 80.0 kg, current 74.0 kg, change -6.0 kg'))).not.toHaveLength(0);
  });

  test('states empty and single-point limitations truthfully', () => {
    let empty!: TestRenderer.ReactTestRenderer;
    act(() => { empty = TestRenderer.create(<WeightTrendChart measurements={[]} />); });
    mounted.push(empty);
    expect(textOf(empty)).toContain('Add a body check-in to begin your weight trend.');

    let single!: TestRenderer.ReactTestRenderer;
    act(() => { single = TestRenderer.create(<WeightTrendChart measurements={[measurement('only', 74)]} />); });
    mounted.push(single);
    expect(textOf(single)).toContain('One check-in recorded. Add another to see a trend.');
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
    const guard = layoutSource.indexOf('<Stack.Protected guard={!!session && onboarded === true}>');
    const guardEnd = layoutSource.indexOf('</Stack.Protected>', guard);
    expect(layoutSource.slice(guard, guardEnd)).toContain('<Stack.Screen name="journey-progress" options={{ headerShown: false }} />');
  });
});
