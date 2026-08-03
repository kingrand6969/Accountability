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
import { colors, font, spacing } from '../ui/theme';
import { JourneyTabs } from './JourneyTabs';
import {
  hasCompletionProof,
  listRecentJourneyItems,
  pillarCompletion,
} from './data';
import { getJourneyEncouragement, type JourneyEncouragement } from './encouragement';
import { JourneyEncouragementBar } from './JourneyEncouragementBar';

const PILLARS = [
  { key: 'body', label: 'Body', icon: 'walk-outline' as const, color: '#9ED438' },
  { key: 'money', label: 'Money', icon: 'cash-outline' as const, color: '#48D6E8' },
  { key: 'focus', label: 'Focus', icon: 'radio-button-on-outline' as const, color: '#7F8EFF' },
  { key: 'people', label: 'People', icon: 'people-outline' as const, color: '#D6DC3E' },
] as const;

export default function MomentumScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    () => PILLARS.map((pillar) => ({ ...pillar, ...pillarCompletion(weekItems, pillar.key) })),
    [weekItems],
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
            <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <JourneyTabs active="momentum" dark />

        {loading ? (
          <ActivityIndicator color="#FFFFFF" style={styles.loader} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={22} color="#AFC1D7" />
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
                            : pillar.key === 'money'
                              ? '/finance'
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
                    onPress={() => router.push((pillar.key === 'body' ? '/body' : pillar.key === 'money' ? '/finance' : pillar.key === 'focus' ? '/today' : '/messages') as never)}
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
                <Ionicons name={nextItem?.type === 'workout' ? 'barbell-outline' : 'arrow-forward'} size={20} color="#9ED438" />
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
                      color={hasCompletionProof(item) ? colors.primary : '#89A8CC'}
                    />
                  </Pressable>
                ))
              )}
            </View>

            <JourneyEncouragementBar
              value={encouragement}
              dark
              onPress={() => encouragement && router.push({ pathname: '/post/[id]', params: { id: encouragement.postId, encouragement: '1' } } as never)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#031A38', overflow: 'hidden' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120, width: '100%', maxWidth: 720, alignSelf: 'center' },
  glowOne: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(0,169,255,0.13)', top: 90, left: -150 },
  glowTwo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(70,94,255,0.12)', top: 220, right: -160 },
  brandRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: '#89A8CC', fontFamily: font.bold, fontSize: 10, letterSpacing: 1.4 },
  greeting: { color: '#FFFFFF', fontFamily: 'Georgia', fontSize: 24, lineHeight: 30 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.68 },
  loader: { marginTop: 96 },
  errorCard: { minHeight: 82, marginTop: 36, borderRadius: 14, padding: 14, backgroundColor: 'rgba(8,43,78,0.94)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: '#D7E3F1', fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  orbit: { height: 308, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  orbitOuter: { position: 'absolute', width: 270, height: 190, borderWidth: 1, borderRadius: 150, borderColor: 'rgba(91,196,255,0.44)', transform: [{ rotate: '-8deg' }] },
  orbitInner: { position: 'absolute', width: 190, height: 190, borderWidth: 1, borderRadius: 100, borderColor: 'rgba(255,255,255,0.30)' },
  core: { width: 126, height: 126, borderRadius: 63, borderWidth: 1, borderColor: 'rgba(255,255,255,0.44)', backgroundColor: 'rgba(3,26,56,0.88)', alignItems: 'center', justifyContent: 'center' },
  coreLabel: { color: '#FFFFFF', fontFamily: font.medium, fontSize: 14 },
  coreValue: { color: '#FFFFFF', fontFamily: font.display, fontSize: 58, lineHeight: 62 },
  pillar: { position: 'absolute', width: 70, height: 70, borderRadius: 35, borderWidth: 2, backgroundColor: '#031A38', alignItems: 'center', justifyContent: 'center' },
  pillarTopLeft: { top: 40, left: 18 },
  pillarTopRight: { top: 40, right: 18 },
  pillarBottomLeft: { bottom: 34, left: 18 },
  pillarBottomRight: { bottom: 34, right: 18 },
  pillarLabel: { fontFamily: font.bold, fontSize: 10.5 },
  pillarValue: { color: '#FFFFFF', fontFamily: font.extrabold, fontSize: 20 },
  largeMomentum: { marginTop: 20, gap: spacing.md },
  largeCore: {
    minHeight: 148,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.44)',
    backgroundColor: 'rgba(3,26,56,0.88)',
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
    backgroundColor: 'rgba(8,43,78,0.94)',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: spacing.md,
  },
  largePillarValue: {
    color: '#FFFFFF',
    fontFamily: font.extrabold,
    fontSize: 20,
    marginTop: spacing.xs,
  },
  nextCard: { minHeight: 60, borderRadius: 14, backgroundColor: 'rgba(8,43,78,0.94)', borderWidth: 1, borderColor: 'rgba(120,178,225,0.19)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  nextCardLargeText: {
    minHeight: 148,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    padding: spacing.md,
  },
  nextIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(158,212,56,0.14)', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  nextKicker: { color: '#89A8CC', fontFamily: font.bold, fontSize: 9.5, letterSpacing: 1 },
  nextTitle: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 13.5, marginTop: 2 },
  startText: { color: '#FFFFFF', backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, fontFamily: font.bold, fontSize: 12 },
  today: { marginTop: 18, borderRadius: 14, backgroundColor: 'rgba(8,43,78,0.78)', padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionHeaderLargeText: { flexDirection: 'column', alignItems: 'flex-start' },
  sectionTitle: { color: '#FFFFFF', fontFamily: 'Georgia', fontSize: 19 },
  sectionMeta: { color: '#89A8CC', fontFamily: font.medium, fontSize: 11 },
  emptyText: { color: '#AFC1D7', fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingVertical: 10 },
  todayRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)', gap: 9 },
  timelineDot: { width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: '#89A8CC' },
  timelineDotActive: { borderColor: '#9ED438', backgroundColor: '#9ED438' },
  timeText: { width: 56, color: '#89A8CC', fontFamily: font.medium, fontSize: 10.5 },
  itemTitle: { flex: 1, color: '#FFFFFF', fontFamily: font.medium, fontSize: 13 },
  encouragement: { minHeight: 64, marginTop: 12, padding: 10, borderRadius: 14, backgroundColor: 'rgba(10,57,95,0.95)', flexDirection: 'row', alignItems: 'center', gap: 10 },
  encourageAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  encourageName: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 12.5 },
  encourageText: { color: '#AFC1D7', fontFamily: font.regular, fontSize: 11, lineHeight: 15, marginTop: 2 },
});
