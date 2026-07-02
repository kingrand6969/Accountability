import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  totalDistanceMeters,
  formatKm,
  formatDuration,
  formatPace,
  type Pt,
} from '../activity/geo';
import {
  LOCATION_TASK_NAME,
  resetTrackPoints,
  readTrackPoints,
} from '../activity/locationTask';
import { saveActivity, type ActivityType } from '../activity/api';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

const TYPES: { value: ActivityType; label: string; icon: 'walk-outline' | 'footsteps-outline' | 'bicycle-outline' }[] = [
  { value: 'run', label: 'Run', icon: 'walk-outline' },
  { value: 'walk', label: 'Walk', icon: 'footsteps-outline' },
  { value: 'ride', label: 'Ride', icon: 'bicycle-outline' },
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
  const [type, setType] = useState<ActivityType>('run');
  const [tracking, setTracking] = useState(false);
  const [distance, setDistance] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  // A recorded-but-unsaved activity (save failed, e.g. offline after a run).
  // The route stays in memory until it's saved or explicitly discarded.
  const [pending, setPending] = useState<PendingSave | null>(null);

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
          notificationColor: colors.primary,
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
      // Timeline card is created by a DB trigger (migration 0022) — atomic.
      setPending(null);
      await resetTrackPoints();
      Alert.alert(
        'Activity saved 🏃',
        `${formatKm(p.distance)} km in ${formatDuration(p.elapsed)}`,
      );
      router.navigate('/today' as never);
    } catch (e) {
      // KEEP the recording — the user can retry (e.g. once back online).
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

    if (finalElapsed < 3 && finalDistance < 5) {
      Alert.alert('Too short', 'That activity was too short to save.');
      await resetTrackPoints();
      return;
    }

    await persist({
      type,
      distance: finalDistance,
      elapsed: finalElapsed,
      points,
      startedAt: startedAtRef.current,
    });
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
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
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
              onPress={() => !tracking && setType(t.value)}
              disabled={tracking || !!pending}
            >
              <Ionicons
                name={t.icon}
                size={16}
                color={selected ? '#fff' : colors.primary}
              />
              <Text style={[styles.typeText, selected && styles.typeTextSelected]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.stats}>
        <Text style={styles.distance}>{formatKm(pending ? pending.distance : distance)}</Text>
        <Text style={styles.distanceUnit}>km</Text>
        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {formatDuration(pending ? pending.elapsed : elapsed)}
            </Text>
            <Text style={styles.statLabel}>Time</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {pending ? formatPace(pending.distance, pending.elapsed) : formatPace(distance, elapsed)}
            </Text>
            <Text style={styles.statLabel}>Pace /km</Text>
          </View>
        </View>
      </View>

      {pending ? (
        <View style={styles.pendingBox}>
          <Text style={styles.pendingText}>
            Recording saved on your phone — not uploaded yet.
          </Text>
          <Button title="Retry save" onPress={() => persist(pending)} loading={saving} />
          <Button title="Discard recording" variant="ghost" onPress={onDiscardPending} disabled={saving} />
        </View>
      ) : tracking ? (
        <Button title="Stop & Save" variant="danger" onPress={onStop} loading={saving} style={styles.bigBtn} />
      ) : (
        <Button title="Start" variant="success" onPress={onStart} style={styles.bigBtn} />
      )}

      <Text style={styles.hint}>
        Tracking keeps running with the screen off (a notification shows while
        active). Needs a real device + location permission.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.xxl, gap: spacing.lg, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  types: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' },
  typeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  typeSelected: { backgroundColor: colors.primary },
  typeText: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
  typeTextSelected: { color: '#fff' },
  stats: { alignItems: 'center', paddingVertical: 30 },
  distance: {
    fontSize: 76,
    fontFamily: font.display,
    color: colors.text,
    includeFontPadding: false,
  },
  distanceUnit: { fontSize: 18, color: colors.textMuted, fontFamily: font.medium, marginTop: -4 },
  row: { flexDirection: 'row', gap: 48, marginTop: spacing.xxl },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 26, fontFamily: font.extrabold, color: colors.text },
  statLabel: { color: colors.textFaint, fontFamily: font.medium, marginTop: 2 },
  bigBtn: { paddingVertical: 18 },
  pendingBox: {
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  pendingText: {
    color: colors.danger,
    fontFamily: font.semibold,
    fontSize: 13.5,
    textAlign: 'center',
  },
  hint: { color: colors.textFaint, fontFamily: font.regular, fontSize: 13, textAlign: 'center', marginTop: 4 },
});
