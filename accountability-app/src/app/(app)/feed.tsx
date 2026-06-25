import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { listFeed, createPost, setLiked } from '../../feed/api';
import { timeAgo, authorLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import type { FeedPost } from '../../feed/types';

export default function Feed() {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setPosts(await listFeed());
    } catch (e) {
      Alert.alert('Could not load the feed', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function onPost() {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await createPost(body.trim());
      setBody('');
      await load();
    } catch (e) {
      Alert.alert('Could not post', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  async function onToggleLike(post: FeedPost) {
    const liked = !post.liked_by_me;
    setPosts((cur) =>
      cur.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: liked, like_count: p.like_count + (liked ? 1 : -1) }
          : p,
      ),
    );
    try {
      await setLiked(post.id, liked);
    } catch (e) {
      setPosts((cur) =>
        cur.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: !liked, like_count: p.like_count + (liked ? -1 : 1) }
            : p,
        ),
      );
      Alert.alert('Could not update like', String((e as Error).message ?? e));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Share a win or what you're up to…"
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Pressable
          style={[styles.postBtn, (!body.trim() || posting) && styles.postBtnDisabled]}
          onPress={onPost}
          disabled={!body.trim() || posting}
        >
          {posting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.postBtnText}>Post</Text>
          )}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={posts.length === 0 ? styles.emptyWrap : styles.list}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>Be the first to share something.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Avatar url={item.author_avatar} name={item.author_name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>{authorLabel(item.author_name)}</Text>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                </View>
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => onToggleLike(item)} hitSlop={8}>
                  <Text style={[styles.actionText, item.liked_by_me && styles.liked]}>
                    {item.liked_by_me ? '♥' : '♡'} {item.like_count}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                  hitSlop={8}
                >
                  <Text style={styles.actionText}>💬 {item.comment_count}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  composer: {
    padding: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  composerInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
  },
  postBtn: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: '#fff', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyWrap: { flexGrow: 1 },
  list: { padding: 14, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#666', marginTop: 6, textAlign: 'center' },
  card: {
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { fontSize: 15, fontWeight: '700' },
  time: { color: '#888', fontSize: 12 },
  body: { fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 22, marginTop: 2 },
  action: { paddingVertical: 4 },
  actionText: { fontSize: 15, color: '#444' },
  liked: { color: '#ef4444', fontWeight: '700' },
});
