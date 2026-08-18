import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { listPages, followPage, PAGE_CATEGORIES, type Page } from '../pages/api';
import { showToast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';
import { useAuth } from '../auth/AuthProvider';
import { useAppTheme } from '../ui/AppThemeProvider';
import {
  colors,
  font,
  radius,
  spacing,
  shadow,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';

type Row = { kind: 'header'; key: string; title: string } | { kind: 'page'; key: string; page: Page };

function categoryLabel(value: string): string | null {
  return PAGE_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

export default function Pages() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [mode, theme]);
  const actionColor = theme.ink.action;
  const mutedColor = mode === 'light' ? colors.textMuted : theme.ink.muted;
  const faintColor = mode === 'light' ? colors.textFaint : theme.ink.muted;
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const loadGeneration = useRef(0);
  const lifecycleGeneration = useRef(0);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // pages with a follow request in flight — blocks double-taps
  const followsInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    const lifecycle = ++lifecycleGeneration.current;
    currentOwnerRef.current = ownerId;
    loadGeneration.current += 1;
    followsInFlight.current.clear();
    queueMicrotask(() => {
      if (
        lifecycle !== lifecycleGeneration.current ||
        currentOwnerRef.current !== ownerId
      )
        return;
      setPages([]);
      setDataOwnerId(null);
      setLoading(ownerId !== null);
      setRefreshing(false);
    });
  }, [ownerId]);

  const load = useCallback(async () => {
    const requestOwner = ownerId;
    const generation = ++loadGeneration.current;
    if (!requestOwner) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const next = await listPages();
      if (generation !== loadGeneration.current || requestOwner !== currentOwnerRef.current) return;
      setPages(next);
      setDataOwnerId(requestOwner);
    } catch (e) {
      if (generation !== loadGeneration.current || requestOwner !== currentOwnerRef.current) return;
      setPages([]);
      setDataOwnerId(requestOwner);
      Alert.alert('Could not load pages', String((e as Error).message ?? e));
    } finally {
      if (generation === loadGeneration.current && requestOwner === currentOwnerRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadGeneration.current += 1;
        lifecycleGeneration.current += 1;
        followsInFlight.current.clear();
      };
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onFollow(page: Page) {
    const requestOwner = ownerId;
    const lifecycle = lifecycleGeneration.current;
    if (!requestOwner) return;
    if (followsInFlight.current.has(page.id)) return;
    followsInFlight.current.add(page.id);
    try {
      await followPage(page.id);
      if (lifecycle !== lifecycleGeneration.current || requestOwner !== currentOwnerRef.current)
        return;
      showToast(`Following ${page.name}`);
      followsInFlight.current.delete(page.id);
      await load();
    } catch (e) {
      if (lifecycle !== lifecycleGeneration.current || requestOwner !== currentOwnerRef.current)
        return;
      Alert.alert('Could not follow page', String((e as Error).message ?? e));
    } finally {
      if (lifecycle === lifecycleGeneration.current && requestOwner === currentOwnerRef.current) {
        followsInFlight.current.delete(page.id);
      }
    }
  }

  function openPage(page: Page) {
    router.push(`/page/${page.id}` as never);
  }

  const visiblePages = dataOwnerId === ownerId ? pages : [];
  const following = visiblePages.filter((p) => p.is_following);
  const mine = visiblePages.filter((p) => p.is_owner && !p.is_following);
  const discover = visiblePages.filter((p) => !p.is_following && !p.is_owner);
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

  if (loading || (ownerId !== null && dataOwnerId !== ownerId)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={actionColor} />
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={actionColor} />
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
                  <Ionicons name="storefront-outline" size={20} color={actionColor} />
                </View>
              )}
              <View style={styles.rowBody}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.privacy === 'private' ? (
                    <Ionicons name="lock-closed" size={13} color={mutedColor} />
                  ) : null}
                </View>
                <Text style={styles.meta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
              {p.is_owner ? (
                <View style={styles.ownerChip}>
                  <Ionicons name="ribbon-outline" size={12} color={actionColor} />
                  <Text style={styles.ownerChipText}>Owner</Text>
                </View>
              ) : p.is_following ? (
                <Ionicons name="chevron-forward" size={18} color={faintColor} />
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
          <Ionicons name="add" size={20} color={theme.ink.inverse} />
          <Text style={styles.fabText}>Create page</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppThemeColors, mode: AppThemeMode) => {
  const primaryInk = mode === 'light' ? colors.text : theme.ink.primary;
  const mutedInk = mode === 'light' ? colors.textMuted : theme.ink.muted;
  const softActionSurface = mode === 'light' ? colors.primarySoft : theme.surface.muted;
  const neutralSurface = mode === 'light' ? colors.surface : theme.surface.muted;

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.raised },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: theme.surface.raised,
  },
  emptyWrap: { flexGrow: 1 },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 96 },
  sectionHeader: {
    fontFamily: font.bold,
    fontSize: 13,
    color: mutedInk,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
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
    backgroundColor: softActionSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 44, height: 44, borderRadius: 22, backgroundColor: neutralSurface },
  rowBody: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontFamily: font.bold, fontSize: 15.5, color: primaryInk, flexShrink: 1 },
  meta: { fontFamily: font.regular, fontSize: 13, color: mutedInk },
  ownerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: softActionSurface,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  ownerChipText: { fontFamily: font.bold, fontSize: 12, color: theme.ink.action },
  followBtn: {
    backgroundColor: theme.ink.action,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 36,
    justifyContent: 'center',
  },
  followText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 13.5 },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.ink.action,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    minHeight: spacing.touch,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fabText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 15 },
  pressed: { opacity: 0.8 },
  });
};
