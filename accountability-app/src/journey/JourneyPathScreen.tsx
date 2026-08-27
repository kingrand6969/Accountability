import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { getMetrics } from '../achievements/api';
import type { Metrics } from '../achievements/catalog';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { JourneyTabs } from './JourneyTabs';
import { listJourneyHistory, pillarActiveDays } from './data';
import type { TimelineItem } from '../timeline/types';

const ZERO: Metrics = {
  streak: 0, totalKm: 0, workouts: 0, challenges: 0, buddies: 0, activities: 0,
  longestKm: 0, activeDays: 0, challengeWins: 0, memories: 0,
  totalHours: 0, places: 0, invitesAccepted: 0, postsShared: 0, likesGiven: 0,
  groupsJoined: 0, buddyMessages: 0, profileFields: 0,
};

const FILTERS = [
  { key: 'all', label: 'All', icon: 'infinite-outline' as const, color: '#B9FF3D' },
  { key: 'body', label: 'Body', icon: 'walk-outline' as const, color: '#74A62C' },
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
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => pathPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const nextMilestone = useMemo(
    () => milestones.find((milestone) => milestone.days > currentDays) ?? milestones[milestones.length - 1],
    [currentDays, milestones],
  );
  const currentMilestone = [...milestones].reverse().find((milestone) => milestone.days <= currentDays) ?? milestones[0];
  const segmentSpan = Math.max(1, nextMilestone.days - currentMilestone.days);
  const segmentProgress = nextMilestone.days <= currentDays
    ? 1
    : Math.min(1, Math.max(0, (currentDays - currentMilestone.days) / segmentSpan));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <JourneyTabs active="path" />

        <View style={styles.progressSummary}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryKicker}>YOUR ACTIVE JOURNEY</Text>
              <Text style={styles.summaryDay}>Day {currentDays}</Text>
            </View>
            <View style={styles.summaryNext}>
              <Text style={styles.summaryKicker}>NEXT LANDMARK</Text>
              <Text style={styles.summaryLandmark}>{nextMilestone.short}</Text>
            </View>
          </View>
          <View style={styles.summaryTrack}>
            <View style={[styles.summaryProgress, { width: `${segmentProgress * 100}%` as `${number}%` }]} />
          </View>
          <Text style={styles.summaryRemaining}>
            {Math.max(0, nextMilestone.days - currentDays).toLocaleString()} days to go
          </Text>
        </View>

        <View style={styles.segmentedFilters}>
          {FILTERS.map((item) => {
            const selected = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={({ pressed }) => [styles.filter, selected && styles.filterSelected, pressed && styles.pressed]}
                hitSlop={{ top: 2, bottom: 2 }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={palette.action} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={21} color={palette.action} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <View style={styles.milestoneList}>
            {milestones.map((milestone, index) => {
              const reached = currentDays >= milestone.days;
              const current = milestone.days === currentMilestone.days;
              return (
                <View key={milestone.days} style={styles.milestoneRow}>
                  <View style={styles.nodeColumn}>
                    {index < milestones.length - 1 ? <View style={styles.connector} /> : null}
                    <View style={[styles.medal, reached && styles.medalReached, current && styles.medalCurrent]}>
                      <Ionicons
                        name={current ? 'footsteps' : milestone.icon}
                        size={20}
                        color={current ? palette.onAction : reached ? palette.medalReachedInk : palette.medalInk}
                      />
                    </View>
                  </View>
                  <View style={styles.milestoneCopy}>
                    <View style={styles.milestoneTitleRow}>
                      <Text style={styles.milestoneShort}>{milestone.short}</Text>
                      <Text style={[styles.milestoneStatus, current && styles.milestoneStatusCurrent]}>
                        {current ? 'CURRENT' : reached ? 'REACHED' : `DAY ${milestone.days.toLocaleString()}`}
                      </Text>
                    </View>
                    <Text style={styles.milestoneLabel}>{milestone.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!error ? (
          <>
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
          <Ionicons name="trophy-outline" size={18} color={palette.action} />
          <Text style={styles.trophyText}>Medals and challenges grow alongside this path</Text>
        </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function pathPalette(theme: AppThemeColors) {
  return {
    canvas: theme.surface.canvas,
    ink: theme.ink.primary,
    inkSoft: theme.ink.secondary,
    mutedInk: theme.ink.muted,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
    border: theme.border.subtle,
    filterSurface: theme.surface.card,
    errorSurface: theme.status.dangerSoft,
    errorBorder: theme.border.danger,
    danger: theme.status.danger,
    pathRail: theme.border.strong,
    medalSurface: theme.surface.muted,
    medalBorder: theme.border.strong,
    medalInk: theme.ink.secondary,
    medalReached: theme.surface.raised,
    medalReachedBorder: theme.border.strong,
    medalReachedInk: theme.ink.primary,
    currentBorder: theme.border.action,
    currentSurface: theme.surface.raised,
    currentBorderSoft: theme.border.subtle,
    progressSurface: theme.surface.card,
    progressBorder: theme.border.subtle,
  } as const;
}

const createStyles = (theme: AppThemeColors) => {
  const palette = pathPalette(theme);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingTop: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: 120 },
  pressed: { opacity: 0.68 },
  progressSummary: {
    marginTop: spacing.lg,
    borderRadius: 18,
    padding: spacing.lg,
    backgroundColor: theme.surface.raised,
    borderWidth: 1,
    borderColor: theme.border.strong,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  summaryNext: { alignItems: 'flex-end', flexShrink: 1 },
  summaryKicker: { color: theme.ink.action, fontFamily: font.bold, fontSize: 9.5, letterSpacing: 1 },
  summaryDay: { color: theme.ink.primary, fontFamily: font.display, fontSize: 42, lineHeight: 46, marginTop: 2 },
  summaryLandmark: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 18, lineHeight: 23, marginTop: 5, textAlign: 'right' },
  summaryTrack: { height: 6, marginTop: spacing.md, overflow: 'hidden', borderRadius: 3, backgroundColor: theme.border.strong },
  summaryProgress: { height: '100%', borderRadius: 3, backgroundColor: theme.ink.action },
  summaryRemaining: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 11.5, marginTop: spacing.sm },
  segmentedFilters: { flexDirection: 'row', gap: spacing.xs, marginVertical: spacing.md, padding: spacing.xs, borderRadius: 14, backgroundColor: palette.filterSurface, borderWidth: 1, borderColor: palette.border },
  filter: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: spacing.xs, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  filterSelected: { backgroundColor: palette.action, borderColor: palette.action },
  filterText: { color: palette.ink, fontFamily: font.bold, fontSize: 12 },
  filterTextSelected: { color: palette.onAction },
  loader: { marginTop: 64 },
  errorCard: { minHeight: 82, marginTop: 32, borderRadius: 14, backgroundColor: palette.errorSurface, borderWidth: 1, borderColor: palette.errorBorder, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: palette.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  milestoneList: { marginTop: spacing.xs },
  milestoneRow: { minHeight: 78, flexDirection: 'row', alignItems: 'stretch' },
  nodeColumn: { width: 52, alignItems: 'center', paddingTop: 13, position: 'relative' },
  connector: { position: 'absolute', top: 48, bottom: -14, width: 3, borderRadius: 2, backgroundColor: palette.pathRail },
  milestoneCopy: { flex: 1, minWidth: 0, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, paddingVertical: spacing.sm },
  milestoneTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  milestoneShort: { flex: 1, color: palette.ink, fontFamily: font.bold, fontSize: 17, lineHeight: 22 },
  milestoneLabel: { color: palette.inkSoft, fontFamily: font.medium, fontSize: 12, marginTop: 2 },
  milestoneStatus: { color: palette.mutedInk, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.8 },
  milestoneStatusCurrent: { color: palette.action },
  medal: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.medalSurface, borderWidth: 3, borderColor: palette.medalBorder, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  medalReached: { backgroundColor: palette.medalReached, borderColor: palette.medalReachedBorder },
  medalCurrent: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.action, borderColor: palette.currentBorder },
  measureNote: { color: palette.mutedInk, fontFamily: font.regular, fontSize: 10.5, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  cta: { minHeight: 52, marginTop: 14, borderRadius: 12, backgroundColor: palette.action, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: palette.onAction, fontFamily: font.bold, fontSize: 15 },
  trophyLink: { minHeight: 52, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  trophyText: { color: palette.action, fontFamily: font.bold, fontSize: 12 },
  });
};
