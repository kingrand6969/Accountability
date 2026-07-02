import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Pt } from './geo';

export const LOCATION_TASK_NAME = 'accountability-location-task';
const POINTS_KEY = 'activity:points';
const SESSION_KEY = 'activity:session';

type PointsBlob = { session: string; points: Pt[] };

// The task runs in a separate context (incl. background), so it shares state
// with the UI via AsyncStorage rather than React refs. Every recording gets a
// session id: a batch written by a stale task invocation (from a previous
// recording) is detected and discarded instead of resurrecting old points.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) return;
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;
    try {
      const session = await AsyncStorage.getItem(SESSION_KEY);
      if (!session) return; // not recording
      const raw = await AsyncStorage.getItem(POINTS_KEY);
      let blob: PointsBlob | null = raw ? JSON.parse(raw) : null;
      if (!blob || blob.session !== session) blob = { session, points: [] };
      for (const loc of locations) {
        blob.points.push({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }
      await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(blob));
    } catch {
      // best effort — a dropped sample is fine
    }
  });
}

/** Start a fresh recording session; previous points can no longer leak in. */
export async function resetTrackPoints(): Promise<void> {
  const session = `${Date.now()}`;
  await AsyncStorage.setItem(SESSION_KEY, session);
  await AsyncStorage.setItem(
    POINTS_KEY,
    JSON.stringify({ session, points: [] } satisfies PointsBlob),
  );
}

export async function readTrackPoints(): Promise<Pt[]> {
  const [session, raw] = await Promise.all([
    AsyncStorage.getItem(SESSION_KEY),
    AsyncStorage.getItem(POINTS_KEY),
  ]);
  if (!session || !raw) return [];
  try {
    const blob = JSON.parse(raw) as PointsBlob | Pt[];
    // tolerate the pre-session array format from older app versions
    if (Array.isArray(blob)) return blob;
    return blob.session === session ? blob.points : [];
  } catch {
    return [];
  }
}
