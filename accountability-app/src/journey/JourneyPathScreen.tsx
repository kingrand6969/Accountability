import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMetrics } from '../achievements/api';
import type { Metrics } from '../achievements/catalog';
import {
  colors as legacyColors,
  font,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { EditorialBackdrop } from './EditorialBackdrop';
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
  { key: 'all', label: 'All', icon: 'infinite-outline' as const, color: '#155EEF' },
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
  const insets = useSafeAreaInsets();
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => pathPalette(theme, mode), [mode, theme]);
  const styles = useMemo(() => createStyles(theme, mode), [mode, theme]);
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
            <Ionicons name="ellipsis-horizontal" size={22} color={palette.ink} />
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
                hitSlop={{ top: 2, bottom: 2 }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Ionicons name={item.icon} size={15} color={selected ? palette.onAction : item.color} />
                <Text style={[styles.filterText, selected && styles.filterTextSelected]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={palette.action} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={21} color={palette.action} />
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
                      color={current ? palette.onAction : reached ? palette.medalReachedInk : palette.medalInk}
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
          <Ionicons name="trophy-outline" size={18} color={palette.action} />
          <Text style={styles.trophyText}>Medals and challenges grow alongside this path</Text>
        </Pressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function pathPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    canvas: mode === 'light' ? legacyColors.cream : theme.surface.canvas,
    ink: mode === 'light' ? legacyColors.navy : theme.ink.primary,
    inkSoft: mode === 'light' ? legacyColors.inkSoft : theme.ink.secondary,
    mutedInk: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    action: mode === 'light' ? legacyColors.primary : theme.ink.action,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    border: mode === 'light' ? 'rgba(8,26,58,0.13)' : theme.border.subtle,
    filterSurface: mode === 'light' ? 'rgba(255,255,255,0.62)' : theme.surface.card,
    errorSurface: mode === 'light' ? '#FFFFFF' : theme.status.dangerSoft,
    errorBorder: mode === 'light' ? '#F3B4B4' : theme.border.danger,
    danger: mode === 'light' ? legacyColors.danger : theme.status.danger,
    pathRail: mode === 'light' ? 'rgba(106,104,97,0.25)' : theme.border.strong,
    medalSurface: mode === 'light' ? '#D8D2C4' : theme.surface.muted,
    medalBorder: mode === 'light' ? '#EBE5D8' : theme.border.strong,
    medalInk: mode === 'light' ? '#766E61' : theme.ink.secondary,
    medalReached: mode === 'light' ? '#87725A' : theme.surface.raised,
    medalReachedBorder: mode === 'light' ? '#C9B697' : theme.border.strong,
    medalReachedInk: mode === 'light' ? '#FFFFFF' : theme.ink.primary,
    currentBorder: mode === 'light' ? '#A9C5FF' : theme.border.action,
    currentSurface: mode === 'light' ? '#FFFFFF' : theme.surface.raised,
    currentBorderSoft: mode === 'light' ? 'rgba(8,26,58,0.12)' : theme.border.subtle,
    progressSurface: mode === 'light' ? 'rgba(255,255,255,0.72)' : theme.surface.card,
    progressBorder: mode === 'light' ? 'rgba(8,26,58,0.10)' : theme.border.subtle,
  } as const;
}

const createStyles = (theme: AppThemeColors, mode: AppThemeMode) => {
  const palette = pathPalette(theme, mode);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 120 },
  headingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: palette.ink, fontFamily: 'Georgia', fontSize: 29, lineHeight: 34 },
  subtitle: { color: palette.inkSoft, fontFamily: font.medium, fontSize: 12.5 },
  more: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
  filters: { paddingVertical: 14, gap: 8 },
  filter: { minHeight: 44, paddingHorizontal: 15, borderRadius: 22, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.filterSurface },
  filterSelected: { backgroundColor: palette.action, borderColor: palette.action },
  filterText: { color: palette.ink, fontFamily: font.bold, fontSize: 12 },
  filterTextSelected: { color: palette.onAction },
  loader: { marginTop: 120 },
  errorCard: { minHeight: 82, marginTop: 32, borderRadius: 14, backgroundColor: palette.errorSurface, borderWidth: 1, borderColor: palette.errorBorder, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: palette.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  path: { minHeight: 570, position: 'relative', paddingVertical: 16 },
  pathRail: { position: 'absolute', top: 28, bottom: 28, left: '50%', width: 5, marginLeft: -2.5, borderRadius: 3, backgroundColor: palette.pathRail, transform: [{ rotate: '2deg' }] },
  pathProgress: { position: 'absolute', top: 28, left: '50%', width: 5, marginLeft: -2.5, borderRadius: 3, backgroundColor: palette.action },
  milestoneRow: { flex: 1, minHeight: 104, flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1, paddingHorizontal: 12 },
  copyRight: { alignItems: 'flex-end' },
  milestoneShort: { color: palette.ink, fontFamily: 'Georgia', fontSize: 19 },
  milestoneLabel: { color: palette.inkSoft, fontFamily: font.medium, fontSize: 11, marginTop: 2 },
  medal: { width: 58, height: 58, borderRadius: 29, backgroundColor: palette.medalSurface, borderWidth: 4, borderColor: palette.medalBorder, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  medalReached: { backgroundColor: palette.medalReached, borderColor: palette.medalReachedBorder },
  medalCurrent: { width: 66, height: 66, borderRadius: 33, backgroundColor: palette.action, borderColor: palette.currentBorder },
  currentBadge: { position: 'absolute', top: 212, left: '56%', backgroundColor: palette.currentSurface, borderRadius: 10, borderWidth: 1, borderColor: palette.currentBorderSoft, paddingHorizontal: 10, paddingVertical: 7 },
  currentBadgeLabel: { color: palette.mutedInk, fontFamily: font.bold, fontSize: 8.5, letterSpacing: 1 },
  currentBadgeValue: { color: palette.action, fontFamily: font.extrabold, fontSize: 14, marginTop: 1 },
  progressCard: { minHeight: 66, borderRadius: 14, backgroundColor: palette.progressSurface, borderWidth: 1, borderColor: palette.progressBorder, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { color: palette.mutedInk, fontFamily: font.bold, fontSize: 9, letterSpacing: 1 },
  progressTitle: { color: palette.ink, fontFamily: 'Georgia', fontSize: 19, marginTop: 1 },
  progressRemaining: { color: palette.inkSoft, fontFamily: font.medium, fontSize: 12 },
  measureNote: { color: palette.mutedInk, fontFamily: font.regular, fontSize: 10.5, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  cta: { minHeight: 52, marginTop: 14, borderRadius: 12, backgroundColor: palette.action, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: palette.onAction, fontFamily: font.bold, fontSize: 15 },
  trophyLink: { minHeight: 52, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  trophyText: { color: palette.action, fontFamily: font.bold, fontSize: 12 },
  });
};
