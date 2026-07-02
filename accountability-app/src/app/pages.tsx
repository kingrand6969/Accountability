import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listPages, followPage, PAGE_CATEGORIES, type Page } from '../pages/api';
import { showToast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing, shadow } from '../ui/theme';

type Row = { kind: 'header'; key: string; title: string } | { kind: 'page'; key: string; page: Page };

function categoryLabel(value: string): string | null {
  return PAGE_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

export default function Pages() {
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // pages with a follow request in flight — blocks double-taps
  const followsInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setPages(await listPages());
    } catch (e) {
      Alert.alert('Could not load pages', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onFollow(page: Page) {
    if (followsInFlight.current.has(page.id)) return;
    followsInFlight.current.add(page.id);
    try {
      await followPage(page.id);
      showToast(`Following ${page.name}`);
      await load();
    } catch (e) {
      Alert.alert('Could not follow page', String((e as Error).message ?? e));
    } finally {
      followsInFlight.current.delete(page.id);
    }
  }

  function openPage(page: Page) {
    router.push(`/page/${page.id}` as never);
  }

  const following = pages.filter((p) => p.is_following);
  const mine = pages.filter((p) => p.is_owner && !p.is_following);
  const discover = pages.filter((p) => !p.is_following && !p.is_owner);
  const rows: Row[] = [
    ...(following.length > 0
      ? [{ kind: 'header', key: 'h-following', title: 'Following' } as Row, ...following.map(
          (p): Row => ({ kind: 'page', key: p.id, page: p }),
        )]
      : []),
    ...(mine.length > 0
      ? [{ kind: 'header', key: 'h-mine', title: 'My pages' } as Row, ...mine.map(
          (p): Row => ({ kind: 'page', key: p.id, page: p }),
        )]
      : []),
    ...(discover.length > 0
      ? [{ kind: 'header', key: 'h-discover', title: 'Discover' } as Row, ...discover.map(
          (p): Row => ({ kind: 'page', key: p.id, page: p }),
        )]
      : []),
  ];

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
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={rows.length === 0 ? styles.emptyWrap : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <EmptyState
              icon="storefront-outline"
              title="No pages yet"
              subtitle="Give your gym, brand, or community a home."
              actionTitle="Create the first page"
              onAction={() => router.push('/page-new' as never)}
            />
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text style={styles.sectionHeader}>{item.title}</Text>;
          }
          const p = item.page;
          const meta = [
            `@${p.handle} · ${p.follower_count} follower${p.follower_count === 1 ? '' : 's'}`,
            categoryLabel(p.category),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => openPage(p)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${p.name}`}
            >
              {p.avatar_url ? (
                <Image source={{ uri: p.avatar_url }} style={styles.avatarImage} />
              ) : (
                <View style={styles.iconCircle}>
                  <Ionicons name="storefront-outline" size={20} color={colors.primary} />
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
              {p.is_owner ? (
                <View style={styles.ownerChip}>
                  <Ionicons name="ribbon-outline" size={12} color={colors.primary} />
                  <Text style={styles.ownerChipText}>Owner</Text>
                </View>
              ) : p.is_following ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.followBtn, pressed && styles.pressed]}
                  onPress={() => onFollow(p)}
                  hitSlop={6}
                  accessibilityLabel={`Follow ${p.name}`}
                >
                  <Text style={styles.followText}>Follow</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
      {rows.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
          onPress={() => router.push('/page-new' as never)}
          accessibilityRole="button"
          accessibilityLabel="Create page"
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.fabText}>Create page</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  emptyWrap: { flexGrow: 1 },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  sectionHeader: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 64,
    ...shadow.card,
  },
  rowPressed: { opacity: 0.85 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface },
  rowBody: { flex: 1, gap: 2 },
  name: { fontFamily: font.bold, fontSize: 15.5, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  ownerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  ownerChipText: { fontFamily: font.bold, fontSize: 12, color: colors.primary },
  followBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 36,
    justifyContent: 'center',
  },
  followText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 13.5 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  pressed: { opacity: 0.8 },
});
