import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getHomeStats, type HomeStats } from './api';
import { formatAmount } from '../money/categories';

export function HomeHeader() {
  const router = useRouter();
  const [stats, setStats] = useState<HomeStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getHomeStats()
        .then((s) => {
          if (active) setStats(s);
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  if (!stats) return null;

  const todayLine =
    stats.todayCount > 0
      ? `${stats.todayCount} thing${stats.todayCount === 1 ? '' : 's'} on your day`
      : 'Nothing planned yet — add something';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Pressable style={styles.streak} onPress={() => router.push('/win-card')}>
          <Text style={styles.streakNum}>🔥 {stats.streak}</Text>
          <Text style={styles.streakLabel}>
            day{stats.streak === 1 ? '' : 's'} streak · share
          </Text>
        </Pressable>
        <Pressable style={styles.buddy} onPress={() => router.push('/buddy')}>
          <Text style={styles.buddyText}>🤝 {stats.buddyCount}</Text>
          {stats.buddyRequests > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{stats.buddyRequests}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Text style={styles.today}>{todayLine}</Text>

      <View style={styles.weekRow}>
        <Text style={styles.weekLabel}>This week</Text>
        <Text style={styles.weekStat}>🏋️ {stats.weekWorkouts}</Text>
        <Text style={styles.weekStat}>🏃 {stats.weekActivities}</Text>
        <Text style={styles.weekStat}>💸 {formatAmount(stats.weekSpend)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#2563eb',
    borderRadius: 16,
    padding: 16,
    margin: 16,
    marginBottom: 4,
    gap: 8,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakNum: { color: '#fff', fontSize: 30, fontWeight: '900' },
  streakLabel: { color: '#dbeafe', fontSize: 14, fontWeight: '600' },
  buddy: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  buddyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  today: { color: '#fff', fontSize: 15, fontWeight: '600' },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.3)',
    paddingTop: 8,
  },
  weekLabel: { color: '#dbeafe', fontSize: 12, fontWeight: '700', flex: 1 },
  weekStat: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
