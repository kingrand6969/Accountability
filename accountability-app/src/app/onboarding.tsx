import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { updateMyProfile } from '../profiles/api';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

/** Per-user flag — a second account on the same device gets its own onboarding. */
export function onboardedKey(userId: string): string {
  return `onboarded:${userId}`;
}

export default function Onboarding() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [saving, setSaving] = useState(false);

  async function markDone() {
    if (userId) {
      try {
        await AsyncStorage.setItem(onboardedKey(userId), '1');
      } catch {
        // storage failure shouldn't trap the user on this screen
      }
    }
  }

  async function finish() {
    setSaving(true);
    try {
      // Only send what the user actually typed — never blank out an existing
      // profile (e.g. same user onboarding on a second device).
      const updates: { display_name?: string; area?: string } = {};
      if (name.trim()) updates.display_name = name.trim();
      if (area.trim()) updates.area = area.trim();
      if (Object.keys(updates).length > 0) await updateMyProfile(updates);
      await markDone();
      router.replace('/');
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function skip() {
    await markDone();
    router.replace('/');
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Image source={require('../../assets/images/logo.png')} style={styles.heroLogo} />
      </View>
      <Text style={styles.title}>Welcome to AccountAbility</Text>
      <Text style={styles.subtitle}>
        Plan your day, track workouts, food, money and runs — and keep your
        streak alive. Let&apos;s set you up.
      </Text>

      <Text style={styles.label}>What should we call you?</Text>
      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor={colors.textFaint}
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Your area</Text>
      <TextInput
        style={styles.input}
        placeholder="City or region (for finding workout buddies)"
        placeholderTextColor={colors.textFaint}
        value={area}
        onChangeText={setArea}
      />

      <Button
        title="Get started"
        onPress={finish}
        loading={saving}
        style={styles.cta}
      />
      <Pressable
        onPress={skip}
        disabled={saving}
        style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.skip}>Skip for now</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxl,
    gap: 10,
    flexGrow: 1,
    justifyContent: 'center',
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  hero: {
    alignSelf: 'center',
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: '#fffffc',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    overflow: 'hidden',
  },
  heroLogo: { width: 70, height: 70 },
  title: {
    fontSize: 26,
    fontFamily: font.extrabold,
    textAlign: 'center',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
  label: { fontSize: 14, fontFamily: font.semibold, color: colors.textSecondary, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 13,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  cta: { marginTop: spacing.xl },
  skipBtn: { minHeight: 44, justifyContent: 'center' },
  skip: { color: colors.textMuted, fontFamily: font.medium, textAlign: 'center' },
});
