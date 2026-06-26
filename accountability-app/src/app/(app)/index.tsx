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
import { typeMeta, formatTime } from '../../timeline/format';
import { cancelReminder } from '../../notifications/api';
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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
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
          renderItem={({ item }) => {
            const meta = typeMeta(item.type);
            return (
              <View style={styles.card}>
                <Text style={styles.time}>{formatTime(item.starts_at)}</Text>
                <Text style={styles.emoji}>{meta.emoji}</Text>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>
                    {item.title}
                    {item.reminder_id ? <Text style={styles.bell}> 🔔</Text> : null}
                  </Text>
                  {item.note ? <Text style={styles.cardNote}>{item.note}</Text> : null}
                </View>
                <Pressable onPress={() => onDelete(item)} hitSlop={8}>
                  <Text style={styles.delete}>✕</Text>
                </Pressable>
              </View>
            );
          }}
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  navBtn: { padding: 8 },
  navText: { fontSize: 18, color: '#2563eb' },
  dayTitle: { fontSize: 20, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyWrap: { flexGrow: 1 },
  listContent: { padding: 16, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#666', marginTop: 6, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
  },
  time: { fontSize: 14, fontWeight: '700', color: '#2563eb', width: 46 },
  emoji: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  bell: { fontSize: 13 },
  cardNote: { color: '#666', marginTop: 2 },
  delete: { color: '#999', fontSize: 18, paddingHorizontal: 4 },
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
