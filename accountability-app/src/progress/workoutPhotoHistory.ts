import AsyncStorage from '@react-native-async-storage/async-storage';

import { WORKOUT_PHOTO_CATEGORIES, type WorkoutPhotoCategory } from './workoutPhotoLibrary';

export const workoutPhotoHistoryKey = 'accountability.workout-photo-history.v1';

export type WorkoutPhotoHistory = Readonly<Record<WorkoutPhotoCategory, readonly string[]>>;
export type WorkoutPhotoHistoryStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export function emptyWorkoutPhotoHistory(): WorkoutPhotoHistory {
  return { push: [], pull: [], legs: [], general: [] };
}

function isOpaqueId(value: unknown, category: WorkoutPhotoCategory): value is string {
  return typeof value === 'string' && new RegExp(`^${category}-[a-zA-Z0-9_-]{1,48}$`).test(value);
}

function parseHistory(raw: string | null): WorkoutPhotoHistory | null {
  if (!raw) return null;
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const record = candidate as Record<string, unknown>;
    if (!WORKOUT_PHOTO_CATEGORIES.every((category) => Array.isArray(record[category]))) return null;
    const parsed = emptyWorkoutPhotoHistory() as Record<WorkoutPhotoCategory, readonly string[]>;
    for (const category of WORKOUT_PHOTO_CATEGORIES) {
      const values = record[category] as unknown[];
      if (!values.every((value) => isOpaqueId(value, category))) return null;
      parsed[category] = [...new Set(values)].slice(-4) as string[];
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadWorkoutPhotoHistory(
  storage: WorkoutPhotoHistoryStorage = AsyncStorage,
): Promise<WorkoutPhotoHistory> {
  try {
    return parseHistory(await storage.getItem(workoutPhotoHistoryKey)) ?? emptyWorkoutPhotoHistory();
  } catch {
    return emptyWorkoutPhotoHistory();
  }
}

export async function recordWorkoutPhoto(
  category: WorkoutPhotoCategory,
  id: string,
  storage: WorkoutPhotoHistoryStorage = AsyncStorage,
): Promise<WorkoutPhotoHistory> {
  const history = await loadWorkoutPhotoHistory(storage);
  if (!isOpaqueId(id, category)) return history;
  const next: WorkoutPhotoHistory = {
    ...history,
    [category]: [...history[category].filter((value) => value !== id), id].slice(-4),
  };
  try {
    await storage.setItem(workoutPhotoHistoryKey, JSON.stringify(next));
    return next;
  } catch {
    return history;
  }
}
