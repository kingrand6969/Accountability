import { describe, expect, jest, test } from '@jest/globals';

import {
  emptyWorkoutPhotoHistory,
  loadWorkoutPhotoHistory,
  recordWorkoutPhoto,
  workoutPhotoHistoryKey,
  type WorkoutPhotoHistoryStorage,
} from './workoutPhotoHistory';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

function memoryStorage(initial: string | null = null): WorkoutPhotoHistoryStorage & { value: string | null } {
  return {
    value: initial,
    async getItem() { return this.value; },
    async setItem(_key, value) { this.value = value; },
  };
}

describe('workoutPhotoHistory', () => {
  test('uses one versioned, account-independent storage key', () => {
    expect(workoutPhotoHistoryKey).toBe('accountability.workout-photo-history.v1');
  });

  test.each([null, '', '{broken', '[]', '{"push":[3]}', '{"push":["bad id"]}'])('recovers safely from malformed storage: %p', async (raw) => {
    await expect(loadWorkoutPhotoHistory(memoryStorage(raw))).resolves.toEqual(emptyWorkoutPhotoHistory());
  });

  test('keeps only the latest four opaque IDs in the selected category', async () => {
    const storage = memoryStorage();
    for (let index = 1; index <= 6; index += 1) {
      await recordWorkoutPhoto('push', `push-${String(index).padStart(2, '0')}`, storage);
    }
    expect(await loadWorkoutPhotoHistory(storage)).toEqual({
      push: ['push-03', 'push-04', 'push-05', 'push-06'],
      pull: [],
      legs: [],
      general: [],
    });
  });

  test('moves an already-recorded ID to most recent without duplicating it', async () => {
    const storage = memoryStorage(JSON.stringify({ push: ['push-01', 'push-02'], pull: [], legs: [], general: [] }));
    await recordWorkoutPhoto('push', 'push-01', storage);
    expect((await loadWorkoutPhotoHistory(storage)).push).toEqual(['push-02', 'push-01']);
  });

  test('treats unavailable storage as empty and does not reject recording', async () => {
    const storage: WorkoutPhotoHistoryStorage = {
      getItem: async () => { throw new Error('unavailable'); },
      setItem: async () => { throw new Error('unavailable'); },
    };
    await expect(loadWorkoutPhotoHistory(storage)).resolves.toEqual(emptyWorkoutPhotoHistory());
    await expect(recordWorkoutPhoto('legs', 'legs-01', storage)).resolves.toEqual(emptyWorkoutPhotoHistory());
  });
});
