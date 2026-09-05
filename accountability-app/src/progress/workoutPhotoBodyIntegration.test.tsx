import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, jest, test } from '@jest/globals';
import BodyScreen from '../app/body';

import type { LibraryExercise } from '../gym/library';
import { WorkoutPhotoHero } from './WorkoutPhotoHero';
import { WORKOUT_PHOTO_POOLS } from './workoutPhotoLibrary';
import type { WorkoutPhotoHistoryStorage } from './workoutPhotoHistory';

const mockPush = jest.fn();
const mockListExercises = jest.fn<() => Promise<LibraryExercise[]>>();
const mockListItemsForDay = jest.fn<() => Promise<{ type: string; title: string; starts_at: string }[]>>();

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
    useFocusEffect: (callback: () => void | (() => void)) => ReactModule.useEffect(callback, [callback]),
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('../ui/AppThemeProvider', () => {
  const { themeColors } = jest.requireActual<typeof import('../ui/theme')>('../ui/theme');
  return { useAppTheme: () => ({ mode: 'light', colors: themeColors('light'), setMode: jest.fn() }) };
});
jest.mock('../insights/api', () => ({ getInsights: jest.fn(async () => ({ workouts: 1 })) }));
jest.mock('../timeline/api', () => ({ listItemsForDay: () => mockListItemsForDay() }));
jest.mock('../gym/library', () => ({ listExercises: () => mockListExercises() }));
jest.mock('../journey/data', () => ({
  listRecentJourneyItems: jest.fn(async () => []),
  pillarCompletion: jest.fn(() => ({ total: 0, complete: 0, score: 0 })),
}));
jest.mock('../journey/EditorialBackdrop', () => ({ EditorialBackdrop: () => null }));
jest.mock('../navigation/routeAccessContract', () => ({ navigateBackSafely: jest.fn() }));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) },
}));

const storage: WorkoutPhotoHistoryStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
};

function exercise(images: string[]): LibraryExercise {
  return {
    id: 'exercise-1',
    name: 'Cable row',
    category: 'strength',
    equipment: 'cable',
    level: 'beginner',
    primary_muscles: ['back'],
    images,
    instructions: [],
  };
}

async function renderHero(images: string[] = []) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <WorkoutPhotoHero
        exercise={exercise(images)}
        workoutTitle="Pull Day"
        random={() => 0}
        historyStorage={storage}
      />,
    );
  });
  return renderer;
}

describe('WorkoutPhotoHero Body integration', () => {
  test('uses only a Pull photograph when Pull Day has no exercise database image', async () => {
    const renderer = await renderHero();
    const image = renderer.root.findByType(Image);
    expect(WORKOUT_PHOTO_POOLS.pull.map((photo) => photo.source)).toContain(image.props.source);
    expect(image.props.accessibilityLabel).toMatch(/pull|row|back|curl|deadlift/i);
    expect(image.props.resizeMode).toBe('cover');
  });

  test('always prefers exercise.images[0] over a curated fallback', async () => {
    const renderer = await renderHero(['https://exercise.example/row.jpg', 'https://exercise.example/ignored.jpg']);
    expect(renderer.root.findByType(Image).props.source).toEqual({ uri: 'https://exercise.example/row.jpg' });
  });

  test('keeps the selection stable across rerenders and replaces a failed curated image in-category', async () => {
    const renderer = await renderHero();
    const first = renderer.root.findByType(Image).props.source;
    act(() => renderer.update(
      <WorkoutPhotoHero exercise={exercise([])} workoutTitle="Pull Day" random={() => 0.99} historyStorage={storage} />,
    ));
    expect(renderer.root.findByType(Image).props.source).toBe(first);

    await act(async () => renderer.root.findByType(Image).props.onError());
    const replacement = renderer.root.findByType(Image).props.source;
    expect(replacement).not.toBe(first);
    expect(WORKOUT_PHOTO_POOLS.pull.map((photo) => photo.source)).toContain(replacement);
  });

  test('uses an accessible fixed-layout fallback if the exercise database image fails', async () => {
    const renderer = await renderHero(['https://exercise.example/missing.jpg']);
    await act(async () => renderer.root.findByType(Image).props.onError());
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
    expect(renderer.root.findByProps({ testID: 'workout-photo-fallback' }).props.accessibilityLabel).toMatch(/unavailable/i);
  });
});

describe('Body workout photography', () => {
  test('renders a Pull pool image for a Pull Day workout without a database image', async () => {
    mockListItemsForDay.mockResolvedValueOnce([{ type: 'workout', title: 'Pull Day', starts_at: '2026-08-22T08:00:00.000Z' }]);
    mockListExercises.mockResolvedValueOnce([exercise([])]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<BodyScreen />); });
    const heroImage = renderer.root.findByType(Image);
    expect(WORKOUT_PHOTO_POOLS.pull.map((photo) => photo.source)).toContain(heroImage.props.source);
    act(() => renderer.unmount());
  });

  test('renders the existing exercise database image first inside Body', async () => {
    mockListItemsForDay.mockResolvedValueOnce([{ type: 'workout', title: 'Pull Day', starts_at: '2026-08-22T08:00:00.000Z' }]);
    mockListExercises.mockResolvedValueOnce([exercise(['https://exercise.example/row.jpg'])]);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<BodyScreen />); });
    expect(renderer.root.findByType(Image).props.source).toEqual({ uri: 'https://exercise.example/row.jpg' });
    act(() => renderer.unmount());
  });
});

test('Body replaces its inline hero image block with WorkoutPhotoHero without changing the route', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/app/body.tsx'), 'utf8');
  expect(source).toContain('<WorkoutPhotoHero exercise={exercise} workoutTitle={workoutTitle} />');
  expect(source).not.toMatch(/<Image source=\{\{ uri: exercise\.images\[0\] \}\}/);
  expect(source).toContain("router.push('/gym-plan' as never)");
});
