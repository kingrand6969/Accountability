import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  haversineMeters,
  formatKm,
  formatDuration,
  formatPace,
  type Pt,
} from '../activity/geo';
import { saveActivity, type ActivityType } from '../activity/api';
import { createItem } from '../timeline/api';

const TYPES: { value: ActivityType; label: string; emoji: string }[] = [
  { value: 'run', label: 'Run', emoji: '🏃' },
  { value: 'walk', label: 'Walk', emoji: '🚶' },
  { value: 'ride', label: 'Ride', emoji: '🚴' },
];

export default function ActivityTrack() {
  const router = useRouter();
  const [type, setType] = useState<ActivityType>('run');
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pointsRef = useRef<Pt[]>([]);
  const startedAtRef = useRef<string>('');
  const startMsRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      subRef.current?.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function onStart() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Location needed', 'Allow location access to track your activity.');
      return;
    }
    pointsRef.current = [];
    setDistance(0);
    setElapsed(0);
    startedAtRef.current = new Date().toISOString();
    startMsRef.current = Date.now();
    setTracking(true);

    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 2000 },
      (loc) => {
        const p: Pt = { lat: loc.coords.latitude, lon: loc.coords.longitude };
        const prev = pointsRef.current[pointsRef.current.length - 1];
        pointsRef.current.push(p);
        if (prev) setDistance((d) => d + haversineMeters(prev, p));
      },
    );
    timerRef.current = setInterval(
      () => setElapsed(Math.round((Date.now() - startMsRef.current) / 1000)),
      1000,
    );
  }

  async function onStop() {
    subRef.current?.remove();
    subRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setTracking(false);

    // Trust the wall clock, not the tick counter (which drifts when suspended).
    const finalElapsed = Math.round((Date.now() - startMsRef.current) / 1000);
    setElapsed(finalElapsed);

    if (finalElapsed < 3 && distance < 5) {
      Alert.alert('Too short', 'That activity was too short to save.');
      return;
    }

    setSaving(true);
    try {
      const meta = TYPES.find((t) => t.value === type)!;
      await saveActivity({
        type,
        distance_m: distance,
        duration_s: finalElapsed,
        route: pointsRef.current,
        started_at: startedAtRef.current,
      });
      await createItem({
        type: 'activity',
        title: `${meta.label} · ${formatKm(distance)} km`,
        note: `${formatDuration(finalElapsed)} · ${formatPace(distance, finalElapsed)} /km`,
        starts_at: startedAtRef.current,
      });
      Alert.alert('Activity saved 🏃', `${formatKm(distance)} km in ${formatDuration(finalElapsed)}`);
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
        Keep the app open while tracking. GPS needs a real device and location
        permission — distance updates as you move.
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
