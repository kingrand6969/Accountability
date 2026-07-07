import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listItemsForDay, deleteItem } from '../../timeline/api';
import { cancelReminder } from '../../notifications/api';
import { TimelineCard } from '../../timeline/TimelineCard';
import { HourGrid } from '../../timeline/HourGrid';
import { toLocalDateString } from '../../timeline/datetime';
import { AdBanner } from '../../pro/AdBanner';
import { HomeHeader } from '../../home/HomeHeader';
import { useIsPro } from '../../pro/ProProvider';
import { confirmDestructive } from '../../ui/confirm';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { contentMaxWidth } from '../../ui/responsive';
import type { TimelineItem } from '../../timeline/types';
import { font, radius, spacing } from '../../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#4f46e5';

/** Quick-add shortcuts shown on an empty day — each opens Add pre-set. */
const QUICK_ADD = [
  { type: 'task', icon: 'checkmark-circle', label: 'Task', tint: '#4f46e5' },
  { type: 'event', icon: 'calendar', label: 'Event', tint: '#0891b2' },
  { type: 'grocery', icon: 'cart', label: 'Groceries', tint: '#16a34a' },
] as const;

function dayLabel(day: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function Today() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const [day, setDay] = useState(() => new Date());
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'hours'>('list');

  // Jump to a specific day (e.g. tapped on the Track hub's weekday strip).
  useEffect(() => {
    if (typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      setDay(new Date(`${params.date}T12:00:00`));
    }
  }, [params.date]);

  const load = useCallback(async () => {
    try {
      setItems(await listItemsForDay(day));
    } catch (e) {
      Alert.alert('Could not load your day', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [day]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  function shiftDay(delta: number) {
    setDay((prev) => {
      const n = new Date(prev);
      n.setDate(n.getDate() + delta);
      return n;
    });
  }

  function onDelete(item: TimelineItem) {
    confirmDestructive(
      'Delete this?',
      `“${item.title}” will be removed from your day.`,
      'Delete',
      async () => {
        try {
          await cancelReminder(item.reminder_id);
          await deleteItem(item.id);
          setItems((cur) => cur.filter((i) => i.id !== item.id));
        } catch (e) {
          Alert.alert('Could not delete', String((e as Error).message ?? e));
        }
      },
    );
  }

  function openAddAtHour(hour: number) {
    router.push({
      pathname: '/add',
      params: {
        date: toLocalDateString(day),
        time: `${hour.toString().padStart(2, '0')}:00`,
      },
    });
  }

  const emptyState = (
    <GlassCard blurTarget={bgRef} style={styles.emptyCard}>
        <View style={styles.emptyPad}>
          <View style={styles.sunWrap}>
            <Ionicons name="sunny" size={26} color={ACCENT} />
          </View>
          <Text style={styles.emptyTitle}>Nothing planned yet</Text>
          <Text style={styles.emptySub}>Add a task, an event, or groceries to get your day going.</Text>
          <View style={styles.quickRow}>
            {QUICK_ADD.map((q) => (
              <Pressable
                key={q.type}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
                onPress={() =>
                  router.push({
                    pathname: '/add',
                    params: { date: toLocalDateString(day), type: q.type },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Add ${q.label.toLowerCase()}`}
              >
                <View style={[styles.quickIcon, { backgroundColor: `${q.tint}18` }]}>
                  <Ionicons name={q.icon} size={20} color={q.tint} />
                </View>
                <Text style={styles.quickLabel}>{q.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
    </GlassCard>
  );

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />

      <View style={[styles.topCol, { maxWidth: colMax, paddingTop: insets.top }]}>
        <HomeHeader />
        <View style={styles.header}>
          <Pressable
            onPress={() => shiftDay(-1)}
            style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel="Previous day"
          >
            <Ionicons name="chevron-back" size={22} color={ACCENT} />
          </Pressable>
          <Pressable onPress={() => setDay(new Date())} accessibilityLabel="Jump to today">
            <Text style={styles.dayTitle}>{dayLabel(day)}</Text>
          </Pressable>
          <Pressable
            onPress={() => shiftDay(1)}
            style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel="Next day"
          >
            <Ionicons name="chevron-forward" size={22} color={ACCENT} />
          </Pressable>
        </View>

        <View style={styles.toggle}>
          {(['list', 'hours'] as const).map((v) => (
            <Pressable
              key={v}
              style={({ pressed }) => [
                styles.toggleBtn,
                view === v && styles.toggleActive,
                pressed && styles.pressed,
              ]}
              onPress={() => setView(v)}
            >
              <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
                {v === 'list' ? 'List' : 'Hours'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={ACCENT} />
        </View>
      ) : view === 'hours' ? (
        <View style={[styles.flexCol, { maxWidth: colMax }]}>
          <HourGrid items={items} onPressHour={openAddAtHour} onDelete={onDelete} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          style={styles.flexFill}
          contentContainerStyle={
            items.length === 0
              ? [styles.emptyWrap, { paddingBottom: isPro ? 150 : 200 }]
              : [styles.listContent, { maxWidth: colMax }]
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={ACCENT}
            />
          }
          ListEmptyComponent={emptyState}
          renderItem={({ item }) => <TimelineCard item={item} onDelete={onDelete} />}
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          // sit at the centered column's edge; clear the floating tab bar (higher when an ad shows)
          {
            right: Math.max(spacing.xl, (width - colMax) / 2 + spacing.xl),
            bottom: isPro ? 104 : 150,
          },
          pressed && styles.fabPressed,
        ]}
        onPress={() => router.push('/add')}
        accessibilityLabel="Add to your day"
      >
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.fabText}>Add</Text>
      </Pressable>

      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  pressed: { opacity: 0.7 },
  topCol: { width: '100%', alignSelf: 'center' },
  flexFill: { flex: 1 },
  flexCol: { flex: 1, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  navBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTitle: { fontSize: 20, fontFamily: font.bold, color: INK },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.sm,
  },
  toggleBtn: { paddingVertical: 7, paddingHorizontal: 22, borderRadius: 8 },
  toggleActive: { backgroundColor: '#fff' },
  toggleText: { color: INK_SOFT, fontFamily: font.semibold, fontSize: 14 },
  toggleTextActive: { color: ACCENT },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: 6 },
  // centre the quick-start card in the space ABOVE the floating Add button,
  // and let it scroll if the viewport is too short to fit it
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  listContent: { padding: spacing.lg, gap: 10, paddingBottom: 170, width: '100%', alignSelf: 'center' },
  // quick-start empty state
  emptyCard: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  emptyPad: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  sunWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(79,70,229,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 18, fontFamily: font.bold, color: INK },
  emptySub: {
    color: INK_SOFT,
    fontFamily: font.regular,
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignSelf: 'stretch',
  },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 13, fontFamily: font.semibold, color: INK },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#4338ca',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  fabText: { color: '#fff', fontSize: 16, fontFamily: font.bold },
});
