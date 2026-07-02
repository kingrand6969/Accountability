import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getPost, listComments, addComment, setLiked } from '../../feed/api';
import { timeAgo, authorLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import type { FeedPost, PostComment } from '../../feed/types';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, c] = await Promise.all([getPost(id), listComments(id)]);
      setPost(p);
      setComments(c);
    } catch (e) {
      Alert.alert('Could not load post', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const likeInFlight = useRef(false);

  async function onToggleLike() {
    if (!post || likeInFlight.current) return; // one request at a time
    likeInFlight.current = true;
    const liked = !post.liked_by_me;
    setPost((cur) =>
      cur
        ? { ...cur, liked_by_me: liked, like_count: Math.max(0, cur.like_count + (liked ? 1 : -1)) }
        : cur,
    );
    try {
      await setLiked(post.id, liked);
    } catch (e) {
      Alert.alert('Could not update like', String((e as Error).message ?? e));
      load();
    } finally {
      likeInFlight.current = false;
    }
  }

  async function onSend() {
    if (!id || !text.trim()) return;
    setSending(true);
    try {
      await addComment(id, text.trim());
      setText('');
      await load();
    } catch (e) {
      Alert.alert('Could not comment', String((e as Error).message ?? e));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={styles.center}>
        <Text>Post not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={comments}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.post}>
            <View style={styles.headerRow}>
              <Avatar url={post.author_avatar} name={post.author_name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.author}>{authorLabel(post.author_name)}</Text>
                <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
              </View>
            </View>
            {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
            {post.image_url ? (
              <Image source={{ uri: post.image_url }} style={styles.postImage} resizeMode="cover" />
            ) : null}
            <Pressable onPress={onToggleLike} hitSlop={8} style={styles.likeRow}>
              <Text style={[styles.like, post.liked_by_me && styles.liked]}>
                {post.liked_by_me ? '♥' : '♡'} {post.like_count}
              </Text>
            </Pressable>
            <Text style={styles.commentsHeading}>Comments</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.noComments}>No comments yet. Say something supportive!</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.comment}>
            <Avatar url={item.author_avatar} name={item.author_name} size={32} />
            <View style={styles.commentBody}>
              <Text style={styles.commentAuthor}>
                {authorLabel(item.author_name)}{' '}
                <Text style={styles.commentTime}>· {timeAgo(item.created_at)}</Text>
              </Text>
              <Text style={styles.commentText}>{item.body}</Text>
            </View>
          </View>
        )}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Add a comment…"
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          onPress={onSend}
          disabled={!text.trim() || sending}
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendDisabled]}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 16, gap: 12 },
  post: { gap: 10, marginBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { fontSize: 16, fontWeight: '700' },
  time: { color: '#888', fontSize: 12 },
  body: { fontSize: 16, lineHeight: 23 },
  postImage: { width: '100%', height: 240, borderRadius: 12, backgroundColor: '#eee' },
  likeRow: { paddingVertical: 4 },
  like: { fontSize: 16, color: '#444' },
  liked: { color: '#ef4444', fontWeight: '700' },
  commentsHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    paddingTop: 12,
  },
  noComments: { color: '#888', fontStyle: 'italic' },
  comment: { flexDirection: 'row', gap: 10 },
  commentBody: { flex: 1 },
  commentAuthor: { fontWeight: '600' },
  commentTime: { color: '#999', fontWeight: '400', fontSize: 12 },
  commentText: { marginTop: 2, lineHeight: 20 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
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
  sendBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '700' },
});
