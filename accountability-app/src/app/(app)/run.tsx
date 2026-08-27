import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Tabs, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResolvedImageUrl } from '../../media/useResolvedImageUrl';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  estimateCalories,
  formatDuration,
  formatKm,
  formatPace,
  totalDistanceMeters,
  type Pt,
} from '../../activity/geo';
import { OsmMap, type OsmMapHandle } from '../../ui/OsmMap';
import { RunShareSheet, type FinishedRun } from '../../activity/RunShareSheet';
import {
  RunTrackerOpenMap,
  type RunTrackerPrimaryAction,
} from '../../activity/RunTrackerOpenMap';
import {
  ActivityUploadBadge,
  activityUploadBadgeStatus,
} from '../../activity/UploadStatus';
import {
  acknowledgeFinalizedTrackRecordingFor,
  beginTrackRecording,
  claimFinalizedEnqueueFor,
  discardLegacyUnprovableTrackRecording,
  discardTrackRecordingFor,
  ensureTrackLocationTaskFor,
  finalizeTrackRecordingFor,
  pauseTrackLocationTaskFor,
  recoverTrackRecording,
  readTrackPoints,
  startTrackLocationTaskFor,
  type FinalizedTrackRecording,
  type TrackRecordingRecovery,
  type TrackRecordingIdentity,
} from '../../activity/locationTask';
import { type ActivityType } from '../../activity/api';
import { enqueueActivity } from '../../activity/offlineQueueStore';
import {
  acquireSynchronousLock,
  createDurableCompletionController,
  recordingDetailView,
  recordingTypeView,
  releaseSynchronousLock,
  shouldApplyOwnerAsyncResult,
  type DurableCompletionController,
  type DurableQueueConfirmation,
  type RecordingRecoveryReadState,
} from '../../activity/runCompletion';
import { getMyProfile } from '../../profiles/api';
import { font, themeColors } from '../../ui/theme';
import { hapticImpact } from '../../ui/haptics';
import { contentMaxWidth } from '../../ui/responsive';
import { useAuth } from '../../auth/AuthProvider';
import { navigateBackSafely } from '../../navigation/routeAccessContract';
import {
  completedRunTimestamp,
  createDefaultRunShareAppearance,
  runCardTitle,
} from '../../activity/runShareAppearance';

const palette = themeColors('dark');
const LIME = palette.ink.action;
const BG = palette.surface.canvas;

const TYPE_LABEL: Record<ActivityType, string> = {
  run: 'Run',
  walk: 'Walk',
  ride: 'Ride',
};

// the run tracker stores points as {lat, lon}; the map wants {lat, lng}
const toLatLng = (pts: Pt[]) => pts.map((p) => ({ lat: p.lat, lng: p.lon }));

// a small loop used only for the web preview of the shareable run card (no GPS)
const SAMPLE_ROUTE: Pt[] = [
  { lat: 14.5, lon: 121.0 },
  { lat: 14.5009, lon: 121.0006 },
  { lat: 14.5014, lon: 121.0018 },
  { lat: 14.501, lon: 121.003 },
  { lat: 14.5, lon: 121.0034 },
  { lat: 14.499, lon: 121.0027 },
  { lat: 14.4986, lon: 121.0013 },
  { lat: 14.4992, lon: 121.0003 },
];

type PendingSave = FinalizedTrackRecording;

type RunTrackingPhase =
  | 'idle'
  | 'recording'
  | 'pausing'
  | 'paused'
  | 'resuming';

type OwnerCommandScope = {
  ownerId: string | null;
  generation: number;
  lifecycle: number;
};

