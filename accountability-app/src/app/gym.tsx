import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { createItem } from '../timeline/api';
import { FOCUSES, GOALS, focusLabel, type Focus, type Goal } from '../gym/exercises';
import { buildSession, sessionSummary, type SessionExercise } from '../gym/session';

export default function Gym() {
  const router = useRouter();
  const [focus, setFocus] = useState<Focus | null>(null);
  const [goal, setGoal] = useState<Goal>('muscle');
  const [session, setSession] = useState<SessionExercise[] | null>(null);
  const [logging, setLogging] = useState(false);

  function pickFocus(f: Focus) {
    setFocus(f);
    setSession(null);
  }
  function pickGoal(g: Goal) {
    setGoal(g);
    setSession(null);
  }
  function onGenerate() {
    if (!focus) {
      Alert.alert('Pick a focus', 'Choose what you want to train today.');
      return;
    }
    setSession(buildSession(focus, goal));
  }

  async function onLog() {
    if (!focus || !session) return;
    setLogging(true);
    try {
      await createItem({
        type: 'workout',
        title: `${focusLabel(focus)} workout`,
        note: sessionSummary(session),
        starts_at: new Date().toISOString(),
      });
      Alert.alert('Logged 💪', 'Your workout is on your timeline.');
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    } finally {
      setLogging(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>What are we training?</Text>
      <View style={styles.chips}>
        {FOCUSES.map((f) => {
          const selected = focus === f.value;
          return (
            <Pressable
              key={f.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => pickFocus(f.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.heading}>Goal</Text>
      <View style={styles.chips}>
        {GOALS.map((g) => {
          const selected = goal === g.value;
          return (
            <Pressable
              key={g.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => pickGoal(g.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {g.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable style={styles.generate} onPress={onGenerate}>
        <Text style={styles.generateText}>Generate session</Text>
      </Pressable>

      {session ? (
        <View style={styles.session}>
          {session.map((ex, i) => (
            <View key={`${ex.name}-${i}`} style={styles.exercise}>
              <Image
                source={{ uri: ex.image }}
                style={styles.exImage}
                resizeMode="cover"
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.exName}>
                  {ex.emoji} {ex.name}
                </Text>
                <Text style={styles.exMeta}>
                  {ex.sets} × {ex.reps} · {ex.restSec}s rest
                </Text>
                <Text style={styles.exCue}>{ex.cue}</Text>
              </View>
            </View>
          ))}

          <Pressable style={styles.log} onPress={onLog} disabled={logging}>
            {logging ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.logText}>Log workout 💪</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 10, paddingBottom: 48 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: '#2563eb' },
  chipText: { color: '#2563eb', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  generate: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  generateText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  session: { gap: 10, marginTop: 16 },
  exercise: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
  },
  exImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  exName: { fontSize: 16, fontWeight: '700' },
  exMeta: { color: '#2563eb', fontWeight: '600', marginTop: 2 },
  exCue: { color: '#666', marginTop: 4, fontSize: 13 },
  log: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
