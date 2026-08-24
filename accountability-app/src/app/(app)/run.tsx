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
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
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
  beginTrackRecording,
  claimLegacyTrackRecording,
  clearTrackRecording,
  ensureTrackLocationTask,
  LOCATION_TASK_NAME,
  persistCompletedTrackRecording,
  recoverTrackRecording,
  readTrackRecording,
  readTrackPoints,
  resetTrackPoints,
  startTrackLocationTask,
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
  type PendingRecordedActivity,
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

type PendingSave = PendingRecordedActivity;

async function stopUpdatesIfRunning() {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // not running
  }
}

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
    | 'legacy_unclaimed'
    | 'storage_error'
    | 'tracking_paused'
    | null
  >(null);
  const [recoveryReadState, setRecoveryReadState] =
    useState<RecordingRecoveryReadState>('checking');
  const [detailOwnerId, setDetailOwnerId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<{
    ownerId: string;
    uri: string | null;
  } | null>(null);
  const [starting, setStarting] = useState(false);
  // shareable run card, shown after a successful save
  const [shareRun, setShareRun] = useState<FinishedRun | null>(null);
  const [durableQueueConfirmation, setDurableQueueConfirmation] =
    useState<DurableQueueConfirmation | null>(null);
  const completionControllerRef =
    useRef<DurableCompletionController | null>(null);
  const getCompletionController = useCallback(() => {
    if (!completionControllerRef.current) {
      completionControllerRef.current =
        createDurableCompletionController({
          enqueueActivity,
          clearRecording: clearTrackRecording,
          onConfirm: setDurableQueueConfirmation,
          onReset: () => setDurableQueueConfirmation(null),
        });
    }
    return completionControllerRef.current;
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);
  const recordingRef = useRef<TrackRecordingIdentity | null>(null);
  const startingRef = useRef(false);
  const avatarRevisionRef = useRef(0);
  const authOwnerRef = useRef<string | null>(session?.user.id ?? null);
  const completionOwnerRef = useRef<string | null>(
    session?.user.id ?? null,
  );
  useLayoutEffect(() => {
    authOwnerRef.current = session?.user.id ?? null;
  }, [session?.user.id]);
  const mapRef = useRef<OsmMapHandle>(null);
  // where to centre the idle map — the user's last-known spot (no prompt)
  const [idlePos, setIdlePos] = useState<{ lat: number; lng: number } | null>(null);

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
      Location.getForegroundPermissionsAsync()
        .then((perm) => (perm.granted ? Location.getLastKnownPositionAsync() : null))
        .then((pos) => pos && setIdlePos({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    }, [session?.user.id]),
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      completionControllerRef.current?.dispose();
      completionControllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    const ownerId = session?.user.id ?? null;
    if (completionOwnerRef.current !== ownerId) {
      getCompletionController().reset('auth_owner_change');
      completionOwnerRef.current = ownerId;
    }
  }, [authLoading, getCompletionController, session?.user.id]);

  // The Run tracker is an immersive, map-first destination in every state.
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: { display: 'none' },
    });
  }, [navigation]);

  const startTrackingTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(async () => {
      setElapsed(
        Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000)),
      );
      try {
        const pts = await readTrackPoints();
        setLivePoints(pts);
        setDistance(totalDistanceMeters(pts));
      } catch {
        // Keep the last safe in-memory view while local storage recovers.
      }
    }, 1000);
  }, []);

  const restorePausedRecovery = useCallback(
    (recovery: Extract<TrackRecordingRecovery, { kind: 'active' }>) => {
      getCompletionController().reset('recovery');
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      recordingRef.current = {
        activityId: recovery.activityId,
        ownerId: recovery.ownerId,
        startedAt: recovery.startedAt,
      };
      setDetailOwnerId(recovery.ownerId);
      setRecoveryReadState('error');
      setRecoveryNotice('tracking_paused');
      setTracking(false);
      setPending(null);
      setDistance(0);
      setElapsed(0);
      setLivePoints([]);
    },
    [getCompletionController],
  );

  const restoreRecovery = useCallback(
    (recovery: TrackRecordingRecovery) => {
      getCompletionController().reset('recovery');
      setRecoveryReadState('ready');
      if (recovery.kind === 'legacy_unclaimed') {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        recordingRef.current = null;
        setDetailOwnerId(null);
        setTracking(false);
        setPending(null);
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setRecoveryNotice('legacy_unclaimed');
        return;
      }
      if (
        recovery.kind === 'needs_owner' ||
        recovery.kind === 'owner_mismatch'
      ) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        recordingRef.current = null;
        setDetailOwnerId(
          recovery.kind === 'owner_mismatch' ? recovery.ownerId : null,
        );
        setTracking(false);
        setPending(null);
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setRecoveryNotice(recovery.kind);
        return;
      }
      if (recovery.kind === 'none') {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        recordingRef.current = null;
        startedAtRef.current = '';
        startMsRef.current = 0;
        setDetailOwnerId(null);
        setTracking(false);
        setPending(null);
        setType('run');
        setDistance(0);
        setElapsed(0);
        setLivePoints([]);
        setRecoveryNotice(null);
        return;
      }
      if (recovery.kind === 'completed') {
        const recording = recovery.recording;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
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
        setPending(recording);
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
      setPending(null);
      setType(recovery.type);
      setLivePoints(recovery.points);
      setDistance(totalDistanceMeters(recovery.points));
      setElapsed(
        Math.max(0, Math.round((Date.now() - startMsRef.current) / 1000)),
      );
      setTracking(true);
      startTrackingTimer();
    },
    [getCompletionController, startTrackingTimer],
  );

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    getCompletionController().reset('recovery');
    queueMicrotask(() => {
      if (active) setRecoveryReadState('checking');
    });
    void recoverTrackRecording(session?.user.id ?? null, 'run')
      .then(async (recovery) => {
        if (!active) return;
        if (recovery.kind === 'active') {
          const taskStatus = await ensureTrackLocationTask();
          if (!active) return;
          if (taskStatus === 'paused') {
            restorePausedRecovery(recovery);
            return;
          }
        }
        restoreRecovery(recovery);
      })
      .catch(() => {
        if (!active) return;
        setRecoveryReadState('error');
        setRecoveryNotice('storage_error');
      });
    return () => {
      active = false;
    };
  }, [
    authLoading,
    getCompletionController,
    restorePausedRecovery,
    restoreRecovery,
    session?.user.id,
  ]);

  async function onClaimLegacy() {
    const ownerId = session?.user.id;
    if (!ownerId) {
      Alert.alert(
        'Sign in required',
        'Sign in before restoring this activity.',
      );
      return;
    }
    setSaving(true);
    setRecoveryReadState('checking');
    try {
      const claimed = await claimLegacyTrackRecording(ownerId, type);
      restoreRecovery(claimed);
    } catch {
      setRecoveryReadState('error');
      setRecoveryNotice('storage_error');
      Alert.alert(
        'Could not restore activity',
        'The activity remains safely stored on this phone. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function onRetryResume() {
    const ownerId = session?.user.id;
    if (!ownerId) return;
    setSaving(true);
    setRecoveryReadState('checking');
    try {
      const recovery = await recoverTrackRecording(ownerId, type);
      if (recovery.kind !== 'active') {
        restoreRecovery(recovery);
        return;
      }
      const taskStatus = await ensureTrackLocationTask();
      if (taskStatus === 'paused') {
        restorePausedRecovery(recovery);
        return;
      }
      restoreRecovery(recovery);
    } catch {
      setRecoveryReadState('error');
      setRecoveryNotice('tracking_paused');
    } finally {
      setSaving(false);
    }
  }

  async function onStart() {
    if (!acquireSynchronousLock(startingRef)) return;
    getCompletionController().reset('new_recording');
    setStarting(true);
    try {
    hapticImpact();
    if (Platform.OS === 'web') {
      // no GPS in a browser — let the user preview the shareable run card
      const completedAt = new Date().toISOString();
      setShareRun({
        activityId: null,
        ownerId: session?.user.id ?? null,
        syncStatus: null,
        type,
        distance: totalDistanceMeters(SAMPLE_ROUTE),
        elapsed: 31 * 60 + 12,
        points: SAMPLE_ROUTE,
        title: runCardTitle(type, completedAt),
        completedAt,
        cardTheme: createDefaultRunShareAppearance(completedAt).theme,
      });
      return;
    }
    const ownerId = session?.user.id;
    if (!ownerId) {
      Alert.alert(
        'Sign in required',
        'Sign in before starting so this activity stays with the right account.',
      );
      return;
    }
    try {
      const existing = await recoverTrackRecording(ownerId, type);
      if (existing.kind !== 'none') {
        restoreRecovery(existing);
        Alert.alert(
          'Recording already saved',
          existing.kind === 'owner_mismatch'
            ? 'Sign in as the recording owner to recover it.'
            : existing.kind === 'legacy_unclaimed'
              ? 'Use Restore to this account before starting.'
            : 'Your saved recording has been restored.',
        );
        return;
      }
    } catch {
      Alert.alert(
        'Could not check saved recording',
        'Try again before starting a new activity.',
      );
      return;
    }
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      Alert.alert('Location needed', 'Allow location access to track your activity.');
      return;
    }
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    let recording: TrackRecordingIdentity;
    try {
      recording = await beginTrackRecording(ownerId, type);
    } catch {
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
      await startTrackLocationTask();
    } catch (e) {
      const recovery = await recoverTrackRecording(ownerId, type).catch(
        () => null,
      );
      if (recovery?.kind === 'active') {
        restorePausedRecovery(recovery);
      }
      Alert.alert(
        'Tracking paused',
        `${String((e as Error).message ?? e)}\n\nYour recording is safe. Tap Retry resume.`,
      );
      return;
    }
    setTracking(true);
    startTrackingTimer();
    } finally {
      releaseSynchronousLock(startingRef);
      setStarting(false);
    }
  }

  async function persist(p: PendingSave) {
    setSaving(true);
    try {
      await persistCompletedTrackRecording(p);
      const queued = await getCompletionController().complete(p);
      setPending(null);
      recordingRef.current = null;
      setDetailOwnerId(null);
      // saved to the log — now offer the shareable run card
      const completedAt = completedRunTimestamp(
        p.activity.started_at,
        p.activity.duration_s,
      );
      setShareRun({
        activityId: queued.id,
        ownerId: queued.ownerId,
        syncStatus: queued.status,
        type: p.activity.type,
        distance: p.activity.distance_m,
        elapsed: p.activity.duration_s,
        points: p.activity.route,
        title: runCardTitle(p.activity.type, completedAt),
        completedAt,
        cardTheme: createDefaultRunShareAppearance(completedAt).theme,
      });
    } catch (e) {
      setPending(p);
      Alert.alert(
        'Could not save on this phone',
        `${String((e as Error).message ?? e)}\n\nYour recording is safe — tap Retry.`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function onStop() {
    getCompletionController().reset('stop');
    hapticImpact();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    await stopUpdatesIfRunning();
    setTracking(false);
    const finalElapsed = Math.round((Date.now() - startMsRef.current) / 1000);
    const points = await readTrackPoints();
    const finalDistance = totalDistanceMeters(points);
    setElapsed(finalElapsed);
    setDistance(finalDistance);
    setLivePoints(points);
    if (finalElapsed < 3 && finalDistance < 5) {
      Alert.alert('Too short', 'That activity was too short to save.');
      await resetTrackPoints();
      recordingRef.current = null;
      setDetailOwnerId(null);
      return;
    }
    const identity =
      recordingRef.current ??
      (await readTrackRecording(session?.user.id).catch(() => null));
    if (!identity) {
      Alert.alert(
        'Could not save on this phone',
        'Your route is still on this phone. Reopen this screen and tap Retry.',
      );
      return;
    }
    const nextPending: PendingSave = {
      activityId: identity.activityId,
      ownerId: identity.ownerId,
      activity: {
        type,
        distance_m: finalDistance,
        duration_s: finalElapsed,
        route: points,
        started_at: identity.startedAt,
      },
    };
    setPending(nextPending);
    await persist(nextPending);
  }

  function onDiscard() {
    Alert.alert('Discard recording?', 'This activity will be lost for good.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          getCompletionController().reset('discard');
          setPending(null);
          await resetTrackPoints();
          recordingRef.current = null;
          setDetailOwnerId(null);
          setDistance(0);
          setElapsed(0);
          setLivePoints([]);
        },
      },
    ]);
  }

  const rawDistance = pending ? pending.activity.distance_m : distance;
  const rawElapsed = pending ? pending.activity.duration_s : elapsed;
  const rawPoints = pending ? pending.activity.route : livePoints;
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
        visible: recoveryNotice === null && recoveryReadState !== 'error',
        distance: rawDistance,
        elapsed: rawElapsed,
        points: rawPoints,
      };
  const shownDist = detailView.distance;
  const shownElapsed = detailView.elapsed;
  const shownPoints = detailView.points;
  const visiblePending = detailView.visible ? pending : null;
  const visibleTracking = detailView.visible && tracking;
  const confirmedBadgeStatus = activityUploadBadgeStatus(
    shareRun?.activityId ?? visiblePending?.activityId ?? null,
    durableQueueConfirmation,
  );
  const recoveryBlocked =
    recoveryReadState !== 'ready' ||
    recoveryNotice !== null ||
    (detailOwnerId !== null && !detailView.visible);
  const typeIsProtected = detailOwnerId !== null || recoveryBlocked;
  const privateTypeView = recordingTypeView(
    type,
    detailOwnerId,
    session?.user.id ?? null,
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
  const idleMarkers =
    !recoveryBlocked && !visibleTracking && safeRoute.length === 0 && idlePos
      ? [{ lat: idlePos.lat, lng: idlePos.lng, label: 'You', color: LIME }]
      : [];
  const sideInset = Math.max(16, (W - contentMaxWidth(W)) / 2);
  const visibleAvatar =
    avatar && avatar.ownerId === session?.user.id ? avatar.uri : null;
  const resolvedVisibleAvatar = useResolvedImageUrl(visibleAvatar);

  // Clear imperative geometry as soon as its owner is no longer authoritative.
  // While recording, update only from the already-redacted detail view.
  useEffect(() => {
    if (!detailView.visible || recoveryBlocked) {
      mapRef.current?.setRoute([]);
      return;
    }
    if (!visibleTracking) return;
    const route = toLatLng(shownPoints);
    mapRef.current?.setRoute(route, route[route.length - 1]);
  }, [detailView.visible, recoveryBlocked, shownPoints, visibleTracking]);

  const selectorDisabled =
    visibleTracking || !!visiblePending || recoveryBlocked || starting;
  const selectedActivityLabel = selectedType ? TYPE_LABEL[selectedType] : 'Run';
  const status = visiblePending
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
  const primaryAction: RunTrackerPrimaryAction = visiblePending
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
    mapRef.current?.setRoute(safeRoute, center);
  }

  function onShowRoute() {
    if (!routeOverviewAvailable) return;
    mapRef.current?.setRoute(safeRoute);
  }

  function onMoreOptions() {
    if (visibleTracking || visiblePending) {
      onDiscard();
      return;
    }
    Alert.alert(
      'Run options',
      'Choose Run, Walk, or Ride above. GPS and saving are handled when you start.',
    );
  }

  const recoveryTitle =
    recoveryNotice === 'legacy_unclaimed'
      ? 'Unsaved activity from an older version found'
      : recoveryNotice === 'storage_error'
        ? 'Saved activity could not be checked'
        : recoveryNotice === 'tracking_paused'
          ? 'Tracking paused'
          : recoveryNotice
            ? 'Recording saved safely'
            : 'Checking saved activity';
  const recoveryDetail =
    recoveryNotice === 'owner_mismatch'
      ? 'Sign in as the recording owner to recover it.'
      : recoveryNotice === 'legacy_unclaimed'
        ? 'Restore it explicitly before viewing its details.'
        : recoveryNotice === 'storage_error'
          ? 'Details stay hidden until storage is available.'
          : recoveryNotice === 'tracking_paused'
            ? 'Your route is safe. Resume tracking to continue.'
            : recoveryNotice === 'needs_owner'
              ? 'Sign in to recover this recording.'
              : 'Activity details stay hidden while this phone is checked.';

  return (
    <View style={styles.screen}>
      <View
        accessibilityElementsHidden={!!shareRun}
        importantForAccessibility={
          shareRun ? 'no-hide-descendants' : 'auto'
        }
        style={StyleSheet.absoluteFill}
      >
        <OsmMap
          ref={mapRef}
          route={mapRoute}
          markers={idleMarkers}
          interactive
          tiles="dark"
          fitPadding={{
            top: insets.top + 88,
            right: sideInset + 64,
            bottom: Math.min(360, Math.max(220, Math.round(H * 0.4))),
            left: sideInset + 24,
          }}
          style={[StyleSheet.absoluteFill, styles.mapBg]}
        />
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
                {recoveryNotice === 'legacy_unclaimed' ? (
                  <Pressable
                    style={[
                      styles.restoreLegacyBtn,
                      (!session?.user.id || saving) && styles.actionDisabled,
                    ]}
                    onPress={onClaimLegacy}
                    disabled={!session?.user.id || saving}
                    accessibilityRole="button"
                    accessibilityLabel="Restore to this account"
                    accessibilityState={{
                      disabled: !session?.user.id || saving,
                    }}
                  >
                    <Text style={styles.restoreLegacyText}>
                      Restore to this account
                    </Text>
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
              </View>
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
      {shareRun ? (
        <RunShareSheet
          run={shareRun}
          onClose={() => {
            getCompletionController().reset('current_run_cleared');
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
  actionDisabled: { opacity: 0.55 },
});
