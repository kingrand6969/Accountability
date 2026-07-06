import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  estimateCalories,
  formatDuration,
  formatKm,
  formatPace,
  totalDistanceMeters,
  type Pt,
} from '../activity/geo';
import { RouteTrace } from '../activity/RouteTrace';
import {
  LOCATION_TASK_NAME,
  readTrackPoints,
  resetTrackPoints,
} from '../activity/locationTask';
import { saveActivity, type ActivityType } from '../activity/api';
import { font } from '../ui/theme';

const TYPES: { value: ActivityType; label: string; icon: 'walk-outline' | 'footsteps-outline' | 'bicycle-outline' }[] = [
  { value: 'run', label: 'Run', icon: 'walk-outline' },
  { value: 'walk', label: 'Walk', icon: 'footsteps-outline' },
  { value: 'ride', label: 'Ride', icon: 'bicycle-outline' },
];

// a small loop so the web preview shows the trace design (clearly labelled)
const SAMPLE_ROUTE: Pt[] = [
  { lat: 14.5, lon: 121.0 },
  { lat: 14.5008, lon: 121.0005 },
  { lat: 14.5012, lon: 121.0016 },
  { lat: 14.5009, lon: 121.0027 },
  { lat: 14.5, lon: 121.003 },
  { lat: 14.4992, lon: 121.0024 },
  { lat: 14.4989, lon: 121.0012 },
  { lat: 14.4994, lon: 121.0003 },
  { lat: 14.5, lon: 121.0 },
];

type PendingSave = {
  type: ActivityType;
  distance: number;
  elapsed: number;
  points: Pt[];
  startedAt: string;
};

async function stopUpdatesIfRunning() {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    // not running — nothing to stop
  }
}

