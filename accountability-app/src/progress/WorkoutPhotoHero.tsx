import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { LibraryExercise } from '../gym/library';
import {
  WORKOUT_PHOTO_POOLS,
  classifyWorkoutTitle,
  selectWorkoutPhoto,
  type WorkoutPhoto,
} from './workoutPhotoLibrary';
import {
  loadWorkoutPhotoHistory,
  recordWorkoutPhoto,
  type WorkoutPhotoHistoryStorage,
} from './workoutPhotoHistory';

type Props = Readonly<{
  exercise: LibraryExercise | null;
  workoutTitle: string;
  random?: () => number;
  historyStorage?: WorkoutPhotoHistoryStorage;
}>;

type HeroSelection =
  | Readonly<{ kind: 'database'; uri: string }>
  | Readonly<{ kind: 'curated'; photo: WorkoutPhoto }>
  | null;

export function WorkoutPhotoHero({
  exercise,
  workoutTitle,
  random = Math.random,
  historyStorage,
}: Props) {
  const initialDatabaseUri = exercise?.images?.[0]?.trim() || null;
  const mountConfig = useRef({
    databaseUri: initialDatabaseUri,
    category: classifyWorkoutTitle(workoutTitle),
    random,
    historyStorage,
  });
  const [selection, setSelection] = useState<HeroSelection>(() =>
    initialDatabaseUri ? { kind: 'database', uri: initialDatabaseUri } : null,
  );
  const [failed, setFailed] = useState(false);
  const failedIds = useRef<string[]>([]);

  useEffect(() => {
    if (mountConfig.current.databaseUri) return;
    let alive = true;
    const { category, random: sample, historyStorage: storage } = mountConfig.current;
    void loadWorkoutPhotoHistory(storage).then((history) => {
      if (!alive) return;
      const photo = selectWorkoutPhoto(WORKOUT_PHOTO_POOLS[category], history[category], sample);
      setSelection({ kind: 'curated', photo });
      void recordWorkoutPhoto(category, photo.id, storage);
    });
    return () => { alive = false; };
  }, []);

  const handleError = async () => {
    if (!selection || selection.kind === 'database') {
      setFailed(true);
      return;
    }
    const { category, random: sample, historyStorage: storage } = mountConfig.current;
    failedIds.current = [...failedIds.current, selection.photo.id];
    const history = await recordWorkoutPhoto(category, selection.photo.id, storage);
    const replacement = selectWorkoutPhoto(
      WORKOUT_PHOTO_POOLS[category],
      history[category],
      sample,
      failedIds.current,
    );
    setSelection({ kind: 'curated', photo: replacement });
    void recordWorkoutPhoto(category, replacement.id, storage);
  };

  if (!selection || failed) {
    return (
      <View
        testID="workout-photo-fallback"
        style={styles.frame}
        accessible
        accessibilityRole="image"
        accessibilityLabel={failed ? 'Workout photograph unavailable' : 'Loading workout photograph'}
      >
        <Ionicons name="barbell-outline" size={88} color="rgba(255,255,255,0.16)" />
      </View>
    );
  }

  const source = selection.kind === 'database' ? { uri: selection.uri } : selection.photo.source;
  const label = selection.kind === 'database'
    ? `${exercise?.name || workoutTitle} exercise photograph`
    : selection.photo.alt;

  return (
    <View style={styles.frame} pointerEvents="none">
      <Image
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
        accessible
        accessibilityLabel={label}
        onError={() => { void handleError(); }}
        fadeDuration={120}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: '62%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
