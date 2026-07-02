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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  listMessages,
  sendMessage,
  getProfileBrief,
  reportUser,
  blockUser,
  type Message,
} from '../../buddy/api';
import { authorLabel } from '../../feed/format';
import { colors, font, radius, spacing } from '../../ui/theme';

export default function BuddyChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [myId, setMyId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMyId(data.user?.id ?? null);
      if (id) setName((await getProfileBrief(id)).name);
    })();
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setMessages(await listMessages(id));
    } catch (e) {
      Alert.alert('Could not load chat', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, [id]);

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
              cur.some((x) => x.id === m.id)
                ? cur
                : [...cur, { id: m.id, sender: m.sender, body: m.body, created_at: m.created_at }],
            );
          },
        )
        .subscribe();

      // Slow safety-net poll in case the realtime socket drops.
      const t = setInterval(load, 20000);
      return () => {
        clearInterval(t);
        supabase.removeChannel(channel);
      };
    }, [load, id, myId]),
  );

  async function onSend() {
    if (!id || !text.trim() || sending) return;
    const body = text.trim();
    setText('');
    setSending(true);
    try {
      await sendMessage(id, body);
      await load();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      setText(body); // give their words back so nothing is lost
      Alert.alert('Could not send', String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  }

  function onReport() {
    if (!id) return;
    Alert.alert('Report or block', `Report ${authorLabel(name)}?`, [
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <View style={styles.topBar}>
        <Text style={styles.topName}>{authorLabel(name)}</Text>
        <Pressable
          onPress={onReport}
          hitSlop={8}
          style={({ pressed }) => [styles.reportBtn, pressed && styles.pressed]}
          accessibilityLabel="Report or block this user"
        >
          <Ionicons name="flag-outline" size={15} color={colors.danger} />
          <Text style={styles.report}>Report</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text style={styles.empty}>Say hi 👋 — plan a session together!</Text>
          }
          renderItem={({ item }) => {
            const mine = item.sender === myId;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, mine && styles.mineText]}>{item.body}</Text>
              </View>
            );
          }}
        />
      )}

      <View style={styles.inputBar}>
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
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topName: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
  },
  report: { color: colors.danger, fontFamily: font.semibold, fontSize: 13 },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { textAlign: 'center', color: colors.textMuted, fontFamily: font.regular, marginTop: 30 },
  bubble: {
    maxWidth: '80%',
    borderRadius: radius.lg,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface },
  bubbleText: { fontSize: 15, lineHeight: 21, fontFamily: font.regular, color: colors.text },
  mineText: { color: '#fff' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
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
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
});
