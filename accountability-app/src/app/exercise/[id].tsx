import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  getExercise,
  listFavoriteIds,
  setFavorite,
  prettyEquipment,
  type LibraryExercise,
} from '../../gym/library';
import { createItem } from '../../timeline/api';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ex, setEx] = useState<LibraryExercise | null>(null);
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!id) return;
        const [exercise, favIds] = await Promise.all([getExercise(id), listFavoriteIds()]);
        if (!active) return;
        setEx(exercise);
        setFav(favIds.includes(id));
      } catch (e) {
        Alert.alert('Could not load', String((e as Error).message ?? e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function toggleFav() {
    if (!id) return;
    const next = !fav;
    setFav(next);
    try {
      await setFavorite(id, next);
    } catch (e) {
      setFav(!next);
      Alert.alert('Could not update favorite', String((e as Error).message ?? e));
    }
  }

  async function onLog() {
    if (!ex) return;
    try {
      await createItem({
        type: 'workout',
        title: ex.name,
        note: null,
        starts_at: new Date().toISOString(),
      });
      Alert.alert('Logged 💪', `${ex.name} is on your timeline.`);
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!ex) {
    return (
      <View style={styles.center}>
        <Text>Exercise not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.name}>{ex.name}</Text>
        <Pressable onPress={toggleFav} hitSlop={8}>
          <Text style={[styles.star, fav && styles.starOn]}>{fav ? '★' : '☆'}</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>
        {ex.primary_muscles.join(', ') || 'full body'} · {prettyEquipment(ex.equipment)}
        {ex.level ? ` · ${ex.level}` : ''}
      </Text>

      <View style={styles.images}>
        {ex.images.map((u, i) => (
          <View key={i} style={styles.imageWrap}>
            <Image source={{ uri: u }} style={styles.image} resizeMode="cover" />
            <Text style={styles.imageLabel}>{i === 0 ? 'Start' : 'Finish'}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>How to do it</Text>
      {ex.instructions.map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <Pressable style={styles.log} onPress={onLog}>
        <Text style={styles.logText}>Log this exercise 💪</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, gap: 10, paddingBottom: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 22, fontWeight: '800', flex: 1 },
  star: { fontSize: 28, color: '#bbb' },
  starOn: { color: '#f0b000' },
  meta: { color: '#666', textTransform: 'capitalize' },
  images: { flexDirection: 'row', gap: 10, marginTop: 6 },
  imageWrap: { flex: 1, gap: 4 },
  image: { width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f3' },
  imageLabel: { textAlign: 'center', color: '#888', fontSize: 12, fontWeight: '600' },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 14 },
  step: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563eb',
    color: '#fff',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 22,
    overflow: 'hidden',
  },
  stepText: { flex: 1, lineHeight: 21 },
  log: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  logText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
