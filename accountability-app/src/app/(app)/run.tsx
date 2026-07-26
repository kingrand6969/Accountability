import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
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
  beginTrackRecording,
  claimLegacyTrackRecording,
  clearTrackRecording,
  LOCATION_TASK_NAME,
  persistCompletedTrackRecording,
  recoverTrackRecording,
  readTrackRecording,
  readTrackPoints,
  resetTrackPoints,
  type TrackRecordingRecovery,
  type TrackRecordingIdentity,
} from '../../activity/locationTask';
import { type ActivityType } from '../../activity/api';
import { enqueueActivity } from '../../activity/offlineQueueStore';
import {
  completeRecordedActivity,
  recordingDetailView,
  type RecordingRecoveryReadState,
  type PendingRecordedActivity,
} from '../../activity/runCompletion';
import { getMyProfile } from '../../profiles/api';
import { floatingTabBarStyle, FLOATING_BAR_CLEARANCE } from '../../ui/floatingTabBar';
import { font } from '../../ui/theme';
import { hapticImpact } from '../../ui/haptics';
import { contentMaxWidth } from '../../ui/responsive';
import { useAuth } from '../../auth/AuthProvider';

const LIME = '#c6f24e';
const BG = '#101319';

const TYPES: { value: ActivityType; label: string; icon: 'walk-outline' | 'footsteps-outline' | 'bicycle-outline' }[] = [
  { value: 'run', label: 'run', icon: 'walk-outline' },
  { value: 'walk', label: 'walk', icon: 'footsteps-outline' },
  { value: 'ride', label: 'ride', icon: 'bicycle-outline' },
];

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

function timeOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

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
  const { width: W, height: H } = useWindowDimensions();
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
    | null
  >(null);
  const [recoveryReadState, setRecoveryReadState] =
    useState<RecordingRecoveryReadState>('checking');
  const [detailOwnerId, setDetailOwnerId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  // shareable run card, shown after a successful save
  const [shareRun, setShareRun] = useState<FinishedRun | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);
  const recordingRef = useRef<TrackRecordingIdentity | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<OsmMapHandle>(null);
  // where to centre the idle map — the user's last-known spot (no prompt)
  const [idlePos, setIdlePos] = useState<{ lat: number; lng: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMyProfile().then((p) => setAvatar(p?.avatar_url ?? null)).catch(() => {});
      if (Platform.OS === 'web') return;
      Location.getForegroundPermissionsAsync()
        .then((perm) => (perm.granted ? Location.getLastKnownPositionAsync() : null))
        .then((pos) => pos && setIdlePos({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    }, []),
  );

  // stream live GPS points into the map without reloading it
  useEffect(() => {
    const ownerCanView =
      recoveryReadState === 'ready' &&
      !!detailOwnerId &&
      detailOwnerId === session?.user.id;
    if (!tracking || !ownerCanView) {
      mapRef.current?.setRoute([]);
      return;
    }
    const pts = toLatLng(livePoints);
    mapRef.current?.setRoute(pts, pts[pts.length - 1]);
  }, [
    detailOwnerId,
    livePoints,
    recoveryReadState,
    session?.user.id,
    tracking,
  ]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopUpdatesIfRunning();
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setRecoveryReadState('checking');
    void recoverTrackRecording(session?.user.id ?? null, 'run')
      .then((recovery) => {
        if (!active) return;
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
  }, [authLoading, session?.user.id]);

  // hide the floating tab bar while actually recording or sharing, so the run
  // stays immersive; show it (highlighted) in the idle pre-start state
  const immersive = tracking || !!shareRun;
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: immersive ? { display: 'none' } : floatingTabBarStyle(W, insets.bottom),
    });
  }, [immersive, navigation, W, insets.bottom]);

  useEffect(() => {
    if (!tracking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [tracking, pulse]);

  function startTrackingTimer() {
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
  }

  function restoreRecovery(recovery: TrackRecordingRecovery) {
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
      setDetailOwnerId(null);
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
  }

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

  async function onStart() {
    hapticImpact();
    if (Platform.OS === 'web') {
      // no GPS in a browser — let the user preview the shareable run card
      setShareRun({
        activityId: null,
        ownerId: null,
        syncStatus: null,
        type,
        distance: totalDistanceMeters(SAMPLE_ROUTE),
        elapsed: 31 * 60 + 12,
        points: SAMPLE_ROUTE,
        title: `${timeOfDay()} ${TYPES.find((t) => t.value === type)?.label ?? 'run'}`,
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
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Tracking your activity',
          notificationBody: 'Recording distance & pace — tap to return.',
          notificationColor: '#2563eb',
        },
      });
    } catch (e) {
      recordingRef.current = null;
      setDetailOwnerId(null);
      await resetTrackPoints().catch(() => undefined);
      Alert.alert('Could not start tracking', String((e as Error).message ?? e));
      return;
    }
    setTracking(true);
    startTrackingTimer();
  }

  async function persist(p: PendingSave) {
    setSaving(true);
    try {
      await persistCompletedTrackRecording(p);
      const queued = await completeRecordedActivity(p, {
        enqueueActivity,
        clearRecording: clearTrackRecording,
      });
      setPending(null);
      recordingRef.current = null;
      setDetailOwnerId(null);
      // saved to the log — now offer the shareable run card
      setShareRun({
        activityId: queued.id,
        ownerId: queued.ownerId,
        syncStatus: queued.status,
        type: p.activity.type,
        distance: p.activity.distance_m,
        elapsed: p.activity.duration_s,
        points: p.activity.route,
        title: `${timeOfDay()} ${TYPES.find((t) => t.value === p.activity.type)?.label ?? 'run'}`,
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
  const recoveryBlocked =
    recoveryReadState !== 'ready' ||
    recoveryNotice !== null ||
    (detailOwnerId !== null && !detailView.visible);
  const kcal = estimateCalories(type, shownDist);

  // live route is pushed via the map ref while tracking (no reload); a finished
  // run passes its full route as a prop
  const mapRoute = visibleTracking ? [] : toLatLng(shownPoints);
  const idleMarkers =
    !tracking && shownPoints.length === 0 && idlePos
      ? [{ lat: idlePos.lat, lng: idlePos.lng, label: 'You', color: LIME }]
      : [];
  // keep the floating UI in a centered column on wide screens (map stays full-bleed)
  const sideInset = Math.max(16, (W - contentMaxWidth(W)) / 2);
  const title = `${timeOfDay()} ${TYPES.find((t) => t.value === type)?.label ?? 'run'}`;
  const when = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={styles.screen}>
      {/* full-screen real map (dark tiles to match the immersive UI) */}
      <OsmMap
        ref={mapRef}
        route={mapRoute}
        markers={idleMarkers}
        interactive={false}
        tiles="dark"
        style={[StyleSheet.absoluteFill, styles.mapBg]}
      />
      {/* top/bottom scrim keeps the white overlay text legible over the map */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(16,19,25,0.62)', 'rgba(16,19,25,0.05)', 'rgba(16,19,25,0.12)', 'rgba(16,19,25,0.86)']}
        locations={[0, 0.28, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* top bar */}
      <View style={[styles.topBar, { top: insets.top + 6, left: sideInset, right: sideInset }]}>
        <Pressable style={styles.circleBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </Pressable>
        <View style={styles.typeSwitch}>
          {TYPES.map((t) => (
            <Pressable
              key={t.value}
              onPress={() => !tracking && !pending && setType(t.value)}
              disabled={tracking || !!pending}
              style={[styles.typePill, type === t.value && styles.typePillActive]}
              accessibilityLabel={t.label}
            >
              <Ionicons name={t.icon} size={15} color={type === t.value ? '#101319' : '#cbd5e1'} />
            </Pressable>
          ))}
        </View>
        <Pressable
          style={[styles.circleBtn, recoveryBlocked && styles.actionDisabled]}
          onPress={onDiscard}
          accessibilityLabel="Discard"
          disabled={recoveryBlocked}
          accessibilityState={{ disabled: recoveryBlocked }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* floating stat pills */}
      <View style={[styles.pills, { top: insets.top + 90, right: sideInset }]}>
        <StatPill value={String(kcal)} label="Calories" />
        <StatPill value={formatPace(shownDist, shownElapsed)} label="per km" />
      </View>

      {/* floating bottom card */}
      <View
        style={[
          styles.bottom,
          // lift the controls clear of the floating bar when it's showing
          {
            left: sideInset,
            right: sideInset,
            paddingBottom: insets.bottom + (immersive ? 16 : FLOATING_BAR_CLEARANCE + 12),
          },
        ]}
      >
        <View style={styles.titleRow}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={14} color="#cbd5e1" />
            </View>
          )}
          <View>
            <Text style={styles.runTitle}>{title}</Text>
            <Text style={styles.runWhen}>
              {when} · {timeLabel}
            </Text>
          </View>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.distanceCard}>
            <View style={styles.distanceTop}>
              <Ionicons name="location" size={14} color="#101319" />
              <Text style={styles.distanceLabel}>Distance</Text>
            </View>
            <View style={styles.distanceValRow}>
              <Text style={styles.distanceVal}>{formatKm(shownDist)}</Text>
              <Text style={styles.distanceUnit}>Km</Text>
            </View>
          </View>

          <View style={styles.timeCard}>
            <Text style={styles.timeLabel}>Time</Text>
            <Text style={styles.timeVal}>{formatDuration(shownElapsed)}</Text>
          </View>
        </View>

        {recoveryNotice ? (
          <View style={styles.recoveryNotice} accessibilityLiveRegion="polite">
            <Ionicons name="shield-checkmark" size={18} color={LIME} />
            <View style={styles.recoveryNoticeCopy}>
              <Text style={styles.recoveryNoticeTitle}>
                {recoveryNotice === 'legacy_unclaimed'
                  ? 'Unsaved activity from an older version found'
                  : recoveryNotice === 'storage_error'
                    ? 'Saved activity could not be checked'
                    : 'Recording saved safely'}
              </Text>
              <Text style={styles.recoveryNoticeDetail}>
                {recoveryNotice === 'owner_mismatch'
                  ? 'Sign in as the recording owner to recover it.'
                  : recoveryNotice === 'legacy_unclaimed'
                    ? 'Restore it explicitly before viewing its details.'
                    : recoveryNotice === 'storage_error'
                      ? 'Details stay hidden until storage is available.'
                  : 'Sign in to recover this recording.'}
              </Text>
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
          </View>
        ) : null}

        {/* floating primary action */}
        {visiblePending ? (
          <View style={styles.pendingRow}>
            <Pressable style={[styles.actionBtn, styles.retryBtn]} onPress={() => persist(visiblePending)} disabled={saving}>
              <Text style={styles.retryText}>{saving ? 'Saving…' : 'Retry'}</Text>
            </Pressable>
          </View>
        ) : visibleTracking ? (
          <Pressable style={[styles.actionBtn, styles.stopBtn]} onPress={onStop} disabled={saving}>
            <Ionicons name="stop" size={20} color="#fff" />
            <Text style={styles.stopText}>{saving ? 'Saving…' : 'Stop & Save'}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[
              styles.actionBtn,
              styles.startBtn,
              recoveryBlocked && styles.actionDisabled,
            ]}
            onPress={onStart}
            disabled={recoveryBlocked}
            accessibilityState={{ disabled: recoveryBlocked }}
          >
            <Ionicons name="play" size={20} color="#101319" />
            <Text style={styles.startText}>
              {recoveryBlocked
                ? 'Recovery required'
                : `Start ${TYPES.find((t) => t.value === type)?.label}`}
            </Text>
          </Pressable>
        )}
      </View>

      {/* post-run: turn it into a shareable card */}
      {shareRun ? (
        <RunShareSheet
          run={shareRun}
          onClose={() => {
            setShareRun(null);
            router.navigate('/today' as never);
          }}
        />
      ) : null}
    </View>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  mapBg: { backgroundColor: BG },
  runner: { position: 'absolute', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  runnerPulse: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: LIME },
  runnerDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: LIME,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(30,36,48,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeSwitch: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(30,36,48,0.85)',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  typePill: { width: 38, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  typePillActive: { backgroundColor: LIME },
  pills: { position: 'absolute', right: 16, gap: 10 },
  pill: {
    minWidth: 62,
    alignItems: 'center',
    backgroundColor: 'rgba(20,24,32,0.82)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pillValue: { color: '#fff', fontFamily: font.extrabold, fontSize: 17 },
  pillLabel: { color: '#94a3b8', fontFamily: font.medium, fontSize: 11, marginTop: 1 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 0, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' },
  avatarFallback: { backgroundColor: 'rgba(30,36,48,0.9)', alignItems: 'center', justifyContent: 'center' },
  runTitle: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  runWhen: { color: '#94a3b8', fontFamily: font.medium, fontSize: 12, marginTop: 1 },
  cardsRow: { flexDirection: 'row', gap: 12 },
  distanceCard: { flex: 1.5, backgroundColor: LIME, borderRadius: 24, padding: 18, justifyContent: 'space-between', minHeight: 108 },
  distanceTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  distanceLabel: { color: '#101319', fontFamily: font.semibold, fontSize: 13 },
  distanceValRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  distanceVal: { color: '#101319', fontFamily: font.display, fontSize: 46, lineHeight: 48, includeFontPadding: false },
  distanceUnit: { color: '#101319', fontFamily: font.bold, fontSize: 16, marginBottom: 6 },
  timeCard: {
    flex: 1,
    backgroundColor: 'rgba(24,29,39,0.92)',
    borderRadius: 24,
    padding: 18,
    justifyContent: 'space-between',
    minHeight: 108,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  timeLabel: { color: '#94a3b8', fontFamily: font.semibold, fontSize: 13 },
  timeVal: { color: '#fff', fontFamily: font.display, fontSize: 34, includeFontPadding: false },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    paddingVertical: 18,
    marginTop: 4,
  },
  startBtn: { backgroundColor: LIME },
  startText: { color: '#101319', fontFamily: font.extrabold, fontSize: 17, textTransform: 'capitalize' },
  stopBtn: { backgroundColor: '#ef4444' },
  stopText: { color: '#fff', fontFamily: font.extrabold, fontSize: 17 },
  pendingRow: { gap: 8 },
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
    minHeight: 44,
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
  retryBtn: { backgroundColor: LIME },
  retryText: { color: '#101319', fontFamily: font.extrabold, fontSize: 16 },
});
