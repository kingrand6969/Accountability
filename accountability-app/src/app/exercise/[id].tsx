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
import { getExercise, prettyEquipment, type LibraryExercise } from '../../gym/library';
import { createItem } from '../../timeline/api';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ex, setEx] = useState<LibraryExercise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (id) setEx(await getExercise(id));
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
      <Text style={styles.name}>{ex.name}</Text>
      <Text style={styles.meta}>
        {ex.primary_muscles.join(', ') || 'full body'} · {prettyEquipment(ex.equipment)}
        {ex.level ? ` · ${ex.level}` : ''}
      </Text>

      <View style={styles.images}>
        {ex.images.map((u, i) => (
          <Image key={i} source={{ uri: u }} style={styles.image} resizeMode="cover" />
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
  name: { fontSize: 22, fontWeight: '800' },
  meta: { color: '#666', textTransform: 'capitalize' },
  images: { flexDirection: 'row', gap: 10, marginTop: 6 },
  image: { flex: 1, height: 160, borderRadius: 12, backgroundColor: '#f0f0f3' },
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
