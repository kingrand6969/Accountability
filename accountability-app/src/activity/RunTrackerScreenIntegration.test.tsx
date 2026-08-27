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
  FinalizedTrackRecording,
  FinalizeTrackRecordingResult,
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
const mockDiscardLegacyUnprovableTrackRecording = jest.fn<
  (discardToken: string) => Promise<'discarded' | 'stale'>
>();
const mockClaimFinalizedEnqueueFor = jest.fn<
  (
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ) => Promise<
    | { kind: 'claimed' }
    | { kind: 'already_claimed' }
    | { kind: 'discarding' }
    | { kind: 'stale' }
  >
>();
const mockClearTrackRecording = jest.fn<(activityId: string) => Promise<void>>();
const mockDiscardTrackRecordingFor = jest.fn<
  (
    identity: TrackRecordingIdentity,
  ) => Promise<'discarded' | 'completion_in_progress' | 'stale'>
>();
const mockPersistCompletedTrackRecording = jest.fn<
  (recording: unknown) => Promise<void>
>();
const mockFinalizeTrackRecordingFor = jest.fn<
  (
    identity: TrackRecordingIdentity,
    summary: { type: ActivityType; durationS: number },
  ) => Promise<FinalizeTrackRecordingResult>
>();
const mockAcknowledgeFinalizedTrackRecordingFor = jest.fn<
  (
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ) => Promise<'acknowledged' | 'stale'>
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
  acknowledgeFinalizedTrackRecordingFor: (
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ) => mockAcknowledgeFinalizedTrackRecordingFor(identity, snapshotId),
  beginTrackRecording: (...args: [string, ActivityType]) =>
    mockBeginTrackRecording(...args),
  discardLegacyUnprovableTrackRecording: (discardToken: string) =>
    mockDiscardLegacyUnprovableTrackRecording(discardToken),
  claimFinalizedEnqueueFor: (
    identity: TrackRecordingIdentity,
    snapshotId: string,
  ) => mockClaimFinalizedEnqueueFor(identity, snapshotId),
  clearTrackRecording: (activityId: string) => mockClearTrackRecording(activityId),
  discardTrackRecordingFor: (identity: TrackRecordingIdentity) =>
    mockDiscardTrackRecordingFor(identity),
  ensureTrackLocationTaskFor: (identity: TrackRecordingIdentity) =>
    mockEnsureTrackLocationTaskFor(identity),
  finalizeTrackRecordingFor: (
    identity: TrackRecordingIdentity,
    summary: { type: ActivityType; durationS: number },
  ) => mockFinalizeTrackRecordingFor(identity, summary),
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

