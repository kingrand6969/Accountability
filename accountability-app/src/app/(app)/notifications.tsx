import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  font,
  radius,
  spacing,
  contentMax,
  type AppThemeColors,
  type AppThemeMode,
} from '../../ui/theme';
import { useAppTheme } from '../../ui/AppThemeProvider';
import { useAuth } from '../../auth/AuthProvider';

const TYPE_ICON: Record<AppNotification['type'], string> = {
  like: 'flame',
  comment: 'chatbubble',
  tag: 'pricetag',
  buddy_request: 'person-add',
  buddy_accept: 'people',
};

function notificationBadge(
  type: AppNotification['type'],
  theme: AppThemeColors,
  mode: AppThemeMode,
): { background: string; foreground: string } {
  if (type === 'like' || type === 'buddy_request') {
    return {
      background: theme.status.attention,
      foreground: mode === 'dark' ? theme.ink.inverse : theme.ink.primary,
    };
  }
  if (type === 'comment') {
    return { background: theme.ink.action, foreground: theme.surface.canvas };
  }
  return { background: theme.status.success, foreground: theme.surface.canvas };
}

export default function Notifications() {
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const dataOwnerRef = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const lifecycleGeneration = useRef(0);
  const opensInFlight = useRef<Set<string>>(new Set());
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [errorOwnerId, setErrorOwnerId] = useState<string | null>(null);

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
      dataOwnerRef.current = null;
      setItems(null);
      setDataOwnerId(null);
      setRefreshing(false);
      setErrorOwnerId(null);
    });
  }, [ownerId]);

  const load = useCallback(async () => {
    const requestOwner = ownerId;
    const generation = ++loadGeneration.current;
    if (!requestOwner) {
      dataOwnerRef.current = null;
      setItems([]);
      setDataOwnerId(null);
      setRefreshing(false);
      setErrorOwnerId(null);
      return;
    }
    try {
      const list = await listNotifications();
      if (generation !== loadGeneration.current || requestOwner !== currentOwnerRef.current) return;
      dataOwnerRef.current = requestOwner;
      setItems(list);
      setDataOwnerId(requestOwner);
      setErrorOwnerId(null);
      void markAllRead(requestOwner).catch(() => {});
    } catch {
      if (generation !== loadGeneration.current || requestOwner !== currentOwnerRef.current) return;
      if (dataOwnerRef.current !== requestOwner) {
        dataOwnerRef.current = requestOwner;
        setItems([]);
        setDataOwnerId(requestOwner);
      }
      setErrorOwnerId(requestOwner);
    } finally {
      if (generation === loadGeneration.current && requestOwner === currentOwnerRef.current) {
        setRefreshing(false);
      }
    }
  }, [ownerId]);

  const ownedItems = !ownerId ? [] : dataOwnerId === ownerId ? items : null;
  const loadFailed = ownerId !== null && errorOwnerId === ownerId;

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

  function open(n: AppNotification) {
    const requestOwner = ownerId;
    if (
      !requestOwner ||
      requestOwner !== currentOwnerRef.current ||
      opensInFlight.current.has(n.id)
    )
      return;
    opensInFlight.current.add(n.id);
    if (!n.post_id) {
      if ((n.type === 'buddy_request' || n.type === 'buddy_accept') && n.actor_id) {
        router.push({ pathname: '/buddy-card/[id]', params: { id: n.actor_id } });
      } else {
        opensInFlight.current.delete(n.id);
        Alert.alert('Unavailable', 'This notification target is no longer available.');
      }
      return;
    }
    router.push({ pathname: '/post/[id]', params: { id: n.post_id } });
  }

  return (
    <View style={styles.screen}>
      {ownedItems === null ? (
        <View
          accessibilityLabel="Loading notifications"
          accessibilityRole="progressbar"
          style={styles.loading}
        >
          <ActivityIndicator color={theme.ink.action} />
        </View>
      ) : (
        <FlatList
          data={ownedItems}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.list, contentMax]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={theme.ink.action}
              colors={[theme.ink.action]}
              progressBackgroundColor={theme.surface.card}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListHeaderComponent={
            loadFailed ? (
              <View
                style={styles.errorNotice}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                <View style={styles.errorCopy}>
                  <Text style={styles.errorTitle}>Notifications couldn’t load</Text>
                  <Text style={styles.errorBody}>Check your connection, then try again.</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setRefreshing(true);
                    void load();
                  }}
                  disabled={refreshing}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading notifications"
                  accessibilityState={{ disabled: refreshing }}
                  style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.retryText}>{refreshing ? 'Trying…' : 'Retry'}</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loadFailed ? null : <EmptyState
              icon="notifications-outline"
              title="No notifications yet"
              subtitle="Cheers, comments, tags and buddy requests land here the moment they happen."
            />
          }
          renderItem={({ item }) => {
            const badge = notificationBadge(item.type, theme, mode);
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
                  <View style={[styles.typeBadge, { backgroundColor: badge.background }]}>
                    <Ionicons
                      name={TYPE_ICON[item.type] as never}
                      size={11}
                      color={badge.foreground}
                    />
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

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
  list: { padding: spacing.md, paddingBottom: 120, gap: 4 },
  loading: { paddingTop: 60, alignItems: 'center' },
  pressed: { opacity: 0.75 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border.subtle,
  },
  rowUnread: { backgroundColor: theme.surface.muted },
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
    borderColor: theme.surface.canvas,
  },
  line: { fontFamily: font.semibold, fontSize: 14.5, color: theme.ink.primary, lineHeight: 20 },
  time: { fontFamily: font.medium, fontSize: 12, color: theme.ink.muted, marginTop: 1 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: theme.ink.action },
  errorNotice: {
    minHeight: spacing.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    backgroundColor: theme.surface.card,
  },
  errorCopy: { flex: 1, gap: 2 },
  errorTitle: { fontFamily: font.bold, fontSize: 14, color: theme.ink.primary },
  errorBody: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 17, color: theme.ink.muted },
  retryButton: {
    minWidth: 68,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: theme.surface.muted,
  },
  retryText: { fontFamily: font.bold, fontSize: 13, color: theme.ink.action },
});
