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

export default function BuddyChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [myId, setMyId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
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
      // Poll so incoming messages appear without leaving the screen.
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }, [load]),
  );

  async function onSend() {
    if (!id || !text.trim()) return;
    const body = text.trim();
    setText('');
    try {
      await sendMessage(id, body);
      await load();
      listRef.current?.scrollToEnd({ animated: true });
    } catch (e) {
      Alert.alert('Could not send', String((e as Error).message ?? e));
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
      keyboardVerticalOffset={90}
    >
      <View style={styles.topBar}>
        <Text style={styles.topName}>{authorLabel(name)}</Text>
        <Pressable onPress={onReport} hitSlop={8}>
          <Text style={styles.report}>⚠ Report</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
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
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          style={[styles.sendBtn, !text.trim() && styles.sendDisabled]}
          onPress={onSend}
          disabled={!text.trim()}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  topName: { fontWeight: '700', fontSize: 15 },
  report: { color: '#ef4444', fontWeight: '600', fontSize: 13 },
  list: { padding: 14, gap: 8 },
  empty: { textAlign: 'center', color: '#888', marginTop: 30 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13 },
  mine: { alignSelf: 'flex-end', backgroundColor: '#2563eb' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  mineText: { color: '#fff' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 18 },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '700' },
});
