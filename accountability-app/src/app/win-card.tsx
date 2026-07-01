import { useCallback, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { getHomeStats, type HomeStats } from '../home/api';
import { createPost } from '../feed/api';
import { uploadPostImage } from '../feed/uploadPostImage';

export default function WinCard() {
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View>(null);

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

  async function captureCard(result: 'base64' | 'tmpfile'): Promise<string | null> {
    if (Platform.OS === 'web' || !cardRef.current) return null;
    try {
      return await captureRef(cardRef, { format: 'png', quality: 0.95, result });
    } catch {
      return null;
    }
  }

  async function onShareToFeed() {
    setPosting(true);
    try {
      let imageUrl: string | null = null;
      const base64 = await captureCard('base64');
      if (base64) {
        try {
          imageUrl = await uploadPostImage(base64, 'png');
        } catch {
          imageUrl = null;
        }
      }
      await createPost(message, imageUrl);
      Alert.alert(
        'Shared to your feed 🎉',
        imageUrl ? 'Your win card is on your feed.' : 'Your win is on your feed.',
      );
      router.back();
    } catch (e) {
      Alert.alert('Could not share', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  async function onShareExternally() {
    setSharing(true);
    try {
      const uri = await captureCard('tmpfile');
      if (uri && Platform.OS !== 'web') {
        try {
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your win' });
            return;
          }
        } catch {
          // fall through
        }
      }
      await Share.share({ message: `${message}\n\n#accountability` });
    } catch {
      // dismissed
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
        <LinearGradient
          colors={['#7c3aed', '#db2777', '#fb923c']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <Text style={styles.brandTop}>ACCOUNTABILITY</Text>

          <View style={styles.flameWrap}>
            <Text style={styles.flame}>🔥</Text>
          </View>

          <Text style={styles.streakNum}>{stats.streak}</Text>
          <Text style={styles.streakLabel}>DAY STREAK</Text>

          <View style={styles.pills}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>🏋️ {stats.weekWorkouts} workouts</Text>
            </View>
            <View style={styles.pill}>
              <Text style={styles.pillText}>🏃 {stats.weekActivities} activities</Text>
            </View>
          </View>

          <Text style={styles.tagline}>Showing up every day 💪</Text>
        </LinearGradient>
      </View>

      <Pressable style={styles.primary} onPress={onShareToFeed} disabled={posting || sharing}>
        {posting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryText}>Share to my feed</Text>
        )}
      </Pressable>
      <Pressable style={styles.secondary} onPress={onShareExternally} disabled={posting || sharing}>
        {sharing ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.secondaryText}>
            {Platform.OS === 'web' ? 'Share link' : 'Share image'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 14, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardWrap: {
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#7c3aed',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  card: { paddingVertical: 44, paddingHorizontal: 24, alignItems: 'center' },
  brandTop: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 18,
  },
  flameWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flame: { fontSize: 48 },
  streakNum: {
    color: '#fff',
    fontSize: 100,
    fontWeight: '900',
    lineHeight: 104,
    marginTop: 10,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  streakLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 4,
    marginTop: -2,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24, justifyContent: 'center' },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  tagline: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 24,
  },
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
