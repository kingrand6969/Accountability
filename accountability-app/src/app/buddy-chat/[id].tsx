import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  CHAT_PAGE,
  listMessages,
  listMessagesAfter,
  sendMessage,
  markConversationRead,
  reportUser,
  blockUser,
  type Message,
} from '../../buddy/api';
import { MessageRow } from '../../buddy/ChatMessages';
import { authorLabel, timeAgo } from '../../feed/format';
import { CachedImage } from '../../ui/CachedImage';
import { colors, contentMax, font, radius, spacing } from '../../ui/theme';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Prepend `incoming` (newest-first) onto `cur`, skipping ids we already have. */
function mergeNewer(cur: Message[], incoming: Message[]): Message[] {
  const seen = new Set(cur.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...fresh, ...cur] : cur;
}

type BuddyBrief = { name: string | null; avatar: string | null; lastActive: string | null };

export default function BuddyChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [myId, setMyId] = useState<string | null>(null);
  const [buddy, setBuddy] = useState<BuddyBrief>({ name: null, avatar: null, lastActive: null });
  const [deleted, setDeleted] = useState(false);
  // newest-first — index 0 is the latest message (pairs with the inverted list)
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMyId(data.user?.id ?? null);
      if (!id) return;
      // no profile row → the person deleted their account (or is otherwise gone)
      const { data: prof } = await supabase
        .from('public_profiles')
        .select('display_name,avatar_url,last_active_at')
        .eq('id', id)
        .maybeSingle();
      if (!prof) {
        setDeleted(true);
      } else {
        setBuddy({
          name: prof.display_name ?? null,
          avatar: prof.avatar_url ?? null,
          lastActive: prof.last_active_at ?? null,
        });
      }
    })();
  }, [id]);

  /** Fresh newest window (open/focus). One 50-row query — never the full thread. */
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const page = await listMessages(id);
      setMessages(page);
      setHasMore(page.length === CHAT_PAGE);
      markConversationRead(id).catch(() => {});
    } catch (e) {
      Alert.alert('Could not load chat', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** Incremental poll — only fetches messages newer than what's on screen. */
  const pollNew = useCallback(async () => {
    if (!id) return;
    const newest = messagesRef.current[0];
    if (!newest) return load();
    try {
      const fresh = await listMessagesAfter(id, newest.created_at);
      if (fresh.length) {
        setMessages((cur) => mergeNewer(cur, fresh));
        markConversationRead(id).catch(() => {});
      }
    } catch {
      // a dropped poll is fine — realtime and the next tick cover it
    }
  }, [id, load]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!id || !myId) return;

      // Realtime: new messages addressed to me appear instantly.
      const channel = supabase
        .channel(`chat-${id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'buddy_messages',
            filter: `recipient=eq.${myId}`,
          },
          (payload) => {
            const m = payload.new as Message & { recipient: string };
            if (m.sender !== id) return; // a different conversation
            setMessages((cur) =>
              mergeNewer(cur, [
                { id: m.id, sender: m.sender, body: m.body, created_at: m.created_at },
              ]),
            );
            markConversationRead(id).catch(() => {});
          },
        )
        .subscribe();

      // Slow safety-net poll in case the realtime socket drops (incremental —
      // it asks only for messages newer than the one on screen).
      const t = setInterval(pollNew, 20000);
      return () => {
        clearInterval(t);
        supabase.removeChannel(channel);
      };
    }, [load, pollNew, id, myId]),
  );

  /** Page further back when the reader scrolls to the top of the history. */
  async function loadOlder() {
    if (!id || loadingOlder || !hasMore) return;
    const oldest = messagesRef.current[messagesRef.current.length - 1];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const older = await listMessages(id, oldest.created_at);
      setMessages((cur) => {
        const seen = new Set(cur.map((m) => m.id));
        return [...cur, ...older.filter((m) => !seen.has(m.id))];
      });
      setHasMore(older.length === CHAT_PAGE);
    } catch {
      // leave hasMore as-is; the next scroll retries
    } finally {
      setLoadingOlder(false);
    }
  }

  async function onSend() {
    if (!id || !text.trim() || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      const sent = await sendMessage(id, body);
      setMessages((cur) => mergeNewer(cur, [sent]));
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      setText(body); // give their words back so nothing is lost
      Alert.alert('Could not send', String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  }

  function onReport() {
    if (!id) return;
    Alert.alert('Report or block', `Report ${authorLabel(buddy.name)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report & block',
        style: 'destructive',
        onPress: async () => {
          try {
            await reportUser(id, 'Reported from chat');
            await blockUser(id);
            Alert.alert('Done', 'Thanks — they’ve been reported and blocked.');
          } catch (e) {
            Alert.alert('Could not report', String((e as Error).message ?? e));
          }
        },
      },
    ]);
  }

  const online =
    !deleted &&
    !!buddy.lastActive &&
    Date.now() - new Date(buddy.lastActive).getTime() < ONLINE_WINDOW_MS;
  const presence = deleted
    ? null
    : online
      ? 'Active now'
      : buddy.lastActive
        ? `Active ${timeAgo(buddy.lastActive)}`
        : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {/* conversation header — who you're talking to, at a glance */}
      <View style={styles.topBarWrap}>
        <View style={[styles.topBar, contentMax]}>
          <View style={styles.topIdentity}>
            <View>
              {deleted || !buddy.avatar ? (
                <View style={[styles.topAvatar, styles.topAvatarFallback]}>
                  <Ionicons name="person" size={16} color={colors.textFaint} />
                </View>
              ) : (
                <CachedImage uri={buddy.avatar} style={styles.topAvatar} />
              )}
              {online ? <View style={styles.onlineDot} /> : null}
            </View>
            <View style={styles.topText}>
              <Text style={styles.topName} numberOfLines={1}>
                {deleted ? 'Deleted Account' : authorLabel(buddy.name)}
              </Text>
              {presence ? (
                <Text
                  style={[styles.topPresence, online && styles.topPresenceOn]}
                  numberOfLines={1}
                >
                  {presence}
                </Text>
              ) : null}
            </View>
          </View>
          {!deleted ? (
            <Pressable
              onPress={onReport}
              hitSlop={8}
              style={({ pressed }) => [styles.reportBtn, pressed && styles.pressed]}
              accessibilityLabel="Report or block this user"
            >
              <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {deleted ? (
        <View style={[styles.goneBanner, contentMax]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.goneText}>
            This account is no longer available — they may have deleted their account, been removed,
            or blocked you. Their details are gone, but your conversation stays here unless you
            delete it.
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          inverted
          data={messages}
          keyExtractor={(m) => m.id}
          style={contentMax}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingOlder ? (
              <ActivityIndicator
                size="small"
                color={colors.textFaint}
                style={styles.olderSpinner}
              />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyFlip}>
              <Text style={styles.emptyTitle}>Say hi 👋</Text>
              <Text style={styles.empty}>Plan a session together, or share today’s win.</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <MessageRow
              item={item}
              newer={messages[index - 1]}
              older={messages[index + 1]}
              mine={item.sender === myId}
              hasMore={hasMore}
              avatar={deleted ? null : buddy.avatar}
            />
          )}
        />
      )}

      {deleted ? (
        <Text style={[styles.goneComposer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          You can&apos;t reply to a deleted account.
        </Text>
      ) : (
        <View style={styles.inputBarWrap}>
          <View
            style={[
              styles.inputBar,
              contentMax,
              { paddingBottom: Math.max(insets.bottom, spacing.sm) },
            ]}
          >
            <TextInput
              style={styles.input}
              placeholder="Message…"
              placeholderTextColor={colors.textFaint}
              value={text}
              onChangeText={setText}
              multiline
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                (!text.trim() || sending) && styles.sendDisabled,
                pressed && text.trim() && styles.pressed,
              ]}
              onPress={onSend}
              disabled={!text.trim() || sending}
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="arrow-up" size={19} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },

  // header
  topBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  topIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 0,
  },
  topAvatar: { width: 34, height: 34, borderRadius: 17 },
  topAvatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#16a34a',
    borderWidth: 2,
    borderColor: colors.background,
  },
  topText: { flex: 1, minWidth: 0 },
  topName: { fontFamily: font.bold, fontSize: 15.5, color: colors.text },
  topPresence: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  topPresenceOn: { color: '#16a34a' },
  reportBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },

  // deleted-account notices
  goneBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  goneText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  goneComposer: {
    textAlign: 'center',
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 13,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // messages
  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  olderSpinner: { paddingVertical: spacing.md },
  // counter-flip: the list is inverted, so the empty state needs flipping back
  emptyFlip: { transform: [{ scaleY: -1 }], alignItems: 'center', paddingVertical: 48, gap: 4 },
  emptyTitle: { fontFamily: font.bold, fontSize: 17, color: colors.text },
  empty: { textAlign: 'center', color: colors.textMuted, fontFamily: font.regular, fontSize: 13.5 },

  // composer
  inputBarWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
});
