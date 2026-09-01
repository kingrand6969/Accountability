import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, test } from '@jest/globals';

import {
  WORKOUT_PHOTO_CATEGORIES,
  WORKOUT_PHOTO_POOLS,
  classifyWorkoutTitle,
  selectWorkoutPhoto,
  type WorkoutPhotoCategory,
} from './workoutPhotoLibrary';

const classificationCases: [string, WorkoutPhotoCategory][] = [
  ['Incline Bench Press', 'push'],
  ['Chest and triceps', 'push'],
  ['Shoulder dip session', 'push'],
  ['Pull Day', 'pull'],
  ['Barbell row and curls', 'pull'],
  ['Deadlift back builder', 'pull'],
  ['Squat Day', 'legs'],
  ['Hamstring and calf work', 'legs'],
  ['Walking lunges', 'legs'],
  ['Morning conditioning', 'general'],
];

describe('workoutPhotoLibrary', () => {
  test('contains exactly 16 uniquely identified and attributed local photographs per category', () => {
    const all = WORKOUT_PHOTO_CATEGORIES.flatMap((category) => WORKOUT_PHOTO_POOLS[category]);

    expect(WORKOUT_PHOTO_CATEGORIES).toEqual(['push', 'pull', 'legs', 'general']);
    for (const category of WORKOUT_PHOTO_CATEGORIES) {
      const pool = WORKOUT_PHOTO_POOLS[category];
      expect(pool).toHaveLength(16);
      expect(pool.every((photo) => photo.category === category)).toBe(true);
    }
    expect(all).toHaveLength(64);
    expect(new Set(all.map((photo) => photo.id)).size).toBe(64);
    expect(new Set(all.map((photo) => photo.source)).size).toBe(64);
    expect(all.every((photo) => photo.alt.trim().length >= 24)).toBe(true);
    expect(all.every((photo) => photo.licenseSource === 'OpenAI generated for Mantle')).toBe(true);
    expect(all.every((photo) => photo.licenseAuthor === 'OpenAI')).toBe(true);
  });

  test('ships 64 decodable, compact, non-empty square WebP assets', async () => {
    for (const category of WORKOUT_PHOTO_CATEGORIES) {
      for (let index = 1; index <= 16; index += 1) {
        const filename = `${category}-${String(index).padStart(2, '0')}.webp`;
        const assetPath = path.join(process.cwd(), 'assets', 'journey', 'workouts', category, filename);
        expect(fs.existsSync(assetPath)).toBe(true);
        const bytes = fs.readFileSync(assetPath);
        expect(bytes.byteLength).toBeGreaterThan(8_000);
        expect(bytes.byteLength).toBeLessThan(180_000);
        const metadata = await sharp(bytes).metadata();
        expect(metadata.format).toBe('webp');
        expect(metadata.width).toBeGreaterThanOrEqual(360);
        expect(metadata.height).toBe(metadata.width);
        const stats = await sharp(bytes).stats();
        expect(stats.isOpaque).toBe(true);
        expect(stats.channels.some((channel) => channel.stdev > 18)).toBe(true);
      }
    }
  });

  test.each(classificationCases)('classifies %s as %s', (title, expected) => {
    expect(classifyWorkoutTitle(title)).toBe(expected);
  });

  test('uses exact semantic tokens instead of matching fragments', () => {
    expect(classifyWorkoutTitle('Backpacking adventure')).toBe('general');
    expect(classifyWorkoutTitle('Legends conditioning')).toBe('general');
  });

  test('excludes the four most recent IDs and clamps hostile random values', () => {
    const pool = WORKOUT_PHOTO_POOLS.push;
    const recent = pool.slice(0, 4).map((photo) => photo.id);
    expect(selectWorkoutPhoto(pool, recent, () => 0)).toBe(pool[4]);
    expect(selectWorkoutPhoto(pool, recent, () => Number.POSITIVE_INFINITY)).toBe(pool[15]);
    expect(selectWorkoutPhoto(pool, recent, () => -1)).toBe(pool[4]);
  });

  test('never returns an explicitly excluded photo and does not mutate the pool', () => {
    const pool = WORKOUT_PHOTO_POOLS.pull;
    const before = [...pool];
    const selected = selectWorkoutPhoto(pool, [], () => 0, [pool[0].id, pool[1].id]);
    expect(selected).toBe(pool[2]);
    expect(pool).toEqual(before);
  });
});