export default function ActivityTrack() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [type, setType] = useState<ActivityType>('run');
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [livePoints, setLivePoints] = useState<Pt[]>([]);
  const [pending, setPending] = useState<PendingSave | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopUpdatesIfRunning();
    };
  }, []);

  // recording pulse
  useEffect(() => {
    if (!tracking) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [tracking, pulse]);

  async function onStart() {
    if (Platform.OS === 'web') {
      Alert.alert('Use the mobile app', 'GPS tracking runs on your phone.');
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
      Alert.alert('Activity saved 🏃', `${formatKm(p.distance)} km in ${formatDuration(p.elapsed)}`);
      router.navigate('/today' as never);
    } catch (e) {
      setPending(p);
      Alert.alert(
        'Could not save',
        `${String((e as Error).message ?? e)}\n\nYour recording is safe — tap "Retry save" when you're back online.`,
      );
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

  function onDiscardPending() {
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

  // map panel dimensions
  const mapW = Math.min(width, 600) - 40;
  const mapH = Math.round(mapW * 0.62);
  const isSample = shownPoints.length === 0 && !tracking;
  const tracePoints = isSample ? SAMPLE_ROUTE : shownPoints;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* activity type */}
        <View style={styles.types}>
          {TYPES.map((t) => {
            const selected = type === t.value;
            return (
              <Pressable
                key={t.value}
                style={({ pressed }) => [
                  styles.typeBtn,
                  selected && styles.typeSelected,
                  pressed && !tracking && styles.pressed,
                ]}
                onPress={() => !tracking && !pending && setType(t.value)}
                disabled={tracking || !!pending}
              >
                <Ionicons name={t.icon} size={16} color={selected ? '#0b1220' : '#93c5fd'} />
                <Text style={[styles.typeText, selected && styles.typeTextSelected]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* map panel with the route trace */}
        <View style={[styles.mapPanel, { width: mapW, height: mapH }]}>
          <RouteTrace
            points={tracePoints}
            width={mapW}
            height={mapH}
            stroke={4}
            showHead={tracking}
            faint={isSample}
          />
          {tracking ? (
            <View style={styles.recPill}>
              <Animated.View
                style={[
                  styles.recDot,
                  {
                    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }),
                    transform: [
                      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) },
                    ],
                  },
                ]}
              />
              <Text style={styles.recText}>REC</Text>
            </View>
          ) : (
            <View style={styles.mapCaption}>
              <Ionicons name="location" size={12} color="#93c5fd" />
              <Text style={styles.mapCaptionText}>
                {isSample ? 'Sample route — your real path records on mobile' : 'Route'}
              </Text>
            </View>
          )}
        </View>

        {/* big distance */}
        <View style={styles.distanceBlock}>
          <Text style={styles.distance}>{formatKm(shownDist)}</Text>
          <Text style={styles.distanceUnit}>KILOMETRES</Text>
        </View>

        {/* stat row */}
        <View style={styles.statRow}>
          <Stat icon="time-outline" value={formatDuration(shownElapsed)} label="Time" />
          <Stat icon="speedometer-outline" value={formatPace(shownDist, shownElapsed)} label="Pace /km" />
          <Stat icon="flame-outline" value={String(kcal)} label="Cal · est" />
        </View>

        {/* controls */}
        {pending ? (
          <View style={styles.pendingBox}>
            <Text style={styles.pendingText}>Recording saved on your phone — not uploaded yet.</Text>
            <Pressable style={styles.retryBtn} onPress={() => persist(pending)} disabled={saving}>
              <Text style={styles.retryText}>{saving ? 'Saving…' : 'Retry save'}</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={onDiscardPending} disabled={saving}>
              <Text style={styles.ghostText}>Discard recording</Text>
            </Pressable>
          </View>
        ) : tracking ? (
          <Pressable style={[styles.bigBtn, styles.stopBtn]} onPress={onStop} disabled={saving}>
            <Ionicons name="stop" size={20} color="#fff" />
            <Text style={styles.bigBtnText}>{saving ? 'Saving…' : 'Stop & Save'}</Text>
          </Pressable>
        ) : (
          <Pressable style={[styles.bigBtn, styles.startBtn]} onPress={onStart}>
            <Ionicons name="play" size={20} color="#0b1220" />
            <Text style={[styles.bigBtnText, { color: '#0b1220' }]}>Start {TYPES.find((t) => t.value === type)?.label}</Text>
          </Pressable>
        )}

        <Text style={styles.hint}>
          Tracking keeps running with the screen off (a notification shows while active). Needs a
          real device + location permission.
        </Text>
      </ScrollView>
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: 'time-outline' | 'speedometer-outline' | 'flame-outline';
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={15} color="#60a5fa" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1220' },
  content: {
    padding: 20,
    gap: 22,
    alignItems: 'center',
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    paddingBottom: 40,
  },
  types: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.4)',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  typeSelected: { backgroundColor: '#60a5fa', borderColor: '#60a5fa' },
  typeText: { color: '#93c5fd', fontFamily: font.bold, fontSize: 14 },
  typeTextSelected: { color: '#0b1220' },
  pressed: { opacity: 0.7 },
  mapPanel: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#111a2e',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.18)',
  },
  recPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  recText: { color: '#fff', fontFamily: font.extrabold, fontSize: 11, letterSpacing: 1 },
  mapCaption: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  mapCaptionText: { color: '#cbd5e1', fontFamily: font.medium, fontSize: 11 },
  distanceBlock: { alignItems: 'center' },
  distance: {
    fontSize: 82,
    lineHeight: 88,
    fontFamily: font.display,
    color: '#fff',
    includeFontPadding: false,
  },
  distanceUnit: {
    fontSize: 12,
    color: '#60a5fa',
    fontFamily: font.bold,
    letterSpacing: 3,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#111a2e',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
    borderRadius: 18,
    paddingVertical: 16,
  },
  statValue: { fontSize: 20, fontFamily: font.extrabold, color: '#fff', marginTop: 2 },
  statLabel: { color: '#94a3b8', fontFamily: font.medium, fontSize: 11 },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    borderRadius: 999,
    paddingVertical: 18,
  },
  startBtn: { backgroundColor: '#a3e635' },
  stopBtn: { backgroundColor: '#ef4444' },
  bigBtnText: { color: '#fff', fontFamily: font.extrabold, fontSize: 17 },
  pendingBox: {
    alignSelf: 'stretch',
    gap: 10,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 18,
    padding: 18,
  },
  pendingText: { color: '#fca5a5', fontFamily: font.semibold, fontSize: 13.5, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#60a5fa',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  retryText: { color: '#0b1220', fontFamily: font.bold, fontSize: 15 },
  ghostBtn: { alignItems: 'center', paddingVertical: 10 },
  ghostText: { color: '#94a3b8', fontFamily: font.semibold, fontSize: 14 },
  hint: { color: '#64748b', fontFamily: font.regular, fontSize: 12.5, textAlign: 'center' },
});
