import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMyProfile } from '../profiles/api';
import { setCalorieTarget } from '../diet/api';

export const ONBOARDED_KEY = 'onboarded';

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [target, setTarget] = useState('2000');
  const [saving, setSaving] = useState(false);

  async function finish() {
    setSaving(true);
    try {
      await updateMyProfile({
        display_name: name.trim() || null,
        area: area.trim() || null,
      });
      const kcal = parseInt(target, 10);
      if (Number.isFinite(kcal) && kcal > 0) await setCalorieTarget(kcal);
      await AsyncStorage.setItem(ONBOARDED_KEY, '1');
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    router.replace('/');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.emoji}>💪</Text>
      <Text style={styles.title}>Welcome to Accountability</Text>
      <Text style={styles.subtitle}>
        Plan your day, track workouts, food, money and runs — and keep your
        streak alive. Let&apos;s set you up.
      </Text>

      <Text style={styles.label}>What should we call you?</Text>
      <TextInput
        style={styles.input}
        placeholder="Your name"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Your area</Text>
      <TextInput
        style={styles.input}
        placeholder="City or region (for finding workout buddies)"
        value={area}
        onChangeText={setArea}
      />

      <Text style={styles.label}>Daily calorie target</Text>
      <TextInput
        style={styles.input}
        placeholder="2000"
        keyboardType="number-pad"
        value={target}
        onChangeText={setTarget}
      />

      <Pressable style={styles.cta} onPress={finish} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaText}>Get started</Text>
        )}
      </Pressable>
      <Pressable onPress={skip} disabled={saving}>
        <Text style={styles.skip}>Skip for now</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 28, gap: 10, flexGrow: 1, justifyContent: 'center' },
  emoji: { fontSize: 52, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#666', textAlign: 'center', lineHeight: 21, marginBottom: 10 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 13,
    fontSize: 16,
  },
  cta: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skip: { color: '#888', textAlign: 'center', marginTop: 12 },
});
