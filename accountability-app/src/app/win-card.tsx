import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getHomeStats, type HomeStats } from '../home/api';
import { createPost } from '../feed/api';

export default function WinCard() {
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [posting, setPosting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getHomeStats().then(setStats).catch(() => {});
    }, []),
  );

  if (!stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const message =
    stats.streak > 0
      ? `🔥 ${stats.streak}-day streak on Accountability! Showing up every day. 💪`
      : `Building better habits with Accountability 💪 — ${stats.weekWorkouts} workouts this week!`;

  async function onShareToFeed() {
    setPosting(true);
    try {
      await createPost(message, null);
      Alert.alert('Shared to your feed 🎉', 'Your buddies can cheer you on.');
      router.back();
    } catch (e) {
      Alert.alert('Could not share', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  async function onShareExternally() {
    try {
      await Share.share({ message: `${message}\n\n#accountability` });
    } catch {
      // user dismissed the share sheet
    }
  }

  return (
    <View style={styles.screen}>
      {/* The shareable card */}
      <View style={styles.card}>
        <Text style={styles.flame}>🔥</Text>
        <Text style={styles.streakNum}>{stats.streak}</Text>
        <Text style={styles.streakLabel}>DAY STREAK</Text>
        <View style={styles.divider} />
        <View style={styles.weekRow}>
          <View style={styles.weekStat}>
            <Text style={styles.weekValue}>{stats.weekWorkouts}</Text>
            <Text style={styles.weekLabel}>workouts</Text>
          </View>
          <View style={styles.weekStat}>
            <Text style={styles.weekValue}>{stats.weekActivities}</Text>
            <Text style={styles.weekLabel}>activities</Text>
          </View>
        </View>
        <Text style={styles.brand}>Accountability</Text>
      </View>

      <Pressable style={styles.primary} onPress={onShareToFeed} disabled={posting}>
        {posting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Share to my feed</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondary} onPress={onShareExternally}>
        <Text style={styles.secondaryText}>
          {Platform.OS === 'web' ? 'Share link' : 'Share elsewhere'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#1d4ed8',
    borderRadius: 24,
    paddingVertical: 36,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  flame: { fontSize: 44 },
  streakNum: { color: '#fff', fontSize: 88, fontWeight: '900', lineHeight: 92 },
  streakLabel: { color: '#bfdbfe', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 40,
    marginVertical: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  weekRow: { flexDirection: 'row', gap: 40 },
  weekStat: { alignItems: 'center' },
  weekValue: { color: '#fff', fontSize: 26, fontWeight: '800' },
  weekLabel: { color: '#bfdbfe', fontSize: 12 },
  brand: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 20 },
  primary: {
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  secondaryText: { color: '#2563eb', fontSize: 16, fontWeight: '700' },
});
