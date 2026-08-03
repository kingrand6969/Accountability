import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { colors, font, radius, spacing, contentMax } from '../../ui/theme';

function firstName(name: string | null): string {
  return authorLabel(name).split(' ')[0];
}

export default function Messages() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [active, setActive] = useState<ActiveBuddy[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listConversations()
      .then(setItems)
      .catch(() => setItems([]));
    listActiveBuddies()
      .then(setActive)
      .catch(() => {});
  }, []);

  useFocusEffect(load);

  const filtered = useMemo(() => {
    if (!items) return null;
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => authorLabel(c.name).toLowerCase().includes(q));
  }, [items, query]);

  const onlineCount = active.filter((b) => b.online).length;

  function openChat(id: string) {
    router.push({ pathname: '/buddy-chat/[id]', params: { id } });
  }

  const header = (
    <View>
      {/* search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search messages"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* active buddies row */}
      {active.length > 0 ? (
        <>
          <Text style={styles.activeTitle}>
            Active{onlineCount > 0 ? ` · ${onlineCount} online` : ''}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.activeRow}
          >
            {active.map((b) => (
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
          <Ionicons name="time-outline" size={14} color={colors.textMuted} />
          <Text style={styles.retentionText}>
            Messages are kept for 30 days on the free plan. Go Pro to keep them forever.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {filtered === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.otherId}
          contentContainerStyle={[styles.list, contentMax]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                Promise.all([
                  listConversations().then(setItems),
                  listActiveBuddies().then(setActive),
                ])
                  .catch(() => {})
                  .finally(() => setRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            query ? (
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
                {active.find((b) => b.id === item.otherId)?.online ? (
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
      )}
    </View>
  );
}

const ONLINE = '#22c55e';

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.sm, paddingBottom: 120 },
  pressed: { opacity: 0.7 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 42,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text, paddingVertical: 0 },
  activeTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  activeRow: { gap: spacing.md, paddingBottom: spacing.sm, paddingRight: spacing.md },
  activeItem: { alignItems: 'center', width: 64, gap: 5 },
  activeName: { fontFamily: font.medium, fontSize: 12, color: colors.textSecondary },
  onlineDot: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: ONLINE,
    borderWidth: 2.5,
    borderColor: colors.background,
  },
  onlineDotSm: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: ONLINE,
    borderWidth: 2,
    borderColor: colors.background,
  },
  retentionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  retentionText: { flex: 1, fontFamily: font.medium, fontSize: 12, color: colors.textMuted, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: font.semibold, fontSize: 15.5, color: colors.text },
  nameUnread: { fontFamily: font.extrabold },
  time: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  preview: { flex: 1, fontFamily: font.regular, fontSize: 13.5, color: colors.textMuted },
  previewUnread: { fontFamily: font.semibold, color: colors.text },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
  noResults: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
