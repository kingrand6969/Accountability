import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getHomeStats, type HomeStats } from './api';
import { formatAmount } from '../money/categories';
import { colors, font, radius, spacing } from '../ui/theme';

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
        .catch(() => {}); // keep last-known stats — never flash a false 0 streak
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
        <Pressable
          style={({ pressed }) => [styles.streak, pressed && styles.pressed]}
          onPress={() => router.push('/win-card')}
          accessibilityLabel="Share your streak"
        >
          <Ionicons name="flame" size={26} color={colors.accent} />
          <Text style={styles.streakNum}>{stats.streak}</Text>
          <Text style={styles.streakLabel}>
            day{stats.streak === 1 ? '' : 's'} streak · share
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.buddy, pressed && styles.pressed]}
          onPress={() => router.push('/buddy')}
          accessibilityLabel="Accountability buddies"
        >
          <Ionicons name="people" size={18} color="#fff" />
          <Text style={styles.buddyText}>{stats.buddyCount}</Text>
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
        <View style={styles.weekStat}>
          <Ionicons name="barbell-outline" size={15} color="#fff" />
          <Text style={styles.weekStatText}>{stats.weekWorkouts}</Text>
        </View>
        <View style={styles.weekStat}>
          <Ionicons name="walk-outline" size={15} color="#fff" />
          <Text style={styles.weekStatText}>{stats.weekActivities}</Text>
        </View>
        <View style={styles.weekStat}>
          <Ionicons name="cash-outline" size={15} color="#fff" />
          <Text style={styles.weekStatText}>{formatAmount(stats.weekSpend)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    margin: spacing.lg,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.75 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  streakNum: { color: '#fff', fontSize: 30, fontFamily: font.extrabold },
  streakLabel: { color: '#dbeafe', fontSize: 14, fontFamily: font.semibold },
  buddy: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingLeft: 8 },
  buddyText: { color: '#fff', fontSize: 16, fontFamily: font.bold },
  badge: {
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontFamily: font.extrabold },
  today: { color: '#fff', fontSize: 15, fontFamily: font.semibold },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.35)',
    paddingTop: spacing.sm,
  },
  weekLabel: { color: '#dbeafe', fontSize: 12, fontFamily: font.bold, flex: 1 },
  weekStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekStatText: { color: '#fff', fontSize: 14, fontFamily: font.bold },
});
