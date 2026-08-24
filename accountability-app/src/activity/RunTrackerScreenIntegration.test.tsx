/* eslint-disable @typescript-eslint/no-require-imports -- route loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Platform, Text } from 'react-native';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

import type { ActivityType } from './api';
import { formatKm, totalDistanceMeters, type Pt } from './geo';
import type {
  TrackRecordingIdentity,
  TrackRecordingRecovery,
} from './locationTask';

const OWNER_A = 'owner-a';
const OWNER_B = 'owner-b';
const STARTED_AT = '2026-08-25T09:00:00.000Z';
const OWNER_A_POINTS: Pt[] = [
  { lat: -31.9523, lon: 115.8613 },
  { lat: -31.947, lon: 115.869 },
  { lat: -31.941, lon: 115.875 },
];

let mockOwnerId: string | null = OWNER_A;
let mockAuthLoading = false;
let mockMapProps: Record<string, unknown> | null = null;
const mockSetOptions = jest.fn();
const mockSetRoute = jest.fn();
const mockNavigateBackSafely = jest.fn();
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  navigate: jest.fn(),
  replace: jest.fn(),
};
const mockRecoverTrackRecording = jest.fn<
  (ownerId: string | null, type: ActivityType) => Promise<TrackRecordingRecovery>
>();
const mockBeginTrackRecording = jest.fn<
  (ownerId: string, type: ActivityType) => Promise<TrackRecordingIdentity>
>();
const mockEnsureTrackLocationTask = jest.fn<
  () => Promise<'running' | 'restarted' | 'paused'>
>();
const mockStartTrackLocationTask = jest.fn<() => Promise<void>>();
const mockReadTrackPoints = jest.fn<() => Promise<Pt[]>>();

jest.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    loading: mockAuthLoading,
    session: mockOwnerId ? { user: { id: mockOwnerId } } : null,
  }),
}));

jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return {
    useAppTheme: () => ({
      colors: themeColors('dark'),
      mode: 'dark',
      setMode: jest.fn(),
    }),
  };
});

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) =>
      ReactModule.useEffect(callback, [callback]),
    useNavigation: () => ({ setOptions: mockSetOptions }),
    useRouter: () => mockRouter,
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 20, left: 0 }),
}));

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

jest.mock('expo-linear-gradient', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    LinearGradient: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      ReactModule.createElement(View, props, children),
  };
});

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
}));

jest.mock('../ui/OsmMap', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    OsmMap: ReactModule.forwardRef(
      (props: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
        mockMapProps = props;
        ReactModule.useImperativeHandle(ref, () => ({ setRoute: mockSetRoute }));
        return ReactModule.createElement(View, { testID: 'mock-osm-map' });
      },
    ),
  };
});

jest.mock('./RunShareSheet', () => ({ RunShareSheet: () => null }));

jest.mock('./locationTask', () => ({
  LOCATION_TASK_NAME: 'test-location-task',
  beginTrackRecording: (...args: [string, ActivityType]) =>
    mockBeginTrackRecording(...args),
  claimLegacyTrackRecording: jest.fn(),
  clearTrackRecording: jest.fn(async () => undefined),
  ensureTrackLocationTask: () => mockEnsureTrackLocationTask(),
  persistCompletedTrackRecording: jest.fn(async () => undefined),
  readTrackPoints: () => mockReadTrackPoints(),
  readTrackRecording: jest.fn(async () => null),
  recoverTrackRecording: (...args: [string | null, ActivityType]) =>
    mockRecoverTrackRecording(...args),
  resetTrackPoints: jest.fn(async () => undefined),
  startTrackLocationTask: () => mockStartTrackLocationTask(),
}));

jest.mock('./offlineQueueStore', () => ({
  enqueueActivity: jest.fn(),
}));

jest.mock('../profiles/api', () => ({
  getMyProfile: jest.fn(async () => null),
}));

jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: () => null,
}));

jest.mock('../ui/haptics', () => ({ hapticImpact: jest.fn() }));

jest.mock('../navigation/routeAccessContract', () => ({
  navigateBackSafely: (...args: unknown[]) => mockNavigateBackSafely(...args),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function textOf(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root
    .findAllByType(Text)
    .flatMap((node) =>
      Array.isArray(node.props.children) ? node.props.children : [node.props.children],
    )
    .filter(
      (value): value is string | number =>
        typeof value === 'string' || typeof value === 'number',
    )
    .join(' ');
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
const originalPlatformOS = Platform.OS;
const RunRoute = require('../app/(app)/run').default as React.ComponentType;

async function renderRoute() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<RunRoute />);
    mounted.push(renderer);
  });
  await flush();
  return renderer;
}

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  mockOwnerId = OWNER_A;
  mockAuthLoading = false;
  mockMapProps = null;
  jest.clearAllMocks();
  mockRecoverTrackRecording.mockResolvedValue({ kind: 'none' });
  mockBeginTrackRecording.mockResolvedValue({
    activityId: 'activity-a',
    ownerId: OWNER_A,
    startedAt: STARTED_AT,
  });
  mockEnsureTrackLocationTask.mockResolvedValue('running');
  mockStartTrackLocationTask.mockResolvedValue(undefined);
  mockReadTrackPoints.mockResolvedValue([]);
});

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: originalPlatformOS,
  });
});

describe('Run tracker Open Map route integration', () => {
  test('hides the focused tab bar and renders the truthful interactive idle tracker', async () => {
    const renderer = await renderRoute();

    expect(mockSetOptions).toHaveBeenCalledWith({
      tabBarStyle: { display: 'none' },
    });
    expect(mockMapProps).toEqual(
      expect.objectContaining({ interactive: true, tiles: 'dark' }),
    );
    expect(renderer.root.findByProps({ testID: 'run-open-map-chrome' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Distance 0.00 kilometres' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:00' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Pace unavailable' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Estimated calories 0' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress());
    expect(mockNavigateBackSafely).toHaveBeenCalledWith(mockRouter);

    const alert = jest.spyOn(Alert, 'alert');
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    expect(alert).toHaveBeenCalledWith(
      'Run options',
      expect.stringMatching(/Run, Walk, or Ride/),
    );
    alert.mockRestore();
  });

  test('preserves Walk selection through the durable native recording start', async () => {
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Walk' }).props.onPress());
    expect(renderer.root.findByProps({ accessibilityLabel: 'Walk' }).props.accessibilityState.selected)
      .toBe(true);

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Start Walk' }).props.onPress();
    });
    await flush();

    expect(mockRecoverTrackRecording).toHaveBeenLastCalledWith(OWNER_A, 'walk');
    expect(mockBeginTrackRecording).toHaveBeenCalledWith(OWNER_A, 'walk');
    expect(mockStartTrackLocationTask).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Recording. GPS active' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
  });

  test('keeps recovered owner-safe geometry in the map and makes both map controls meaningful', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
      type: 'walk',
    });
    const renderer = await renderRoute();
    const safeRoute = OWNER_A_POINTS.map((point) => ({ lat: point.lat, lng: point.lon }));
    const latest = safeRoute[safeRoute.length - 1];

    expect(mockSetRoute).toHaveBeenCalledWith(safeRoute, latest);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Walk' }).props.accessibilityState.selected)
      .toBe(true);
    expect(
      renderer.root.findByProps({
        accessibilityLabel: `Distance ${formatKm(totalDistanceMeters(OWNER_A_POINTS))} kilometres`,
      }),
    ).toBeTruthy();

    mockSetRoute.mockClear();
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Center map on my location' }).props.onPress(),
    );
    expect(mockSetRoute).toHaveBeenLastCalledWith(safeRoute, latest);

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Show complete route' }).props.onPress(),
    );
    expect(mockSetRoute).toHaveBeenLastCalledWith(safeRoute);
  });

  test('clears account A immediately while account B recovery is unresolved', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: new Date(Date.now() - 65 * 60_000).toISOString(),
      type: 'ride',
    });
    const renderer = await renderRoute();
    const ownerADistance = formatKm(totalDistanceMeters(OWNER_A_POINTS));

    expect(textOf(renderer)).toContain(ownerADistance);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Ride' }).props.accessibilityState.selected)
      .toBe(true);

    const ownerBRecovery = deferred<TrackRecordingRecovery>();
    mockRecoverTrackRecording.mockReturnValueOnce(ownerBRecovery.promise);
    mockSetRoute.mockClear();
    mockOwnerId = OWNER_B;
    await act(async () => {
      renderer.update(<RunRoute />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(renderer.root.findAllByProps({ testID: 'run-open-map-chrome' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Distance 0.00 kilometres' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Ride' })).toHaveLength(0);
    expect(textOf(renderer)).not.toContain(ownerADistance);
    expect(mockSetRoute).toHaveBeenCalledWith([]);
    expect(mockMapProps).toEqual(expect.objectContaining({ route: [] }));

    ownerBRecovery.resolve({ kind: 'none' });
    await flush();
    expect(renderer.root.findByProps({ testID: 'run-open-map-chrome' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Distance 0.00 kilometres' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:00' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Ride' }).some(
      (node) => node.props.accessibilityState?.selected,
    )).toBe(false);
    expect(textOf(renderer)).not.toContain(ownerADistance);
    expect(mockMapProps).toEqual(expect.objectContaining({ route: [] }));
  });
});