function finalizedTrack(
  activity: {
    type: ActivityType;
    distance_m: number;
    duration_s: number;
    route: Pt[];
    started_at: string;
  },
  identity: TrackRecordingIdentity = {
    activityId: 'activity-a',
    ownerId: OWNER_A,
    startedAt: activity.started_at,
  },
): FinalizedTrackRecording {
  return {
    identity,
    finishId: `finish-${identity.activityId}`,
    snapshotId: `snapshot-${identity.activityId}`,
    recording: {
      activityId: identity.activityId,
      ownerId: identity.ownerId,
      activity,
    },
  };
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
    mockDiscardLegacyUnprovableTrackRecording,
    mockClaimFinalizedEnqueueFor,
    mockClearTrackRecording,
    mockDiscardTrackRecordingFor,
    mockPersistCompletedTrackRecording,
    mockFinalizeTrackRecordingFor,
    mockAcknowledgeFinalizedTrackRecordingFor,
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
  mockDiscardLegacyUnprovableTrackRecording.mockResolvedValue('discarded');
  mockClaimFinalizedEnqueueFor.mockResolvedValue({ kind: 'claimed' });
  mockClearTrackRecording.mockResolvedValue(undefined);
  mockDiscardTrackRecordingFor.mockResolvedValue('discarded');
  mockPersistCompletedTrackRecording.mockResolvedValue(undefined);
  mockFinalizeTrackRecordingFor.mockImplementation(async (identity, summary) => ({
    kind: 'sealed',
    finalized: finalizedTrack(
      {
        type: summary.type,
        distance_m: totalDistanceMeters(OWNER_A_POINTS),
        duration_s: summary.durationS,
        route: OWNER_A_POINTS,
        started_at: identity.startedAt,
      },
      identity,
    ),
  }));
  mockAcknowledgeFinalizedTrackRecordingFor.mockResolvedValue('acknowledged');
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
      expect.objectContaining({
        interactive: true,
        showZoomControl: false,
        tiles: 'osm',
      }),
    );
    expect(StyleSheet.flatten(mockMapProps?.style as never)).toMatchObject({
      backgroundColor: '#0B0D0B',
    });
    expect(renderer.root.findByProps({ testID: 'run-open-map-chrome' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Distance 0.00 kilometres' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:00' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Pace unavailable' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Estimated calories 0' })).toBeTruthy();
    const start = renderer.root.findByProps({ accessibilityLabel: 'Start Run' });
    const startStyle = StyleSheet.flatten(start.props.style({ pressed: false }));
    expect(startStyle).toMatchObject({
      backgroundColor: '#B9FF3D',
    });
    expect(startStyle.minHeight).toBeGreaterThanOrEqual(58);

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
    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Walk' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
    expect(StyleSheet.flatten(
      renderer.root.findByProps({ accessibilityLabel: 'Pause Walk' }).props.style({ pressed: false }),
    )).toMatchObject({
      backgroundColor: 'rgba(11,13,11,0.88)',
      borderColor: '#B9FF3D',
    });
  });

  test('labels the pause control for a Ride recording', async () => {
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Ride' }).props.onPress());
    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Start Ride' }).props.onPress();
    });
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Ride' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
  });

  test('pauses the owner-bound recording without finalizing and keeps its map and metrics visible', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      type: 'run',
      points: OWNER_A_POINTS,
      recordingState: 'recording',
      activeDurationMs: 12_000,
      resumeAfterOwnerCheck: false,
    } as TrackRecordingRecovery);
    const renderer = await renderRoute();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Run' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Pause Run' }).props.onPress());
    await flush();

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledTimes(1);
    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'mock-osm-map' })).toBeTruthy();
    expect(renderer.root.findByProps({
      accessibilityLabel: `Distance ${formatKm(totalDistanceMeters(OWNER_A_POINTS))} kilometres`,
    })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:12' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Resume Run' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
    expect(StyleSheet.flatten(
      renderer.root.findByProps({ accessibilityLabel: 'Resume Run' }).props.style({ pressed: false }),
    )).toMatchObject({
      backgroundColor: 'rgba(11,13,11,0.88)',
      borderColor: '#B9FF3D',
    });
  });

  test('resumes a durably paused recording through its existing owner-bound identity', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      type: 'run',
      points: OWNER_A_POINTS,
      recordingState: 'paused',
      activeDurationMs: 42_000,
      resumeAfterOwnerCheck: false,
    } as TrackRecordingRecovery);
    const renderer = await renderRoute();

    expect(mockEnsureTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'mock-osm-map' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:42' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Resume Run' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Resume Run' }).props.onPress());
    await flush();

    expect(mockStartTrackLocationTaskFor).toHaveBeenCalledTimes(1);
    expect(mockStartTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(mockBeginTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Run' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
  });

  test('still performs the owner-check recovery for a safety-paused background recording', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      type: 'run',
      points: OWNER_A_POINTS,
      recordingState: 'paused',
      activeDurationMs: 18_000,
      resumeAfterOwnerCheck: true,
    } as TrackRecordingRecovery);

    const renderer = await renderRoute();

    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledWith(identity);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Run' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:18' })).toBeTruthy();
  });

  test('does not finalize concurrently when Pause and Stop are pressed in one frame', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      type: 'run',
      points: OWNER_A_POINTS,
      recordingState: 'recording',
      activeDurationMs: 12_000,
      resumeAfterOwnerCheck: false,
    } as TrackRecordingRecovery);
    const pauseResult = deferred<'paused'>();
    mockPauseTrackLocationTaskFor.mockReturnValueOnce(pauseResult.promise);
    const renderer = await renderRoute();
    const pause = renderer.root.findByProps({ accessibilityLabel: 'Pause Run' });
    const stop = renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' });

    act(() => {
      pause.props.onPress();
      stop.props.onPress();
    });

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledTimes(1);
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();

    pauseResult.resolve('paused');
    await flush();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Resume Run' })).toBeTruthy();
  });

  test('does not finalize concurrently when Resume and Stop are pressed in one frame', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      type: 'run',
      points: OWNER_A_POINTS,
      recordingState: 'paused',
      activeDurationMs: 42_000,
      resumeAfterOwnerCheck: false,
    } as TrackRecordingRecovery);
    const resumeResult = deferred<'restarted'>();
    mockStartTrackLocationTaskFor.mockReturnValueOnce(resumeResult.promise);
    const renderer = await renderRoute();
    const resume = renderer.root.findByProps({ accessibilityLabel: 'Resume Run' });
    const stop = renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' });

    act(() => {
      resume.props.onPress();
      stop.props.onPress();
    });

    expect(mockStartTrackLocationTaskFor).toHaveBeenCalledTimes(1);
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();

    resumeResult.resolve('restarted');
    await flush();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Run' })).toBeTruthy();
  });

  test('does not claim a pause when both pause attempts and recovery are unavailable', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        type: 'run',
        points: OWNER_A_POINTS,
        recordingState: 'recording',
        activeDurationMs: 12_000,
        resumeAfterOwnerCheck: false,
      } as TrackRecordingRecovery)
      .mockRejectedValueOnce(new Error('storage unavailable'));
    mockPauseTrackLocationTaskFor.mockRejectedValue(new Error('pause unavailable'));
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Pause Run' }).props.onPress());
    await flush();
    await flush();

    expect(mockPauseTrackLocationTaskFor).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledWith(
      'Pause not confirmed',
      expect.stringMatching(/could not confirm whether GPS stopped/i),
    );
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Resume Run' })).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'run-private-map-placeholder' })).toBeTruthy();
    alert.mockRestore();
  });

  test('keeps GPS stop unconfirmed when both pause attempts throw and storage only proves a paused lease', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        type: 'run',
        points: OWNER_A_POINTS,
        recordingState: 'recording',
        activeDurationMs: 12_000,
        resumeAfterOwnerCheck: false,
      } as TrackRecordingRecovery)
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        type: 'run',
        points: OWNER_A_POINTS,
        recordingState: 'paused',
        activeDurationMs: 12_000,
        resumeAfterOwnerCheck: false,
      } as TrackRecordingRecovery);
    mockPauseTrackLocationTaskFor.mockRejectedValue(new Error('native stop uncertain'));
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Pause Run' }).props.onPress());
    await flush();
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry stop GPS' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Resume Run' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Pause Run' })).toHaveLength(0);
    expect(alert).toHaveBeenCalledWith(
      'GPS stop not confirmed',
      expect.stringMatching(/phone has not confirmed that GPS stopped/i),
    );
    alert.mockRestore();
  });

  test('keeps GPS stop unconfirmed when failed resume cleanup throws and storage only proves a paused lease', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const pausedRecovery = {
      ...identity,
      kind: 'active',
      type: 'run',
      points: OWNER_A_POINTS,
      recordingState: 'paused',
      activeDurationMs: 42_000,
      resumeAfterOwnerCheck: false,
    } as TrackRecordingRecovery;
    mockRecoverTrackRecording
      .mockResolvedValueOnce(pausedRecovery)
      .mockResolvedValueOnce(pausedRecovery);
    mockStartTrackLocationTaskFor.mockRejectedValueOnce(new Error('resume uncertain'));
    mockPauseTrackLocationTaskFor.mockRejectedValueOnce(new Error('native stop uncertain'));
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Resume Run' }).props.onPress());
    await flush();
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry stop GPS' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Resume Run' })).toHaveLength(0);
    expect(alert).toHaveBeenCalledWith(
      'GPS stop not confirmed',
      expect.stringMatching(/phone has not confirmed that GPS stopped/i),
    );
    alert.mockRestore();
  });

  test('restores authoritative recording state when resume and safety-pause both fail', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        type: 'run',
        points: OWNER_A_POINTS,
        recordingState: 'paused',
        activeDurationMs: 42_000,
        resumeAfterOwnerCheck: false,
      } as TrackRecordingRecovery)
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        type: 'run',
        points: OWNER_A_POINTS,
        recordingState: 'recording',
        activeDurationMs: 43_000,
        resumeAfterOwnerCheck: false,
      } as TrackRecordingRecovery);
    mockStartTrackLocationTaskFor.mockRejectedValueOnce(new Error('resume uncertain'));
    mockPauseTrackLocationTaskFor.mockRejectedValueOnce(new Error('pause uncertain'));
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Resume Run' }).props.onPress());
    await flush();
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Pause Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Resume Run' })).toHaveLength(0);
    expect(alert).toHaveBeenCalledWith(
      'GPS state changed',
      expect.stringMatching(/may be recording/i),
    );
    alert.mockRestore();
  });

  test('excludes the paused gap from the visible timer and finalized duration', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    jest.setSystemTime(new Date('2026-08-25T09:00:00.000Z'));
    try {
      const renderer = await renderRoute();
      await act(async () => {
        await renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress();
      });
      await flush();

      await act(async () => {
        jest.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:05' })).toBeTruthy();

      act(() => renderer.root.findByProps({ accessibilityLabel: 'Pause Run' }).props.onPress());
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
      });
      expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:05' })).toBeTruthy();

      act(() => renderer.root.findByProps({ accessibilityLabel: 'Resume Run' }).props.onPress());
      await flush();
      await act(async () => {
        jest.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      expect(renderer.root.findByProps({ accessibilityLabel: 'Elapsed time 00:10' })).toBeTruthy();

      act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
      await flush();
      expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: OWNER_A }),
        { type: 'run', durationS: 10 },
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('single-flights Stop through one deep finalize and queues before exact acknowledgement', async () => {
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt };
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 30,
      route: OWNER_A_POINTS,
      started_at: startedAt,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'run',
    });
    const finalization = deferred<FinalizeTrackRecordingResult>();
    mockFinalizeTrackRecordingFor.mockReturnValueOnce(finalization.promise);
    const order: string[] = [];
    mockClaimFinalizedEnqueueFor.mockImplementationOnce(async () => {
      order.push('claim');
      return { kind: 'claimed' };
    });
    mockEnqueueActivity.mockImplementationOnce(async () => {
      order.push('enqueue');
      return { id: identity.activityId, ownerId: OWNER_A, status: 'saved' };
    });
    mockAcknowledgeFinalizedTrackRecordingFor.mockImplementationOnce(async () => {
      order.push('acknowledge');
      return 'acknowledged';
    });
    const renderer = await renderRoute();
    const stop = renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props
      .onPress as () => void;

    act(() => {
      stop();
      stop();
    });
    await flush();

    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ type: 'run' }),
    );
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockReadTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Finishing…' })).toBeTruthy();

    finalization.resolve({
      kind: 'sealed',
      finalized: finalizedTrack(activity, identity),
    });
    await flush();

    expect(order).toEqual(['claim', 'enqueue', 'acknowledge']);
    expect(mockClaimFinalizedEnqueueFor).toHaveBeenCalledWith(
      identity,
      `snapshot-${identity.activityId}`,
    );
    expect(mockEnqueueActivity).toHaveBeenCalledWith(
      OWNER_A,
      activity,
      identity.activityId,
    );
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledWith(
      identity,
      `snapshot-${identity.activityId}`,
    );
    expect(mockShareSheetProps?.run).toEqual(expect.objectContaining({
      distance: activity.distance_m,
      points: activity.route,
      ownerId: OWNER_A,
    }));
  });

  test('refuses a stale discard confirmation while the same activity is being claimed and queued', async () => {
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
    const claim = deferred<
      { kind: 'claimed' }
      | { kind: 'already_claimed' }
      | { kind: 'discarding' }
      | { kind: 'stale' }
    >();
    mockClaimFinalizedEnqueueFor.mockReturnValueOnce(claim.promise);
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    const staleDiscard = (
      alert.mock.calls.at(-1)?.[2] as
        | { text: string; onPress?: () => void }[]
        | undefined
    )?.find((button) => button.text === 'Discard permanently')?.onPress;
    expect(staleDiscard).toBeDefined();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();
    expect(mockClaimFinalizedEnqueueFor).toHaveBeenCalledWith(
      identity,
      `snapshot-${identity.activityId}`,
    );

    act(() => staleDiscard?.());
    await flush();

    expect(mockDiscardTrackRecordingFor).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith(
      'Activity is being saved',
      'This activity was not discarded. Finish saving it safely, then delete it from Activity history if you no longer want it.',
      [expect.objectContaining({ text: 'Close', style: 'cancel' })],
    );

    claim.resolve({ kind: 'claimed' });
    await flush();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledTimes(1);
  });

  test('retries exact acknowledgement without re-finalizing or changing canonical queue bytes', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    const finalized = finalizedTrack(activity);
    mockRecoverTrackRecording.mockResolvedValueOnce({ kind: 'completed', finalized });
    mockAcknowledgeFinalizedTrackRecordingFor
      .mockRejectedValueOnce(new Error('ack failed'))
      .mockResolvedValueOnce('acknowledged');
    const queuedBytes: string[] = [];
    mockEnqueueActivity.mockImplementation(async (_owner, queuedActivity) => {
      queuedBytes.push(JSON.stringify(queuedActivity));
      return { id: 'activity-a', ownerId: OWNER_A, status: 'saved' };
    });
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress();
    });
    await flush();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry save' })).toBeTruthy();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    const pendingOptions = alert.mock.calls.at(-1)?.[2] as
      | { text: string; onPress?: () => void }[]
      | undefined;
    expect(pendingOptions?.map((button) => button.text)).not.toContain('Discard activity');
    expect(alert).toHaveBeenLastCalledWith(
      'Run options',
      expect.stringMatching(/already.*saved|finish.*saving|activity history/i),
      [expect.objectContaining({ text: 'Close', style: 'cancel' })],
    );
    expect(mockDiscardTrackRecordingFor).not.toHaveBeenCalled();

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress();
    });
    await flush();

    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockClaimFinalizedEnqueueFor).toHaveBeenCalledTimes(2);
    expect(mockClaimFinalizedEnqueueFor).toHaveBeenNthCalledWith(
      2,
      finalized.identity,
      finalized.snapshotId,
    );
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(2);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledTimes(2);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenNthCalledWith(
      2,
      finalized.identity,
      finalized.snapshotId,
    );
    expect(queuedBytes[1]).toBe(queuedBytes[0]);
    expect(renderer.root.findByProps({ testID: 'mock-run-share-sheet' })).toBeTruthy();
  });

  test('keeps recovered closing work private and retries finalization without resuming GPS', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const activity = {
      type: 'walk' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 123,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'closing',
      identity,
      finishId: 'finish-activity-a',
      type: 'walk',
      durationS: 123,
    });
    mockFinalizeTrackRecordingFor.mockResolvedValueOnce({
      kind: 'sealed',
      finalized: finalizedTrack(activity, identity),
    });
    const renderer = await renderRoute();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry finish' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'run-private-map-placeholder' })).toBeTruthy();
    expect(mockEnsureTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockStartTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(textOf(renderer)).not.toContain(formatKm(activity.distance_m));

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry finish' }).props.onPress());
    await flush();

    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledWith(identity, {
      type: 'walk',
      durationS: 123,
    });
    expect(mockEnsureTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockStartTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ testID: 'mock-run-share-sheet' })).toBeTruthy();
  });

  test('keeps an unprovable legacy recording private and offers exact discard only', async () => {
    const identity = {
      activityId: 'activity-legacy',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'closing',
      identity,
      finishId: 'finish-activity-legacy',
      type: 'run',
      durationS: 123,
      quarantineReason: 'legacy_unprovable',
    });
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Discard older recording' }),
    ).toBeTruthy();
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Retry finish' }),
    ).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'run-private-map-placeholder' })).toBeTruthy();
    expect(textOf(renderer)).toContain('Older recording cannot be finished');
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockEnsureTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockStartTrackLocationTaskFor).not.toHaveBeenCalled();

    act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: 'Discard older recording' })
        .props.onPress(),
    );
    expect(alert).toHaveBeenCalledWith(
      'Discard older recording?',
      expect.stringContaining('cannot be safely finished'),
      expect.any(Array),
    );
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    expect(mockDiscardTrackRecordingFor).toHaveBeenCalledWith(identity);
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('keeps legacy quarantine discard-only when exact cleanup fails', async () => {
    const identity = {
      activityId: 'activity-legacy',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'closing',
      identity,
      finishId: 'finish-activity-legacy',
      type: 'run',
      durationS: 123,
      quarantineReason: 'legacy_unprovable',
    });
    mockDiscardTrackRecordingFor.mockRejectedValueOnce(new Error('cleanup failed'));
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() =>
      renderer.root
        .findByProps({ accessibilityLabel: 'Discard older recording' })
        .props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Discard older recording' }),
    ).toBeTruthy();
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Retry resume' }),
    ).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'run-private-map-placeholder' })).toBeTruthy();
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
  });

  test('resets only after deep finalization confirms a too-short cleanup', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: new Date().toISOString(),
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: [],
      type: 'run',
    });
    mockFinalizeTrackRecordingFor.mockResolvedValueOnce({ kind: 'too_short' });
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(mockAcknowledgeFinalizedTrackRecordingFor).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
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
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry stop GPS' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test('does not claim GPS stopped when a new recording start throws with only a paused durable lease', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        type: 'run',
        points: [],
        recordingState: 'paused',
        activeDurationMs: 0,
        resumeAfterOwnerCheck: false,
      } as TrackRecordingRecovery);
    mockStartTrackLocationTaskFor.mockRejectedValueOnce(
      new Error('native collector state uncertain'),
    );
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Start Run' }).props.onPress());
    await flush();
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry stop GPS' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Retry resume' })).toHaveLength(0);
    expect(alert).toHaveBeenCalledWith(
      'GPS stop not confirmed',
      expect.stringMatching(/phone has not confirmed that GPS stopped/i),
    );
    alert.mockRestore();
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
  ])('keeps More options fail-closed $name', async ({ recovery }) => {
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
            finalized: finalizedTrack(activity),
          },
    );
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );

    const menuButtons = alert.mock.calls.at(-1)?.[2] as
      | { text: string; onPress?: () => void }[]
      | undefined;
    if (recovery === 'active') {
      expect(menuButtons).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: 'Keep activity', style: 'cancel' }),
        expect.objectContaining({ text: 'Discard activity', style: 'destructive' }),
      ]));
      act(() => menuButtons?.find((button) => button.text === 'Keep activity')?.onPress?.());
    } else {
      expect(alert).toHaveBeenLastCalledWith(
        'Run options',
        expect.stringMatching(/already.*saved|finish.*saving|activity history/i),
        [expect.objectContaining({ text: 'Close', style: 'cancel' })],
      );
      expect(menuButtons?.map((button) => button.text)).not.toContain('Discard activity');
    }
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
  });

  test('requires confirmation before completely discarding an active recording', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'run',
    });
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
    expect(renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' })).toBeTruthy();
    expect(mockDiscardTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    expect(mockDiscardTrackRecordingFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    });
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
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
      finalized: finalizedTrack(activity),
    });
    mockPauseTrackLocationTaskFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();

    await act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress();
    });
    await flush();

    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'mock-run-share-sheet' })).toBeTruthy();
  });

  test('does not offer discard for a completed save that may already be queued', async () => {
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      finalized: finalizedTrack(activity),
    });
    mockPauseTrackLocationTaskFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() => renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress());
    const buttons = alert.mock.calls.at(-1)?.[2] as
      | { text: string; onPress?: () => void }[]
      | undefined;

    expect(buttons?.map((button) => button.text)).not.toContain('Discard activity');
    expect(mockDiscardTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry save' })).toBeTruthy();
  });

  test('moves a failed deep active discard into a recoverable paused state', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'run',
    });
    mockDiscardTrackRecordingFor.mockRejectedValueOnce(new Error('discard failed'));
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();

    expect(mockDiscardTrackRecordingFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    });
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Start Run' })).toHaveLength(0);
  });

  test('requests authoritative recovery when an exact discard is stale', async () => {
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
    mockDiscardTrackRecordingFor.mockResolvedValueOnce('stale');
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();
    await flush();

    expect(mockDiscardTrackRecordingFor).toHaveBeenCalledWith(identity);
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('never reports discarded when durable enqueue authority refuses deep discard', async () => {
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        points: OWNER_A_POINTS,
        type: 'run',
      })
      .mockResolvedValueOnce({
        kind: 'completed',
        finalized: finalizedTrack(activity, identity),
      });
    mockDiscardTrackRecordingFor.mockResolvedValueOnce('completion_in_progress');
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    pressLatestAlertButton(alert, 'Discard permanently');
    await flush();
    await flush();

    expect(mockDiscardTrackRecordingFor).toHaveBeenCalledWith(identity);
    expect(alert).toHaveBeenLastCalledWith(
      'Activity is being saved',
      'This activity was not discarded. Retry save to finish safely, then delete it from Activity history if you no longer want it.',
      [expect.objectContaining({ text: 'Close', style: 'cancel' })],
    );
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry save' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Start Run' })).toHaveLength(0);
  });

  test('refuses an old discard confirmation after enqueue succeeds but acknowledgement fails', async () => {
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
    mockAcknowledgeFinalizedTrackRecordingFor.mockRejectedValueOnce(
      new Error('ack failed'),
    );
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    const staleDiscard = (
      alert.mock.calls.at(-1)?.[2] as
        | { text: string; onPress?: () => void }[]
        | undefined
    )?.find((button) => button.text === 'Discard permanently')?.onPress;
    expect(staleDiscard).toBeDefined();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry save' })).toBeTruthy();

    act(() => staleDiscard?.());
    await flush();

    expect(mockDiscardTrackRecordingFor).not.toHaveBeenCalled();
    expect(alert).toHaveBeenLastCalledWith(
      'Activity is being saved',
      'This activity was not discarded. Finish saving it safely, then delete it from Activity history if you no longer want it.',
      [expect.objectContaining({ text: 'Close', style: 'cancel' })],
    );
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry save' })).toBeTruthy();
  });

  test('keeps the recording recoverable when deep finalization rejects', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: OWNER_A_POINTS,
      startedAt: STARTED_AT,
      type: 'run',
    });
    mockFinalizeTrackRecordingFor.mockRejectedValueOnce(new Error('finalization failed'));
    const renderer = await renderRoute();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress(),
    );
    await flush();

    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledWith({
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    }, expect.objectContaining({ type: 'run' }));
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockReadTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry finish' })).toBeTruthy();
  });

  test('keeps a closing Stop private and retryable without opening share or resuming GPS', async () => {
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
    mockFinalizeTrackRecordingFor.mockResolvedValueOnce({
      kind: 'closing',
      finishId: 'finish-activity-a',
      reason: 'journal_unstable',
    });
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry finish' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'run-private-map-placeholder' })).toBeTruthy();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(mockAcknowledgeFinalizedTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockEnsureTrackLocationTaskFor).toHaveBeenCalledTimes(1);
    expect(mockStartTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
  });

  test('turns an unprovable legacy Stop into discard-only recovery', async () => {
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
    mockFinalizeTrackRecordingFor.mockResolvedValueOnce({
      kind: 'closing',
      finishId: 'finish-activity-a',
      reason: 'legacy_unprovable',
    });
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Discard older recording' }),
    ).toBeTruthy();
    expect(
      renderer.root.findAllByProps({ accessibilityLabel: 'Retry finish' }),
    ).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'run-private-map-placeholder' })).toBeTruthy();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(mockAcknowledgeFinalizedTrackRecordingFor).not.toHaveBeenCalled();
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
  });

  test('does not enqueue when deep finalization discovers a stale recording', async () => {
    const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt: STARTED_AT };
    mockRecoverTrackRecording
      .mockResolvedValueOnce({
        ...identity,
        kind: 'active',
        points: OWNER_A_POINTS,
        type: 'run',
      })
      .mockResolvedValueOnce({ kind: 'none' });
    mockFinalizeTrackRecordingFor.mockResolvedValueOnce({ kind: 'stale' });
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ type: 'run' }),
    );
    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockReadTrackRecording).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('refuses a finalized snapshot whose exact recording identity changed', async () => {
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
    const otherIdentity = {
      activityId: 'activity-b',
      ownerId: OWNER_B,
      startedAt: '2026-08-25T10:00:00.000Z',
    };
    mockFinalizeTrackRecordingFor.mockResolvedValueOnce({
      kind: 'sealed',
      finalized: finalizedTrack({
        type: 'run',
        distance_m: totalDistanceMeters(OWNER_B_POINTS),
        duration_s: 60,
        route: OWNER_B_POINTS,
        started_at: otherIdentity.startedAt,
      }, otherIdentity),
    });
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();

    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry finish' })).toBeTruthy();
    expect(textOf(renderer)).not.toContain(formatKm(totalDistanceMeters(OWNER_B_POINTS)));
  });

  test('releases the Stop lock after a finalize error so Retry finish can settle it', async () => {
    const activeRecovery: TrackRecordingRecovery = {
      activityId: 'activity-a',
      kind: 'active',
      ownerId: OWNER_A,
      points: [],
      startedAt: new Date().toISOString(),
      type: 'run',
    };
    mockRecoverTrackRecording.mockResolvedValueOnce(activeRecovery);
    mockFinalizeTrackRecordingFor.mockRejectedValueOnce(
      new Error('temporary finalize failure'),
    );
    const renderer = await renderRoute();

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress(),
    );
    await flush();
    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Retry finish' })).toBeTruthy();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry finish' }).props.onPress());
    await flush();
    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledTimes(2);
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ testID: 'mock-run-share-sheet' })).toBeTruthy();
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

  test('keeps a stale ownerless-legacy discard result out of a newer owner generation', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'legacy_unprovable',
      discardToken: 'legacy-token-a',
    });
    const discard = deferred<'discarded'>();
    mockDiscardLegacyUnprovableTrackRecording.mockReturnValueOnce(discard.promise);
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => {
      renderer.root.findByProps({
        accessibilityLabel: 'Discard older recording',
      }).props.onPress();
      pressLatestAlertButton(alert, 'Discard permanently');
    });
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    discard.resolve('discarded');
    await flush();

    expect(mockDiscardLegacyUnprovableTrackRecording)
      .toHaveBeenCalledWith('legacy-token-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Discard older recording' }))
      .toHaveLength(0);
  });

  test('permanently discards ownerless legacy GPS without offering account restore', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'legacy_unprovable',
      discardToken: 'legacy-token-a',
    });
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => {
      renderer.root.findByProps({
        accessibilityLabel: 'Discard older recording',
      }).props.onPress();
      pressLatestAlertButton(alert, 'Discard permanently');
    });
    await flush();

    expect(mockDiscardLegacyUnprovableTrackRecording)
      .toHaveBeenCalledWith('legacy-token-a');
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Restore to this account' }))
      .toHaveLength(0);
  });

  test('keeps ownerless legacy GPS private and retryable when exact discard fails', async () => {
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'legacy_unprovable',
      discardToken: 'legacy-token-a',
    });
    mockDiscardLegacyUnprovableTrackRecording.mockRejectedValueOnce(
      new Error('cleanup failed'),
    );
    const alert = jest.spyOn(Alert, 'alert');
    const renderer = await renderRoute();

    act(() => {
      renderer.root.findByProps({
        accessibilityLabel: 'Discard older recording',
      }).props.onPress();
      pressLatestAlertButton(alert, 'Discard permanently');
    });
    await flush();

    expect(renderer.root.findByProps({ accessibilityLabel: 'Discard older recording' }))
      .toBeTruthy();
    expect(textOf(renderer)).toContain('Older recording cannot be finished');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Restore to this account' }))
      .toHaveLength(0);
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
    const identity = {
      activityId: 'activity-a',
      ownerId: OWNER_A,
      startedAt: STARTED_AT,
    };
    const activity = {
      type: 'run' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      ...identity,
      kind: 'active',
      points: OWNER_A_POINTS,
      type: 'run',
    });
    const renderer = await renderRoute();
    const finalization = deferred<FinalizeTrackRecordingResult>();
    mockFinalizeTrackRecordingFor.mockReturnValueOnce(finalization.promise);
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    finalization.resolve({
      kind: 'sealed',
      finalized: finalizedTrack(activity, identity),
    });
    await flush();
    await flush();

    expect(mockFinalizeTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledWith(
      identity,
      'snapshot-activity-a',
    );
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

  test('reconciles a stale too-short Stop after deep cleanup finishes across A to B to A', async () => {
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
    const finalization = deferred<FinalizeTrackRecordingResult>();
    mockFinalizeTrackRecordingFor.mockReturnValueOnce(finalization.promise);
    const renderer = await renderRoute();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    finalization.resolve({ kind: 'too_short' });
    await flush();
    await flush();

    expect(ownerAReads).toBeGreaterThanOrEqual(3);
    expect(mockClearTrackRecording).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
  });

  test.each(['discard succeeds', 'discard fails'] as const)(
    'reconciles stale confirmed discard when deep %s across A to B to A',
    async (discardOutcome) => {
      const identity = { activityId: 'activity-a', ownerId: OWNER_A, startedAt: STARTED_AT };
      let ownerAReads = 0;
      mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
        if (ownerId === OWNER_B) {
          return { activityId: identity.activityId, kind: 'owner_mismatch', ownerId: OWNER_A };
        }
        ownerAReads += 1;
        if (ownerAReads >= 3 && discardOutcome === 'discard succeeds') return { kind: 'none' };
        return { ...identity, kind: 'active', points: OWNER_A_POINTS, type: 'run' };
      });
      mockEnsureTrackLocationTaskFor.mockImplementation(async () =>
        ownerAReads >= 3 ? 'paused' : 'running',
      );
      const deepDiscard = deferred<'discarded'>();
      mockDiscardTrackRecordingFor.mockReturnValueOnce(deepDiscard.promise);
      const renderer = await renderRoute();
      const alert = jest.spyOn(Alert, 'alert');

      act(() => renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress());
      pressLatestAlertButton(alert, 'Discard activity');
      pressLatestAlertButton(alert, 'Discard permanently');
      await switchOwner(renderer, OWNER_B);
      await switchOwner(renderer, OWNER_A);
      if (discardOutcome === 'discard succeeds') deepDiscard.resolve('discarded');
      else deepDiscard.reject(new Error('discard failed'));
      await flush();
      await flush();

      expect(mockDiscardTrackRecordingFor).toHaveBeenCalledWith(identity);
      expect(mockClearTrackRecording).not.toHaveBeenCalled();
      expect(ownerAReads).toBeGreaterThanOrEqual(3);
      if (discardOutcome === 'discard succeeds') {
        expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
      } else {
        expect(renderer.root.findByProps({ accessibilityLabel: 'Retry resume' })).toBeTruthy();
      }
      expect(renderer.root.findAllByProps({ accessibilityLabel: 'Stop & Save' })).toHaveLength(0);
    },
  );

  test('finishes durable A acknowledgement but suppresses stale completion UI after account changes', async () => {
    const activity = {
      type: 'walk' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      finalized: finalizedTrack(activity),
    });
    const renderer = await renderRoute();
    const acknowledgement = deferred<'acknowledged'>();
    mockAcknowledgeFinalizedTrackRecordingFor.mockReturnValueOnce(
      acknowledgement.promise,
    );
    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    mockRecoverTrackRecording
      .mockResolvedValueOnce({ kind: 'none' })
      .mockResolvedValueOnce({ kind: 'none' });
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    acknowledgement.resolve('acknowledged');
    await flush();

    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('never lets an old discard confirmation race a claimed completion after A to B to A', async () => {
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
    const claim = deferred<
      { kind: 'claimed' }
      | { kind: 'already_claimed' }
      | { kind: 'discarding' }
      | { kind: 'stale' }
    >();
    mockClaimFinalizedEnqueueFor.mockReturnValueOnce(claim.promise);
    const renderer = await renderRoute();
    const alert = jest.spyOn(Alert, 'alert');

    act(() =>
      renderer.root.findByProps({ accessibilityLabel: 'More options' }).props.onPress(),
    );
    pressLatestAlertButton(alert, 'Discard activity');
    const staleDiscard = (
      alert.mock.calls.at(-1)?.[2] as
        | { text: string; onPress?: () => void }[]
        | undefined
    )?.find((button) => button.text === 'Discard permanently')?.onPress;
    expect(staleDiscard).toBeDefined();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Stop & Save' }).props.onPress());
    await flush();
    await switchOwner(renderer, OWNER_B);
    await switchOwner(renderer, OWNER_A);
    act(() => staleDiscard?.());

    expect(mockDiscardTrackRecordingFor).not.toHaveBeenCalled();

    claim.resolve({ kind: 'claimed' });
    await flush();
    await flush();

    expect(mockClaimFinalizedEnqueueFor).toHaveBeenCalledWith(
      identity,
      `snapshot-${identity.activityId}`,
    );
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByProps({ testID: 'mock-run-share-sheet' })).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: 'Start Run' })).toBeTruthy();
  });

  test('refreshes B after stale A queue and exact acknowledgement work finishes', async () => {
    const activity = {
      type: 'walk' as const,
      distance_m: totalDistanceMeters(OWNER_A_POINTS),
      duration_s: 360,
      route: OWNER_A_POINTS,
      started_at: STARTED_AT,
    };
    mockRecoverTrackRecording.mockResolvedValueOnce({
      kind: 'completed',
      finalized: finalizedTrack(activity),
    });
    const renderer = await renderRoute();
    const queued = deferred<Record<string, unknown>>();
    const acknowledged = deferred<void>();
    let recordingAcknowledged = false;
    mockEnqueueActivity.mockReturnValueOnce(queued.promise);
    mockAcknowledgeFinalizedTrackRecordingFor.mockImplementationOnce(async () => {
      await acknowledged.promise;
      recordingAcknowledged = true;
      return 'acknowledged';
    });

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    await flush();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);

    let ownerBRecoveryReads = 0;
    mockRecoverTrackRecording.mockImplementation(async (ownerId) => {
      if (ownerId !== OWNER_B) return { kind: 'none' };
      ownerBRecoveryReads += 1;
      return !recordingAcknowledged
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
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledWith(
      finalizedTrack(activity).identity,
      finalizedTrack(activity).snapshotId,
    );
    expect(renderer.root.findByProps({ accessibilityLabel: 'Recovery required' })).toBeTruthy();

    acknowledged.resolve(undefined);
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
      finalized: finalizedTrack(activity),
    });
    const renderer = await renderRouteStrictMode();

    act(() => renderer.root.findByProps({ accessibilityLabel: 'Retry save' }).props.onPress());
    await flush();

    expect(mockPauseTrackLocationTaskFor).not.toHaveBeenCalled();
    expect(mockPersistCompletedTrackRecording).not.toHaveBeenCalled();
    expect(mockFinalizeTrackRecordingFor).not.toHaveBeenCalled();
    expect(mockEnqueueActivity).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeFinalizedTrackRecordingFor).toHaveBeenCalledTimes(1);
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
      finalized: finalizedTrack(activity),
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
      finalized: finalizedTrack(activity),
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
      state: 'legacy_unprovable',
      copy: 'Older recording cannot be finished',
      allowedAction: 'Discard older recording',
    },
    {
      state: 'tracking_incomplete',
      copy: 'Run tracking is incomplete',
      allowedAction: 'Discard incomplete activity',
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
      } else if (state === 'tracking_incomplete') {
        mockRecoverTrackRecording.mockResolvedValueOnce({
          kind: 'closing',
          identity: {
            activityId: 'activity-a',
            ownerId: OWNER_A,
            startedAt: STARTED_AT,
          },
          finishId: 'finish-incomplete',
          type: 'run',
          durationS: 60,
          quarantineReason: 'tracking_incomplete',
        });
      } else if (state === 'legacy_unprovable') {
        mockRecoverTrackRecording.mockResolvedValueOnce({
          kind: 'legacy_unprovable',
          discardToken: 'legacy-token-a',
        });
      } else {
        mockRecoverTrackRecording.mockResolvedValueOnce({
          kind: state as 'needs_owner',
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
