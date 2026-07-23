import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

const TYPE_ICON: Record<AppNotification['type'], { icon: string; tint: string }> = {
  like: { icon: 'flame', tint: colors.cheer },
  comment: { icon: 'chatbubble', tint: '#2563eb' },
  tag: { icon: 'pricetag', tint: '#0d9488' },
  buddy_request: { icon: 'person-add', tint: '#ea580c' },
  buddy_accept: { icon: 'people', tint: '#16a34a' },
};

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listNotifications()
      .then((list) => {
        setItems(list);
        // opening the tab clears the badge — same behavior as FB/IG
        markAllRead().catch(() => {});
      })
      .catch(() => setItems([]));
  }, []);

  useFocusEffect(load);

  function open(n: AppNotification) {
    if (n.post_id) {
      router.push({ pathname: '/post/[id]', params: { id: n.post_id } });
    } else {
      router.push('/buddy' as never);
    }
  }

  return (
    <View style={styles.screen}>
      {items === null ? (
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
                listNotifications()
                  .then(setItems)
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No notifications yet"
              subtitle="Cheers, comments, tags and buddy requests land here the moment they happen."
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
