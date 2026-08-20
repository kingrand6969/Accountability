import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../feed/Avatar';
import { timeAgo, authorLabel } from '../../feed/format';
import {
  listConversations,
  listActiveBuddies,
  type Conversation,
  type ActiveBuddy,
} from '../../buddy/api';
import { useIsPro } from '../../pro/ProProvider';
import { EmptyState } from '../../ui/EmptyState';
import { font, radius, spacing, contentMax, type AppThemeColors } from '../../ui/theme';
import { useAppTheme } from '../../ui/AppThemeProvider';
import { useAuth } from '../../auth/AuthProvider';

function firstName(name: string | null): string {
  return authorLabel(name).split(' ')[0];
}

export default function Messages() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const dataOwnerRef = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const chatsInFlight = useRef<Set<string>>(new Set());
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveBuddy[]>([]);
  const [activeOwnerId, setActiveOwnerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [errorOwnerId, setErrorOwnerId] = useState<string | null>(null);

  useEffect(() => {
    currentOwnerRef.current = ownerId;
    dataOwnerRef.current = null;
    loadGeneration.current += 1;
    chatsInFlight.current.clear();
    queueMicrotask(() => {
      if (currentOwnerRef.current !== ownerId) return;
      setItems(null);
      setDataOwnerId(null);
      setActive([]);
      setActiveOwnerId(null);
      setQuery('');
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
      setActive([]);
      setActiveOwnerId(null);
      setRefreshing(false);
      setErrorOwnerId(null);
      return;
    }

    void listActiveBuddies()
      .then((next) => {
        if (
          generation === loadGeneration.current &&
          requestOwner === currentOwnerRef.current
        ) {
          setActive(next);
          setActiveOwnerId(requestOwner);
        }
      })
      .catch(() => {});

    try {
      const next = await listConversations();
      if (
        generation !== loadGeneration.current ||
        requestOwner !== currentOwnerRef.current
      )
        return;
      dataOwnerRef.current = requestOwner;
      setItems(next);
      setDataOwnerId(requestOwner);
      setErrorOwnerId(null);
    } catch {
      if (
        generation !== loadGeneration.current ||
        requestOwner !== currentOwnerRef.current
      )
        return;
      if (dataOwnerRef.current !== requestOwner) {
        dataOwnerRef.current = requestOwner;
        setItems([]);
        setDataOwnerId(requestOwner);
      }
      setErrorOwnerId(requestOwner);
    } finally {
      if (
        generation === loadGeneration.current &&
        requestOwner === currentOwnerRef.current
      )
        setRefreshing(false);
    }
  }, [ownerId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadGeneration.current += 1;
        chatsInFlight.current.clear();
        setRefreshing(false);
      };
    }, [load]),
  );

  const ownedItems = ownerId && dataOwnerId === ownerId ? items : null;
  const ownedActive = useMemo(
    () => (ownerId && activeOwnerId === ownerId ? active : []),
    [active, activeOwnerId, ownerId],
  );
  const loadFailed = ownerId !== null && errorOwnerId === ownerId;

  const filtered = useMemo(() => {
    if (!ownedItems) return null;
    const q = query.trim().toLowerCase();
    if (!q) return ownedItems;
    return ownedItems.filter((c) => authorLabel(c.name).toLowerCase().includes(q));
  }, [ownedItems, query]);

  const onlineIds = useMemo(
    () => new Set(ownedActive.filter((buddy) => buddy.online).map((buddy) => buddy.id)),
    [ownedActive],
  );

  const onlineCount = ownedActive.filter((buddy) => buddy.online).length;

  function openChat(id: string) {
    const requestOwner = ownerId;
    if (
      !requestOwner ||
      requestOwner !== currentOwnerRef.current ||
      chatsInFlight.current.has(id)
    )
      return;
    chatsInFlight.current.add(id);
    router.push({ pathname: '/buddy-chat/[id]', params: { id } });
  }

  const header = (
    <View>
      {/* search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={theme.ink.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor={theme.ink.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            style={styles.clearSearch}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={theme.ink.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* active buddies row */}
      {ownedActive.length > 0 ? (
        <>
          <Text style={styles.activeTitle}>
            Active{onlineCount > 0 ? ` · ${onlineCount} online` : ''}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeRow}
          >
            {ownedActive.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => openChat(b.id)}
                style={({ pressed }) => [styles.activeItem, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Message ${firstName(b.name)}${b.online ? ', online' : ''}`}
              >
                <View>
                  <Avatar url={b.avatar} name={b.name} size={58} />
                  {b.online ? <View style={styles.onlineDot} /> : null}
                </View>
                <Text style={styles.activeName} numberOfLines={1}>
                  {firstName(b.name)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {!isPro && items && items.length > 0 ? (
        <View style={styles.retentionNote}>
          <Ionicons name="time-outline" size={14} color={theme.ink.muted} />
          <Text style={styles.retentionText}>
            Messages are kept for 30 days on the free plan. Go Pro to keep them forever.
          </Text>
        </View>
      ) : null}

      {loadFailed ? (
        <View
          style={styles.errorNotice}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <View style={styles.errorCopy}>
            <Text style={styles.errorTitle}>Messages couldn’t load</Text>
            <Text style={styles.errorBody}>Check your connection, then try again.</Text>
          </View>
          <Pressable
            onPress={() => {
              setRefreshing(true);
              void load();
            }}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Retry loading messages"
            accessibilityState={{ disabled: refreshing }}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>{refreshing ? 'Trying…' : 'Retry'}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
          data={filtered ?? []}
          keyExtractor={(c) => c.otherId}
          contentContainerStyle={[styles.list, contentMax]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
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
          ListEmptyComponent={
            filtered === null ? (
              <View
                accessibilityLabel="Loading messages"
                accessibilityRole="progressbar"
                style={styles.loadingList}
              >
                {[0, 1, 2].map((index) => (
                  <View key={index} style={styles.loadingRow}>
                    <View style={styles.loadingAvatar} />
                    <View style={styles.loadingCopy}>
                      <View style={styles.loadingName} />
                      <View style={styles.loadingPreview} />
                    </View>
                  </View>
                ))}
              </View>
            ) : loadFailed ? null : query ? (
              <Text style={styles.noResults}>No conversations match “{query}”.</Text>
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title="No messages yet"
                subtitle="Match with an accountability buddy, then say hi — your chats show up here."
                actionTitle="Find buddies"
                onAction={() => router.push('/buddy' as never)}
              />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openChat(item.otherId)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Chat with ${authorLabel(item.name)}`}
            >
              <View>
                <Avatar url={item.avatar} name={item.name} size={52} />
                {onlineIds.has(item.otherId) ? (
                  <View style={styles.onlineDotSm} />
                ) : null}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.topRow}>
                  <Text style={[styles.name, item.unread > 0 && styles.nameUnread]} numberOfLines={1}>
                    {authorLabel(item.name)}
                  </Text>
                  <Text style={styles.time}>{timeAgo(item.lastAt)}</Text>
                </View>
                <View style={styles.bottomRow}>
                  <Text
                    style={[styles.preview, item.unread > 0 && styles.previewUnread]}
                    numberOfLines={1}
                  >
                    {item.lastFromMe ? 'You: ' : ''}
                    {item.lastBody}
                  </Text>
                  {item.unread > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unread > 99 ? '99+' : item.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          )}
        />
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
  list: { padding: spacing.sm, paddingBottom: 120 },
  pressed: { opacity: 0.7 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.surface.muted,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: spacing.touch,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: theme.ink.primary, paddingVertical: 0 },
  clearSearch: {
    width: spacing.touch,
    height: spacing.touch,
    marginRight: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingList: { gap: spacing.sm, paddingTop: spacing.sm },
  loadingRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  loadingAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.interaction.skeleton },
  loadingCopy: { flex: 1, gap: spacing.sm },
  loadingName: { width: '42%', height: 14, borderRadius: 7, backgroundColor: theme.interaction.skeleton },
  loadingPreview: { width: '74%', height: 12, borderRadius: 6, backgroundColor: theme.interaction.skeleton },
  activeTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: theme.ink.secondary,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  activeRow: { gap: spacing.md, paddingBottom: spacing.sm, paddingRight: spacing.md },
  activeItem: { alignItems: 'center', width: 64, gap: 5 },
  activeName: { fontFamily: font.medium, fontSize: 12, color: theme.ink.secondary },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: theme.status.success,
    borderWidth: 2.5,
    borderColor: theme.surface.canvas,
  },
  onlineDotSm: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: theme.status.success,
    borderWidth: 2,
    borderColor: theme.surface.canvas,
  },
  retentionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.surface.card,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  retentionText: { flex: 1, fontFamily: font.medium, fontSize: 12, color: theme.ink.muted, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border.subtle,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: font.semibold, fontSize: 15.5, color: theme.ink.primary },
  nameUnread: { fontFamily: font.extrabold },
  time: { fontFamily: font.medium, fontSize: 12, color: theme.ink.muted },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: theme.ink.muted },
  previewUnread: { fontFamily: font.semibold, color: theme.ink.primary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.ink.action,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 11 },
  noResults: { fontFamily: font.medium, fontSize: 14, color: theme.ink.muted, textAlign: 'center', marginTop: 40 },
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
