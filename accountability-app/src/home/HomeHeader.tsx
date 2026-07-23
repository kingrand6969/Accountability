import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
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
      <LinearGradient
        colors={['#3b82f6', '#2563eb', '#1d4ed8']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <Pressable
            style={({ pressed }) => [styles.streak, pressed && styles.pressed]}
            onPress={() => router.push('/win-card')}
            accessibilityLabel="Share your streak"
          >
            <View style={styles.flameWrap}>
              <Ionicons name="flame" size={20} color={colors.accent} />
            </View>
            {stats.streak > 0 ? (
              <>
                <Text style={styles.streakNum}>{stats.streak}</Text>
                <Text style={styles.streakLabel}>
                  day{stats.streak === 1 ? '' : 's'} streak · share
                </Text>
              </>
            ) : (
              <Text style={styles.streakLabel}>Start your streak today</Text>
            )}
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

        {/* frosted glass stat strip */}
        <Pressable
          style={({ pressed }) => [styles.weekRowWrap, pressed && styles.pressed]}
          onPress={() => router.push('/insights')}
          accessibilityLabel="See your full progress"
        >
          <BlurView intensity={22} tint="light" style={styles.weekRow}>
            <Text style={styles.weekLabel}>This week · see progress</Text>
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
            <Ionicons name="chevron-forward" size={14} color="#dbeafe" />
          </BlurView>
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    shadowColor: '#4338ca',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  gradient: { padding: spacing.lg, gap: spacing.md },
  pressed: { opacity: 0.75 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  flameWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakNum: { color: '#fff', fontSize: 26, fontFamily: font.extrabold },
  streakLabel: { color: '#e0e7ff', fontSize: 14, fontFamily: font.semibold },
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
  today: { color: '#fff', fontSize: 15, fontFamily: font.semibold, marginBottom: 2 },
  weekRowWrap: { borderRadius: radius.md, overflow: 'hidden' },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  weekLabel: { color: '#eff6ff', fontSize: 12, fontFamily: font.bold, flex: 1 },
  weekStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weekStatText: { color: '#fff', fontSize: 14, fontFamily: font.bold },
});
