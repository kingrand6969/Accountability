import { useCallback, useMemo, useRef, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { listItemsForDay, deleteItem } from '../../timeline/api';
import { cancelReminder } from '../../notifications/api';
import { TimelineCard } from '../../timeline/TimelineCard';
import { HourGrid } from '../../timeline/HourGrid';
import { toLocalDateString } from '../../timeline/datetime';
import { HomeHeader } from '../../home/HomeHeader';
import { confirmDestructive } from '../../ui/confirm';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { contentMaxWidth } from '../../ui/responsive';
import { resolveTodayRouteSeed } from '../../navigation/scheduleRouteState';
import type { TimelineItem } from '../../timeline/types';
import { useAppTheme } from '../../ui/AppThemeProvider';
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../../ui/theme';
import JourneyJournal from '../../journey/JournalScreen';

/** Quick-add shortcuts shown on an empty day — each opens Add pre-set. */
const QUICK_ADD = [
  { type: 'task', icon: 'checkmark-circle', label: 'Task', tint: '#6F9F00' },
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

function TodayLegacy() {
  const params = useLocalSearchParams<{ date?: string }>();
  const seed = resolveTodayRouteSeed(params.date, new Date());

  return <TodayLegacyDay key={seed.key} initialDay={seed.day} />;
}

function TodayLegacyDay({ initialDay }: { initialDay: Date }) {
  const router = useRouter();
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => todayPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(initialDay);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'list' | 'hours'>('list');

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
            <Ionicons name="sunny" size={26} color={palette.action} />
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
            <Ionicons name="chevron-back" size={22} color={palette.action} />
          </Pressable>
          <Pressable
            onPress={() => setDay(new Date())}
            accessibilityLabel="Jump to today"
            hitSlop={14}
          >
            <Text style={styles.dayTitle}>{dayLabel(day)}</Text>
          </Pressable>
          <Pressable
            onPress={() => shiftDay(1)}
            style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
            hitSlop={8}
            accessibilityLabel="Next day"
          >
            <Ionicons name="chevron-forward" size={22} color={palette.action} />
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
              hitSlop={{ top: 9, bottom: 9 }}
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
          <ActivityIndicator size="large" color={palette.action} />
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
              ? [styles.emptyWrap, { paddingBottom: 150 }]
              : [styles.listContent, { maxWidth: colMax }]
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={palette.action}
            />
          }
          ListEmptyComponent={emptyState}
          renderItem={({ item }) => <TimelineCard item={item} onDelete={onDelete} />}
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          // sit at the centered column's edge, clear of the floating tab bar
          {
            right: Math.max(spacing.xl, (width - colMax) / 2 + spacing.xl),
            bottom: 104,
          },
          pressed && styles.fabPressed,
        ]}
        onPress={() => router.push('/add')}
        accessibilityLabel="Add to your day"
      >
        <Ionicons name="add" size={20} color={palette.onAction} />
        <Text style={styles.fabText}>Add</Text>
      </Pressable>
    </View>
  );
}

function todayPalette(theme: AppThemeColors) {
  return {
    ink: theme.ink.primary,
    inkSoft: theme.ink.muted,
    action: theme.ink.action,
    toggle: theme.surface.card,
    glassBorder: theme.border.subtle,
    selected: theme.surface.raised,
    sunSoft: theme.surface.muted,
    quickSurface: theme.surface.card,
    quickBorder: theme.border.subtle,
    fabShadow: theme.surface.canvas,
    onAction: theme.ink.inverse,
  } as const;
}

const createStyles = (theme: AppThemeColors) => {
  const palette = todayPalette(theme);

  return StyleSheet.create({
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
  dayTitle: { fontSize: 20, fontFamily: font.bold, color: palette.ink },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: palette.toggle,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.sm,
  },
  toggleBtn: { paddingVertical: 7, paddingHorizontal: 22, borderRadius: 8 },
  toggleActive: { backgroundColor: palette.selected },
  toggleText: { color: palette.inkSoft, fontFamily: font.semibold, fontSize: 14 },
  toggleTextActive: { color: palette.action },
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
    backgroundColor: palette.sunSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 18, fontFamily: font.bold, color: palette.ink },
  emptySub: {
    color: palette.inkSoft,
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
    backgroundColor: palette.quickSurface,
    borderWidth: 1,
    borderColor: palette.quickBorder,
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
  quickLabel: { fontSize: 13, fontFamily: font.semibold, color: palette.ink },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.action,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: palette.fabShadow,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  fabText: { color: palette.onAction, fontSize: 16, fontFamily: font.bold },
  });
};

void TodayLegacy;
export default JourneyJournal;
