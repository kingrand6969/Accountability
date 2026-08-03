import { useCallback, useEffect, useRef, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../feed/Avatar';
import { timeAgo } from '../../feed/format';
import {
  listNotifications,
  markAllRead,
  notificationLine,
  type AppNotification,
} from '../../notify/api';
import { EmptyState } from '../../ui/EmptyState';
import { colors, font, radius, spacing, contentMax } from '../../ui/theme';
import { useAuth } from '../../auth/AuthProvider';
import { getPost } from '../../feed/api';

const TYPE_ICON: Record<AppNotification['type'], { icon: string; tint: string }> = {
  like: { icon: 'flame', tint: colors.cheer },
  comment: { icon: 'chatbubble', tint: '#2563eb' },
  tag: { icon: 'pricetag', tint: '#0d9488' },
  buddy_request: { icon: 'person-add', tint: '#ea580c' },
  buddy_accept: { icon: 'people', tint: '#16a34a' },
};

export default function Notifications() {
  const router = useRouter();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const loadGeneration = useRef(0);
  const lifecycleGeneration = useRef(0);
  const opensInFlight = useRef<Set<string>>(new Set());
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const lifecycle = ++lifecycleGeneration.current;
    currentOwnerRef.current = ownerId;
    loadGeneration.current += 1;
    opensInFlight.current.clear();
    queueMicrotask(() => {
      if (
        lifecycle !== lifecycleGeneration.current ||
        currentOwnerRef.current !== ownerId
      )
        return;
      setItems(null);
      setDataOwnerId(null);
      setRefreshing(false);
    });
  }, [ownerId]);

  const load = useCallback(async () => {
    const requestOwner = ownerId;
    const generation = ++loadGeneration.current;
    if (!requestOwner) {
      setItems([]);
      setRefreshing(false);
      return;
    }
    try {
      const list = await listNotifications();
      if (generation !== loadGeneration.current || requestOwner !== currentOwnerRef.current) return;
      setItems(list);
      setDataOwnerId(requestOwner);
      void markAllRead(requestOwner).catch(() => {});
    } catch {
      if (generation !== loadGeneration.current || requestOwner !== currentOwnerRef.current) return;
      setItems([]);
      setDataOwnerId(requestOwner);
    } finally {
      if (generation === loadGeneration.current && requestOwner === currentOwnerRef.current) {
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
        opensInFlight.current.clear();
        setRefreshing(false);
      };
    }, [load]),
  );

  async function open(n: AppNotification) {
    const requestOwner = ownerId;
    const lifecycle = lifecycleGeneration.current;
    if (!requestOwner || opensInFlight.current.has(n.id)) return;
    if (!n.post_id) {
      router.push('/buddy' as never);
      return;
    }
    opensInFlight.current.add(n.id);
    try {
      const target = await getPost(n.post_id);
      if (lifecycle !== lifecycleGeneration.current || requestOwner !== currentOwnerRef.current) return;
      if (!target) {
        Alert.alert('Unavailable', 'This notification target is no longer available.');
        return;
      }
      router.push({ pathname: '/post/[id]', params: { id: n.post_id } });
    } catch {
      if (lifecycle !== lifecycleGeneration.current || requestOwner !== currentOwnerRef.current) return;
      Alert.alert('Unavailable', 'This notification target is no longer available.');
    } finally {
      if (lifecycle === lifecycleGeneration.current && requestOwner === currentOwnerRef.current) {
        opensInFlight.current.delete(n.id);
      }
    }
  }

  return (
    <View style={styles.screen}>
      {items === null || (ownerId !== null && dataOwnerId !== ownerId) ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.list, contentMax]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No notifications yet"
              subtitle="Encouragement, comments, tags and buddy requests land here the moment they happen."
            />
          }
          renderItem={({ item }) => {
            const meta = TYPE_ICON[item.type];
            return (
              <Pressable
                onPress={() => open(item)}
                style={({ pressed }) => [
                  styles.row,
                  !item.read && styles.rowUnread,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={notificationLine(item)}
              >
                <View>
                  <Avatar url={item.actor_avatar} name={item.actor_name} size={44} />
                  <View style={[styles.typeBadge, { backgroundColor: meta.tint }]}>
                    <Ionicons name={meta.icon as never} size={11} color="#fff" />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.line}>{notificationLine(item)}</Text>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
                {!item.read ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.md, paddingBottom: 120, gap: 4 },
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  rowUnread: { backgroundColor: colors.primarySoft },
  typeBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  line: { fontFamily: font.semibold, fontSize: 14.5, color: colors.text, lineHeight: 20 },
  time: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
});
