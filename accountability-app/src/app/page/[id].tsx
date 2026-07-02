import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getPage, followPage, unfollowPage, PAGE_CATEGORIES, type Page } from '../../pages/api';
import { listFeed, createPost, setLiked } from '../../feed/api';
import { showToast } from '../../ui/Toast';
import { timeAgo } from '../../feed/format';
import type { FeedPost } from '../../feed/types';
import { EmptyState } from '../../ui/EmptyState';
import { Button } from '../../ui/Button';
import { colors, font, radius, spacing, shadow } from '../../ui/theme';

const COVER_GRADIENT = ['#312e81', '#7c3aed', '#db2777'] as const;

function categoryLabel(value: string): string | null {
  return PAGE_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

export default function PageDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  // posts with a like request in flight — blocks double-taps from racing
  const likesInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [p, feed] = await Promise.all([getPage(id), listFeed(undefined, undefined, id)]);
      setPage(p);
      setPosts(feed);
    } catch (e) {
      Alert.alert('Could not load page', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onToggleFollow() {
    if (!page || followBusy) return;
    setFollowBusy(true);
    const next = !page.is_following;
    // optimistic — flip the button and follower count immediately
    setPage((cur) =>
      cur
        ? {
            ...cur,
            is_following: next,
            follower_count: Math.max(0, cur.follower_count + (next ? 1 : -1)),
          }
        : cur,
    );
    try {
      if (next) {
        await followPage(page.id);
        showToast(`Following ${page.name}`);
      } else {
        await unfollowPage(page.id);
        showToast(`Unfollowed ${page.name}`);
      }
    } catch (e) {
      setPage((cur) =>
        cur
          ? {
              ...cur,
              is_following: !next,
              follower_count: Math.max(0, cur.follower_count + (next ? -1 : 1)),
            }
          : cur,
      );
      Alert.alert('Could not update follow', String((e as Error).message ?? e));
    } finally {
      setFollowBusy(false);
    }
  }

  const canPost = body.trim().length > 0 && !posting;

  async function onPost() {
    if (!id || !body.trim()) return;
    setPosting(true);
    try {
      await createPost(body.trim(), null, null, id);
      setBody('');
      await load();
      showToast('Posted to your page');
    } catch (e) {
      Alert.alert('Could not post', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  async function onToggleLike(post: FeedPost) {
    if (likesInFlight.current.has(post.id)) return; // one request per post at a time
    likesInFlight.current.add(post.id);
    const liked = !post.liked_by_me;
    setPosts((cur) =>
      cur.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) }
          : p,
      ),
    );
    try {
      await setLiked(post.id, liked);
    } catch (e) {
      setPosts((cur) =>
        cur.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: !liked, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)) }
            : p,
        ),
      );
      Alert.alert('Could not update like', String((e as Error).message ?? e));
    } finally {
      likesInFlight.current.delete(post.id);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!page) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Page not found.</Text>
      </View>
    );
  }

  const category = categoryLabel(page.category);
  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.pageCard}>
        {page.cover_url ? (
          <Image source={{ uri: page.cover_url }} style={styles.cover} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={COVER_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cover}
          />
        )}
        <View style={styles.avatarWrap}>
          {page.avatar_url ? (
            <Image source={{ uri: page.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Ionicons name="storefront" size={28} color={colors.primary} />
            </View>
          )}
        </View>
        <View style={styles.pageBody}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageName}>{page.name}</Text>
              <Text style={styles.handle}>@{page.handle}</Text>
            </View>
            {page.is_owner ? (
              <View style={styles.ownerChip}>
                <Ionicons name="ribbon-outline" size={12} color={colors.primary} />
                <Text style={styles.ownerChipText}>Your page</Text>
              </View>
            ) : page.is_following ? (
              <Button
                title="Following"
                variant="ghost"
                onPress={onToggleFollow}
                loading={followBusy}
                style={styles.followBtn}
                accessibilityLabel={`Unfollow ${page.name}`}
              />
            ) : (
              <Button
                title="Follow"
                onPress={onToggleFollow}
                loading={followBusy}
                style={styles.followBtn}
                accessibilityLabel={`Follow ${page.name}`}
              />
            )}
          </View>
          <Text style={styles.pageMeta}>
            {[
              category,
              `${page.follower_count} follower${page.follower_count === 1 ? '' : 's'}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {page.bio?.trim() ? <Text style={styles.bio}>{page.bio.trim()}</Text> : null}
        </View>
      </View>

      {page.is_owner ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder={`Share an update from ${page.name}…`}
            placeholderTextColor={colors.textFaint}
            value={body}
            onChangeText={setBody}
            multiline
          />
          <Pressable
            style={({ pressed }) => [
              styles.postBtn,
              !canPost && styles.postBtnDisabled,
              pressed && canPost && styles.pressed,
            ]}
            onPress={onPost}
            disabled={!canPost}
            accessibilityLabel="Post to your page"
          >
            {posting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="megaphone-outline"
            title="No posts yet"
            subtitle={page.is_owner ? 'Share your first update' : 'Check back soon.'}
          />
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {/* The page is speaking, not the person — show the page identity. */}
              {page.avatar_url ? (
                <Image source={{ uri: page.avatar_url }} style={styles.postAvatarImage} />
              ) : (
                <View style={styles.postAvatarFallback}>
                  <Ionicons name="storefront-outline" size={18} color={colors.primary} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.author}>{page.name}</Text>
                <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>
            {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" />
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => onToggleLike(item)}
                hitSlop={8}
                accessibilityLabel={item.liked_by_me ? 'Unlike' : 'Like'}
              >
                <Ionicons
                  name={item.liked_by_me ? 'heart' : 'heart-outline'}
                  size={19}
                  color={item.liked_by_me ? colors.danger : colors.textMuted}
                />
                <Text style={[styles.actionText, item.liked_by_me && styles.liked]}>
                  {item.like_count}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                hitSlop={8}
                accessibilityLabel="View comments"
              >
                <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                <Text style={styles.actionText}>{item.comment_count}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const AVATAR_SIZE = 64;

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
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md },
  pageCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  cover: { width: '100%', height: 120, backgroundColor: colors.surface },
  avatarWrap: {
    marginTop: -(AVATAR_SIZE / 2),
    marginLeft: spacing.lg,
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.surface,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  pageName: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  handle: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  ownerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  ownerChipText: { fontFamily: font.bold, fontSize: 12, color: colors.primary },
  followBtn: { minHeight: 44, paddingVertical: 10, paddingHorizontal: spacing.lg },
  pageMeta: { fontFamily: font.medium, fontSize: 13.5, color: colors.textMuted },
  bio: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  composer: { gap: spacing.sm },
  composerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 48,
    backgroundColor: colors.surfaceAlt,
  },
  postBtn: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 24,
    minHeight: 44,
    justifyContent: 'center',
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  pressed: { opacity: 0.7 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatarImage: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface },
  postAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  author: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  time: { color: colors.textFaint, fontSize: 12, fontFamily: font.medium },
  body: { fontSize: 15, lineHeight: 22, fontFamily: font.regular, color: colors.text },
  postImage: { width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: spacing.xl, marginTop: 2 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
    minHeight: 32,
  },
  actionText: { fontSize: 14, color: colors.textMuted, fontFamily: font.semibold },
  liked: { color: colors.danger },
});
