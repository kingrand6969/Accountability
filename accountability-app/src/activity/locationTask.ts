import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Pt } from './geo';

export const LOCATION_TASK_NAME = 'accountability-location-task';
const POINTS_KEY = 'activity:points';

// The task runs in a separate context (incl. background), so it shares state
// with the UI via AsyncStorage rather than React refs.
if (Platform.OS !== 'web') {
  TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
    if (error) return;
    const locations = data?.locations ?? [];
    if (locations.length === 0) return;
    try {
      const raw = await AsyncStorage.getItem(POINTS_KEY);
      const points: Pt[] = raw ? JSON.parse(raw) : [];
      for (const loc of locations) {
        points.push({ lat: loc.coords.latitude, lon: loc.coords.longitude });
      }
      await AsyncStorage.setItem(POINTS_KEY, JSON.stringify(points));
    } catch {
      // best effort — a dropped sample is fine
    }
  });
}

export async function resetTrackPoints(): Promise<void> {
  await AsyncStorage.setItem(POINTS_KEY, JSON.stringify([]));
}

export async function readTrackPoints(): Promise<Pt[]> {
  const raw = await AsyncStorage.getItem(POINTS_KEY);
  return raw ? (JSON.parse(raw) as Pt[]) : [];
}
