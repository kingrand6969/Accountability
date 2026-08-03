import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMetrics } from '../achievements/api';
import type { Metrics } from '../achievements/catalog';
import { colors, font, spacing } from '../ui/theme';
import { EditorialBackdrop } from './EditorialBackdrop';
import { JourneyTabs } from './JourneyTabs';
import { listJourneyHistory, pillarActiveDays } from './data';
import type { TimelineItem } from '../timeline/types';

const ZERO: Metrics = {
  streak: 0, totalKm: 0, workouts: 0, challenges: 0, buddies: 0, activities: 0,
  longestKm: 0, activeDays: 0, challengeWins: 0, memories: 0, goalsHit: 0,
  totalHours: 0, places: 0, invitesAccepted: 0, postsShared: 0, likesGiven: 0,
  groupsJoined: 0, buddyMessages: 0, profileFields: 0,
};

const FILTERS = [
  { key: 'all', label: 'All', icon: 'infinite-outline' as const, color: '#155EEF' },
  { key: 'body', label: 'Body', icon: 'walk-outline' as const, color: '#74A62C' },
  { key: 'money', label: 'Money', icon: 'cash-outline' as const, color: '#437CCC' },
  { key: 'focus', label: 'Focus', icon: 'radio-button-on-outline' as const, color: '#B17A31' },
  { key: 'people', label: 'People', icon: 'people-outline' as const, color: '#7D6E9D' },
] as const;

const MILESTONES = [
  { days: 0, label: 'Beginning', short: 'Start', icon: 'footsteps-outline' as const },
  { days: 100, label: 'Foundation', short: '100 Days', icon: 'medal-outline' as const },
  { days: 365, label: 'Committed', short: '1 Year', icon: 'shield-outline' as const },
  { days: 500, label: 'Proven', short: '500 Days', icon: 'ribbon-outline' as const },
  { days: 1825, label: 'Legacy', short: '5+ Years', icon: 'lock-closed-outline' as const },
] as const;

