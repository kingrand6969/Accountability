import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteMemory,
  formatBytes,
  getMemoriesUsage,
  listMemories,
  QUOTA_BYTES,
  type Memory,
} from '../memories/api';
import { confirmDestructive } from '../ui/confirm';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing } from '../ui/theme';

const GRID_GAP = 4;
const COLUMNS = 3;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Memories: an automatic album of moments saved when posting — view-only.
 *  Photos get here via the "Add to Memories" checkbox on the composer or the
 *  bookmark on any post photo. */
export default function Memories() {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Memory[]>([]);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<Memory | null>(null);

  const tile = Math.floor(
    (Math.min(width, 720) - spacing.lg * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS,
  );

  const load = useCallback(async () => {
    try {
      const [list, usage] = await Promise.all([listMemories(), getMemoriesUsage()]);
      setItems(list);
      setUsed(usage);
    } catch (e) {
      Alert.alert('Could not load memories', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const byDay = new Map<string, Memory[]>();
    for (const m of items) {
      const key = dayLabel(m.created_at);
      const arr = byDay.get(key);
      if (arr) arr.push(m);
      else byDay.set(key, [m]);
    }
    return [...byDay.entries()]; // items arrive newest-first, so days do too
  }, [items]);

  function onDelete(m: Memory) {
    confirmDestructive(
      'Delete this memory?',
      'It will be removed from your storage. This can’t be undone.',
      'Delete',
      async () => {
        try {
          await deleteMemory(m);
          setItems((cur) => cur.filter((x) => x.id !== m.id));
          setUsed((u) => Math.max(0, u - m.bytes));
          setViewer(null);
        } catch (e) {
          Alert.alert('Could not delete', String((e as Error).message ?? e));
        }
      },
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.usageLine}>
          {formatBytes(used)} of {formatBytes(QUOTA_BYTES)} used
        </Text>

        {sections.length === 0 ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="images-outline"
              title="No memories yet"
              subtitle='When you post a photo, tick "Add to Memories" — your moments collect here with their date and place.'
            />
          </View>
        ) : (
          sections.map(([day, mems]) => (
            <View key={day} style={styles.section}>
              <Text style={styles.dayHeader}>{day}</Text>
              <View style={styles.grid}>
                {mems.map((m) => (
                  <Pressable
                    key={m.id}
                    style={({ pressed }) => [
                      { width: tile, height: tile },
                      pressed && styles.pressed,
                    ]}
                    onPress={() => setViewer(m)}
                    onLongPress={() => onDelete(m)}
                    accessibilityLabel={`View memory from ${day}`}
                  >
                    <Image
                      source={{ uri: m.url }}
                      style={{ width: tile, height: tile, borderRadius: radius.sm }}
                      contentFit="cover"
                      transition={120}
                    />
                    {m.location ? (
                      <View style={styles.tilePin}>
                        <Ionicons name="location" size={10} color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* full-screen viewer with the moment's details */}
      <Modal
        visible={!!viewer}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {viewer ? (
            <>
              <Image
                source={{ uri: viewer.url }}
                style={styles.viewerImage}
                contentFit="contain"
                transition={150}
              />
              <View style={styles.viewerMeta} pointerEvents="none">
                <Text style={styles.viewerDate}>
                  {dayLabel(viewer.created_at)} · {timeLabel(viewer.created_at)}
                </Text>
                {viewer.location ? (
                  <View style={styles.viewerPlaceRow}>
                    <Ionicons name="location-outline" size={13} color="#e2e8f0" />
                    <Text style={styles.viewerPlace}>{viewer.location}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.viewerActions}>
                <Pressable
                  style={({ pressed }) => [styles.viewerBtn, pressed && styles.pressed]}
                  onPress={() => onDelete(viewer)}
                  accessibilityLabel="Delete this memory"
                >
                  <Ionicons name="trash-outline" size={20} color="#fff" />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.viewerBtn, pressed && styles.pressed]}
                  onPress={() => setViewer(null)}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
    paddingBottom: 48,
  },
  usageLine: {
    fontFamily: font.medium,
    fontSize: 12.5,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  emptyWrap: { flex: 1, justifyContent: 'center' },
  section: { marginBottom: spacing.lg },
  dayHeader: {
    fontFamily: font.bold,
    fontSize: 14.5,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  tilePin: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '78%' },
  viewerMeta: { position: 'absolute', bottom: 40, alignItems: 'center', gap: 4 },
  viewerDate: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  viewerPlaceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewerPlace: { color: '#e2e8f0', fontFamily: font.medium, fontSize: 13 },
  viewerActions: {
    position: 'absolute',
    top: 48,
    right: 20,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  viewerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
