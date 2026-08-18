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
import { useAuth } from '../../auth/AuthProvider';
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

type BuddyBrief = {
  name: string | null;
  avatar: string | null;
  lastActive: string | null;
  presenceCheckedAt: number | null;
};

type ChatContext = Readonly<{
  key: string;
  ownerId: string;
  targetId: string;
}>;

type ChatActionToken = ChatContext & Readonly<{ token: symbol }>;

const EMPTY_BUDDY: BuddyBrief = {
  name: null,
  avatar: null,
  lastActive: null,
  presenceCheckedAt: null,
};

const chatContextKey = (ownerId: string, targetId: string) => `${ownerId}:${targetId}`;

export default function BuddyChat() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const { session, loading: authLoading } = useAuth();
  const ownerId = session?.user.id ?? null;
  const insets = useSafeAreaInsets();
  const contextKey = ownerId && id ? chatContextKey(ownerId, id) : null;
  const [dataContextKey, setDataContextKey] = useState<string | null>(null);
  const [buddy, setBuddy] = useState<BuddyBrief>(EMPTY_BUDDY);
  const [expiredPresenceKey, setExpiredPresenceKey] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  // newest-first — index 0 is the latest message (pairs with the inverted list)
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [textContextKey, setTextContextKey] = useState<string | null>(contextKey);
  const [loading, setLoading] = useState(true);
  const [sendingContextKey, setSendingContextKey] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const mountedRef = useRef(true);
  const currentOwnerRef = useRef(ownerId);
  const currentTargetRef = useRef(id);
  const lifecycleGenerationRef = useRef(0);
  const messageStateRef = useRef({ contextKey: dataContextKey, messages });
  const olderTokenRef = useRef<ChatActionToken | null>(null);
  const sendTokenRef = useRef<ChatActionToken | null>(null);
  const reportTokenRef = useRef<(ChatActionToken & { started: boolean }) | null>(null);

  // Route and auth values can change before effect cleanup; update these during
  // render so every delayed callback observes the newest identity immediately.
  /* eslint-disable react-hooks/refs -- identity guards must update before stale effect cleanup */
  currentOwnerRef.current = ownerId;
  currentTargetRef.current = id;
  messageStateRef.current = { contextKey: dataContextKey, messages };
  /* eslint-enable react-hooks/refs */

  function currentContext(): ChatContext | null {
    const currentOwner = currentOwnerRef.current;
    const currentTarget = currentTargetRef.current;
    if (!currentOwner || !currentTarget) return null;
    return {
      ownerId: currentOwner,
      targetId: currentTarget,
      key: chatContextKey(currentOwner, currentTarget),
    };
  }

  function contextIsCurrent(context: ChatContext): boolean {
    return (
      mountedRef.current &&
      currentOwnerRef.current === context.ownerId &&
      currentTargetRef.current === context.targetId
    );
  }

  function actionOwns(
    ref: { current: ChatActionToken | null },
    token: ChatActionToken,
  ): boolean {
    return ref.current === token && contextIsCurrent(token);
  }

  function acquireAction(
    ref: { current: ChatActionToken | null },
    context: ChatContext,
  ): ChatActionToken | null {
    if (ref.current && contextIsCurrent(ref.current)) return null;
    const token = { ...context, token: Symbol('chat-action') };
    ref.current = token;
    return token;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      olderTokenRef.current = null;
      sendTokenRef.current = null;
      reportTokenRef.current = null;
    };
  }, []);

  // Drafts belong to one exact owner/conversation. The render-time context
  // gate below hides the previous value immediately, while this clears it for
  // the new conversation after commit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset private draft at identity boundary
    setText('');
    setTextContextKey(contextKey);
    setSendingContextKey(null);
    if (sendTokenRef.current && !contextIsCurrent(sendTokenRef.current)) {
      sendTokenRef.current = null;
    }
    if (reportTokenRef.current && !contextIsCurrent(reportTokenRef.current)) {
      reportTokenRef.current = null;
    }
  }, [contextKey]);

  const ownsData = !!contextKey && dataContextKey === contextKey;
  const visibleBuddy = ownsData ? buddy : EMPTY_BUDDY;
  const visibleDeleted = ownsData && deleted;
  const visibleMessages = ownsData ? messages : [];
  const visibleHasMore = ownsData && hasMore;
  const visibleLoadingOlder = ownsData && loadingOlder;
  const visibleText = textContextKey === contextKey ? text : '';
  const sending = !!contextKey && sendingContextKey === contextKey;
  const visibleLoading = authLoading || (!!contextKey && (!ownsData || loading));
  const presenceKey = id && visibleBuddy.lastActive ? `${id}:${visibleBuddy.lastActive}` : null;

  useEffect(() => {
    const context = currentContext();
    if (
      !context ||
      !presenceKey ||
      !visibleBuddy.lastActive ||
      visibleBuddy.presenceCheckedAt == null
    ) return;
    const expiresIn =
      new Date(visibleBuddy.lastActive).getTime() +
      ONLINE_WINDOW_MS -
      visibleBuddy.presenceCheckedAt;
    if (!Number.isFinite(expiresIn) || expiresIn <= 0) return;
    const timer = setTimeout(() => {
      if (contextIsCurrent(context)) setExpiredPresenceKey(presenceKey);
    }, expiresIn);
    return () => clearTimeout(timer);
  }, [presenceKey, visibleBuddy.lastActive, visibleBuddy.presenceCheckedAt]);

  useFocusEffect(
    useCallback(() => {
      if (!ownerId || !id) {
        setDataContextKey(null);
        setBuddy(EMPTY_BUDDY);
        setDeleted(false);
        setMessages([]);
        setHasMore(false);
        setLoadingOlder(false);
        setLoading(false);
        return;
      }
      const context: ChatContext = {
        ownerId,
        targetId: id,
        key: chatContextKey(ownerId, id),
      };
      const generation = ++lifecycleGenerationRef.current;
      const requestIsCurrent = () =>
        generation === lifecycleGenerationRef.current && contextIsCurrent(context);

      setDataContextKey(context.key);
      setBuddy(EMPTY_BUDDY);
      setDeleted(false);
      setMessages([]);
      setHasMore(false);
      setLoadingOlder(false);
      setLoading(true);

      // Profile and messages load independently, but both commit only to this
      // immutable owner/target generation.
      void Promise.resolve(
        supabase
          .from('public_profiles')
          .select('display_name,avatar_url,last_active_at')
          .eq('id', context.targetId)
          .maybeSingle(),
      )
        .then(({ data: prof }) => {
          if (!requestIsCurrent()) return;
          if (!prof) {
            setDeleted(true);
            setBuddy(EMPTY_BUDDY);
            return;
          }
          setBuddy({
            name: prof.display_name ?? null,
            avatar: prof.avatar_url ?? null,
            lastActive: prof.last_active_at ?? null,
            presenceCheckedAt: Date.now(),
          });
        })
        .catch(() => {
          // A profile refresh failure must not overwrite a newer conversation.
        });

      void listMessages(context.targetId, undefined, context.ownerId)
        .then((page) => {
          if (!requestIsCurrent()) return;
          setMessages(page);
          setHasMore(page.length === CHAT_PAGE);
          void markConversationRead(context.targetId, context.ownerId).catch(() => {});
        })
        .catch((e) => {
          if (!requestIsCurrent()) return;
          Alert.alert('Could not load chat', String((e as Error).message ?? e));
        })
        .finally(() => {
          if (requestIsCurrent()) setLoading(false);
        });

      const pollNew = async () => {
        if (!requestIsCurrent()) return;
        const state = messageStateRef.current;
        const newest = state.contextKey === context.key ? state.messages[0] : undefined;
        try {
          const fresh = newest
            ? await listMessagesAfter(
                context.targetId,
                newest.created_at,
                context.ownerId,
              )
            : await listMessages(context.targetId, undefined, context.ownerId);
          if (!requestIsCurrent() || !fresh.length) return;
          setMessages((cur) => mergeNewer(cur, fresh));
          void markConversationRead(context.targetId, context.ownerId).catch(() => {});
        } catch {
          // A dropped poll is fine — realtime and the next tick cover it.
        }
      };

      // Realtime: new messages addressed to me appear instantly.
      const channel = supabase
        .channel(`chat-${context.ownerId}-${context.targetId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'buddy_messages',
            filter: `recipient=eq.${context.ownerId}`,
          },
          (payload) => {
            const m = payload.new as Message & { recipient: string };
            if (
              !requestIsCurrent() ||
              m.sender !== context.targetId ||
              m.recipient !== context.ownerId
            ) return;
            setMessages((cur) =>
              mergeNewer(cur, [
                { id: m.id, sender: m.sender, body: m.body, created_at: m.created_at },
              ]),
            );
            void markConversationRead(context.targetId, context.ownerId).catch(() => {});
          },
        )
        .subscribe();

      // Slow safety-net poll in case the realtime socket drops (incremental —
      // it asks only for messages newer than the one on screen).
      const t = setInterval(() => void pollNew(), 20000);
      return () => {
        if (generation === lifecycleGenerationRef.current) {
          lifecycleGenerationRef.current += 1;
        }
        clearInterval(t);
        void supabase.removeChannel(channel);
      };
    }, [id, ownerId]),
  );

  /** Page further back when the reader scrolls to the top of the history. */
  async function loadOlder() {
    const context = currentContext();
    if (!context || dataContextKey !== context.key || !visibleHasMore) return;
    const token = acquireAction(olderTokenRef, context);
    if (!token) return;
    const state = messageStateRef.current;
    const ownedMessages = state.contextKey === context.key ? state.messages : [];
    const oldest = ownedMessages[ownedMessages.length - 1];
    if (!oldest) {
      if (olderTokenRef.current === token) olderTokenRef.current = null;
      return;
    }
    setLoadingOlder(true);
    try {
      const older = await listMessages(context.targetId, oldest.created_at, context.ownerId);
      if (!actionOwns(olderTokenRef, token)) return;
      setMessages((cur) => {
        const seen = new Set(cur.map((m) => m.id));
        return [...cur, ...older.filter((m) => !seen.has(m.id))];
      });
      setHasMore(older.length === CHAT_PAGE);
    } catch {
      // leave hasMore as-is; the next scroll retries
    } finally {
      if (actionOwns(olderTokenRef, token)) setLoadingOlder(false);
      if (olderTokenRef.current === token) olderTokenRef.current = null;
    }
  }

  async function onSend() {
    const context = currentContext();
    const body = visibleText.trim();
    if (!context || !body) return;
    const token = acquireAction(sendTokenRef, context);
    if (!token) return;
    setText('');
    setTextContextKey(context.key);
    setSendingContextKey(context.key);
    try {
      const sent = await sendMessage(context.targetId, body, context.ownerId);
      if (!actionOwns(sendTokenRef, token)) return;
      setMessages((cur) => mergeNewer(cur, [sent]));
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    } catch (e) {
      if (!actionOwns(sendTokenRef, token)) return;
      // Give their words back without overwriting anything typed while the
      // first message was in flight.
      setTextContextKey(context.key);
      setText((current) => (current.trim() ? `${body}\n${current}` : body));
      Alert.alert('Could not send', String((e as Error).message ?? e));
    } finally {
      if (actionOwns(sendTokenRef, token)) setSendingContextKey(null);
      if (sendTokenRef.current === token) sendTokenRef.current = null;
    }
  }

  function onReport() {
    const context = currentContext();
    if (!context) return;
    const baseToken = acquireAction(reportTokenRef, context);
    if (!baseToken) return;
    const token = { ...baseToken, started: false };
    reportTokenRef.current = token;
    const release = () => {
      if (reportTokenRef.current === token) reportTokenRef.current = null;
    };
    Alert.alert('Report or block', `Report ${authorLabel(visibleBuddy.name)}?`, [
      { text: 'Cancel', style: 'cancel', onPress: release },
      {
        text: 'Report & block',
        style: 'destructive',
        onPress: async () => {
          if (!actionOwns(reportTokenRef, token) || token.started) {
            release();
            return;
          }
          token.started = true;
          try {
            await reportUser(context.targetId, 'Reported from chat', context.ownerId);
            if (!actionOwns(reportTokenRef, token)) return;
            await blockUser(context.targetId, context.ownerId);
            if (!actionOwns(reportTokenRef, token)) return;
            Alert.alert('Done', 'Thanks — they’ve been reported and blocked.');
          } catch (e) {
            if (!actionOwns(reportTokenRef, token)) return;
            Alert.alert('Could not report', String((e as Error).message ?? e));
          } finally {
            release();
          }
        },
      },
    ], { cancelable: true, onDismiss: release });
  }

  const online =
    !visibleDeleted &&
    !!visibleBuddy.lastActive &&
    visibleBuddy.presenceCheckedAt != null &&
    expiredPresenceKey !== presenceKey &&
    visibleBuddy.presenceCheckedAt - new Date(visibleBuddy.lastActive).getTime() < ONLINE_WINDOW_MS;
  const presence = visibleDeleted
    ? null
    : online
      ? 'Active now'
      : visibleBuddy.lastActive
        ? `Active ${timeAgo(visibleBuddy.lastActive)}`
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
              {visibleDeleted || !visibleBuddy.avatar ? (
                <View style={[styles.topAvatar, styles.topAvatarFallback]}>
                  <Ionicons name="person" size={16} color={colors.textFaint} />
                </View>
              ) : (
                <CachedImage uri={visibleBuddy.avatar} style={styles.topAvatar} />
              )}
              {online ? <View style={styles.onlineDot} /> : null}
            </View>
            <View style={styles.topText}>
              <Text style={styles.topName} numberOfLines={1}>
                {visibleDeleted ? 'Deleted Account' : authorLabel(visibleBuddy.name)}
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
          {!visibleDeleted ? (
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

      {visibleDeleted ? (
        <View style={[styles.goneBanner, contentMax]}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.goneText}>
            This account is no longer available — they may have deleted their account, been removed,
            or blocked you. Their details are gone, but your conversation stays here unless you
            delete it.
          </Text>
        </View>
      ) : null}

      {visibleLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          inverted
          data={visibleMessages}
          keyExtractor={(m) => m.id}
          style={contentMax}
          contentContainerStyle={styles.list}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            visibleLoadingOlder ? (
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
              newer={visibleMessages[index - 1]}
              older={visibleMessages[index + 1]}
              mine={item.sender === ownerId}
              hasMore={visibleHasMore}
              avatar={visibleDeleted ? null : visibleBuddy.avatar}
            />
          )}
        />
      )}

      {visibleDeleted ? (
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
              value={visibleText}
              onChangeText={(value) => {
                const context = currentContext();
                if (!context) return;
                setTextContextKey(context.key);
                setText(value);
              }}
              multiline
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                (!visibleText.trim() || sending) && styles.sendDisabled,
                pressed && visibleText.trim() && styles.pressed,
              ]}
              onPress={onSend}
              disabled={!visibleText.trim() || sending}
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
