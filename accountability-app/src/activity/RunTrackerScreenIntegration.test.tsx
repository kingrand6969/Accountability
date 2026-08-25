/* eslint-disable @typescript-eslint/no-require-imports -- route loads after mutable Jest mocks */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert, Platform, StyleSheet, Text } from 'react-native';
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
const OWNER_C = 'owner-c';
const STARTED_AT = '2026-08-25T09:00:00.000Z';
const OWNER_A_POINTS: Pt[] = [
  { lat: -31.9523, lon: 115.8613 },
  { lat: -31.947, lon: 115.869 },
  { lat: -31.941, lon: 115.875 },
];
const OWNER_B_POINTS: Pt[] = [
  { lat: -33.8688, lon: 151.2093 },
  { lat: -33.8215, lon: 151.1809 },
  { lat: -33.773, lon: 151.124 },
];

let mockOwnerId: string | null = OWNER_A;
let mockAuthLoading = false;
let mockMapProps: Record<string, unknown> | null = null;
let mockMapMounts = 0;
let mockMapUnmounts = 0;
let mockStaticTabOptions: Record<string, unknown> | null = null;
let mockShareSheetProps: {
  run: { ownerId: string | null; distance: number; points: Pt[] };
  onClose: () => void;
} | null = null;
const mockSetOptions = jest.fn();
const mockSetRoute = jest.fn();
const mockClearRoute = jest.fn();
const mockCenterOn = jest.fn();
const mockFitRoute = jest.fn();
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
const mockEnsureTrackLocationTaskFor = jest.fn<
  (identity: TrackRecordingIdentity) => Promise<'running' | 'restarted' | 'paused' | 'stale'>
>();
const mockStartTrackLocationTaskFor = jest.fn<
  (identity: TrackRecordingIdentity) => Promise<'running' | 'restarted' | 'paused' | 'stale'>
>();
const mockPauseTrackLocationTaskFor = jest.fn<
  (identity: TrackRecordingIdentity) => Promise<'paused' | 'already_paused' | 'stale'>
>();
const mockReadTrackPoints = jest.fn<() => Promise<Pt[]>>();
const mockReadTrackRecording = jest.fn<
  (ownerId?: string | null) => Promise<(TrackRecordingIdentity & { points: Pt[] }) | null>
>();
const mockClaimLegacyTrackRecording = jest.fn<
  (ownerId: string, type: ActivityType) => Promise<TrackRecordingRecovery>
>();
const mockClearTrackRecording = jest.fn<(activityId: string) => Promise<void>>();
const mockPersistCompletedTrackRecording = jest.fn<
  (recording: unknown) => Promise<void>
>();
const mockEnqueueActivity = jest.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>();

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
    Tabs: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockStaticTabOptions = options;
        return null;
      },
    },
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
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
}));

jest.mock('../ui/OsmMap', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    OsmMap: ReactModule.forwardRef(
      (props: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
        mockMapProps = props;
        ReactModule.useEffect(() => {
          mockMapMounts += 1;
          return () => {
            mockMapUnmounts += 1;
          };
        }, []);
        ReactModule.useImperativeHandle(
          ref,
          () => ({
            centerOn: mockCenterOn,
            clearRoute: mockClearRoute,
            fitRoute: mockFitRoute,
            setRoute: mockSetRoute,
          }),
          [],
        );
        return ReactModule.createElement(View, { testID: 'mock-osm-map' });
      },
    ),
  };
});

jest.mock('./RunShareSheet', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RunShareSheet: (props: typeof mockShareSheetProps) => {
      mockShareSheetProps = props;
      return ReactModule.createElement(View, { testID: 'mock-run-share-sheet' });
    },
  };
});

jest.mock('./locationTask', () => ({
  beginTrackRecording: (...args: [string, ActivityType]) =>
    mockBeginTrackRecording(...args),
  claimLegacyTrackRecording: (...args: [string, ActivityType]) =>
    mockClaimLegacyTrackRecording(...args),
  clearTrackRecording: (activityId: string) => mockClearTrackRecording(activityId),
  ensureTrackLocationTaskFor: (identity: TrackRecordingIdentity) =>
    mockEnsureTrackLocationTaskFor(identity),
  persistCompletedTrackRecording: (recording: unknown) =>
    mockPersistCompletedTrackRecording(recording),
  readTrackPoints: () => mockReadTrackPoints(),
  readTrackRecording: (ownerId?: string | null) => mockReadTrackRecording(ownerId),
  recoverTrackRecording: (...args: [string | null, ActivityType]) =>
    mockRecoverTrackRecording(...args),
  startTrackLocationTaskFor: (identity: TrackRecordingIdentity) =>
    mockStartTrackLocationTaskFor(identity),
  pauseTrackLocationTaskFor: (identity: TrackRecordingIdentity) =>
    mockPauseTrackLocationTaskFor(identity),
}));

