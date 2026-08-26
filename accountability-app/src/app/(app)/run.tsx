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
import { font } from '../../ui/theme';
import { hapticImpact } from '../../ui/haptics';
import { contentMaxWidth } from '../../ui/responsive';
import { useAuth } from '../../auth/AuthProvider';
import { navigateBackSafely } from '../../navigation/routeAccessContract';
import {
  completedRunTimestamp,
  createDefaultRunShareAppearance,
  runCardTitle,
} from '../../activity/runShareAppearance';

const LIME = '#c6f24e';
const BG = '#101319';

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
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [livePoints, setLivePoints] = useState<Pt[]>([]);
  const [pending, setPending] = useState<PendingSave | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<
    | 'needs_owner'
    | 'owner_mismatch'
    | 'storage_error'
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
  const stoppingRef = useRef(false);
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
    stoppingRef.current = false;
    setStarting(false);
    setStopping(false);
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
      setTracking(false);
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
        setTracking(false);
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
        setTracking(false);
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
        setTracking(false);
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
        setTracking(false);
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
        setTracking(false);
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
      setElapsed(
        Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000)),
      );
      setTracking(true);
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
      try {
        const taskStatus = await startTrackLocationTaskFor(recording);
        if (!isCommandCurrent(command)) return;
        if (taskStatus !== 'running' && taskStatus !== 'restarted') {
          throw new Error(
            taskStatus === 'stale'
              ? 'The saved recording changed before GPS could start.'
              : 'GPS could not stay active.',
          );
        }
      } catch (e) {
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
          setRecoveryReadState('error');
          setRecoveryNotice('storage_error');
        }
        Alert.alert(
          'Tracking paused',
          `${String((e as Error).message ?? e)}\n\nYour recording is safe. Tap Retry resume.`,
        );
        return;
      }
      setTracking(true);
      startTrackingTimer(ownerId);
    } finally {
      releaseSynchronousLock(startingRef);
      if (isCommandCurrent(command)) setStarting(false);
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
    if (!acquireSynchronousLock(stoppingRef)) return;
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
      const finalElapsed = exactStoredSummary?.durationS ?? Math.max(
        0,
        Math.round((Date.now() - startedAtMs) / 1000),
      );
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
          setTracking(false);
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
        setTracking(false);
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
        setTracking(false);
        setRecoveryReadState('error');
        setRecoveryNotice('finishing');
        Alert.alert(
          'Could not finish activity',
          'Your route is still safe on this phone. Tap Retry finish.',
        );
      }
    } finally {
      releaseSynchronousLock(stoppingRef);
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
    setTracking(false);
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
      stoppingRef.current ||
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
        setTracking(false);
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
  const ownerlessPrivateDetail =
    detailOwnerId === null &&
    (pending !== null || tracking || rawDistance > 0 || rawElapsed > 0 || rawPoints.length > 0);
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
    !recoveryBlocked && !visibleTracking && safeRoute.length === 0 && idlePos
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
    visibleTracking || !!visiblePending || recoveryBlocked || starting || stopping;
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
      : visibleTracking
        ? {
            label: 'Stop & Save',
            icon: 'stop',
            tone: 'danger',
            disabled: saving,
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
        : visibleTracking
          ? 'Your activity is recording. Use Stop & Save when you finish.'
          : 'Choose Run, Walk, or Ride above. GPS and saving are handled when you start.';
    const identity = visiblePending
      ? visiblePending.identity
      : visibleTracking
        ? recordingRef.current
        : null;
    if (
      !identity ||
      visiblePending !== null ||
      stopping ||
      saving ||
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
            tiles="dark"
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
              <Ionicons name="chevron-back" size={23} color="#f7f8f4" />
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
                    <Ionicons name="person" size={14} color="#cbd5e1" />
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
                <Ionicons name="lock-closed" size={18} color="#101319" />
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
    backgroundColor: 'rgba(18,21,18,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recoveryBottom: {
    position: 'absolute',
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(11,13,11,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarFallback: {
    backgroundColor: 'rgba(30,36,48,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  runTitle: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  runWhen: {
    color: '#9da59d',
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
    backgroundColor: 'rgba(198,242,78,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
  },
  recoveryNoticeCopy: { flex: 1 },
  recoveryNoticeTitle: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 13,
  },
  recoveryNoticeDetail: {
    color: '#cbd5e1',
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
    color: '#101319',
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
    color: '#101319',
    fontFamily: font.bold,
    fontSize: 15,
  },
  actionDisabled: { opacity: 0.55 },
});