export default function JourneyPathScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<Metrics>(ZERO);
  const [historyItems, setHistoryItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      setError(null);
      Promise.all([getMetrics(), listJourneyHistory()])
        .then(([next, history]) => {
          if (!alive) return;
          setMetrics(next);
          setHistoryItems(history);
        })
        .catch(() => {
          if (!alive) return;
          setMetrics(ZERO);
          setHistoryItems([]);
          setError('Journey history could not be loaded. Return to this screen to retry.');
        })
        .finally(() => alive && setLoading(false));
      return () => { alive = false; };
    }, []),
  );

  const allSelected = filter === 'all';
  const currentDays = allSelected ? metrics.activeDays : pillarActiveDays(historyItems, filter);
  const milestones = MILESTONES;
  const milestoneCeiling = 1825;
  const nextMilestone = useMemo(
    () => milestones.find((milestone) => milestone.days > currentDays) ?? milestones[milestones.length - 1],
    [currentDays, milestones],
  );
  const pathProgress = Math.min(1, currentDays / milestoneCeiling);

  return (
    <View style={styles.screen}>
      <EditorialBackdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.title}>Your Journey</Text>
            <Text style={styles.subtitle}>Keep the chain alive</Text>
          </View>
          <Pressable
            onPress={() => router.push('/menu' as never)}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Journey options"
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.navy} />
          </Pressable>
        </View>
        <JourneyTabs active="path" />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Ionicons name={item.icon} size={15} color={selected ? '#FFFFFF' : item.color} />
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={21} color={colors.primary} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.path}>
            <View style={styles.pathRail} />
            <View style={[styles.pathProgress, { height: `${Math.max(8, pathProgress * 100)}%` }]} />
            {milestones.map((milestone, index) => {
              const reached = currentDays >= milestone.days;
              const current = reached && nextMilestone.days === milestones[index + 1]?.days;
              const side = index % 2 === 0 ? 'left' : 'right';
              return (
                <View key={milestone.days} style={styles.milestoneRow}>
                  <View style={[styles.copy, side === 'right' && styles.copyRight]}>
                    <Text style={styles.milestoneShort}>{milestone.short}</Text>
                    <Text style={styles.milestoneLabel}>{milestone.label}</Text>
                  </View>
                  <View style={[styles.medal, reached && styles.medalReached, current && styles.medalCurrent]}>
                    <Ionicons
                      name={current ? 'people' : milestone.icon}
                      size={current ? 24 : 20}
                      color={reached ? '#FFFFFF' : '#766E61'}
                    />
                  </View>
                  <View style={styles.copy} />
                </View>
              );
            })}
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeLabel}>CURRENT</Text>
              <Text style={styles.currentBadgeValue}>
                Day {currentDays}
              </Text>
            </View>
          </View>
        )}

        {!error ? (
          <>
        <View style={styles.progressCard}>
          <View>
            <Text style={styles.progressLabel}>NEXT LANDMARK</Text>
            <Text style={styles.progressTitle}>{nextMilestone.short}</Text>
          </View>
          <Text style={styles.progressRemaining}>
            {Math.max(0, nextMilestone.days - currentDays).toLocaleString()} days to go
          </Text>
        </View>
        {!allSelected ? (
          <Text style={styles.measureNote}>
            {FILTERS.find((item) => item.key === filter)?.label} path counts completed days over your five-year Journey history.
          </Text>
        ) : null}

        <Pressable
          onPress={() => router.push('/today' as never)}
          style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{"Complete today's promise"}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/achievements' as never)}
          style={({ pressed }) => [styles.trophyLink, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open medals and challenges"
        >
          <Ionicons name="trophy-outline" size={18} color={colors.primary} />
          <Text style={styles.trophyText}>Medals and challenges grow alongside this path</Text>
        </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 120 },
  headingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.navy, fontFamily: 'Georgia', fontSize: 29, lineHeight: 34 },
  subtitle: { color: colors.inkSoft, fontFamily: font.medium, fontSize: 12.5 },
  more: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
  filters: { paddingVertical: 14, gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 15, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(8,26,58,0.13)', backgroundColor: 'rgba(255,255,255,0.62)' },
  filterSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.navy, fontFamily: font.bold, fontSize: 12 },
  filterTextSelected: { color: '#FFFFFF' },
  loader: { marginTop: 120 },
  errorCard: { minHeight: 82, marginTop: 32, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3B4B4', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: colors.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  path: { minHeight: 570, position: 'relative', paddingVertical: 16 },
  pathRail: { position: 'absolute', top: 28, bottom: 28, left: '50%', width: 5, marginLeft: -2.5, borderRadius: 3, backgroundColor: 'rgba(106,104,97,0.25)', transform: [{ rotate: '2deg' }] },
  pathProgress: { position: 'absolute', top: 28, left: '50%', width: 5, marginLeft: -2.5, borderRadius: 3, backgroundColor: colors.primary },
  milestoneRow: { flex: 1, minHeight: 104, flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1, paddingHorizontal: 12 },
  copyRight: { alignItems: 'flex-end' },
  milestoneShort: { color: colors.navy, fontFamily: 'Georgia', fontSize: 19 },
  milestoneLabel: { color: colors.inkSoft, fontFamily: font.medium, fontSize: 11, marginTop: 2 },
  medal: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#D8D2C4', borderWidth: 4, borderColor: '#EBE5D8', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  medalReached: { backgroundColor: '#87725A', borderColor: '#C9B697' },
  medalCurrent: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.primary, borderColor: '#A9C5FF' },
  currentBadge: { position: 'absolute', top: 212, left: '56%', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(8,26,58,0.12)', paddingHorizontal: 10, paddingVertical: 7 },
  currentBadgeLabel: { color: colors.textMuted, fontFamily: font.bold, fontSize: 8.5, letterSpacing: 1 },
  currentBadgeValue: { color: colors.primary, fontFamily: font.extrabold, fontSize: 14, marginTop: 1 },
  progressCard: { minHeight: 66, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(8,26,58,0.10)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { color: colors.textMuted, fontFamily: font.bold, fontSize: 9, letterSpacing: 1 },
  progressTitle: { color: colors.navy, fontFamily: 'Georgia', fontSize: 19, marginTop: 1 },
  progressRemaining: { color: colors.inkSoft, fontFamily: font.medium, fontSize: 12 },
  measureNote: { color: colors.textMuted, fontFamily: font.regular, fontSize: 10.5, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  cta: { minHeight: 52, marginTop: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 15 },
  trophyLink: { minHeight: 52, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  trophyText: { color: colors.primary, fontFamily: font.bold, fontSize: 12 },
});
