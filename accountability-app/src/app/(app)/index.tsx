import { useCallback, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { listItemsForDay, deleteItem } from '../../timeline/api';
import { cancelReminder } from '../../notifications/api';
import { TimelineCard } from '../../timeline/TimelineCard';
import { HourGrid } from '../../timeline/HourGrid';
import { toLocalDateString } from '../../timeline/datetime';
import { AdBanner } from '../../pro/AdBanner';
import type { TimelineItem } from '../../timeline/types';

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
  const [day, setDay] = useState(() => new Date());
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

  async function onDelete(item: TimelineItem) {
    try {
      await cancelReminder(item.reminder_id);
      await deleteItem(item.id);
      setItems((cur) => cur.filter((i) => i.id !== item.id));
    } catch (e) {
      Alert.alert('Could not delete', String((e as Error).message ?? e));
    }
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
      <View style={styles.header}>
        <Pressable onPress={() => shiftDay(-1)} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navText}>◀</Text>
        </Pressable>
        <Pressable onPress={() => setDay(new Date())}>
          <Text style={styles.dayTitle}>{dayLabel(day)}</Text>
        </Pressable>
        <Pressable onPress={() => shiftDay(1)} style={styles.navBtn} hitSlop={8}>
          <Text style={styles.navText}>▶</Text>
        </Pressable>
      </View>

      <View style={styles.toggle}>
        {(['list', 'hours'] as const).map((v) => (
          <Pressable
            key={v}
            style={[styles.toggleBtn, view === v && styles.toggleActive]}
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
          <ActivityIndicator size="large" />
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
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>Nothing planned</Text>
              <Text style={styles.emptySub}>
                Tap ＋ Add to put something on your day.
              </Text>
            </View>
          }
          renderItem={({ item }) => <TimelineCard item={item} onDelete={onDelete} />}
        />
      )}

      <Pressable style={styles.fab} onPress={() => router.push('/add')}>
        <Text style={styles.fabText}>＋ Add</Text>
      </Pressable>

      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  navBtn: { padding: 8 },
  navText: { fontSize: 18, color: '#2563eb' },
  dayTitle: { fontSize: 20, fontWeight: '700' },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#eee',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  toggleBtn: { paddingVertical: 6, paddingHorizontal: 22, borderRadius: 8 },
  toggleActive: { backgroundColor: '#fff' },
  toggleText: { color: '#666', fontWeight: '600' },
  toggleTextActive: { color: '#2563eb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyWrap: { flexGrow: 1 },
  listContent: { padding: 16, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#666', marginTop: 6, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 66,
    backgroundColor: '#2563eb',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
