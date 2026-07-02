import { useCallback, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { listGroups, joinGroup, type Group } from '../groups/api';
import { showToast } from '../ui/Toast';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing, shadow } from '../ui/theme';

type Row = { kind: 'header'; key: string; title: string } | { kind: 'group'; key: string; group: Group };

export default function Groups() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // groups with a join request in flight — blocks double-taps
  const joinsInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setGroups(await listGroups());
    } catch (e) {
      Alert.alert('Could not load groups', String((e as Error).message ?? e));
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

  async function onJoin(group: Group) {
    if (joinsInFlight.current.has(group.id)) return;
    joinsInFlight.current.add(group.id);
    try {
      await joinGroup(group.id);
      showToast(`Joined ${group.name} 🎉`);
      await load();
    } catch (e) {
      Alert.alert('Could not join group', String((e as Error).message ?? e));
    } finally {
      joinsInFlight.current.delete(group.id);
    }
  }

  function openGroup(group: Group) {
    // Members see the feed; non-members see the about info + a join prompt.
    router.push(`/group/${group.id}` as never);
  }

  const mine = groups.filter((g) => g.is_member);
  const discover = groups.filter((g) => !g.is_member);
  const rows: Row[] = [
    ...(mine.length > 0
      ? [{ kind: 'header', key: 'h-mine', title: 'My groups' } as Row, ...mine.map(
          (g): Row => ({ kind: 'group', key: g.id, group: g }),
        )]
      : []),
    ...(discover.length > 0
      ? [{ kind: 'header', key: 'h-discover', title: 'Discover' } as Row, ...discover.map(
          (g): Row => ({ kind: 'group', key: g.id, group: g }),
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
              icon="people-outline"
              title="No groups yet"
              subtitle="Start a group and hold each other accountable."
              actionTitle="Create the first group"
              onAction={() => router.push('/group-new' as never)}
            />
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return <Text style={styles.sectionHeader}>{item.title}</Text>;
          }
          const g = item.group;
          const meta = [
            `${g.member_count} member${g.member_count === 1 ? '' : 's'}`,
            g.description?.trim() || null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => openGroup(g)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${g.name}`}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="people" size={20} color={colors.primary} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{g.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
              {g.is_member ? (
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}
                  onPress={() => onJoin(g)}
                  hitSlop={6}
                  accessibilityLabel={`Join ${g.name}`}
                >
                  <Text style={styles.joinText}>Join</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
      {rows.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
          onPress={() => router.push('/group-new' as never)}
          accessibilityRole="button"
          accessibilityLabel="Create group"
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.fabText}>Create group</Text>
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
  rowBody: { flex: 1, gap: 2 },
  name: { fontFamily: font.bold, fontSize: 15.5, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  joinBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 36,
    justifyContent: 'center',
  },
  joinText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 13.5 },
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
