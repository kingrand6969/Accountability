import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  totalDistanceMeters,
  formatKm,
  formatDuration,
  formatPace,
} from '../activity/geo';
import {
  LOCATION_TASK_NAME,
  resetTrackPoints,
  readTrackPoints,
} from '../activity/locationTask';
import { saveActivity, type ActivityType } from '../activity/api';
import { createItem } from '../timeline/api';

const TYPES: { value: ActivityType; label: string; emoji: string }[] = [
  { value: 'run', label: 'Run', emoji: '🏃' },
  { value: 'walk', label: 'Walk', emoji: '🚶' },
  { value: 'ride', label: 'Ride', emoji: '🚴' },
];

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
  const [type, setType] = useState<ActivityType>('run');
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopUpdatesIfRunning();
    };
  }, []);

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
    // Background is best-effort: tracking still works in foreground if declined.
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);

    await resetTrackPoints();
    setDistance(0);
    setElapsed(0);
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
        setDistance(totalDistanceMeters(await readTrackPoints()));
      } catch {
        // keep last value
      }
    }, 1000);
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

    if (finalElapsed < 3 && finalDistance < 5) {
      Alert.alert('Too short', 'That activity was too short to save.');
      await resetTrackPoints();
      return;
    }

    setSaving(true);
    try {
      const meta = TYPES.find((t) => t.value === type)!;
      await saveActivity({
        type,
        distance_m: finalDistance,
        duration_s: finalElapsed,
        route: points,
        started_at: startedAtRef.current,
      });
      await createItem({
        type: 'activity',
        title: `${meta.label} · ${formatKm(finalDistance)} km`,
        note: `${formatDuration(finalElapsed)} · ${formatPace(finalDistance, finalElapsed)} /km`,
        starts_at: startedAtRef.current,
      });
      await resetTrackPoints();
      Alert.alert('Activity saved 🏃', `${formatKm(finalDistance)} km in ${formatDuration(finalElapsed)}`);
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.types}>
        {TYPES.map((t) => {
          const selected = type === t.value;
          return (
            <Pressable
              key={t.value}
              style={[styles.typeBtn, selected && styles.typeSelected]}
              onPress={() => !tracking && setType(t.value)}
              disabled={tracking}
            >
              <Text style={[styles.typeText, selected && styles.typeTextSelected]}>
                {t.emoji} {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.stats}>
        <Text style={styles.distance}>{formatKm(distance)}</Text>
        <Text style={styles.distanceUnit}>km</Text>
        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatDuration(elapsed)}</Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{formatPace(distance, elapsed)}</Text>
            <Text style={styles.statLabel}>Pace /km</Text>
          </View>
        </View>
      </View>

      {tracking ? (
        <Pressable style={[styles.button, styles.stop]} onPress={onStop} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Stop & Save</Text>}
        </Pressable>
      ) : (
        <Pressable style={[styles.button, styles.start]} onPress={onStart}>
          <Text style={styles.buttonText}>Start</Text>
        </Pressable>
      )}

      <Text style={styles.hint}>
        Tracking keeps running with the screen off (a notification shows while
        active). Needs a real device + location permission.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  types: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  typeBtn: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  typeSelected: { backgroundColor: '#2563eb' },
  typeText: { color: '#2563eb', fontWeight: '700' },
  typeTextSelected: { color: '#fff' },
  stats: { alignItems: 'center', paddingVertical: 30 },
  distance: { fontSize: 72, fontWeight: '900', color: '#16a34a' },
  distanceUnit: { fontSize: 18, color: '#666', marginTop: -8 },
  row: { flexDirection: 'row', gap: 48, marginTop: 24 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 26, fontWeight: '800' },
  statLabel: { color: '#888', marginTop: 2 },
  button: { borderRadius: 16, padding: 20, alignItems: 'center' },
  start: { backgroundColor: '#16a34a' },
  stop: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  hint: { color: '#888', fontSize: 13, textAlign: 'center', marginTop: 4 },
});
