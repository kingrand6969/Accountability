import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteMemory,
  formatBytes,
  getMemoriesUsage,
  listMemories,
  saveImageToMemories,
  saveVideoToMemories,
  QUOTA_BYTES,
  type Memory,
} from '../memories/api';
import { confirmDestructive } from '../ui/confirm';
import { showToast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing, shadow } from '../ui/theme';

const GRID_GAP = 4;
const COLUMNS = 3;

export default function Memories() {
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<Memory[]>([]);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); // one upload at a time
  const [viewer, setViewer] = useState<Memory | null>(null);

  const tile = Math.floor((Math.min(width, 720) - spacing.lg * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

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

  async function onAdd(kind: 'image' | 'video') {
    if (busy) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to save memories.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'image' ? ['images'] : ['videos'],
      quality: 0.8,
    });
    if (res.canceled) return;
    setBusy(true);
    try {
      if (kind === 'image') await saveImageToMemories(res.assets[0].uri);
      else await saveVideoToMemories(res.assets[0].uri);
      showToast('Saved to Memories ✨');
      await load();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

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
        } catch (e) {
          Alert.alert('Could not delete', String((e as Error).message ?? e));
        }
      },
    );
  }

  function onOpen(m: Memory) {
    if (m.kind === 'video') WebBrowser.openBrowserAsync(m.url).catch(() => {});
    else setViewer(m);
  }

  const pct = Math.min(100, Math.round((used / QUOTA_BYTES) * 100));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        key={COLUMNS}
        numColumns={COLUMNS}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={{ gap: GRID_GAP }}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.meterCard}>
              <View style={styles.meterTopRow}>
                <Ionicons name="images" size={18} color={colors.primary} />
                <Text style={styles.meterTitle}>Your storage</Text>
                <Text style={styles.meterText}>
                  {formatBytes(used)} of {formatBytes(QUOTA_BYTES)}
                </Text>
              </View>
              <View style={styles.meterTrack}>
                <View style={[styles.meterFill, { width: `${Math.max(pct, 1)}%` }]} />
              </View>
              <Text style={styles.meterHint}>
                Photos are compressed before saving, so 1 GB fits roughly 3,000 of them.
              </Text>
            </View>
            <View style={styles.addRow}>
              <Pressable
                style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                onPress={() => onAdd('image')}
                disabled={busy}
                accessibilityLabel="Save a photo to memories"
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Ionicons name="image-outline" size={17} color={colors.onPrimary} />
                )}
                <Text style={styles.addText}>Add photo</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.addBtn, styles.addBtnAlt, pressed && styles.pressed]}
                onPress={() => onAdd('video')}
                disabled={busy}
                accessibilityLabel="Save a video to memories"
              >
                <Ionicons name="videocam-outline" size={17} color={colors.primary} />
                <Text style={[styles.addText, { color: colors.primary }]}>Add video</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="images-outline"
            title="No memories yet"
            subtitle="Save photos and videos here — or tap the bookmark on any photo in your feed."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              { width: tile, height: tile, marginBottom: GRID_GAP },
              pressed && styles.pressed,
            ]}
            onPress={() => onOpen(item)}
            onLongPress={() => onDelete(item)}
            accessibilityLabel={item.kind === 'video' ? 'Open video' : 'Open photo'}
          >
            {item.kind === 'video' ? (
              <View style={[styles.tileVideo, { width: tile, height: tile }]}>
                <Ionicons name="play-circle" size={34} color="#fff" />
                <Text style={styles.tileVideoText}>{formatBytes(item.bytes)}</Text>
              </View>
            ) : (
              <Image
                source={{ uri: item.url }}
                style={{ width: tile, height: tile, borderRadius: radius.sm }}
                contentFit="cover"
                transition={120}
              />
            )}
            <Pressable
              style={styles.tileDelete}
              onPress={() => onDelete(item)}
              hitSlop={8}
              accessibilityLabel="Delete this memory"
            >
              <Ionicons name="close" size={13} color="#fff" />
            </Pressable>
          </Pressable>
        )}
      />

      {/* full-screen photo viewer */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewerBackdrop} onPress={() => setViewer(null)}>
          {viewer ? (
            <Image
              source={{ uri: viewer.url }}
              style={styles.viewerImage}
              contentFit="contain"
              transition={150}
            />
          ) : null}
          <View style={styles.viewerClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </View>
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
  list: {
    padding: spacing.lg,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },
  header: { gap: spacing.md, marginBottom: spacing.md },
  meterCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  meterTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meterTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text, flex: 1 },
  meterText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  meterHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 44,
  },
  addBtnAlt: { backgroundColor: colors.primarySoft },
  addText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 14 },
  pressed: { opacity: 0.8 },
  tileVideo: {
    borderRadius: radius.sm,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tileVideoText: { color: 'rgba(255,255,255,0.7)', fontFamily: font.medium, fontSize: 11 },
  tileDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
