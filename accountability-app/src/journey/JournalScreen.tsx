import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listItemsForDay } from '../timeline/api';
import { toLocalDateString } from '../timeline/datetime';
import type { TimelineItem } from '../timeline/types';
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
import { hasCompletionProof, timelinePillar } from './data';
import { getJourneyEncouragement, type JourneyEncouragement } from './encouragement';
import { JourneyEncouragementBar } from './JourneyEncouragementBar';

type JournalFilter = 'all' | 'body' | 'focus' | 'people';

const FILTERS: { key: JournalFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'body', label: 'Body' },
  { key: 'focus', label: 'Focus' },
  { key: 'people', label: 'People' },
];

function iconFor(item: TimelineItem) {
  const pillar = timelinePillar(item.type);
  if (pillar === 'body') return 'walk-outline' as const;
  if (pillar === 'focus') return 'radio-button-on-outline' as const;
  return 'people-outline' as const;
}

function journalTitle(day: Date, count: number) {
  const today = toLocalDateString(day) === toLocalDateString(new Date());
  if (!today) return count > 0 ? 'You showed up.' : 'A day to remember.';
  return count > 0 ? 'Show up for yourself.' : 'What will you show up for?';
}

export default function JournalScreen() {
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [mode, theme]);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string; filter?: string }>();
  const requestGeneration = useRef(0);
  const [day, setDay] = useState(() =>
    typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? new Date(`${params.date}T12:00:00`)
      : new Date(),
  );
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<JournalFilter>(() => {
    const candidate = params.filter;
    return candidate === 'body' || candidate === 'focus' || candidate === 'people' || candidate === 'all'
      ? candidate
      : 'all';
  });
  const [error, setError] = useState<string | null>(null);
  const [encouragement, setEncouragement] = useState<JourneyEncouragement | null>(null);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setItems([]);
    setError(null);
    try {
      const from = new Date(day); from.setHours(0, 0, 0, 0);
      const to = new Date(day); to.setHours(23, 59, 59, 999);
      const [nextItems, nextEncouragement] = await Promise.all([
        listItemsForDay(day),
        getJourneyEncouragement(from, to).catch(() => null),
      ]);
      if (generation === requestGeneration.current) {
        setItems(nextItems);
        setEncouragement(nextEncouragement);
      }
    } catch {
      if (generation === requestGeneration.current) {
        setError('Could not load this journal day. Pull down to try again.');
      }
    } finally {
      if (generation === requestGeneration.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [day]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    setLoading(true);
    if (alive) load();
    return () => {
      alive = false;
      requestGeneration.current += 1;
    };
  }, [load]));

  const visible = useMemo(
    () => filter === 'all' ? items : items.filter((item) => timelinePillar(item.type) === filter),
    [filter, items],
  );
  const proofCount = visible.filter(hasCompletionProof).length;

  function shiftDay(delta: number) {
    setDay((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  return (
    <View style={styles.screen}>
      <EditorialBackdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.ink.action} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.dateRow}>
          <Pressable onPress={() => shiftDay(-1)} style={styles.navButton} accessibilityLabel="Previous journal day">
            <Ionicons name="chevron-back" size={20} color={theme.ink.primary} />
          </Pressable>
          <Text style={styles.date}>
            {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
          <Pressable onPress={() => shiftDay(1)} style={styles.navButton} accessibilityLabel="Next journal day">
            <Ionicons name="chevron-forward" size={20} color={theme.ink.primary} />
          </Pressable>
        </View>
        <JourneyTabs active="journal" />

        <View style={styles.hero}>
          <ImageBackground
            source={require('../../assets/images/auth-mountain-hero.png')}
            resizeMode="cover"
            style={styles.heroImage}
            imageStyle={styles.heroImageStyle}
            accessibilityLabel="Mountain landscape representing your daily journey"
          >
            <View style={styles.heroScrim} />
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{journalTitle(day, items.length)}</Text>
              <Text style={styles.handwriting}>Discipline today, freedom tomorrow.</Text>
            </View>
          </ImageBackground>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={({ pressed }) => [styles.filter, filter === item.key && styles.filterActive, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityState={{ selected: filter === item.key }}
            >
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={theme.ink.action} style={styles.loader} />
        ) : error ? (
          <Pressable
            onPress={() => {
              setLoading(true);
              load();
            }}
            style={({ pressed }) => [styles.errorCard, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Retry loading this journal day"
          >
            <Ionicons name="refresh-outline" size={20} color={theme.ink.action} />
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : (
          <View style={styles.recordCard}>
            <View style={styles.column}>
              <Text style={styles.columnHeading}>{"TODAY'S PROMISE"}</Text>
              {visible.length === 0 ? (
                <Text style={styles.emptyText}>No promise recorded for this view.</Text>
              ) : visible.slice(0, 5).map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/item/${item.id}` as never)}
                  style={({ pressed }) => [styles.promiseRow, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <View style={[styles.checkbox, !hasCompletionProof(item) && styles.checkboxOpen]}>
                    {hasCompletionProof(item) ? <Ionicons name="checkmark" size={11} color={theme.ink.inverse} /> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.itemMeta}>{timelinePillar(item.type)} - {new Date(item.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <View style={styles.divider} />
            <View style={styles.column}>
              <Text style={styles.columnHeading}>PROOF</Text>
              {visible.length === 0 ? (
                <Text style={styles.emptyText}>Proof appears when you complete or record it.</Text>
              ) : visible.slice(0, 5).map((item) => (
                <View key={item.id} style={styles.proofRow}>
                  <View style={styles.proofIcon}>
                    <Ionicons name={iconFor(item)} size={15} color={theme.ink.action} />
                  </View>
                  <Text style={styles.proofText} numberOfLines={1}>
                    {hasCompletionProof(item) ? (item.type === 'activity' ? 'Recorded' : 'Completed') : 'No proof yet'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.proofSummary}>
          <Text style={styles.handwritingSmall}>Progress is proof of your promise.</Text>
          <Text style={styles.proofCount}>{proofCount}/{visible.length} proof recorded</Text>
        </View>

        <JourneyEncouragementBar
          value={encouragement}
          onPress={() => encouragement && router.push({ pathname: '/post/[id]', params: { id: encouragement.postId, encouragement: '1' } } as never)}
        />

        <Pressable
          onPress={() => router.push('/add' as never)}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color={theme.ink.inverse} />
          <Text style={styles.addText}>{"Add today's promise"}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: AppThemeColors, mode: AppThemeMode) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 120 },
  dateRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  date: { color: mode === 'light' ? legacyColors.inkSoft : theme.ink.muted, fontFamily: font.medium, fontSize: 12 },
  hero: { marginTop: 14, height: 254, borderRadius: 18, overflow: 'hidden' },
  heroImage: { flex: 1, justifyContent: 'flex-end' },
  heroImageStyle: { borderRadius: 18 },
  heroScrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(2,15,34,0.23)' },
  heroCopy: { padding: 18 },
  heroTitle: { color: '#FFFFFF', fontFamily: 'Georgia', fontSize: 35, lineHeight: 37, maxWidth: 300 },
  handwriting: { color: '#DCE8FF', fontFamily: font.medium, fontSize: 15, fontStyle: 'italic', marginTop: 7 },
  filters: { paddingVertical: 12, gap: 8 },
  filter: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: mode === 'light' ? 'rgba(8,26,58,0.12)' : theme.border.subtle, backgroundColor: mode === 'light' ? 'rgba(255,255,255,0.58)' : theme.surface.card },
  filterActive: { backgroundColor: theme.ink.action, borderColor: theme.border.action },
  filterText: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 12 },
  filterTextActive: { color: theme.ink.inverse },
  pressed: { opacity: 0.68 },
  loader: { marginVertical: 48 },
  errorCard: { minHeight: 72, borderRadius: 14, backgroundColor: mode === 'light' ? '#FFFFFF' : theme.status.dangerSoft, borderWidth: 1, borderColor: mode === 'light' ? '#F3B4B4' : theme.border.danger, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: theme.status.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  recordCard: { minHeight: 226, borderRadius: 16, backgroundColor: mode === 'light' ? 'rgba(255,255,255,0.86)' : theme.surface.card, borderWidth: 1, borderColor: mode === 'light' ? 'rgba(8,26,58,0.10)' : theme.border.subtle, flexDirection: 'row', padding: 14 },
  column: { flex: 1 },
  columnHeading: { color: theme.ink.primary, fontFamily: font.extrabold, fontSize: 9.5, letterSpacing: 0.9, marginBottom: 8 },
  divider: { width: 1, backgroundColor: mode === 'light' ? 'rgba(8,26,58,0.10)' : theme.border.subtle, marginHorizontal: 10 },
  promiseRow: { minHeight: 42, flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  checkbox: { width: 17, height: 17, borderRadius: 4, backgroundColor: theme.ink.action, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxOpen: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.ink.muted },
  flex: { flex: 1 },
  itemTitle: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 11.5 },
  itemMeta: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 8.5, textTransform: 'capitalize', marginTop: 2 },
  proofRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6 },
  proofIcon: { width: 25, height: 25, borderRadius: 13, backgroundColor: mode === 'light' ? legacyColors.primarySoft : theme.surface.muted, alignItems: 'center', justifyContent: 'center' },
  proofText: { flex: 1, color: theme.ink.primary, fontFamily: font.medium, fontSize: 10.5 },
  emptyText: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 11, lineHeight: 16 },
  proofSummary: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  handwritingSmall: { flex: 1, color: theme.ink.action, fontFamily: font.medium, fontStyle: 'italic', fontSize: 12.5 },
  proofCount: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 10.5 },
  encouragement: { minHeight: 72, borderRadius: 15, padding: 10, backgroundColor: mode === 'light' ? '#F0E9DC' : theme.surface.card, borderWidth: 1, borderColor: mode === 'light' ? 'rgba(99,79,46,0.14)' : theme.border.subtle, flexDirection: 'row', alignItems: 'center', gap: 10 },
  encouragementIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: mode === 'light' ? legacyColors.primarySoft : theme.surface.muted, alignItems: 'center', justifyContent: 'center' },
  encourageTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 11.5 },
  encourageMeta: { color: mode === 'light' ? legacyColors.inkSoft : theme.ink.muted, fontFamily: font.regular, fontSize: 9.5, lineHeight: 13, marginTop: 2 },
  addButton: { minHeight: 52, marginTop: 12, borderRadius: 12, backgroundColor: theme.ink.action, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  addText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 14 },
});
