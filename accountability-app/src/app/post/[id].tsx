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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPost, listComments, addComment, setLiked } from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { SaveToMemories } from '../../memories/SaveToMemories';
import { PostImage } from '../../feed/PostImage';
import { timeAgo, authorLabel, taggedLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import type { FeedPost, PostComment } from '../../feed/types';
import { EmptyState } from '../../ui/EmptyState';
import { colors, font, radius, spacing } from '../../ui/theme';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Post not found.</Text>
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
                <Text style={styles.time}>
                  {timeAgo(post.created_at)}
                  {post.tagged.length > 0 ? ` · ${taggedLabel(post.tagged)}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  showPostMenu(post, myId, () => {
                    if (router.canGoBack()) router.back();
                    else router.replace('/');
                  })
                }
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Post options"
                style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}
              >
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
            {post.image_url ? (
              <View style={{ alignSelf: 'stretch' }}>
                <PostImage url={post.image_url} />
                <SaveToMemories url={post.image_url} />
              </View>
            ) : null}
            <Pressable
              onPress={onToggleLike}
              hitSlop={8}
              style={({ pressed }) => [styles.likeRow, pressed && styles.pressed]}
              accessibilityLabel={post.liked_by_me ? 'Remove cheer' : 'Cheer'}
            >
              <Ionicons
                name={post.liked_by_me ? 'flame' : 'flame-outline'}
                size={20}
                color={post.liked_by_me ? colors.cheer : colors.textMuted}
              />
              <Text style={[styles.like, post.liked_by_me && styles.liked]}>{post.like_count}</Text>
            </Pressable>
            <Text style={styles.commentsHeading}>Comments</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No comments yet"
            subtitle="Say something supportive!"
          />
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
          placeholderTextColor={colors.textFaint}
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          onPress={onSend}
          disabled={!text.trim() || sending}
          style={({ pressed }) => [
            styles.sendBtn,
            (!text.trim() || sending) && styles.sendDisabled,
            pressed && !(!text.trim() || sending) && styles.pressed,
          ]}
          accessibilityLabel="Send comment"
        >
          {sending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  notFound: { fontFamily: font.regular, color: colors.textMuted },
  list: { padding: spacing.lg, gap: spacing.md },
  post: { gap: 10, marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  author: { fontSize: 16, fontFamily: font.bold, color: colors.text },
  time: { color: colors.textFaint, fontSize: 12, fontFamily: font.medium },
  body: { fontSize: 16, lineHeight: 23, fontFamily: font.regular, color: colors.text },
  postImage: {
    width: '100%',
    height: 240,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
    minHeight: 44,
    alignSelf: 'flex-start',
  },
  like: { fontSize: 15, color: colors.textMuted, fontFamily: font.semibold },
  liked: { color: colors.cheer },
  pressed: { opacity: 0.7 },
  commentsHeading: {
    fontSize: 14,
    fontFamily: font.bold,
    color: colors.textMuted,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  comment: { flexDirection: 'row', gap: 10 },
  commentBody: { flex: 1 },
  commentAuthor: { fontFamily: font.semibold, color: colors.text },
  commentTime: { color: colors.textFaint, fontFamily: font.regular, fontSize: 12 },
  commentText: { marginTop: 2, lineHeight: 20, fontFamily: font.regular, color: colors.text },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
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
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: colors.onPrimary, fontFamily: font.bold },
});
