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
import { font, spacing, type AppThemeColors, type AppThemeMode } from '../ui/theme';
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

function pillarDefinitions(theme: AppThemeColors, mode: AppThemeMode) {
  const accents = [
    mode === 'dark' ? theme.status.success : '#13753D',
    theme.ink.action,
    mode === 'dark' ? theme.status.attention : '#8A5B00',
  ] as const;
  return PILLARS.map((pillar, index) => ({ ...pillar, color: accents[index] }));
}

export default function MomentumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const pillars = useMemo(() => pillarDefinitions(theme, mode), [theme, mode]);
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
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
      >
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.eyebrow}>YOUR JOURNEY</Text>
            <Text style={styles.greeting}>Today is yours.</Text>
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
            {largeText ? (
              <View style={styles.largeMomentum}>
                <View style={styles.largeCore}>
                  <Text style={styles.coreLabel}>Momentum</Text>
                  <Text style={styles.coreValue}>{momentum}</Text>
                </View>
                <View style={styles.largePillarGrid}>
                  {pillarScores.map((pillar) => (
                    <Pressable
                      key={pillar.key}
                      style={({ pressed }) => [
                        styles.largePillarCard,
                        { borderColor: pillar.color },
                        pressed && styles.pressed,
                      ]}
                      onPress={() =>
                        router.push(
                          (pillar.key === 'body'
                            ? '/body'
                            : pillar.key === 'focus'
                              ? '/today'
                              : '/messages') as never,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={
                        pillar.total > 0
                          ? `${pillar.label} completion ${pillar.score} percent this week`
                          : `${pillar.label}, no data this week`
                      }
                    >
                      <Text style={[styles.pillarLabel, { color: pillar.color }]}>
                        {pillar.label}
                      </Text>
                      <Text style={styles.largePillarValue}>
                        {pillar.total > 0 ? pillar.score : '\u2014'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.orbit}>
              <View style={styles.orbitOuter} />
              <View style={styles.orbitInner} />
              <View style={styles.core}>
                <Text style={styles.coreLabel}>Momentum</Text>
                <Text style={styles.coreValue}>{momentum}</Text>
              </View>
              {pillarScores.map((pillar, index) => {
                const pos = [styles.pillarTopLeft, styles.pillarTopRight, styles.pillarBottomLeft, styles.pillarBottomRight][index];
                return (
                  <Pressable
                    key={pillar.key}
                    style={({ pressed }) => [styles.pillar, pos, { borderColor: pillar.color }, pressed && styles.pressed]}
                    onPress={() => router.push((pillar.key === 'body' ? '/body' : pillar.key === 'focus' ? '/today' : '/messages') as never)}
                    accessibilityRole="button"
                    accessibilityLabel={pillar.total > 0 ? `${pillar.label} completion ${pillar.score} percent this week` : `${pillar.label}, no data this week`}
                  >
                    <Text style={[styles.pillarLabel, { color: pillar.color }]}>{pillar.label}</Text>
                    <Text style={styles.pillarValue}>{pillar.total > 0 ? pillar.score : "\u2014"}</Text>
                  </Pressable>
                );
              })}
              </View>
            )}

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

const createStyles = (theme: AppThemeColors, mode: AppThemeMode) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas, overflow: 'hidden' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  glowOne: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: mode === 'dark' ? 'rgba(96,165,250,0.13)' : 'rgba(21,94,239,0.07)',
    top: 90,
    left: -150,
  },
  glowTwo: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: mode === 'dark' ? 'rgba(129,140,248,0.12)' : 'rgba(124,58,237,0.06)',
    top: 220,
    right: -160,
  },
  brandRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: theme.ink.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 1.4 },
  greeting: { color: theme.ink.primary, fontFamily: 'Georgia', fontSize: 24, lineHeight: 30 },
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
  orbit: { height: 308, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  orbitOuter: {
    position: 'absolute',
    width: 270,
    height: 190,
    borderWidth: 1,
    borderRadius: 150,
    borderColor: mode === 'dark' ? 'rgba(96,165,250,0.46)' : 'rgba(21,94,239,0.28)',
    transform: [{ rotate: '-8deg' }],
  },
  orbitInner: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderWidth: 1,
    borderRadius: 100,
    borderColor: theme.border.strong,
  },
  core: {
    width: 126,
    height: 126,
    borderRadius: 63,
    borderWidth: 1,
    borderColor: theme.border.strong,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreLabel: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 14 },
  coreValue: { color: theme.ink.primary, fontFamily: font.display, fontSize: 58, lineHeight: 62 },
  pillar: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTopLeft: { top: 40, left: 18 },
  pillarTopRight: { top: 40, right: 18 },
  pillarBottomLeft: { bottom: 34, left: 18 },
  pillarBottomRight: { bottom: 34, right: 18 },
  pillarLabel: { fontFamily: font.bold, fontSize: 10.5 },
  pillarValue: { color: theme.ink.primary, fontFamily: font.extrabold, fontSize: 20 },
  largeMomentum: { marginTop: 20, gap: spacing.md },
  largeCore: {
    minHeight: 148,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.border.strong,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  largePillarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  largePillarCard: {
    width: '48%',
    minHeight: 112,
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 2,
    backgroundColor: theme.surface.card,
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: spacing.md,
  },
  largePillarValue: {
    color: theme.ink.primary,
    fontFamily: font.extrabold,
    fontSize: 20,
    marginTop: spacing.xs,
  },
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
  sectionTitle: { color: theme.ink.primary, fontFamily: 'Georgia', fontSize: 19 },
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