export default function ActivityTrack() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { width: W, height: H, fontScale } = useWindowDimensions();
  const [type, setType] = useState<ActivityType>('run');
  const [trackingPhase, setTrackingPhase] = useState<RunTrackingPhase>('idle');
  const tracking =
    trackingPhase === 'recording' ||
    trackingPhase === 'pausing' ||
    trackingPhase === 'resuming';
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [livePoints, setLivePoints] = useState<Pt[]>([]);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<
    | 'needs_owner'
    | 'owner_mismatch'
    | 'storage_error'
    | 'gps_unconfirmed'
    | 'tracking_paused'
    | 'finishing'
    | 'legacy_unprovable'
    | 'tracking_incomplete'
    | null
  >(null);
  const [recoveryReadState, setRecoveryReadState] =
    useState<RecordingRecoveryReadState>('checking');
  const [recoveryRefreshRevision, setRecoveryRefreshRevision] = useState(0);
  const [detailOwnerId, setDetailOwnerId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{
    ownerId: string;
    uri: string | null;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  // where to centre the idle map — the user's last-known spot (no prompt)
  const [idlePos, setIdlePos] =
    useState<{ lat: number; lng: number } | null>(null);
  // shareable run card, shown after a successful save
  const [shareRun, setShareRun] = useState<FinishedRun | null>(null);
  const [shareAuthority, setShareAuthority] =
    useState<OwnerCommandScope | null>(null);
  const [durableQueueConfirmation, setDurableQueueConfirmation] =
    useState<DurableQueueConfirmation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerGenerationRef = useRef(0);
  const timerReadTokenRef = useRef<number | null>(null);
  const nextTimerReadTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const lifecycleGenerationRef = useRef(0);
  const ownerGenerationRef = useRef(0);
  const [ownerRenderGeneration, setOwnerRenderGeneration] = useState(0);
  const [authoritativeOwnerId, setAuthoritativeOwnerId] =
    useState<string | null>(session?.user.id ?? null);
  const authOwnerRef = useRef<string | null>(session?.user.id ?? null);
  const completionGuardRef = useRef<OwnerCommandScope | null>(null);
  const legacyDiscardTokenRef = useRef<string | null>(null);
  const mapRef = useRef<OsmMapHandle>(null);
  const liveViewportAuthorityRef = useRef<string | null>(null);
  const completionControllerRef =
    useRef<DurableCompletionController<FinalizedTrackRecording> | null>(null);

  const isCommandCurrent = useCallback((scope: OwnerCommandScope) => (
    mountedRef.current &&
    authOwnerRef.current === scope.ownerId &&
    ownerGenerationRef.current === scope.generation &&
    lifecycleGenerationRef.current === scope.lifecycle
  ), []);

  const captureCommand = useCallback(
    (ownerId: string | null = authOwnerRef.current): OwnerCommandScope => ({
      ownerId,
      generation: ownerGenerationRef.current,
      lifecycle: lifecycleGenerationRef.current,
    }),
    [],
  );

  const requestAuthoritativeRecovery = useCallback(() => {
    if (mountedRef.current) {
      setRecoveryRefreshRevision((revision) => revision + 1);
    }
  }, []);

  const invalidateTimer = useCallback(() => {
    timerGenerationRef.current += 1;
    timerReadTokenRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const getCompletionController = useCallback(() => {
    if (!completionControllerRef.current) {
      completionControllerRef.current =
        createDurableCompletionController({
          enqueueActivity,
          claimFinalized: async (finalized) => {
            const claimed = await claimFinalizedEnqueueFor(
              finalized.identity,
              finalized.snapshotId,
            );
            if (
              claimed.kind === 'claimed' ||
              claimed.kind === 'already_claimed'
            ) {
              return;
            }
            requestAuthoritativeRecovery();
            throw new Error(
              claimed.kind === 'discarding'
                ? 'This activity is already being discarded.'
                : 'The finalized recording changed before it could be saved.',
            );
          },
          acknowledgeFinalized: async (finalized) => {
            const acknowledged = await acknowledgeFinalizedTrackRecordingFor(
              finalized.identity,
              finalized.snapshotId,
            );
            if (acknowledged !== 'acknowledged') {
              throw new Error('The finalized recording changed before acknowledgement.');
            }
          },
          onConfirm: (confirmation) => {
            const guard = completionGuardRef.current;
            if (guard && isCommandCurrent(guard)) {
              setDurableQueueConfirmation(confirmation);
            }
          },
          onReset: () => {
            completionGuardRef.current = null;
            if (mountedRef.current) setDurableQueueConfirmation(null);
          },
        });
    }
    return completionControllerRef.current;
  }, [isCommandCurrent, requestAuthoritativeRecovery]);

  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);
  const recordingRef = useRef<TrackRecordingIdentity | null>(null);
  const pendingRef = useRef<PendingSave | null>(null);
  const finishSummaryRef = useRef<{
    identity: TrackRecordingIdentity;
    type: ActivityType;
    durationS: number;
  } | null>(null);
  const leaseIdentityRef = useRef<TrackRecordingIdentity | null>(null);
  const startingRef = useRef(false);
  const sessionTransitionRef = useRef(false);
  const avatarRevisionRef = useRef(0);
  const completionOwnerRef = useRef<string | null>(
    session?.user.id ?? null,
  );
  const commitPending = useCallback((next: PendingSave | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);
  useLayoutEffect(() => {
    const nextOwnerId = session?.user.id ?? null;
    if (authOwnerRef.current === nextOwnerId) return;
    const previousRecording = leaseIdentityRef.current ?? recordingRef.current;
    leaseIdentityRef.current = null;
    pendingRef.current = null;
    finishSummaryRef.current = null;
    if (previousRecording) {
      void pauseTrackLocationTaskFor(previousRecording).then(
        requestAuthoritativeRecovery,
        requestAuthoritativeRecovery,
      );
    }
    authOwnerRef.current = nextOwnerId;
    ownerGenerationRef.current += 1;
    setAuthoritativeOwnerId(nextOwnerId);
    setOwnerRenderGeneration(ownerGenerationRef.current);
    invalidateTimer();
    liveViewportAuthorityRef.current = null;
    mapRef.current?.clearRoute();
    completionControllerRef.current?.reset('auth_owner_change');
    startingRef.current = false;
    sessionTransitionRef.current = false;
    setStarting(false);
    setStopping(false);
    setTrackingPhase('idle');
    setSaving(false);
    setIdlePos(null);
    setRecoveryReadState('checking');
    setRecoveryNotice(null);
  }, [invalidateTimer, requestAuthoritativeRecovery, session?.user.id]);
  useFocusEffect(
    useCallback(() => {
      const requestedOwnerId = session?.user.id ?? null;
      const requestedRevision = ++avatarRevisionRef.current;
      setAvatar(null);
      if (requestedOwnerId) {
        getMyProfile()
          .then((profile) => {
            if (
              shouldApplyOwnerAsyncResult(
                requestedOwnerId,
                authOwnerRef.current,
                requestedRevision,
                avatarRevisionRef.current,
              )
            ) {
              setAvatar({
                ownerId: requestedOwnerId,
                uri: profile?.avatar_url ?? null,
              });
            }
          })
          .catch(() => {});
      }
      if (Platform.OS === 'web') return;
      const requestedOwnerGeneration = ownerGenerationRef.current;
      Location.getForegroundPermissionsAsync()
        .then((perm) => (perm.granted ? Location.getLastKnownPositionAsync() : null))
        .then((pos) => {
          if (
            pos &&
            mountedRef.current &&
            authOwnerRef.current === requestedOwnerId &&
            ownerGenerationRef.current === requestedOwnerGeneration
          ) {
            setIdlePos({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          }
        })
        .catch(() => {});
    }, [session?.user.id, setIdlePos]),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      invalidateTimer();
      mapRef.current?.clearRoute();
      completionControllerRef.current?.dispose();
      completionControllerRef.current = null;
    };
  }, [invalidateTimer]);

  useEffect(() => {
    if (authLoading) return;
    const ownerId = session?.user.id ?? null;
    if (completionOwnerRef.current !== ownerId) {
      getCompletionController().reset('auth_owner_change');
      completionOwnerRef.current = ownerId;
    }
  }, [authLoading, getCompletionController, session?.user.id]);

  // The Run tracker is an immersive, map-first destination in every state.
  useLayoutEffect(() => {
    navigation.setOptions({
      tabBarStyle: { display: 'none' },
    });
  }, [navigation]);

  const startTrackingTimer = useCallback((ownerId: string) => {
    invalidateTimer();
    const timerGeneration = timerGenerationRef.current;
    const command = captureCommand(ownerId);
    timerRef.current = setInterval(() => {
      if (
        timerGenerationRef.current !== timerGeneration ||
        !isCommandCurrent(command)
      ) {
        return;
      }
      setElapsed(
        Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000)),
      );
      if (timerReadTokenRef.current !== null) return;
      const readToken = ++nextTimerReadTokenRef.current;
      timerReadTokenRef.current = readToken;
      void readTrackPoints()
        .then((pts) => {
          if (
            timerReadTokenRef.current === readToken &&
            timerGenerationRef.current === timerGeneration &&
            isCommandCurrent(command) &&
            recordingRef.current?.ownerId === ownerId
          ) {
            setLivePoints(pts);
            setDistance(totalDistanceMeters(pts));
          }
        })
        .catch(() => {
          // Keep the last owner-safe in-memory view while local storage recovers.
        })
        .finally(() => {
          if (timerReadTokenRef.current === readToken) {
            timerReadTokenRef.current = null;
          }
        });
    }, 1000);
  }, [captureCommand, invalidateTimer, isCommandCurrent]);

  const ensureRecordingLease = useCallback(
    async (identity: TrackRecordingIdentity) => {
      leaseIdentityRef.current = identity;
      try {
        return await ensureTrackLocationTaskFor(identity);
      } finally {
        if (leaseIdentityRef.current === identity) {
          leaseIdentityRef.current = null;
        }
      }
    },
    [],
  );

  const restorePausedRecovery = useCallback(
    (recovery: Extract<TrackRecordingRecovery, { kind: 'active' }>) => {
      getCompletionController().reset('recovery');
      invalidateTimer();
      recordingRef.current = {
        activityId: recovery.activityId,
        ownerId: recovery.ownerId,
        startedAt: recovery.startedAt,
      };
      setDetailOwnerId(recovery.ownerId);
      setRecoveryReadState('error');
      setRecoveryNotice('tracking_paused');
      setTrackingPhase('idle');
      commitPending(null);
      setDistance(0);
      setElapsed(0);
      setLivePoints([]);
    },
    [commitPending, getCompletionController, invalidateTimer],
  );

  const restoreRecovery = useCallback(
    (recovery: TrackRecordingRecovery) => {
      getCompletionController().reset('recovery');
      setRecoveryReadState('ready');
      legacyDiscardTokenRef.current = null;
      if (recovery.kind === 'legacy_unprovable') {
        invalidateTimer();
        recordingRef.current = null;
        legacyDiscardTokenRef.current = recovery.discardToken;
        setDetailOwnerId(null);
        setTrackingPhase('idle');
        commitPending(null);
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setRecoveryReadState('error');
        setRecoveryNotice('legacy_unprovable');
        return;
      }
      if (
        recovery.kind === 'needs_owner' ||
        recovery.kind === 'owner_mismatch'
      ) {
        invalidateTimer();
        recordingRef.current = null;
        setDetailOwnerId(
          recovery.kind === 'owner_mismatch' ? recovery.ownerId : null,
        );
        setTrackingPhase('idle');
        commitPending(null);
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setRecoveryNotice(recovery.kind);
        return;
      }
      if (recovery.kind === 'none') {
        invalidateTimer();
        recordingRef.current = null;
        startedAtRef.current = '';
        startMsRef.current = 0;
        setDetailOwnerId(null);
        setTrackingPhase('idle');
        commitPending(null);
        setType('run');
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setRecoveryNotice(null);
        return;
      }
      if (recovery.kind === 'completed') {
        const finalized = recovery.finalized;
        const recording = finalized.recording;
        invalidateTimer();
        recordingRef.current = {
          activityId: recording.activityId,
          ownerId: recording.ownerId,
          startedAt: recording.activity.started_at,
        };
        setDetailOwnerId(recording.ownerId);
        startedAtRef.current = recording.activity.started_at;
        setTrackingPhase('idle');
        setRecoveryNotice(null);
        setType(recording.activity.type);
        setDistance(recording.activity.distance_m);
        setElapsed(recording.activity.duration_s);
        setLivePoints(recording.activity.route);
        commitPending(finalized);
        finishSummaryRef.current = null;
        return;
      }

      if (recovery.kind === 'closing') {
        invalidateTimer();
        recordingRef.current = recovery.identity;
        finishSummaryRef.current = {
          identity: recovery.identity,
          type: recovery.type,
          durationS: recovery.durationS,
        };
        setDetailOwnerId(recovery.identity.ownerId);
        startedAtRef.current = recovery.identity.startedAt;
        startMsRef.current = Date.parse(recovery.identity.startedAt);
        setTrackingPhase('idle');
        commitPending(null);
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setType(recovery.type);
        setRecoveryReadState('error');
        setRecoveryNotice(
          recovery.quarantineReason === 'legacy_unprovable' ||
          recovery.quarantineReason === 'tracking_incomplete'
            ? recovery.quarantineReason
            : 'finishing',
        );
        return;
      }

      recordingRef.current = {
        activityId: recovery.activityId,
        ownerId: recovery.ownerId,
        startedAt: recovery.startedAt,
      };
      setDetailOwnerId(recovery.ownerId);
      startedAtRef.current = recovery.startedAt;
      startMsRef.current = Date.parse(recovery.startedAt);
      setRecoveryNotice(null);
      commitPending(null);
      setType(recovery.type);
      setLivePoints(recovery.points);
      setDistance(totalDistanceMeters(recovery.points));
      const recoveredElapsed =
        typeof recovery.activeDurationMs === 'number' &&
        Number.isFinite(recovery.activeDurationMs)
          ? Math.max(0, Math.round(recovery.activeDurationMs / 1000))
          : Math.max(
              0,
              Math.round((Date.now() - startMsRef.current) / 1000),
            );
      setElapsed(recoveredElapsed);
      startMsRef.current = Date.now() - recoveredElapsed * 1000;
      if (
        recovery.recordingState === 'paused' &&
        recovery.resumeAfterOwnerCheck !== true
      ) {
        invalidateTimer();
        setTrackingPhase('paused');
        return;
      }
      setTrackingPhase('recording');
      startTrackingTimer(recovery.ownerId);
    },
    [commitPending, getCompletionController, invalidateTimer, startTrackingTimer],
  );

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    const ownerId = session?.user.id ?? null;
    const command = captureCommand(ownerId);
    getCompletionController().reset('recovery');
    queueMicrotask(() => {
      if (active && isCommandCurrent(command)) {
        setRecoveryReadState('checking');
      }
    });
    void recoverTrackRecording(ownerId, 'run')
      .then(async (recovery) => {
        if (!active || !isCommandCurrent(command)) return;
        if (recovery.kind === 'active') {
          if (
            recovery.recordingState === 'paused' &&
            recovery.resumeAfterOwnerCheck !== true
          ) {
            restoreRecovery(recovery);
            return;
          }
          const taskStatus = await ensureRecordingLease({
            activityId: recovery.activityId,
            ownerId: recovery.ownerId,
            startedAt: recovery.startedAt,
          });
          if (!active || !isCommandCurrent(command)) return;
          if (taskStatus === 'stale') {
            requestAuthoritativeRecovery();
            return;
          }
          if (taskStatus === 'paused') {
            restorePausedRecovery(recovery);
            return;
          }
        }
        restoreRecovery(recovery);
      })
      .catch(() => {
        if (!active || !isCommandCurrent(command)) return;
        setRecoveryReadState('error');
        setRecoveryNotice('storage_error');
      });
    return () => {
      active = false;
    };
  }, [
    authLoading,
    captureCommand,
    getCompletionController,
    ensureRecordingLease,
    isCommandCurrent,
    recoveryRefreshRevision,
    requestAuthoritativeRecovery,
    restorePausedRecovery,
    restoreRecovery,
    session?.user.id,
  ]);

  async function discardOwnerlessLegacyRecording(
    discardToken: string,
    command: OwnerCommandScope,
  ) {
    if (!isCommandCurrent(command)) return;
    setSaving(true);
    try {
      const status = await discardLegacyUnprovableTrackRecording(discardToken);
      if (!isCommandCurrent(command)) return;
      if (status === 'stale') {
        requestAuthoritativeRecovery();
        return;
      }
      clearOwnerDetailState();
    } catch {
      if (!isCommandCurrent(command)) return;
      setRecoveryReadState('error');
      setRecoveryNotice('legacy_unprovable');
      Alert.alert(
        'Could not discard recording',
        'The older recording remains private on this phone. Try again.',
      );
    } finally {
      if (isCommandCurrent(command)) {
        setSaving(false);
      } else {
        requestAuthoritativeRecovery();
      }
    }
  }

  async function onRetryResume() {
    const ownerId = session?.user.id;
    if (!ownerId) return;
    const command = captureCommand(ownerId);
    setSaving(true);
    setRecoveryReadState('checking');
    try {
      const recovery = await recoverTrackRecording(ownerId, type);
      if (!isCommandCurrent(command)) return;
      if (recovery.kind !== 'active') {
        restoreRecovery(recovery);
        return;
      }
      const taskStatus = await ensureRecordingLease({
        activityId: recovery.activityId,
        ownerId: recovery.ownerId,
        startedAt: recovery.startedAt,
      });
      if (!isCommandCurrent(command)) return;
      if (taskStatus === 'stale') {
        requestAuthoritativeRecovery();
        return;
      }
      if (taskStatus === 'paused') {
        restorePausedRecovery(recovery);
        return;
      }
      restoreRecovery(recovery);
    } catch {
      if (!isCommandCurrent(command)) return;
      setRecoveryReadState('error');
      setRecoveryNotice('tracking_paused');
    } finally {
      if (isCommandCurrent(command)) setSaving(false);
    }
  }

  async function onStart() {
    if (!acquireSynchronousLock(startingRef)) return;
    const ownerId = session?.user.id ?? null;
    const command = captureCommand(ownerId);
    const selectedTypeAtStart = type;
    getCompletionController().reset('new_recording');
    setStarting(true);
    try {
      hapticImpact();
      if (Platform.OS === 'web') {
        // no GPS in a browser — let the user preview the shareable run card
        const completedAt = new Date().toISOString();
        if (!isCommandCurrent(command)) return;
        setShareRun({
          activityId: null,
          ownerId,
          syncStatus: null,
          type: selectedTypeAtStart,
          distance: totalDistanceMeters(SAMPLE_ROUTE),
          elapsed: 31 * 60 + 12,
          points: SAMPLE_ROUTE,
          title: runCardTitle(selectedTypeAtStart, completedAt),
          completedAt,
          cardTheme: createDefaultRunShareAppearance(completedAt).theme,
        });
        setShareAuthority(command);
        return;
      }
      if (!ownerId) {
        Alert.alert(
          'Sign in required',
          'Sign in before starting so this activity stays with the right account.',
        );
        return;
      }
      try {
        const existing = await recoverTrackRecording(ownerId, selectedTypeAtStart);
        if (!isCommandCurrent(command)) return;
        if (existing.kind !== 'none') {
          if (existing.kind === 'active') {
            if (
              existing.recordingState === 'paused' &&
              existing.resumeAfterOwnerCheck !== true
            ) {
              restoreRecovery(existing);
            } else {
              const taskStatus = await ensureRecordingLease({
                activityId: existing.activityId,
                ownerId: existing.ownerId,
                startedAt: existing.startedAt,
              });
              if (!isCommandCurrent(command)) return;
              if (taskStatus === 'stale') {
                requestAuthoritativeRecovery();
                return;
              }
              if (taskStatus === 'paused') {
                restorePausedRecovery(existing);
              } else {
                restoreRecovery(existing);
              }
            }
          } else {
            restoreRecovery(existing);
          }
          Alert.alert(
            'Recording already saved',
            existing.kind === 'owner_mismatch'
              ? 'Sign in as the recording owner to recover it.'
              : existing.kind === 'legacy_unprovable'
                ? 'For your privacy, discard the unverifiable older recording before starting.'
              : 'Your saved recording has been restored.',
          );
          return;
        }
      } catch {
        if (!isCommandCurrent(command)) return;
        Alert.alert(
          'Could not check saved recording',
          'Try again before starting a new activity.',
        );
        return;
      }
      const fg = await Location.requestForegroundPermissionsAsync();
      if (!isCommandCurrent(command)) return;
      if (fg.status !== 'granted') {
        Alert.alert('Location needed', 'Allow location access to track your activity.');
        return;
      }
      await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
      if (!isCommandCurrent(command)) return;
      let recording: TrackRecordingIdentity;
      try {
        recording = await beginTrackRecording(ownerId, selectedTypeAtStart);
        if (!isCommandCurrent(command)) {
          requestAuthoritativeRecovery();
          return;
        }
      } catch {
        if (!isCommandCurrent(command)) return;
        Alert.alert(
          'Could not save on this phone',
          'Free some storage and try starting again.',
        );
        return;
      }
      setDistance(0);
      setElapsed(0);
      setLivePoints([]);
      recordingRef.current = recording;
      setDetailOwnerId(recording.ownerId);
      setRecoveryReadState('ready');
      startedAtRef.current = recording.startedAt;
      startMsRef.current = Date.now();
      let taskStatus: Awaited<ReturnType<typeof startTrackLocationTaskFor>>;
      try {
        taskStatus = await startTrackLocationTaskFor(recording);
      } catch {
        const recovery = await recoverTrackRecording(
          ownerId,
          selectedTypeAtStart,
        ).catch(() => null);
        if (!isCommandCurrent(command)) return;
        if (recovery?.kind === 'active') {
          if (recovery.recordingState === 'recording') {
            restoreRecovery(recovery);
            Alert.alert(
              'GPS state changed',
              'This activity may be recording. Check the status above, then Pause or use Stop & Save.',
            );
          } else {
            invalidateTimer();
            setTrackingPhase('idle');
            setRecoveryReadState('error');
            setRecoveryNotice('gps_unconfirmed');
            Alert.alert(
              'GPS stop not confirmed',
              'New route points are blocked, but the phone has not confirmed that GPS stopped. Retry stopping GPS.',
            );
          }
        } else if (recovery) {
          restoreRecovery(recovery);
        } else {
          setTrackingPhase('idle');
          setRecoveryReadState('error');
          setRecoveryNotice('storage_error');
          Alert.alert(
            'GPS state not confirmed',
            'We could not confirm whether tracking started or stopped. Activity details stay hidden until the saved state can be checked.',
          );
        }
        return;
      }
      if (!isCommandCurrent(command)) return;
      if (taskStatus === 'stale') {
        setTrackingPhase('idle');
        setRecoveryReadState('error');
        setRecoveryNotice('gps_unconfirmed');
        return;
      }
      if (taskStatus === 'paused') {
        const recovery = await recoverTrackRecording(
          ownerId,
          selectedTypeAtStart,
        ).catch(() => null);
        if (!isCommandCurrent(command)) return;
        if (recovery?.kind === 'active') {
          restorePausedRecovery(recovery);
        } else if (recovery) {
          restoreRecovery(recovery);
        } else {
          setTrackingPhase('idle');
          setRecoveryReadState('error');
          setRecoveryNotice('storage_error');
        }
        Alert.alert(
          'Tracking paused',
          'GPS could not stay active. Your recording is safe. Tap Retry resume.',
        );
        return;
      }
      setTrackingPhase('recording');
      startTrackingTimer(ownerId);
    } finally {
      releaseSynchronousLock(startingRef);
      if (isCommandCurrent(command)) setStarting(false);
    }
  }

  async function onPause() {
    if (
      trackingPhase !== 'recording' ||
      !acquireSynchronousLock(sessionTransitionRef)
    ) {
      return;
    }
    const identity = recordingRef.current;
    if (!identity) {
      releaseSynchronousLock(sessionTransitionRef);
      return;
    }
    const command = captureCommand(identity.ownerId);
    const frozenElapsed = Math.max(
      elapsed,
      Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000)),
    );
    invalidateTimer();
    setTrackingPhase('pausing');
    try {
      hapticImpact();
      const pauseStatus = await pauseTrackLocationTaskFor(identity);
      if (!isCommandCurrent(command)) return;
      if (pauseStatus === 'stale') {
        setTrackingPhase('idle');
        requestAuthoritativeRecovery();
        return;
      }

      const storedPoints = await readTrackPoints().catch(() => livePoints);
      const points = storedPoints.length > 0 ? storedPoints : livePoints;
      if (!isCommandCurrent(command)) return;
      setLivePoints(points);
      setDistance(totalDistanceMeters(points));
      setElapsed(frozenElapsed);
      startMsRef.current = Date.now() - frozenElapsed * 1000;
      setRecoveryReadState('ready');
      setRecoveryNotice(null);
      setTrackingPhase('paused');
    } catch {
      if (!isCommandCurrent(command)) return;
      try {
        const retryStatus = await pauseTrackLocationTaskFor(identity);
        if (!isCommandCurrent(command)) return;
        if (retryStatus === 'stale') {
          setTrackingPhase('idle');
          requestAuthoritativeRecovery();
          return;
        }
        const storedPoints = await readTrackPoints().catch(() => livePoints);
        const points = storedPoints.length > 0 ? storedPoints : livePoints;
        if (!isCommandCurrent(command)) return;
        setLivePoints(points);
        setDistance(totalDistanceMeters(points));
        setElapsed(frozenElapsed);
        startMsRef.current = Date.now() - frozenElapsed * 1000;
        setRecoveryReadState('ready');
        setRecoveryNotice(null);
        setTrackingPhase('paused');
        return;
      } catch {
        // Fall through to an authoritative recovery read. A failed pause must
        // never be presented as confirmed while its durable state is unknown.
      }

      const recovery = await recoverTrackRecording(identity.ownerId, type).catch(
        () => null,
      );
      if (!isCommandCurrent(command)) return;
      if (recovery) {
        if (
          recovery.kind === 'active' &&
          recovery.recordingState === 'recording'
        ) {
          restoreRecovery(recovery);
          Alert.alert(
            'Pause not confirmed',
            'This activity may still be recording. Try Pause again, or use Stop & Save.',
          );
          return;
        }
        if (recovery.kind === 'active') {
          setTrackingPhase('idle');
          setRecoveryReadState('error');
          setRecoveryNotice('gps_unconfirmed');
          Alert.alert(
            'GPS stop not confirmed',
            'New route points are blocked, but the phone has not confirmed that GPS stopped. Retry stopping GPS.',
          );
          return;
        }
        restoreRecovery(recovery);
        return;
      }

      setTrackingPhase('idle');
      setRecoveryReadState('error');
      setRecoveryNotice('storage_error');
      Alert.alert(
        'Pause not confirmed',
        'We could not confirm whether GPS stopped, so this run is not marked as paused. Activity details stay hidden until the saved state can be checked.',
      );
    } finally {
      releaseSynchronousLock(sessionTransitionRef);
    }
  }

  async function onRetryConfirmGpsStop() {
    if (!acquireSynchronousLock(sessionTransitionRef)) return;
    const identity = recordingRef.current;
    if (!identity) {
      releaseSynchronousLock(sessionTransitionRef);
      return;
    }
    const command = captureCommand(identity.ownerId);
    setSaving(true);
    setRecoveryReadState('checking');
    try {
      const pauseStatus = await pauseTrackLocationTaskFor(identity);
      if (!isCommandCurrent(command)) return;
      if (pauseStatus === 'stale') {
        setTrackingPhase('idle');
        requestAuthoritativeRecovery();
        return;
      }

      const recovery = await recoverTrackRecording(identity.ownerId, type).catch(
        () => null,
      );
      if (!isCommandCurrent(command)) return;
      if (recovery?.kind === 'active') {
        if (
          recovery.recordingState === 'paused' &&
          recovery.resumeAfterOwnerCheck !== true
        ) {
          restoreRecovery(recovery);
          return;
        }
        setTrackingPhase('idle');
        setRecoveryReadState('error');
        setRecoveryNotice('gps_unconfirmed');
        Alert.alert(
          'GPS stop not confirmed',
          'The saved GPS state changed before it could be confirmed. Retry stopping GPS.',
        );
        return;
      }
      if (recovery) {
        restoreRecovery(recovery);
        return;
      }

      // The native stop and durable suspension both returned successfully.
      // Keep the owner-safe in-memory summary visible even if this follow-up
      // read is temporarily unavailable.
      invalidateTimer();
      setTrackingPhase('paused');
      setRecoveryReadState('ready');
      setRecoveryNotice(null);
    } catch {
      if (!isCommandCurrent(command)) return;
      invalidateTimer();
      setTrackingPhase('idle');
      setRecoveryReadState('error');
      setRecoveryNotice('gps_unconfirmed');
      Alert.alert(
        'GPS stop not confirmed',
        'The phone still has not confirmed that GPS stopped. Retry before leaving this activity.',
      );
    } finally {
      releaseSynchronousLock(sessionTransitionRef);
      if (isCommandCurrent(command)) setSaving(false);
    }
  }

  async function onResume() {
    if (
      trackingPhase !== 'paused' ||
      !acquireSynchronousLock(sessionTransitionRef)
    ) {
      return;
    }
    const identity = recordingRef.current;
    if (!identity) {
      releaseSynchronousLock(sessionTransitionRef);
      return;
    }
    const command = captureCommand(identity.ownerId);
    const resumeRequestedAtMs = Date.now();
    setTrackingPhase('resuming');
    try {
      hapticImpact();
      const taskStatus = await startTrackLocationTaskFor(identity);
      if (!isCommandCurrent(command)) return;
      if (taskStatus === 'stale') {
        setTrackingPhase('idle');
        requestAuthoritativeRecovery();
        return;
      }
      if (taskStatus !== 'running' && taskStatus !== 'restarted') {
        throw new Error('GPS could not stay active.');
      }

      startMsRef.current = resumeRequestedAtMs - elapsed * 1000;
      setRecoveryReadState('ready');
      setRecoveryNotice(null);
      setTrackingPhase('recording');
      startTrackingTimer(identity.ownerId);
    } catch {
      try {
        const pauseStatus = await pauseTrackLocationTaskFor(identity);
        if (!isCommandCurrent(command)) return;
        if (pauseStatus === 'stale') {
          setTrackingPhase('idle');
          requestAuthoritativeRecovery();
          return;
        }
        invalidateTimer();
        setTrackingPhase('paused');
        Alert.alert(
          'Could not resume',
          'Your activity is still paused. Check GPS and try again.',
        );
        return;
      } catch {
        // Verify the durable lease before describing the activity as paused.
      }

      const recovery = await recoverTrackRecording(identity.ownerId, type).catch(
        () => null,
      );
      if (!isCommandCurrent(command)) return;
      if (recovery) {
        if (
          recovery.kind === 'active' &&
          recovery.recordingState === 'recording'
        ) {
          restoreRecovery(recovery);
          Alert.alert(
            'GPS state changed',
            'This activity may be recording. Check the status above, then Pause or use Stop & Save.',
          );
          return;
        }
        if (recovery.kind === 'active') {
          setTrackingPhase('idle');
          setRecoveryReadState('error');
          setRecoveryNotice('gps_unconfirmed');
          Alert.alert(
            'GPS stop not confirmed',
            'New route points are blocked, but the phone has not confirmed that GPS stopped. Retry stopping GPS.',
          );
          return;
        }
        restoreRecovery(recovery);
        return;
      }

      invalidateTimer();
      setTrackingPhase('idle');
      setRecoveryReadState('error');
      setRecoveryNotice('storage_error');
      Alert.alert(
        'GPS state not confirmed',
        'We could not confirm whether tracking resumed or stopped. Activity details stay hidden until the saved state can be checked.',
      );
    } finally {
      releaseSynchronousLock(sessionTransitionRef);
    }
  }

  async function persist(
    p: PendingSave,
    command: OwnerCommandScope = captureCommand(p.recording.ownerId),
  ) {
    if (isCommandCurrent(command)) setSaving(true);
    try {
      completionGuardRef.current = command;
      const queued = await getCompletionController().complete(p);
      if (!isCommandCurrent(command)) {
        requestAuthoritativeRecovery();
        return;
      }
      const recording = p.recording;
      commitPending(null);
      recordingRef.current = null;
      // saved to the log — now offer the shareable run card
      const completedAt = completedRunTimestamp(
        recording.activity.started_at,
        recording.activity.duration_s,
      );
      setShareRun({
        activityId: queued.id,
        ownerId: queued.ownerId,
        syncStatus: queued.status,
        type: recording.activity.type,
        distance: recording.activity.distance_m,
        elapsed: recording.activity.duration_s,
        points: recording.activity.route,
        title: runCardTitle(recording.activity.type, completedAt),
        completedAt,
        cardTheme: createDefaultRunShareAppearance(completedAt).theme,
      });
      setShareAuthority(command);
    } catch (e) {
      if (!isCommandCurrent(command)) return;
      commitPending(p);
      Alert.alert(
        'Could not save on this phone',
        `${String((e as Error).message ?? e)}\n\nYour recording is safe — tap Retry.`,
      );
    } finally {
      if (isCommandCurrent(command)) {
        setSaving(false);
      } else {
        requestAuthoritativeRecovery();
      }
    }
  }

  async function onStop() {
    if (!acquireSynchronousLock(sessionTransitionRef)) return;
    const capturedIdentity = recordingRef.current;
    const ownerId = capturedIdentity?.ownerId ?? detailOwnerId;
    const command = captureCommand(ownerId);
    const selectedTypeAtStop = type;
    const startedAtMs = startMsRef.current;
    if (isCommandCurrent(command)) setStopping(true);
    try {
      getCompletionController().reset('stop');
      hapticImpact();
      invalidateTimer();
      const identity =
        capturedIdentity;
      if (!identity) {
        throw new Error('The saved recording identity is unavailable.');
      }
      const storedSummary = finishSummaryRef.current;
      const exactStoredSummary =
        storedSummary &&
        storedSummary.identity.activityId === identity.activityId &&
        storedSummary.identity.ownerId === identity.ownerId &&
        storedSummary.identity.startedAt === identity.startedAt
          ? storedSummary
          : null;
      const liveElapsed =
        trackingPhase === 'paused'
          ? elapsed
          : Math.max(
              elapsed,
              Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)),
            );
      const finalElapsed = exactStoredSummary?.durationS ?? liveElapsed;
      const finishType = exactStoredSummary?.type ?? selectedTypeAtStop;
      finishSummaryRef.current = {
        identity,
        type: finishType,
        durationS: finalElapsed,
      };
      const result = await finalizeTrackRecordingFor(identity, {
        type: finishType,
        durationS: finalElapsed,
      });
      if (result.kind === 'stale') {
        requestAuthoritativeRecovery();
        return;
      }
      if (result.kind === 'closing') {
        if (isCommandCurrent(command)) {
          setTrackingPhase('idle');
          setRecoveryReadState('error');
          setRecoveryNotice(
            result.reason === 'legacy_unprovable' ||
            result.reason === 'tracking_incomplete'
              ? result.reason
              : 'finishing',
          );
        }
        return;
      }
      if (result.kind === 'too_short') {
        finishSummaryRef.current = null;
        if (isCommandCurrent(command)) {
          Alert.alert('Too short', 'That activity was too short to save.');
          clearOwnerDetailState();
        }
        return;
      }
      const nextPending = result.finalized;
      if (
        nextPending.identity.activityId !== identity.activityId ||
        nextPending.identity.ownerId !== identity.ownerId ||
        nextPending.identity.startedAt !== identity.startedAt ||
        nextPending.recording.activityId !== identity.activityId ||
        nextPending.recording.ownerId !== identity.ownerId ||
        nextPending.recording.activity.started_at !== identity.startedAt
      ) {
        throw new Error('The finalized recording identity changed.');
      }
      const canonical = nextPending.recording.activity;
      if (isCommandCurrent(command)) {
        finishSummaryRef.current = null;
        setTrackingPhase('idle');
        setRecoveryReadState('ready');
        setRecoveryNotice(null);
        setElapsed(canonical.duration_s);
        setDistance(canonical.distance_m);
        setLivePoints(canonical.route);
      }
      if (isCommandCurrent(command)) commitPending(nextPending);
      await persist(nextPending, command);
    } catch {
      if (isCommandCurrent(command)) {
        setTrackingPhase('idle');
        setRecoveryReadState('error');
        setRecoveryNotice('finishing');
        Alert.alert(
          'Could not finish activity',
          'Your route is still safe on this phone. Tap Retry finish.',
        );
      }
    } finally {
      releaseSynchronousLock(sessionTransitionRef);
      if (isCommandCurrent(command)) {
        setStopping(false);
      } else {
        requestAuthoritativeRecovery();
      }
    }
  }

  function clearOwnerDetailState() {
    invalidateTimer();
    mapRef.current?.clearRoute();
    liveViewportAuthorityRef.current = null;
    recordingRef.current = null;
    legacyDiscardTokenRef.current = null;
    finishSummaryRef.current = null;
    startedAtRef.current = '';
    startMsRef.current = 0;
    setTrackingPhase('idle');
    commitPending(null);
    setDistance(0);
    setElapsed(0);
    setLivePoints([]);
    setDetailOwnerId(null);
    setType('run');
    setRecoveryReadState('ready');
    setRecoveryNotice(null);
  }

  async function discardActivity(
    identity: TrackRecordingIdentity,
    command: OwnerCommandScope,
    failureNotice:
      | 'tracking_paused'
      | 'legacy_unprovable'
      | 'tracking_incomplete' = 'tracking_paused',
  ) {
    if (!isCommandCurrent(command) || identity.ownerId !== command.ownerId) return;
    const currentPending = pendingRef.current;
    const sameFinalizedRecording =
      currentPending?.identity.activityId === identity.activityId &&
      currentPending.identity.ownerId === identity.ownerId &&
      currentPending.identity.startedAt === identity.startedAt;
    const completionController = getCompletionController();
    if (
      sessionTransitionRef.current ||
      sameFinalizedRecording ||
      completionController.isCompleting(identity.activityId)
    ) {
      Alert.alert(
        'Activity is being saved',
        'This activity was not discarded. Finish saving it safely, then delete it from Activity history if you no longer want it.',
        [{ text: 'Close', style: 'cancel' }],
      );
      return;
    }
    const wasActiveRecording = currentPending === null;
    setSaving(true);
    completionController.reset('discard');
    invalidateTimer();
    try {
      const discardStatus = await discardTrackRecordingFor(identity);
      if (discardStatus === 'completion_in_progress') {
        Alert.alert(
          'Activity is being saved',
          'This activity was not discarded. Retry save to finish safely, then delete it from Activity history if you no longer want it.',
          [{ text: 'Close', style: 'cancel' }],
        );
        requestAuthoritativeRecovery();
        return;
      }
      if (discardStatus === 'stale') {
        requestAuthoritativeRecovery();
        return;
      }
      if (!isCommandCurrent(command)) return;
      clearOwnerDetailState();
    } catch {
      if (!isCommandCurrent(command)) return;
      if (wasActiveRecording) {
        setTrackingPhase('idle');
        setRecoveryReadState('error');
        setRecoveryNotice(failureNotice);
      }
      Alert.alert(
        'Could not discard activity',
        'The activity is still safe on this phone. Try again.',
      );
    } finally {
      if (isCommandCurrent(command)) {
        setSaving(false);
      } else {
        requestAuthoritativeRecovery();
      }
    }
  }

  function confirmDiscardLegacyRecording() {
    const discardToken = legacyDiscardTokenRef.current;
    if (discardToken) {
      const command = captureCommand(authoritativeOwnerId);
      Alert.alert(
        'Discard older recording?',
        'This older recording cannot be linked safely to an account. Discarding permanently removes its stored route from this phone.',
        [
          { text: 'Keep private', style: 'cancel' },
          {
            text: 'Discard permanently',
            style: 'destructive',
            onPress: () => {
              if (!isCommandCurrent(command)) return;
              void discardOwnerlessLegacyRecording(discardToken, command);
            },
          },
        ],
      );
      return;
    }
    const identity = recordingRef.current;
    if (!identity || identity.ownerId !== authoritativeOwnerId) return;
    const command = captureCommand(identity.ownerId);
    const trackingIncomplete = recoveryNotice === 'tracking_incomplete';
    Alert.alert(
      trackingIncomplete
        ? 'Discard incomplete activity?'
        : 'Discard older recording?',
      trackingIncomplete
        ? 'Some GPS data could not be saved reliably. This activity cannot be posted. Discarding permanently removes its stored route from this phone.'
        : 'This older recording cannot be safely finished. Discarding permanently removes its stored route from this phone.',
      [
        { text: 'Keep private', style: 'cancel' },
        {
          text: 'Discard permanently',
          style: 'destructive',
          onPress: () => {
            if (!isCommandCurrent(command)) return;
            void discardActivity(
              identity,
              command,
              trackingIncomplete
                ? 'tracking_incomplete'
                : 'legacy_unprovable',
            );
          },
        },
      ],
    );
  }

  const rawDistance = pending ? pending.recording.activity.distance_m : distance;
  const rawElapsed = pending ? pending.recording.activity.duration_s : elapsed;
  const rawPoints = pending ? pending.recording.activity.route : livePoints;
  const paused = trackingPhase === 'paused';
  const ownerlessPrivateDetail =
    detailOwnerId === null &&
    (pending !== null ||
      tracking ||
      paused ||
      rawDistance > 0 ||
      rawElapsed > 0 ||
      rawPoints.length > 0);
  const detailView = detailOwnerId
    ? recordingDetailView(
        {
          ownerId: detailOwnerId,
          distance: rawDistance,
          elapsed: rawElapsed,
          points: rawPoints,
        },
        session?.user.id ?? null,
        recoveryReadState,
      )
    : {
        visible:
          !ownerlessPrivateDetail &&
          recoveryNotice === null &&
          recoveryReadState === 'ready',
        distance: 0,
        elapsed: 0,
        points: [] as Pt[],
      };
  const shownDist = detailView.distance;
  const shownElapsed = detailView.elapsed;
  const shownPoints = detailView.points;
  const visiblePending = detailView.visible ? pending : null;
  const visibleTracking = detailView.visible && tracking;
  const visiblePaused = detailView.visible && paused;
  const visibleSession = visibleTracking || visiblePaused;
  const currentOwnerId = session?.user.id ?? null;
  const ownerTransitionPending = authoritativeOwnerId !== currentOwnerId;
  const visibleShareRun =
    !authLoading &&
    !ownerTransitionPending &&
    shareRun &&
    shareAuthority &&
    shareRun.ownerId === currentOwnerId &&
    shareAuthority.ownerId === authoritativeOwnerId &&
    shareAuthority.generation === ownerRenderGeneration
      ? shareRun
      : null;
  const confirmedBadgeStatus = activityUploadBadgeStatus(
    visibleShareRun?.activityId ?? visiblePending?.recording.activityId ?? null,
    durableQueueConfirmation,
  );
  const recoveryBlocked =
    ownerTransitionPending ||
    recoveryReadState !== 'ready' ||
    recoveryNotice !== null ||
    (detailOwnerId !== null && !detailView.visible);
  const typeIsProtected = detailOwnerId !== null || recoveryBlocked;
  const privateTypeView = recordingTypeView(
    type,
    detailOwnerId,
    currentOwnerId,
    recoveryReadState,
  );
  const selectedType = typeIsProtected
    ? privateTypeView.selectedType
    : type;
  const kcal = selectedType ? estimateCalories(selectedType, shownDist) : 0;
  const safeRoute = detailView.visible ? toLatLng(shownPoints) : [];
  const latestSafePoint = safeRoute[safeRoute.length - 1] ?? null;
  const routeOverviewAvailable = detailView.visible && safeRoute.length >= 2;
  // A live route is pushed through the ref to avoid rebuilding the WebView.
  // Finished or pending owner-safe geometry can be supplied declaratively.
  const mapRoute = visibleTracking ? [] : safeRoute;
  const mapAuthorityResolved =
    !authLoading &&
    !ownerTransitionPending &&
    !recoveryBlocked &&
    detailView.visible &&
    selectedType !== null &&
    !ownerlessPrivateDetail;
  const mapAuthorityKey = `${currentOwnerId ?? 'signed-out'}:${ownerRenderGeneration}`;
  const idleMarkers =
    !recoveryBlocked && !visibleSession && safeRoute.length === 0 && idlePos
      ? [{ lat: idlePos.lat, lng: idlePos.lng, label: 'You', color: LIME }]
      : [];
  const sideInset = Math.max(16, (W - contentMaxWidth(W)) / 2);
  const visibleAvatar =
    avatar && avatar.ownerId === session?.user.id ? avatar.uri : null;
  const resolvedVisibleAvatar = useResolvedImageUrl(visibleAvatar);

  const bindMapHandle = useCallback((handle: OsmMapHandle | null) => {
    if (!handle && mapRef.current) {
      mapRef.current.clearRoute();
    }
    mapRef.current = handle;
  }, []);

  // Clear imperative geometry as soon as its owner is no longer authoritative.
  // While recording, update only from the already-redacted detail view.
  useEffect(() => {
    if (!mapAuthorityResolved) {
      liveViewportAuthorityRef.current = null;
      mapRef.current?.clearRoute();
      return;
    }
    if (!visibleTracking) return;
    const route = toLatLng(shownPoints);
    const latest = route[route.length - 1];
    if (liveViewportAuthorityRef.current !== mapAuthorityKey && latest) {
      liveViewportAuthorityRef.current = mapAuthorityKey;
      mapRef.current?.setRoute(route, { viewport: 'center', center: latest });
      return;
    }
    mapRef.current?.setRoute(route, { viewport: 'preserve' });
  }, [mapAuthorityKey, mapAuthorityResolved, shownPoints, visibleTracking]);

  const selectorDisabled =
    visibleSession || !!visiblePending || recoveryBlocked || starting || stopping;
  const selectedActivityLabel = selectedType ? TYPE_LABEL[selectedType] : 'Run';
  const status = stopping
    ? {
        title: 'Finishing activity',
        detail: 'Saving your route safely',
      }
    : visiblePending
      ? {
          title: 'Save needs attention',
          detail: 'Your route is safe on this phone',
        }
      : trackingPhase === 'pausing'
        ? { title: 'Pausing', detail: 'Securing your route' }
        : trackingPhase === 'resuming'
          ? { title: 'Resuming', detail: 'Reconnecting GPS' }
          : visiblePaused
            ? { title: 'Paused', detail: 'GPS paused' }
            : visibleTracking
              ? { title: 'Recording', detail: 'GPS active' }
        : starting
          ? {
              title: 'Getting GPS ready',
              detail: 'Checking location permission',
            }
          : {
              title: `Ready to ${selectedType ?? 'run'}`,
              detail: idlePos ? 'GPS available' : 'GPS checks when you start',
            };
  const primaryAction: RunTrackerPrimaryAction = stopping
    ? {
        label: 'Finishing…',
        icon: 'hourglass-outline',
        tone: 'primary',
        disabled: true,
        busy: true,
        onPress: () => undefined,
      }
    : visiblePending
      ? {
          label: 'Retry save',
          icon: 'refresh',
          tone: 'primary',
          disabled: saving,
          busy: saving,
          onPress: () => void persist(visiblePending),
        }
      : visibleSession
        ? {
            label: 'Stop & Save',
            compactLabel: 'Finish',
            icon: 'stop',
            tone: 'danger',
            disabled:
              saving ||
              trackingPhase === 'pausing' ||
              trackingPhase === 'resuming',
            busy: saving,
            onPress: () => void onStop(),
          }
        : starting
          ? {
              label: 'Starting…',
              icon: 'hourglass-outline',
              tone: 'primary',
              disabled: true,
              busy: true,
              onPress: () => undefined,
            }
          : {
              label: `Start ${selectedActivityLabel}`,
              icon: 'play',
              tone: 'primary',
              disabled: false,
              busy: false,
              onPress: () => void onStart(),
            };
  const secondaryAction: RunTrackerPrimaryAction | undefined = stopping
    ? undefined
    : trackingPhase === 'recording'
      ? {
          label: `Pause ${selectedActivityLabel}`,
          compactLabel: 'Pause',
          icon: 'pause',
          tone: 'primary',
          disabled: false,
          busy: false,
          onPress: () => void onPause(),
        }
      : trackingPhase === 'pausing'
        ? {
            label: 'Pausing…',
            compactLabel: 'Pausing…',
            icon: 'hourglass-outline',
            tone: 'primary',
            disabled: true,
            busy: true,
            onPress: () => undefined,
          }
        : trackingPhase === 'paused'
          ? {
              label: `Resume ${selectedActivityLabel}`,
              compactLabel: 'Resume',
              icon: 'play',
              tone: 'primary',
              disabled: false,
              busy: false,
              onPress: () => void onResume(),
            }
          : trackingPhase === 'resuming'
            ? {
                label: 'Resuming…',
                compactLabel: 'Resuming…',
                icon: 'hourglass-outline',
                tone: 'primary',
                disabled: true,
                busy: true,
                onPress: () => undefined,
              }
            : undefined;

  function onCenterMap() {
    const center = latestSafePoint ?? (!recoveryBlocked ? idlePos : null);
    if (!center) {
      Alert.alert(
        'Location unavailable',
        'Your location will appear after GPS is available or you start tracking.',
      );
      return;
    }
    mapRef.current?.centerOn(center);
  }

  function onShowRoute() {
    if (!routeOverviewAvailable) return;
    mapRef.current?.fitRoute();
  }

  function onMoreOptions() {
    const detail = visiblePending
      ? 'This finished activity may already be saved on this phone. Retry save to finish safely, then delete it from Activity history if you no longer want it.'
      : stopping
        ? 'Your activity is being finished and saved safely.'
        : visiblePaused
          ? 'Your activity is paused. Resume when you are ready, or use Stop & Save to finish.'
          : visibleTracking
            ? 'Your activity is recording. Use Stop & Save when you finish.'
          : 'Choose Run, Walk, or Ride above. GPS and saving are handled when you start.';
    const identity = visiblePending
      ? visiblePending.identity
      : visibleSession
        ? recordingRef.current
        : null;
    if (
      !identity ||
      visiblePending !== null ||
      stopping ||
      saving ||
      trackingPhase === 'pausing' ||
      trackingPhase === 'resuming' ||
      getCompletionController().isCompleting(identity.activityId)
    ) {
      Alert.alert('Run options', detail, [{ text: 'Close', style: 'cancel' }]);
      return;
    }
    const command = captureCommand(identity.ownerId);
    Alert.alert(
      'Run options',
      detail,
      [
        { text: 'Keep activity', style: 'cancel' },
        {
          text: 'Discard activity',
          style: 'destructive',
          onPress: () => {
            if (!isCommandCurrent(command)) return;
            Alert.alert(
              'Discard activity?',
              'This permanently removes the saved route from this phone and cannot be undone.',
              [
                { text: 'Keep activity', style: 'cancel' },
                {
                  text: 'Discard permanently',
                  style: 'destructive',
                  onPress: () => void discardActivity(identity, command),
                },
              ],
            );
          },
        },
      ],
    );
  }

  const recoveryTitle =
    recoveryNotice === 'tracking_incomplete'
      ? 'Run tracking is incomplete'
      : recoveryNotice === 'legacy_unprovable'
      ? 'Older recording cannot be finished'
      : recoveryNotice === 'storage_error'
        ? 'Saved activity could not be checked'
        : recoveryNotice === 'gps_unconfirmed'
          ? 'GPS stop not confirmed'
        : recoveryNotice === 'tracking_paused'
          ? 'Tracking paused'
          : recoveryNotice === 'finishing'
            ? 'Finishing activity'
          : recoveryNotice
            ? 'Recording saved safely'
            : 'Checking saved activity';
  const recoveryDetail =
    recoveryNotice === 'tracking_incomplete'
      ? 'Some GPS data could not be saved reliably. This activity stays private and can only be discarded.'
      : recoveryNotice === 'legacy_unprovable'
      ? 'Its tracking history cannot be verified. For your privacy, discard it before starting a new activity.'
      : recoveryNotice === 'owner_mismatch'
      ? 'Sign in as the recording owner to recover it.'
      : recoveryNotice === 'storage_error'
          ? 'Details stay hidden until storage is available.'
          : recoveryNotice === 'gps_unconfirmed'
            ? 'The app cannot confirm that the phone stopped GPS. Retry the stop check before leaving this activity.'
          : recoveryNotice === 'tracking_paused'
            ? 'Your route is safe. Resume tracking to continue.'
            : recoveryNotice === 'finishing'
              ? 'Your route is safe. Finish saving before starting another activity.'
            : recoveryNotice === 'needs_owner'
              ? 'Sign in to recover this recording.'
              : 'Activity details stay hidden while this phone is checked.';

  return (
    <View style={styles.screen}>
      <Tabs.Screen
        options={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      />
      <View
        accessibilityElementsHidden={!!visibleShareRun}
        importantForAccessibility={
          visibleShareRun ? 'no-hide-descendants' : 'auto'
        }
        style={StyleSheet.absoluteFill}
      >
        {mapAuthorityResolved ? (
          <OsmMap
            key={mapAuthorityKey}
            ref={bindMapHandle}
            route={mapRoute}
            markers={idleMarkers}
            interactive
            tiles="osm"
            showZoomControl={false}
            fitPadding={{
              top: insets.top + 88,
              right: sideInset + 64,
              bottom: Math.min(360, Math.max(220, Math.round(H * 0.4))),
              left: sideInset + 24,
            }}
            style={[StyleSheet.absoluteFill, styles.mapBg]}
          />
        ) : (
          <View testID="run-private-map-placeholder" style={StyleSheet.absoluteFill} />
        )}
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(11,13,11,0.70)',
            'rgba(11,13,11,0.03)',
            'rgba(11,13,11,0.10)',
            'rgba(11,13,11,0.92)',
          ]}
          locations={[0, 0.3, 0.58, 1]}
          style={StyleSheet.absoluteFill}
        />

        {!recoveryBlocked && selectedType ? (
          <RunTrackerOpenMap
            selectedActivity={selectedType}
            activitySelectorDisabled={selectorDisabled}
            onSelectActivity={(activity) => {
              if (!selectorDisabled) setType(activity);
            }}
            onBack={() => navigateBackSafely(router)}
            onMore={onMoreOptions}
            onCenterMap={onCenterMap}
            onShowRoute={onShowRoute}
            routeOverviewAvailable={routeOverviewAvailable}
            statusTitle={status.title}
            statusDetail={status.detail}
            distance={formatKm(shownDist)}
            elapsed={formatDuration(shownElapsed)}
            pace={formatPace(shownDist, shownElapsed)}
            estimatedCalories={kcal}
            secondaryAction={secondaryAction}
            primaryAction={primaryAction}
            viewportWidth={W}
            viewportHeight={H}
            fontScale={fontScale}
            safeTop={insets.top}
            safeBottom={insets.bottom}
            sideInset={sideInset}
          />
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => navigateBackSafely(router)}
              style={[
                styles.recoveryBack,
                { left: sideInset, top: insets.top + 8 },
              ]}
            >
              <Ionicons name="chevron-back" size={23} color={palette.ink.primary} />
            </Pressable>
            <View
              style={[
                styles.recoveryBottom,
                {
                  left: sideInset,
                  right: sideInset,
                  bottom: insets.bottom + 16,
                },
              ]}
            >
              <View style={styles.titleRow}>
                {resolvedVisibleAvatar ? (
                  <Image
                    source={{ uri: resolvedVisibleAvatar }}
                    style={styles.avatar}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={14} color={palette.ink.secondary} />
                  </View>
                )}
                <View style={styles.recoveryHeadingCopy}>
                  <Text style={styles.runTitle}>Activity recovery</Text>
                  <Text style={styles.runWhen}>
                    Details stay private until recovery finishes
                  </Text>
                </View>
              </View>
              <View
                style={styles.recoveryNotice}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <Ionicons name="shield-checkmark" size={18} color={LIME} />
                <View style={styles.recoveryNoticeCopy}>
                  <Text style={styles.recoveryNoticeTitle}>{recoveryTitle}</Text>
                  <Text style={styles.recoveryNoticeDetail}>{recoveryDetail}</Text>
                </View>
                {recoveryNotice === 'gps_unconfirmed' ? (
                  <Pressable
                    style={[
                      styles.restoreLegacyBtn,
                      saving && styles.actionDisabled,
                    ]}
                    onPress={() => void onRetryConfirmGpsStop()}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Retry stop GPS"
                    accessibilityState={{ disabled: saving }}
                  >
                    <Text style={styles.restoreLegacyText}>Retry stop GPS</Text>
                  </Pressable>
                ) : null}
                {recoveryNotice === 'tracking_paused' ? (
                  <Pressable
                    style={[
                      styles.restoreLegacyBtn,
                      saving && styles.actionDisabled,
                    ]}
                    onPress={onRetryResume}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel="Retry resume"
                    accessibilityState={{ disabled: saving }}
                  >
                    <Text style={styles.restoreLegacyText}>Retry resume</Text>
                  </Pressable>
                ) : null}
                {recoveryNotice === 'finishing' ? (
                  <Pressable
                    style={[
                      styles.restoreLegacyBtn,
                      stopping && styles.actionDisabled,
                    ]}
                    onPress={() => void onStop()}
                    disabled={stopping}
                    accessibilityRole="button"
                    accessibilityLabel="Retry finish"
                    accessibilityState={{ disabled: stopping }}
                  >
                    <Text style={styles.restoreLegacyText}>Retry finish</Text>
                  </Pressable>
                ) : null}
                {recoveryNotice === 'legacy_unprovable' ||
                recoveryNotice === 'tracking_incomplete' ? (
                  <Pressable
                    style={[
                      styles.restoreLegacyBtn,
                      saving && styles.actionDisabled,
                    ]}
                    onPress={confirmDiscardLegacyRecording}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={
                      recoveryNotice === 'tracking_incomplete'
                        ? 'Discard incomplete activity'
                        : 'Discard older recording'
                    }
                    accessibilityState={{ disabled: saving }}
                  >
                    <Text style={styles.restoreLegacyText}>
                      {recoveryNotice === 'tracking_incomplete'
                        ? 'Discard incomplete activity'
                        : 'Discard older recording'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Recovery required"
                accessibilityState={{ disabled: true }}
                disabled
                style={styles.recoveryRequiredAction}
              >
                <Ionicons name="lock-closed" size={18} color={palette.ink.inverse} />
                <Text style={styles.recoveryRequiredText}>
                  Recovery required
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {confirmedBadgeStatus ? (
          <ActivityUploadBadge
            status={confirmedBadgeStatus}
            dark
            style={[
              styles.uploadBadge,
              { left: sideInset, top: insets.top + 68 },
            ]}
          />
        ) : null}
      </View>

      {/* post-run: turn it into a shareable card */}
      {visibleShareRun ? (
        <RunShareSheet
          run={visibleShareRun}
          onClose={() => {
            if (!shareAuthority || !isCommandCurrent(shareAuthority)) return;
            getCompletionController().reset('current_run_cleared');
            clearOwnerDetailState();
            setShareAuthority(null);
            setShareRun(null);
            router.navigate('/today' as never);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  mapBg: { backgroundColor: BG },
  recoveryBack: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.surface.card,
    borderWidth: 1,
    borderColor: palette.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryBottom: {
    position: 'absolute',
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: palette.surface.canvas,
    borderWidth: 1,
    borderColor: palette.border.subtle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recoveryHeadingCopy: { flex: 1 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: palette.border.strong,
  },
  avatarFallback: {
    backgroundColor: palette.surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runTitle: { color: palette.ink.primary, fontFamily: font.bold, fontSize: 16 },
  runWhen: {
    color: palette.ink.muted,
    fontFamily: font.regular,
    fontSize: 12,
    marginTop: 2,
  },
  uploadBadge: { position: 'absolute' },
  recoveryNotice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: palette.surface.muted,
    borderWidth: 1,
    borderColor: palette.border.action,
  },
  recoveryNoticeCopy: { flex: 1 },
  recoveryNoticeTitle: {
    color: palette.ink.primary,
    fontFamily: font.bold,
    fontSize: 13,
  },
  recoveryNoticeDetail: {
    color: palette.ink.secondary,
    fontFamily: font.medium,
    fontSize: 11,
    marginTop: 2,
  },
  restoreLegacyBtn: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
    backgroundColor: LIME,
  },
  restoreLegacyText: {
    color: palette.ink.inverse,
    fontFamily: font.bold,
    fontSize: 11,
    textAlign: 'center',
  },
  recoveryRequiredAction: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: LIME,
    opacity: 0.58,
  },
  recoveryRequiredText: {
    color: palette.ink.inverse,
    fontFamily: font.bold,
    fontSize: 15,
  },
  actionDisabled: { opacity: 0.55 },
});
