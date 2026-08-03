import { useCallback, useEffect, useRef, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { getPage, followPage, unfollowPage, PAGE_CATEGORIES, type Page } from '../../pages/api';
import { listFeed, createPost, setLiked } from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { SaveToMemories } from '../../memories/SaveToMemories';
import { PostImage } from '../../feed/PostImage';
import { PostVideo } from '../../feed/PostVideo';
import { showToast } from '../../ui/Toast';
import { timeAgo, taggedLabel } from '../../feed/format';
import type { FeedPost } from '../../feed/types';
import { EmptyState } from '../../ui/EmptyState';
import { Button } from '../../ui/Button';
import { colors, font, radius, spacing, shadow } from '../../ui/theme';

const COVER_GRADIENT = ['#1e3a8a', '#2563eb', '#0ea5e9'] as const;

function categoryLabel(value: string): string | null {
  return PAGE_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

export default function PageDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const currentOwnerRef = useRef(myId);
  const loadGeneration = useRef(0);
  const lifecycleGeneration = useRef(0);
  const viewKey = `${myId ?? 'signed-out'}:${id ?? 'missing'}`;
  const currentViewKeyRef = useRef(viewKey);
  const [dataViewKey, setDataViewKey] = useState<string | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  // posts with a like request in flight — blocks double-taps from racing
  const likesInFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    const lifecycle = ++lifecycleGeneration.current;
    currentOwnerRef.current = myId;
    currentViewKeyRef.current = viewKey;
    loadGeneration.current += 1;
    likesInFlight.current.clear();
    queueMicrotask(() => {
      if (
        lifecycle !== lifecycleGeneration.current ||
        currentOwnerRef.current !== myId ||
        currentViewKeyRef.current !== viewKey
      )
        return;
      setPage(null);
      setPosts([]);
      setDataViewKey(null);
      setBody('');
      setPosting(false);
      setFollowBusy(false);
      setRefreshing(false);
      setLoading(myId !== null);
    });
  }, [myId, viewKey]);

  function isCurrentMutation(
    requestOwner: string,
    lifecycle: number,
    requestViewKey: string,
  ) {
    return (
      lifecycle === lifecycleGeneration.current &&
      requestOwner === currentOwnerRef.current &&
      requestViewKey === currentViewKeyRef.current
    );
  }

  const load = useCallback(async () => {
    const requestViewKey = `${myId ?? 'signed-out'}:${id ?? 'missing'}`;
    const generation = ++loadGeneration.current;
    if (!myId || !id) {
      setPage(null);
      setPosts([]);
      setDataViewKey(requestViewKey);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [p, feed] = await Promise.all([getPage(id), listFeed(undefined, undefined, id)]);
      if (generation !== loadGeneration.current || currentOwnerRef.current !== myId) return;
      setPage(p);
      setPosts(feed);
      setDataViewKey(requestViewKey);
    } catch (e) {
      if (generation !== loadGeneration.current || currentOwnerRef.current !== myId) return;
      setPage(null);
      setPosts([]);
      setDataViewKey(requestViewKey);
      Alert.alert('Could not load page', String((e as Error).message ?? e));
    } finally {
      if (generation !== loadGeneration.current || currentOwnerRef.current !== myId) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, myId]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadGeneration.current += 1;
        lifecycleGeneration.current += 1;
        likesInFlight.current.clear();
        setPosting(false);
        setFollowBusy(false);
      };
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onToggleFollow() {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    const target = page;
    if (!requestOwner || !target || target.is_owner || followBusy) return;
    setFollowBusy(true);
    const next = !target.is_following;
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
        await followPage(target.id);
      } else {
        await unfollowPage(target.id);
      }
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      showToast(next ? `Following ${target.name}` : `Unfollowed ${target.name}`);
    } catch (e) {
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
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
      if (isCurrentMutation(requestOwner, lifecycle, requestViewKey)) {
        setFollowBusy(false);
      }
    }
  }

  const canPost = body.trim().length > 0 && !posting;

  async function onPost() {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    const targetId = id;
    const text = body.trim();
    if (!requestOwner || !targetId || !page?.is_owner || !text) return;
    setPosting(true);
    try {
      await createPost(text, null, null, targetId);
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      setBody('');
      setPosting(false);
      showToast('Posted to your page');
      void load();
    } catch (e) {
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      Alert.alert('Could not post', String((e as Error).message ?? e));
    } finally {
      if (isCurrentMutation(requestOwner, lifecycle, requestViewKey)) {
        setPosting(false);
      }
    }
  }

  async function onToggleLike(post: FeedPost) {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    if (!requestOwner) return;
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
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      setPosts((cur) =>
        cur.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: !liked, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)) }
            : p,
        ),
      );
      Alert.alert('Could not update like', String((e as Error).message ?? e));
    } finally {
      if (isCurrentMutation(requestOwner, lifecycle, requestViewKey)) {
        likesInFlight.current.delete(post.id);
      }
    }
  }

  function backToPages() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/pages' as never);
    }
  }

  if (loading || dataViewKey !== viewKey) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!page) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>This page was not found or is no longer available.</Text>
        <Button title="Back to pages" onPress={backToPages} />
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
                <Text style={styles.time}>
                  {timeAgo(item.created_at)}
                  {item.tagged.length > 0 ? ` · ${taggedLabel(item.tagged)}` : ''}
                </Text>
              </View>
              <Pressable
                  onPress={() => {
                    const requestOwner = myId;
                    const lifecycle = lifecycleGeneration.current;
                    const requestViewKey = viewKey;
                    if (!requestOwner) return;
                    showPostMenu(item, requestOwner, (postId) => {
                      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
                      setPosts((cur) => cur.filter((p) => p.id !== postId));
                    });
                  }}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Post options"
                style={({ pressed }) => [styles.postMenuBtn, pressed && { opacity: 0.6 }]}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {item.body ? (
              <Pressable
                onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                accessibilityRole="link"
                accessibilityLabel="Open post"
              >
                <Text style={styles.body}>{item.body}</Text>
              </Pressable>
            ) : null}
            {item.image_url ? (
              <View style={{ alignSelf: 'stretch' }}>
                <Pressable
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                  style={({ pressed }) => [{ alignSelf: 'stretch' as const }, pressed && { opacity: 0.9 }]}
                  accessibilityRole="link"
                  accessibilityLabel="Open post"
                >
                  {item.post_type === 'video' ? (
                    <PostVideo url={item.image_url} />
                  ) : (
                    <PostImage url={item.image_url} capTall />
                  )}
                </Pressable>
                {item.post_type !== 'video' ? <SaveToMemories url={item.image_url} /> : null}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                onPress={() => onToggleLike(item)}
                hitSlop={8}
                accessibilityLabel={item.liked_by_me ? 'Remove encouragement' : 'Encourage'}
              >
                <Ionicons
                  name={item.liked_by_me ? 'flame' : 'flame-outline'}
                  size={19}
                  color={item.liked_by_me ? colors.cheer : colors.textMuted}
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
  cover: { width: '100%', height: 180, backgroundColor: colors.surface },
  avatarWrap: {
    // avatar sits fully on the cover — cover reaches its bottom edge
    marginTop: -(AVATAR_SIZE + 8),
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
  postMenuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
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
  liked: { color: colors.cheer },
});