jest.mock('./offlineQueueStore', () => ({
  enqueueActivity: (...args: unknown[]) => mockEnqueueActivity(...args),
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

function pressLatestAlertButton(
  alert: jest.SpiedFunction<typeof Alert.alert>,
  label: string,
) {
  const buttons = alert.mock.calls.at(-1)?.[2];
  const button = buttons?.find((candidate) => candidate.text === label);
  if (!button) throw new Error(`Alert button not found: ${label}`);
  act(() => button.onPress?.());
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

async function renderRouteStrictMode() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <React.StrictMode>
        <RunRoute />
      </React.StrictMode>,
      { unstable_strictMode: true } as never,
    );
    mounted.push(renderer);
  });
  await flush();
  return renderer;
}

async function switchOwner(
  renderer: TestRenderer.ReactTestRenderer,
  ownerId: string | null,
) {
  mockOwnerId = ownerId;
  await act(async () => {
    renderer.update(<RunRoute />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  mockOwnerId = OWNER_A;
  mockAuthLoading = false;
  mockMapProps = null;
  mockMapMounts = 0;
  mockMapUnmounts = 0;
  mockStaticTabOptions = null;
  mockShareSheetProps = null;
  jest.clearAllMocks();
  [
    mockRecoverTrackRecording,
    mockBeginTrackRecording,
    mockEnsureTrackLocationTaskFor,
    mockStartTrackLocationTaskFor,
    mockPauseTrackLocationTaskFor,
    mockReadTrackPoints,
    mockReadTrackRecording,
    mockClaimLegacyTrackRecording,
    mockClearTrackRecording,
    mockPersistCompletedTrackRecording,
    mockEnqueueActivity,
  ].forEach((mock) => mock.mockReset());
  mockRecoverTrackRecording.mockResolvedValue({ kind: 'none' });
  mockBeginTrackRecording.mockResolvedValue({
    activityId: 'activity-a',
    ownerId: OWNER_A,
    startedAt: STARTED_AT,
  });
  mockEnsureTrackLocationTaskFor.mockResolvedValue('running');
  mockStartTrackLocationTaskFor.mockResolvedValue('restarted');
  mockPauseTrackLocationTaskFor.mockResolvedValue('paused');
  mockReadTrackPoints.mockResolvedValue([]);
  mockReadTrackRecording.mockResolvedValue(null);
  mockClaimLegacyTrackRecording.mockResolvedValue({ kind: 'none' });
  mockClearTrackRecording.mockResolvedValue(undefined);
  mockPersistCompletedTrackRecording.mockResolvedValue(undefined);
  mockEnqueueActivity.mockResolvedValue({
    id: 'activity-a',
    ownerId: OWNER_A,
    status: 'saved',
  });
});

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
  jest.restoreAllMocks();
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
    expect(mockStaticTabOptions).toEqual(
      expect.objectContaining({ tabBarStyle: { display: 'none' } }),
    );
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
      [expect.objectContaining({ text: 'Close', style: 'cancel' })],
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
    expect(mockStartTrackLocationTaskFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Recording. GPS active' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
  });

  test('never enters tracking UI when a newly started recording lease is stale', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    let recoveryReads = 0;
    mockRecoverTrackRecording.mockImplementation(async () => {
      recoveryReads += 1;
      return recoveryReads < 3
        ? { kind: 'none' }
        : { ...identity, kind: 'active', points: [], type: 'run' };
    });
    mockStartTrackLocationTaskFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress());
    await flush();

    expect(mockStartTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test('refreshes recovery instead of tracking a stale recovered lease', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        points: OWNER_A_POINTS,
        type: 'run',
      })
      .mockResolvedValueOnce({ kind: 'none' });
    mockEnsureTrackLocationTaskFor.mockResolvedValueOnce('stale');

    const renderer = await renderRoute();

    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
  });

  test('pauses a recovered A lease when its owner changes while resume is pending', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const leaseResume = deferred<'running'>();
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'run',
    });
    mockEnsureTrackLocationTaskFor.mockReturnValueOnce(leaseResume.promise);
    const renderer = await renderRoute();

    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    await switchOwner(renderer, OWNER_B);

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    leaseResume.resolve('running');
    await flush();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
  });

  test('prioritizes the current in-flight lease over a stale prior-owner recording ref', async () => {
    const identityA = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const identityB = {
      activityId: 'activity-b',
      ownerId: OWNER_B,
      startedAt: '2026-08-25T10:00:00.000Z',
    };
    const pauseA = deferred<'paused'>();
    const leaseResumeB = deferred<'running'>();
    mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
      if (ownerId === OWNER_A) {
        return { ...identityA, kind: 'active', points: OWNER_A_POINTS, type: 'run' };
      }
      if (ownerId === OWNER_B) {
        return { ...identityB, kind: 'active', points: [], type: 'walk' };
      }
      return { kind: 'none' };
    });
    mockEnsureTrackLocationTaskFor
      .mockResolvedValueOnce('running')
      .mockReturnValueOnce(leaseResumeB.promise);
    mockPauseTrackLocationTaskFor
      .mockReturnValueOnce(pauseA.promise)
      .mockResolvedValue('paused');
    const renderer = await renderRoute();

    await switchOwner(renderer, OWNER_B);
    await flush();
    expect(mockEnsureTrackLocationTaskFor).toHaveBeenLastCalledWith(identityB);
    mockPauseTrackLocationTaskFor.mockClear();

    await switchOwner(renderer, OWNER_C);

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identityB);
    pauseA.resolve('paused');
    leaseResumeB.resolve('running');
    await flush();
  });

  test('reconciles an active recording found during Start before showing tracking UI', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        points: OWNER_A_POINTS,
        type: 'run',
      });
    mockEnsureTrackLocationTaskFor.mockResolvedValueOnce('paused');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress());
    await flush();

    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(mockBeginTrackRecording).not.toHaveBeenCalled();
  });

  test('pauses an existing A lease found during Start when its owner changes while resume is pending', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const leaseResume = deferred<'running'>();
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        points: OWNER_A_POINTS,
        type: 'run',
      });
    mockEnsureTrackLocationTaskFor.mockReturnValueOnce(leaseResume.promise);
    const renderer = await renderRoute();

    act(() => {
      void renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress();
    });
    await flush();
    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);

    await switchOwner(renderer, OWNER_B);
    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    leaseResume.resolve('running');
    await flush();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
  });

  test.each([
    { name: 'while recording', recovery: 'active' as const },
    { name: 'with a pending save', recovery: 'completed' as const },
  ])('keeps More options safe until a separately confirmed discard $name', async ({ recovery }) => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce(
      recovery === 'active'
        ? {
            activityId: 'activity-a',
            kind: 'active',
            ownerId: OWNER_A,
            points: OWNER_A_POINTS,
            startedAt: STARTED_AT,
            type: 'run',
          }
        : {
            kind: 'completed',
            recording: {
              activityId: 'activity-a',
              ownerId: OWNER_A,
              activity,
            },
          },
    );
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );

    expect(alert).toHaveBeenCalledWith(
      'Run options',
      expect.stringMatching(/safely|recording|saved/i),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Keep activity', style: 'cancel' }),
        expect.objectContaining({ text: 'Discard activity', style: 'destructive' }),
      ]),
    );
    const menuButtons = alert.mock.calls.at(-1)?.[2] as
      | { text: string; onPress?: () => void }[]
      | undefined;
    act(() => menuButtons?.find((button) => button.text === 'Keep activity')?.onPress?.());
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
  });

  test.each([
    { recovery: 'active' as const, expectedPrimary: 'Stop & Save' },
    { recovery: 'completed' as const, expectedPrimary: 'Retry save' },
  ])('requires confirmation before completely discarding a $recovery recording', async ({
    recovery,
    expectedPrimary,
  }) => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce(
      recovery === 'active'
        ? {
            activityId: 'activity-a',
            kind: 'active',
            ownerId: OWNER_A,
            points: OWNER_A_POINTS,
            startedAt: STARTED_AT,
            type: 'run',
          }
        : {
            kind: 'completed',
            recording: {
              activityId: 'activity-a',
              ownerId: OWNER_A,
              activity,
            },
          },
    );
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    expect(alert).toHaveBeenLastCalledWith(
      'Discard activity?',
      expect.stringMatching(/permanently|cannot be undone/i),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Keep activity', style: 'cancel' }),
        expect.objectContaining({ text: 'Discard permanently', style: 'destructive' }),
      ]),
    );
    pressLatestAlertButton(alert, 'Keep activity');
    expect(renderer.root.findByProps({ accessibilityLabel: expectedPrimary })).toBeTruthy();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    if (recovery === 'active') {
      expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith({
        activityId: 'activity-a',
        ownerId: OWNER_A,
        startedAt: STARTED_AT,
      });
    } else {
      expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    }
    expect(mockClearTrackRecording).toHaveBeenCalledWith('activity-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(activity.distance_m));
  });

  test('retries a completed save without requiring an active location lease', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    mockPauseTrackLocationTaskFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress();
    });
    await flush();

    expect(mockPersistCompletedTrackRecording).toHaveBeenCalledTimes(1);
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'mock-run-share-sheet' })).toBeTruthy();
  });

  test('discards a completed save without requiring an active location lease', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    mockPauseTrackLocationTaskFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() => renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress());
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    expect(mockClearTrackRecording).toHaveBeenCalledWith('activity-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test.each(['lease pause', 'durable clear'] as const)(
    'moves a failed active discard into recoverable paused state after %s fails',
    async (failureStage) => {
      mockRecoverTrackRecording.mockResolvedValueOnce({
        activityId: 'activity-a',
        kind: 'active',
        ownerId: OWNER_A,
        points: OWNER_A_POINTS,
        startedAt: STARTED_AT,
        type: 'run',
      });
      if (failureStage === 'lease pause') {
        mockPauseTrackLocationTaskFor.mockRejectedValueOnce(new Error('lease pause failed'));
      } else {
        mockClearTrackRecording.mockRejectedValueOnce(new Error('durable clear failed'));
      }
      const renderer = await renderRoute();
      const alert = jest.spyOn(Alert, 'alert');

      act(() =>
        renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
      );
      pressLatestAlertButton(alert, 'Discard activity');
      pressLatestAlertButton(alert, 'Discard permanently');
      await flush();

      expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith({
        activityId: 'activity-a',
        ownerId: OWNER_A,
        startedAt: STARTED_AT,
      });
      expect(mockClearTrackRecording).toHaveBeenCalledTimes(
        failureStage === 'lease pause' ? 0 : 1,
      );
      expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Start Run' })).toHaveLength(0);
    },
  );

  test('keeps a pending save retryable when discard cannot clear durable storage', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    mockClearTrackRecording.mockRejectedValueOnce(new Error('durable clear failed'));
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    expect(mockClearTrackRecording).toHaveBeenCalledWith('activity-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry save' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'More options' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Recovery required' })).toHaveLength(0);
    expect(textOf(renderer)).toContain(formatKm(activity.distance_m));
  });

  test('single-flights Stop and keeps Finishing visible until lease pause and route read settle', async () => {
    const startedAt = new Date().toISOString();
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: [],
      startedAt,
      type: 'run',
    });
    const leasePause = deferred<'paused'>();
    const routeRead = deferred<TrackRecordingIdentity & { points: Pt[] }>();
    mockPauseTrackLocationTaskFor.mockReturnValueOnce(leasePause.promise);
    mockReadTrackRecording.mockReturnValueOnce(routeRead.promise);
    const renderer = await renderRoute();
    const stop = renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props
      .onPress as () => void;

    await act(async () => {
      stop();
      stop();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledTimes(1);
    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt,
    });
    expect(mockReadTrackRecording).not.toHaveBeenCalled();
    expect(
      renderer.root.findByProps({
        accessibilityLabel: 'Finishing activity. Saving your route safely',
      }),
    ).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Finishing…' }).props)
      .toMatchObject({
        accessibilityState: { busy: true, disabled: true },
        disabled: true,
      });
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Start Run' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Run' }).props.accessibilityState.disabled)
      .toBe(true);

    leasePause.resolve('paused');
    await flush();
    expect(mockReadTrackRecording).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Finishing…' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Start Run' })).toHaveLength(0);

    routeRead.resolve({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt,
      points: [],
    });
    await flush();
    expect(mockClearTrackRecording).toHaveBeenCalledWith('activity-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Finishing…' })).toHaveLength(0);
  });

  test('keeps the recording recoverable when its owner-bound lease cannot pause', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'run',
    });
    mockPauseTrackLocationTaskFor.mockRejectedValueOnce(new Error('lease pause failed'));
    const renderer = await renderRoute();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress(),
    );
    await flush();

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    });
    expect(mockReadTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
  });

  test('does not read or save points when Stop discovers a stale recording lease', async () => {
    const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt: STARTED_AT };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        points: OWNER_A_POINTS,
        type: 'run',
      })
      .mockResolvedValueOnce({ kind: 'none' });
    mockPauseTrackLocationTaskFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(mockReadTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('refuses to save a Stop snapshot whose exact recording identity changed', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'run',
    });
    mockReadTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-b',
      ownerId: OWNER_B,
      startedAt: '2026-08-25T10:00:00.000Z',
      points: OWNER_B_POINTS,
    });
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_B_POINTS)));
  });

  test('releases the Stop lock after a route-read error so recovery can retry', async () => {
    const activeRecovery: TrackRecordingRecovery = {
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: [],
      startedAt: new Date().toISOString(),
      type: 'run',
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce(activeRecovery)
      .mockResolvedValueOnce(activeRecovery);
    mockReadTrackRecording
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce({
        activityId: activeRecovery.activityId,
        ownerId: activeRecovery.ownerId,
        startedAt: activeRecovery.startedAt,
        points: [],
      });
    const renderer = await renderRoute();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress(),
    );
    await flush();
    expect(mockReadTrackRecording).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Retry resume' }).props.onPress();
    });
    await flush();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress(),
    );
    await flush();
    expect(mockReadTrackRecording).toHaveBeenCalledTimes(2);
    expect(mockClearTrackRecording).toHaveBeenCalledWith('activity-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('rejects a stale Start result after A to B to A even when the owner id matches again', async () => {
    const renderer = await renderRoute();
    const startRecovery = deferred<TrackRecordingRecovery>();
    mockRecoverTrackRecording
      .mockReturnValueOnce(startRecovery.promise)
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress());
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    startRecovery.resolve({ kind: 'none' });
    await flush();

    expect(mockBeginTrackRecording).not.toHaveBeenCalled();
    expect(mockStartTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test('leaves a durably begun A recording for recovery without starting stale UI under B', async () => {
    const renderer = await renderRoute();
    const begun = deferred<TrackRecordingIdentity>();
    mockRecoverTrackRecording.mockResolvedValueOnce({ kind: 'none' });
    mockBeginTrackRecording.mockReturnValueOnce(begun.promise);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress());
    await flush();
    expect(mockBeginTrackRecording).toHaveBeenCalledWith(OWNER_A, 'run');

    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    begun.resolve({ activityId: 'durable-a', ownerId: OWNER_A, startedAt: STARTED_AT });
    await flush();

    expect(mockStartTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('pauses A when its owner changes while the leased native start is pending', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const leasedStart = deferred<'running'>();
    mockStartTrackLocationTaskFor.mockReturnValueOnce(leasedStart.promise);
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress());
    await flush();
    expect(mockStartTrackLocationTaskFor).toHaveBeenCalledWith(identity);

    await switchOwner(renderer, OWNER_B);
    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    leasedStart.resolve('running');
    await flush();

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Distance 0.00 kilometres' })).toBeTruthy();
  });

  test('rejects a stale legacy-claim result after the owner generation changes', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({ kind: 'legacy_unclaimed' });
    const renderer = await renderRoute();
    const claim = deferred<TrackRecordingRecovery>();
    mockClaimLegacyTrackRecording.mockReturnValueOnce(claim.promise);
    act(() => {
      void renderer.root.findByProps({
        accessibilityLabel: 'Restore to this account',
      }).props.onPress();
    });
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    claim.resolve({
      activityId: 'stale-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'ride',
    });
    await flush();

    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Ride' }).some(
      (node) => node.props.accessibilityState?.selected,
    )).toBe(false);
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
  });

  test('reconciles a claimed legacy recording lease before showing tracking UI', async () => {
    const identity = {
      activityId: 'claimed-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({ kind: 'legacy_unclaimed' });
    mockClaimLegacyTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'walk',
    });
    mockEnsureTrackLocationTaskFor.mockResolvedValueOnce('paused');
    const renderer = await renderRoute();

    await act(async () => {
      await renderer.root.findByProps({
        accessibilityLabel: 'Restore to this account',
      }).props.onPress();
    });

    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test('pauses a claimed legacy A lease when its owner changes while resume is pending', async () => {
    const identity = {
      activityId: 'claimed-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const leaseResume = deferred<'running'>();
    mockRecoverTrackRecording.mockResolvedValueOnce({ kind: 'legacy_unclaimed' });
    mockClaimLegacyTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'walk',
    });
    mockEnsureTrackLocationTaskFor.mockReturnValueOnce(leaseResume.promise);
    const renderer = await renderRoute();

    act(() => {
      void renderer.root.findByProps({
        accessibilityLabel: 'Restore to this account',
      }).props.onPress();
    });
    await flush();
    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);

    await switchOwner(renderer, OWNER_B);
    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    leaseResume.resolve('running');
    await flush();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
  });

  test('rejects a stale retry-resume result after A to B to A', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: [],
      startedAt: STARTED_AT,
      type: 'run',
    });
    mockEnsureTrackLocationTaskFor.mockResolvedValueOnce('paused');
    const renderer = await renderRoute();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    const retryRecovery = deferred<TrackRecordingRecovery>();
    mockRecoverTrackRecording.mockReturnValueOnce(retryRecovery.promise);
    act(() => {
      void renderer.root.findByProps({ accessibilityLabel: 'Retry resume' }).props.onPress();
    });
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    retryRecovery.resolve({
      activityId: 'stale-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'ride',
    });
    await flush();
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Ride' }).some(
      (node) => node.props.accessibilityState?.selected,
    )).toBe(false);
  });

  test('finishes durable A stop work but never applies it after A to B to A', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'run',
    });
    const renderer = await renderRoute();
    const leasePause = deferred<'paused'>();
    mockPauseTrackLocationTaskFor.mockReturnValue(leasePause.promise);
    mockReadTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
      points: OWNER_A_POINTS,
    });
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    leasePause.resolve('paused');
    await flush();
    await flush();

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    });
    expect(mockPersistCompletedTrackRecording).toHaveBeenCalledTimes(1);
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
  });

  test('pauses the immutable A recording lease immediately at an owner boundary', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'run',
    });
    const renderer = await renderRoute();
    const ownerBRecovery = deferred<TrackRecordingRecovery>();
    mockRecoverTrackRecording.mockImplementation(async (ownerId) =>
      ownerId === OWNER_B ? ownerBRecovery.promise : { kind: 'none' },
    );

    await switchOwner(renderer, OWNER_B);

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(renderer.root.findAllByProps({ testID: 'mock-osm-map' })).toHaveLength(0);
    ownerBRecovery.resolve({ kind: 'none' });
    await flush();
  });

  test('reconciles a stale too-short Stop after its owner-bound clear finishes across A to B to A', async () => {
    const startedAt = new Date().toISOString();
    const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt };
    let ownerAReads = 0;
    mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
      if (ownerId === OWNER_B) {
        return { activityId: identity.activityId, kind: 'owner_mismatch', ownerId: OWNER_A };
      }
      ownerAReads += 1;
      return ownerAReads < 3
        ? { ...identity, kind: 'active', points: [], type: 'run' }
        : { kind: 'none' };
    });
    const leasePause = deferred<'paused'>();
    const durableClear = deferred<void>();
    mockPauseTrackLocationTaskFor.mockReturnValue(leasePause.promise);
    mockReadTrackRecording.mockResolvedValueOnce({ ...identity, points: [] });
    mockClearTrackRecording.mockReturnValueOnce(durableClear.promise);
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    leasePause.resolve('paused');
    await flush();
    expect(mockClearTrackRecording).toHaveBeenCalledWith(identity.activityId);

    durableClear.resolve(undefined);
    await flush();
    await flush();

    expect(ownerAReads).toBeGreaterThanOrEqual(3);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test('reconciles a stale too-short Stop clear failure to paused recovery across A to B to A', async () => {
    const startedAt = new Date().toISOString();
    const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt };
    let ownerAReads = 0;
    mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
      if (ownerId === OWNER_B) {
        return { activityId: identity.activityId, kind: 'owner_mismatch', ownerId: OWNER_A };
      }
      ownerAReads += 1;
      return { ...identity, kind: 'active', points: [], type: 'run' };
    });
    mockEnsureTrackLocationTaskFor.mockImplementation(async () =>
      ownerAReads >= 3 ? 'paused' : 'running',
    );
    const leasePause = deferred<'paused'>();
    const durableClear = deferred<void>();
    mockPauseTrackLocationTaskFor.mockReturnValue(leasePause.promise);
    mockReadTrackRecording.mockResolvedValueOnce({ ...identity, points: [] });
    mockClearTrackRecording.mockReturnValueOnce(durableClear.promise);
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    leasePause.resolve('paused');
    await flush();
    expect(mockClearTrackRecording).toHaveBeenCalledWith(identity.activityId);

    durableClear.reject(new Error('clear failed'));
    await flush();
    await flush();

    expect(ownerAReads).toBeGreaterThanOrEqual(3);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test('reconciles a stale Stop read error to paused recovery across A to B to A', async () => {
    const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt: STARTED_AT };
    let ownerAReads = 0;
    mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
      if (ownerId === OWNER_B) {
        return { activityId: identity.activityId, kind: 'owner_mismatch', ownerId: OWNER_A };
      }
      ownerAReads += 1;
      return { ...identity, kind: 'active', points: [], type: 'run' };
    });
    mockEnsureTrackLocationTaskFor.mockImplementation(async () =>
      ownerAReads >= 3 ? 'paused' : 'running',
    );
    const leasePause = deferred<'paused'>();
    mockPauseTrackLocationTaskFor.mockReturnValue(leasePause.promise);
    mockReadTrackRecording.mockRejectedValueOnce(new Error('route read failed'));
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    leasePause.resolve('paused');
    await flush();
    await flush();

    expect(ownerAReads).toBeGreaterThanOrEqual(3);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test.each(['clear succeeds', 'clear fails'] as const)(
    'reconciles stale confirmed discard when durable %s across A to B to A',
    async (clearOutcome) => {
      const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt: STARTED_AT };
      let ownerAReads = 0;
      mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
        if (ownerId === OWNER_B) {
          return { activityId: identity.activityId, kind: 'owner_mismatch', ownerId: OWNER_A };
        }
        ownerAReads += 1;
        if (ownerAReads >= 3 && clearOutcome === 'clear succeeds') return { kind: 'none' };
        return { ...identity, kind: 'active', points: OWNER_A_POINTS, type: 'run' };
      });
      mockEnsureTrackLocationTaskFor.mockImplementation(async () =>
        ownerAReads >= 3 ? 'paused' : 'running',
      );
      const leasePause = deferred<'paused'>();
      const durableClear = deferred<void>();
      mockPauseTrackLocationTaskFor.mockReturnValue(leasePause.promise);
      mockClearTrackRecording.mockReturnValueOnce(durableClear.promise);
      const renderer = await renderRoute();
      const alert = jest.spyOn(Alert, 'alert');

      act(() => renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress());
      pressLatestAlertButton(alert, 'Discard activity');
      pressLatestAlertButton(alert, 'Discard permanently');
      await switchOwner(renderer, OWNER_B);
      await switchOwner(renderer, OWNER_A);
      leasePause.resolve('paused');
      await flush();
      if (clearOutcome === 'clear succeeds') durableClear.resolve(undefined);
      else durableClear.reject(new Error('clear failed'));
      await flush();
      await flush();

      expect(ownerAReads).toBeGreaterThanOrEqual(3);
      if (clearOutcome === 'clear succeeds') {
        expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
      } else {
        expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
      }
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    },
  );

  test('finishes durable A persist but suppresses stale completion UI after account changes', async () => {
    const activity = {
      type: 'walk' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    const renderer = await renderRoute();
    const persisted = deferred<void>();
    mockPersistCompletedTrackRecording.mockReturnValueOnce(persisted.promise);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    persisted.resolve(undefined);
    await flush();

    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('refreshes B after stale A queue and recording-clear work finishes', async () => {
    const activity = {
      type: 'walk' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    const renderer = await renderRoute();
    const queued = deferred<Record<string, unknown>>();
    const cleared = deferred<void>();
    let recordingCleared = false;
    mockEnqueueActivity.mockReturnValueOnce(queued.promise);
    mockClearTrackRecording.mockImplementationOnce(async () => {
      await cleared.promise;
      recordingCleared = true;
    });

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    await flush();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);

    let ownerBRecoveryReads = 0;
    mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
      if (ownerId !== OWNER_B) return { kind: 'none' };
      ownerBRecoveryReads += 1;
      return !recordingCleared
        ? {
            activityId: 'activity-a',
            kind: 'owner_mismatch',
            ownerId: OWNER_A,
          }
        : { kind: 'none' };
    });
    await switchOwner(renderer, OWNER_B);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Recovery required' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ testID: 'mock-osm-map' })).toHaveLength(0);

    queued.resolve({ id: 'activity-a', ownerId: OWNER_A, status: 'saved' });
    await flush();
    expect(mockClearTrackRecording).toHaveBeenCalledWith('activity-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Recovery required' })).toBeTruthy();

    cleared.resolve(undefined);
    await flush();
    await flush();

    expect(mockRecoverTrackRecording).toHaveBeenLastCalledWith(OWNER_B, 'run');
    expect(ownerBRecoveryReads).toBeGreaterThanOrEqual(2);
    expect(renderer.root.findByProps({ testID: 'mock-osm-map' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(activity.distance_m));
  });

  test('keeps save-to-share authority valid through Strict Mode effect replay', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValue({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    const renderer = await renderRouteStrictMode();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    await flush();

    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).toHaveBeenCalledTimes(1);
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockShareSheetProps?.run.ownerId).toBe(OWNER_A);
    expect(renderer.root.findByProps({ testID: 'mock-run-share-sheet' })).toBeTruthy();
  });

  test('never reveals an A completion after its share sheet closes under B', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    const renderer = await renderRoute();
    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress();
    });
    await flush();
    const staleClose = mockShareSheetProps?.onClose;
    expect(mockShareSheetProps?.run.ownerId).toBe(OWNER_A);

    const ownerBRecovery = deferred<TrackRecordingRecovery>();
    mockRecoverTrackRecording.mockImplementation(async (ownerId) =>
      ownerId === OWNER_B ? ownerBRecovery.promise : { kind: 'none' },
    );
    await switchOwner(renderer, OWNER_B);
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'mock-osm-map' })).toHaveLength(0);
    act(() => staleClose?.());
    expect(renderer.root.findAllByProps({ testID: 'mock-osm-map' })).toHaveLength(0);
    expect(textOf(renderer)).not.toContain(formatKm(activity.distance_m));

    ownerBRecovery.resolve({ kind: 'none' });
    await flush();
    expect(renderer.root.findByProps({ testID: 'mock-osm-map' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Distance 0.00 kilometres' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(activity.distance_m));
  });

  test('rejects a stale A share close after A to B to A changes the owner generation', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      recording: { activityId: 'activity-a', ownerId: OWNER_A, activity },
    });
    const renderer = await renderRoute();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    await flush();
    const staleClose = mockShareSheetProps?.onClose;
    expect(staleClose).toBeDefined();

    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    expect(renderer.root.findByProps({ testID: 'mock-osm-map' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();

    act(() => staleClose?.());

    expect(mockRouter.navigate).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'mock-osm-map' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(activity.distance_m));
  });

  test('single-flights timer reads and rejects their result after A to B to A', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    try {
      mockRecoverTrackRecording.mockResolvedValueOnce({
        activityId: 'activity-a',
        kind: 'active',
        ownerId: OWNER_A,
        points: [],
        startedAt: STARTED_AT,
        type: 'run',
      });
      const routeRead = deferred<Pt[]>();
      mockReadTrackPoints.mockReturnValueOnce(routeRead.promise);
      const renderer = await renderRoute();

      await act(async () => {
        jest.advanceTimersByTime(3_000);
        await Promise.resolve();
      });
      expect(mockReadTrackPoints).toHaveBeenCalledTimes(1);
      mockRecoverTrackRecording
        .mockResolvedValueOnce({ kind: 'none' })
        .mockResolvedValueOnce({ kind: 'none' });
      await switchOwner(renderer, OWNER_B);
      await switchOwner(renderer, OWNER_A);
      routeRead.resolve(OWNER_A_POINTS);
      await flush();

      expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_A_POINTS)));
      expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test('preserves user pan and zoom after the first authoritative live-route centering', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    try {
      mockRecoverTrackRecording.mockResolvedValueOnce({
        activityId: 'activity-a',
        kind: 'active',
        ownerId: OWNER_A,
        points: OWNER_A_POINTS,
        startedAt: STARTED_AT,
        type: 'run',
      });
      const nextPoints = [
        ...OWNER_A_POINTS,
        { lat: -31.936, lon: 115.881 },
      ];
      const routeRead = deferred<Pt[]>();
      mockReadTrackPoints.mockReturnValueOnce(routeRead.promise);
      const renderer = await renderRoute();
      expect(mockSetRoute).toHaveBeenCalledWith(
        OWNER_A_POINTS.map((point) => ({ lat: point.lat, lng: point.lon })),
        expect.objectContaining({ viewport: 'center' }),
      );
      mockSetRoute.mockClear();

      await act(async () => {
        jest.advanceTimersByTime(3_000);
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        routeRead.resolve(nextPoints);
        await Promise.resolve();
        await Promise.resolve();
      });
      await flush();

      expect(mockReadTrackPoints).toHaveBeenCalledTimes(1);
      expect(textOf(renderer)).toContain(formatKm(totalDistanceMeters(nextPoints)));
      expect(mockSetRoute).toHaveBeenCalledWith(
        nextPoints.map((point) => ({ lat: point.lat, lng: point.lon })),
        { viewport: 'preserve' },
      );
      expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  test.each([
    { state: 'checking', copy: 'Checking saved activity', allowedAction: null },
    { state: 'needs_owner', copy: 'Recording saved safely', allowedAction: null },
    { state: 'owner_mismatch', copy: 'Recording saved safely', allowedAction: null },
    { state: 'storage_error', copy: 'Saved activity could not be checked', allowedAction: null },
    {
      state: 'legacy_unclaimed',
      copy: 'Unsaved activity from an older version found',
      allowedAction: 'Restore to this account',
    },
    { state: 'tracking_paused', copy: 'Tracking paused', allowedAction: 'Retry resume' },
  ])(
    'shows one redacted disabled recovery action for $state',
    async ({ state, copy, allowedAction }) => {
      if (state === 'checking') {
        mockRecoverTrackRecording.mockReturnValueOnce(new Promise(() => {}));
      } else if (state === 'storage_error') {
        mockRecoverTrackRecording.mockRejectedValueOnce(new Error('storage unavailable'));
      } else if (state === 'tracking_paused') {
        mockRecoverTrackRecording.mockResolvedValueOnce({
          activityId: 'activity-a',
          kind: 'active',
          ownerId: OWNER_A,
          points: OWNER_A_POINTS,
          startedAt: STARTED_AT,
          type: 'ride',
        });
        mockEnsureTrackLocationTaskFor.mockResolvedValueOnce('paused');
      } else if (state === 'owner_mismatch') {
        mockOwnerId = OWNER_B;
        mockRecoverTrackRecording.mockResolvedValueOnce({
          activityId: 'activity-a',
          kind: 'owner_mismatch',
          ownerId: OWNER_A,
        });
      } else {
        mockRecoverTrackRecording.mockResolvedValueOnce({
          kind: state as 'needs_owner' | 'legacy_unclaimed',
        });
      }

      const renderer = await renderRoute();
      const recoveryAction = renderer.root.findByProps({
        accessibilityLabel: 'Recovery required',
      });
      const actionStyle = StyleSheet.flatten(recoveryAction.props.style);

      expect(recoveryAction.props.disabled).toBe(true);
      expect(recoveryAction.props.accessibilityState).toEqual({ disabled: true });
      expect(actionStyle.minHeight ?? actionStyle.height).toBeGreaterThanOrEqual(58);
      expect(textOf(renderer)).toContain(copy);
      expect(renderer.root.findAllByProps({ testID: 'run-open-map-chrome' })).toHaveLength(0);
      expect(renderer.root.findAllByProps({ testID: 'mock-osm-map' })).toHaveLength(0);
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Run' })).toHaveLength(0);
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Ride' })).toHaveLength(0);
      expect(renderer.root.findAll((node) =>
        typeof node.props.accessibilityLabel === 'string' &&
        node.props.accessibilityLabel.startsWith('Distance '),
      )).toHaveLength(0);
      if (allowedAction) {
        expect(renderer.root.findByProps({ accessibilityLabel: allowedAction })).toBeTruthy();
      }
    },
  );

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

    expect(mockSetRoute).toHaveBeenCalledWith(safeRoute, {
      viewport: 'center',
      center: latest,
    });
    expect(renderer.root.findByProps({ accessibilityLabel: 'Walk' }).props.accessibilityState.selected)
      .toBe(true);
    expect(
      renderer.root.findByProps({
        accessibilityLabel: `Distance ${formatKm(totalDistanceMeters(OWNER_A_POINTS))} kilometres`,
      }),
    ).toBeTruthy();

    mockCenterOn.mockClear();
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Center map on my location' }).props.onPress(),
    );
    expect(mockCenterOn).toHaveBeenLastCalledWith(latest);

    mockFitRoute.mockClear();
    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Show complete route' }).props.onPress(),
    );
    expect(mockFitRoute).toHaveBeenCalledTimes(1);
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
    mockRecoverTrackRecording.mockImplementation(async (ownerId) =>
      ownerId === OWNER_B ? ownerBRecovery.promise : { kind: 'none' },
    );
    mockClearRoute.mockClear();
    const ownerAMounts = mockMapMounts;
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
    expect(renderer.root.findAllByProps({ testID: 'mock-osm-map' })).toHaveLength(0);
    expect(mockClearRoute).toHaveBeenCalledTimes(1);
    expect(mockMapUnmounts).toBeGreaterThanOrEqual(1);

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
    expect(mockMapMounts).toBeGreaterThan(ownerAMounts);
  });
});
