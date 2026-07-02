import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listItemsForDay, deleteItem } from '../../timeline/api';
import { cancelReminder } from '../../notifications/api';
import { TimelineCard } from '../../timeline/TimelineCard';
import { HourGrid } from '../../timeline/HourGrid';
import { toLocalDateString } from '../../timeline/datetime';
import { AdBanner } from '../../pro/AdBanner';
import { HomeHeader } from '../../home/HomeHeader';
import { useIsPro } from '../../pro/ProProvider';
import type { TimelineItem } from '../../timeline/types';
import { colors, font, radius, spacing } from '../../ui/theme';

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
    Alert.alert('Delete this?', `“${item.title}” will be removed from your day.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelReminder(item.reminder_id);
            await deleteItem(item.id);
            setItems((cur) => cur.filter((i) => i.id !== item.id));
          } catch (e) {
            Alert.alert('Could not delete', String((e as Error).message ?? e));
          }
        },
      },
    ]);
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

  return (
    <View style={styles.screen}>
      <HomeHeader />
      <View style={styles.header}>
        <Pressable
          onPress={() => shiftDay(-1)}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          hitSlop={8}
          accessibilityLabel="Previous day"
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
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
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : view === 'hours' ? (
        <HourGrid items={items} onPressHour={openAddAtHour} onDelete={onDelete} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={
            items.length === 0 ? styles.emptyWrap : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="sunny-outline" size={40} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>Nothing planned</Text>
              <Text style={styles.emptySub}>
                Tap Add to put something on your day.
              </Text>
            </View>
          }
          renderItem={({ item }) => <TimelineCard item={item} onDelete={onDelete} />}
        />
      )}

      <Pressable
        style={({ pressed }) => [
          styles.fab,
          // sit above the ad banner only when one is showing
          { bottom: isPro ? 20 : 66 },
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
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  navBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayTitle: { fontSize: 20, fontFamily: font.bold, color: colors.text },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
    marginBottom: spacing.sm,
  },
  toggleBtn: { paddingVertical: 7, paddingHorizontal: 22, borderRadius: 8 },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 14 },
  toggleTextActive: { color: colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: 6 },
  emptyWrap: { flexGrow: 1 },
  listContent: { padding: spacing.lg, gap: 10, paddingBottom: 96 },
  emptyTitle: { fontSize: 17, fontFamily: font.bold, color: colors.text, marginTop: 4 },
  emptySub: { color: colors.textMuted, fontFamily: font.regular, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  fabText: { color: '#fff', fontSize: 16, fontFamily: font.bold },
});
