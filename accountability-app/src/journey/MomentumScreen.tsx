import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listItemsForDay } from '../timeline/api';
import type { TimelineItem } from '../timeline/types';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { JourneyTabs } from './JourneyTabs';
import {
  hasCompletionProof,
  listRecentJourneyItems,
  pillarCompletion,
} from './data';
import { getJourneyEncouragement, type JourneyEncouragement } from './encouragement';
import { JourneyEncouragementBar } from './JourneyEncouragementBar';

const PILLARS = [
  { key: 'body', label: 'Body', icon: 'walk-outline' as const },
  { key: 'focus', label: 'Focus', icon: 'radio-button-on-outline' as const },
  { key: 'people', label: 'People', icon: 'people-outline' as const },
] as const;

function pillarDefinitions(theme: AppThemeColors) {
  const accents = [
    theme.status.success,
    theme.ink.action,
    theme.status.attention,
  ] as const;
  return PILLARS.map((pillar, index) => ({ ...pillar, color: accents[index] }));
}

export default function MomentumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pillars = useMemo(() => pillarDefinitions(theme), [theme]);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.75;
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [weekItems, setWeekItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [encouragement, setEncouragement] = useState<JourneyEncouragement | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      setError(null);
      const since = new Date();
      since.setDate(since.getDate() - 30);
      Promise.all([listItemsForDay(new Date()), listRecentJourneyItems(7), getJourneyEncouragement(since).catch(() => null)])
        .then(([nextItems, nextWeekItems, nextEncouragement]) => {
          if (!alive) return;
          setItems(nextItems);
          setWeekItems(nextWeekItems);
          setEncouragement(nextEncouragement);
        })
        .catch(() => {
          if (!alive) return;
          setItems([]);
          setWeekItems([]);
          setError('Momentum could not be loaded. Open this screen again to retry.');
        })
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }, []),
  );

  const pillarScores = useMemo(
    () => pillars.map((pillar) => ({ ...pillar, ...pillarCompletion(weekItems, pillar.key) })),
    [pillars, weekItems],
  );
  const measuredPillars = pillarScores.filter((pillar) => pillar.total > 0);
  const momentum = measuredPillars.length > 0
    ? Math.round(measuredPillars.reduce((sum, pillar) => sum + pillar.score, 0) / measuredPillars.length)
    : 0;
  const nextItem = items.find((item) => new Date(item.starts_at) >= new Date()) ?? items[0];

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.eyebrow}>JOURNEY</Text>
            <Text style={styles.greeting}>Build momentum.</Text>
          </View>
          <Pressable
            onPress={() => router.push('/notifications' as never)}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={20} color={theme.ink.action} />
          </Pressable>
        </View>

        <JourneyTabs active="momentum" />

        {loading ? (
          <ActivityIndicator color={theme.ink.action} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={22} color={theme.status.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.momentumPanel}>
              <View style={styles.momentumHeader}>
                <View style={styles.momentumCopy}>
                  <Text style={styles.panelKicker}>7-DAY MOMENTUM</Text>
                  <Text style={styles.panelHint}>
                    {measuredPillars.length > 0
                      ? `${measuredPillars.length} of ${pillarScores.length} areas active`
                      : 'Log one action to get moving'}
                  </Text>
                </View>
                <View style={styles.scoreRow} accessible accessibilityLabel={`Momentum ${momentum} out of 100`}>
                  <Text style={styles.score}>{momentum}</Text>
                  <Text style={styles.scoreUnit}>/100</Text>
                </View>
              </View>
              <View style={styles.pillarList}>
                {pillarScores.map((pillar) => (
                  <Pressable
                    key={pillar.key}
                    style={({ pressed }) => [styles.pillarRow, pressed && styles.panelPressed]}
                    onPress={() => router.push((pillar.key === 'body' ? '/body' : pillar.key === 'focus' ? '/today' : '/messages') as never)}
                    accessibilityRole="button"
                    accessibilityLabel={pillar.total > 0 ? `${pillar.label} completion ${pillar.score} percent this week` : `${pillar.label}, no data this week`}
                  >
                    <View style={[styles.pillarIcon, { backgroundColor: `${pillar.color}24` }]}>
                      <Ionicons name={pillar.icon} size={18} color={pillar.color} />
                    </View>
                    <View style={styles.pillarContent}>
                      <View style={styles.pillarLabelRow}>
                        <Text style={styles.pillarName}>{pillar.label}</Text>
                        <Text style={styles.pillarValue}>
                          {pillar.total > 0 ? `${pillar.score}%` : 'No activity'}
                        </Text>
                      </View>
                      <View style={styles.pillarTrack}>
                        <View
                          style={[
                            styles.pillarProgress,
                            {
                              width: `${pillar.total > 0 ? pillar.score : 0}%` as `${number}%`,
                              backgroundColor: pillar.color,
                            },
                          ]}
                        />
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={theme.ink.muted} />
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={() => router.push(nextItem ? `/item/${nextItem.id}` as never : '/add' as never)}
              style={({ pressed }) => [
                styles.nextCard,
                largeText && styles.nextCardLargeText,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={nextItem ? `Next up, ${nextItem.title}` : 'Plan your next promise'}
            >
              <View style={styles.nextIcon}>
                <Ionicons
                  name={nextItem?.type === 'workout' ? 'barbell-outline' : 'arrow-forward'}
                  size={20}
                  color={theme.status.success}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.nextKicker}>NEXT UP</Text>
                <Text style={styles.nextTitle}>{nextItem?.title ?? "Choose today's first promise"}</Text>
              </View>
              <Text style={styles.startText}>{nextItem ? 'Open' : 'Plan'}</Text>
            </Pressable>

            <View style={styles.today}>
              <View
                style={[
                  styles.sectionHeader,
                  largeText && styles.sectionHeaderLargeText,
                ]}
              >
                <Text style={styles.sectionTitle}>Today</Text>
                <Text style={styles.sectionMeta}>{items.length} promise{items.length === 1 ? '' : 's'}</Text>
              </View>
              {items.length === 0 ? (
                <Text style={styles.emptyText}>A quiet day is still yours. Add one promise worth keeping.</Text>
              ) : (
                items.slice(0, 4).map((item, index) => (
                  <Pressable
                    key={item.id}
                    style={({ pressed }) => [styles.todayRow, pressed && styles.pressed]}
                    onPress={() => router.push(`/item/${item.id}` as never)}
                    accessibilityRole="button"
                  >
                    <View style={[styles.timelineDot, index === 0 && styles.timelineDotActive]} />
                    <Text style={styles.timeText}>
                      {new Date(item.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                    <Ionicons
                      name={hasCompletionProof(item) ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={hasCompletionProof(item) ? theme.ink.action : theme.ink.muted}
                    />
                  </Pressable>
                ))
              )}
            </View>

            <JourneyEncouragementBar
              value={encouragement}
              onPress={() => encouragement && router.push({ pathname: '/post/[id]', params: { id: encouragement.postId, encouragement: '1' } } as never)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas, overflow: 'hidden' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  brandRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: theme.ink.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 1.4 },
  greeting: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 24, lineHeight: 30 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    backgroundColor: theme.surface.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.68 },
  loader: { marginTop: 96 },
  errorCard: {
    minHeight: 82,
    marginTop: 36,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border.danger,
    padding: 14,
    backgroundColor: theme.surface.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { flex: 1, color: theme.ink.primary, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  momentumPanel: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 18,
    padding: spacing.lg,
    backgroundColor: theme.surface.raised,
    borderWidth: 1,
    borderColor: theme.border.strong,
  },
  momentumHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginBottom: spacing.md },
  momentumCopy: { flex: 1, minWidth: 0 },
  panelKicker: { color: theme.ink.action, fontFamily: font.bold, fontSize: 10, letterSpacing: 1.2 },
  panelHint: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 12, lineHeight: 17, marginTop: 3 },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline' },
  score: { color: theme.ink.primary, fontFamily: font.display, fontSize: 48, lineHeight: 50 },
  scoreUnit: { color: theme.ink.muted, fontFamily: font.bold, fontSize: 12, marginLeft: 3 },
  pillarList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border.strong },
  pillarRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border.strong },
  panelPressed: { opacity: 0.78 },
  pillarIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillarContent: { flex: 1, minWidth: 0 },
  pillarLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  pillarName: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 13 },
  pillarValue: { color: theme.ink.secondary, fontFamily: font.semibold, fontSize: 11.5 },
  pillarTrack: { height: 4, marginTop: 7, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.border.strong },
  pillarProgress: { height: '100%', borderRadius: 2 },
  nextCard: {
    minHeight: 60,
    borderRadius: 14,
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  nextCardLargeText: {
    minHeight: 148,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    padding: spacing.md,
  },
  nextIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.status.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  nextKicker: { color: theme.ink.muted, fontFamily: font.bold, fontSize: 9.5, letterSpacing: 1 },
  nextTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 13.5, marginTop: 2 },
  startText: {
    color: theme.ink.inverse,
    backgroundColor: theme.ink.action,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    fontFamily: font.bold,
    fontSize: 12,
  },
  today: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    padding: 14,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionHeaderLargeText: { flexDirection: 'column', alignItems: 'flex-start' },
  sectionTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 19 },
  sectionMeta: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 11 },
  emptyText: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  todayRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border.subtle,
    gap: 9,
  },
  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: theme.ink.muted,
  },
  timelineDotActive: {
    borderColor: theme.status.success,
    backgroundColor: theme.status.success,
  },
  timeText: { width: 56, color: theme.ink.muted, fontFamily: font.medium, fontSize: 10.5 },
  itemTitle: { flex: 1, color: theme.ink.primary, fontFamily: font.medium, fontSize: 13 },
});
