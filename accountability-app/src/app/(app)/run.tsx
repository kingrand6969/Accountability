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
import { RouteTrace, traceHead } from '../../activity/RouteTrace';
import { RunShareSheet, type FinishedRun } from '../../activity/RunShareSheet';
import {
  LOCATION_TASK_NAME,
  readTrackPoints,
  resetTrackPoints,
} from '../../activity/locationTask';
import { saveActivity, type ActivityType } from '../../activity/api';
import { getMyProfile } from '../../profiles/api';
import { floatingTabBarStyle, FLOATING_BAR_CLEARANCE } from '../../ui/floatingTabBar';
import { font } from '../../ui/theme';

const LIME = '#c6f24e';
const BG = '#101319';

const TYPES: { value: ActivityType; label: string; icon: 'walk-outline' | 'footsteps-outline' | 'bicycle-outline' }[] = [
  { value: 'run', label: 'run', icon: 'walk-outline' },
  { value: 'walk', label: 'walk', icon: 'footsteps-outline' },
  { value: 'ride', label: 'ride', icon: 'bicycle-outline' },
];

// a small loop so the screen shows the trace design before a real run
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

type PendingSave = {
  type: ActivityType;
  distance: number;
  elapsed: number;
  points: Pt[];
  startedAt: string;
};

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
  const [avatar, setAvatar] = useState<string | null>(null);
  // shareable run card, shown after a successful save
  const [shareRun, setShareRun] = useState<FinishedRun | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      getMyProfile().then((p) => setAvatar(p?.avatar_url ?? null)).catch(() => {});
    }, []),
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopUpdatesIfRunning();
    };
  }, []);

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

  async function onStart() {
    if (Platform.OS === 'web') {
      // no GPS in a browser — let the user preview the shareable run card
      setShareRun({
        type,
        distance: totalDistanceMeters(SAMPLE_ROUTE),
        elapsed: 31 * 60 + 12,
        points: SAMPLE_ROUTE,
        title: `${timeOfDay()} ${TYPES.find((t) => t.value === type)?.label ?? 'run'}`,
      });
      return;
    }
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      Alert.alert('Location needed', 'Allow location access to track your activity.');
      return;
    }
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    await resetTrackPoints();
    setDistance(0);
    setElapsed(0);
    setLivePoints([]);
    startedAtRef.current = new Date().toISOString();
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
      Alert.alert('Could not start tracking', String((e as Error).message ?? e));
      return;
    }
    setTracking(true);
    timerRef.current = setInterval(async () => {
      setElapsed(Math.round((Date.now() - startMsRef.current) / 1000));
      try {
        const pts = await readTrackPoints();
        setLivePoints(pts);
        setDistance(totalDistanceMeters(pts));
      } catch {
        // keep last value
      }
    }, 1000);
  }

  async function persist(p: PendingSave) {
    setSaving(true);
    try {
      await saveActivity({
        type: p.type,
        distance_m: p.distance,
        duration_s: p.elapsed,
        route: p.points,
        started_at: p.startedAt,
      });
      setPending(null);
      await resetTrackPoints();
      // saved to the log — now offer the shareable run card
      setShareRun({
        type: p.type,
        distance: p.distance,
        elapsed: p.elapsed,
        points: p.points,
        title: `${timeOfDay()} ${TYPES.find((t) => t.value === p.type)?.label ?? 'run'}`,
      });
    } catch (e) {
      setPending(p);
      Alert.alert('Could not save', `${String((e as Error).message ?? e)}\n\nYour recording is safe — tap "Retry save".`);
    } finally {
      setSaving(false);
    }
  }

  async function onStop() {
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
      return;
    }
    await persist({ type, distance: finalDistance, elapsed: finalElapsed, points, startedAt: startedAtRef.current });
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
          setDistance(0);
          setElapsed(0);
          setLivePoints([]);
        },
      },
    ]);
  }

  const shownDist = pending ? pending.distance : distance;
  const shownElapsed = pending ? pending.elapsed : elapsed;
  const shownPoints = pending ? pending.points : livePoints;
  const kcal = estimateCalories(type, shownDist);

  const isSample = shownPoints.length === 0 && !tracking;
  const tracePoints = isSample ? SAMPLE_ROUTE : shownPoints;
  // trace fills the screen but the path is lifted into the top ~55% so the
  // floating bottom card never covers the runner marker
  const tracePad = { top: insets.top + 80, right: 70, bottom: H * 0.44, left: 60 };
  const head = traceHead(tracePoints, W, H, 5, tracePad);
  const title = `${timeOfDay()} ${TYPES.find((t) => t.value === type)?.label ?? 'run'}`;
  const when = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeLabel = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={styles.screen}>
      {/* full-screen map trace */}
      <RouteTrace
        points={tracePoints}
        width={W}
        height={H}
        stroke={5}
        accent={LIME}
        showHead={false}
        endStyle="none"
        faint={isSample}
        pad={tracePad}
      />

      {/* runner marker at the current position */}
      {head ? (
        <View style={[styles.runner, { left: head.x - 22, top: head.y - 22 }]} pointerEvents="none">
          {tracking ? (
            <Animated.View
              style={[
                styles.runnerPulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
                },
              ]}
            />
          ) : null}
          <View style={styles.runnerDot}>
            <Ionicons name="walk" size={18} color="#101319" />
          </View>
        </View>
      ) : null}

      {/* top bar */}
      <View style={[styles.topBar, { top: insets.top + 6 }]}>
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
        <Pressable style={styles.circleBtn} onPress={onDiscard} accessibilityLabel="Discard">
          <Ionicons name="ellipsis-horizontal" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* floating stat pills */}
      <View style={[styles.pills, { top: insets.top + 90 }]}>
        <StatPill value={String(kcal)} label="Calories" />
        <StatPill value={formatPace(shownDist, shownElapsed)} label="per km" />
        <StatPill value="—" label="bpm" hint />
      </View>

      {/* floating bottom card */}
      <View
        style={[
          styles.bottom,
          // lift the controls clear of the floating bar when it's showing
          { paddingBottom: insets.bottom + (immersive ? 16 : FLOATING_BAR_CLEARANCE + 12) },
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

        {/* floating primary action */}
        {pending ? (
          <View style={styles.pendingRow}>
            <Pressable style={[styles.actionBtn, styles.retryBtn]} onPress={() => persist(pending)} disabled={saving}>
              <Text style={styles.retryText}>{saving ? 'Saving…' : 'Retry save'}</Text>
            </Pressable>
          </View>
        ) : tracking ? (
          <Pressable style={[styles.actionBtn, styles.stopBtn]} onPress={onStop} disabled={saving}>
            <Ionicons name="stop" size={20} color="#fff" />
            <Text style={styles.stopText}>{saving ? 'Saving…' : 'Stop & Save'}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.actionBtn, styles.startBtn]} onPress={onStart}>
            <Ionicons name="play" size={20} color="#101319" />
            <Text style={styles.startText}>Start {TYPES.find((t) => t.value === type)?.label}</Text>
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

function StatPill({ value, label, hint }: { value: string; label: string; hint?: boolean }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, hint && styles.pillValueHint]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
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
  pillValueHint: { color: '#64748b' },
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
  retryBtn: { backgroundColor: LIME },
  retryText: { color: '#101319', fontFamily: font.extrabold, fontSize: 16 },
});
