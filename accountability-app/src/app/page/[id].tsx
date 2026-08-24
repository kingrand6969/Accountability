import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useActiveVideoList } from '../../feed/useActiveVideoList';
import { showToast } from '../../ui/Toast';
import { timeAgo, taggedLabel } from '../../feed/format';
import type { FeedPost } from '../../feed/types';
import { EmptyState } from '../../ui/EmptyState';
import { Button } from '../../ui/Button';
import { useAppTheme } from '../../ui/AppThemeProvider';
import {
  colors,
  font,
  radius,
  spacing,
  shadow,
  type AppThemeColors,
  type AppThemeMode,
} from '../../ui/theme';

const COVER_GRADIENT = ['#263223', '#6F9F00', '#83B91B'] as const;

function categoryLabel(value: string): string | null {
  return PAGE_CATEGORIES.find((c) => c.value === value)?.label ?? null;
}

export default function PageDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const { session } = useAuth();
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [mode, theme]);
  const actionColor = theme.ink.action;
  const mutedColor = mode === 'light' ? colors.textMuted : theme.ink.muted;
  const faintColor = mode === 'light' ? colors.textFaint : theme.ink.muted;
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
  const [screenFocused, setScreenFocused] = useState(false);
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
      setScreenFocused(true);
      void load();
      return () => {
        setScreenFocused(false);
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

  const videoPlayback = useActiveVideoList({
    posts,
    scopeKey: viewKey,
    focused: screenFocused,
    blocked: loading || refreshing || posting || followBusy,
  });

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
        <ActivityIndicator size="large" color={actionColor} />
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
              <Ionicons name="storefront" size={28} color={actionColor} />
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
                <Ionicons name="ribbon-outline" size={12} color={actionColor} />
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
            placeholderTextColor={faintColor}
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
            hitSlop={2}
            accessibilityLabel="Post to your page"
          >
            {posting ? (
              <ActivityIndicator color={theme.ink.inverse} />
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
        data={videoPlayback.rows}
        keyExtractor={(row) => row.post.id}
        viewabilityConfig={videoPlayback.viewabilityConfig}
        onViewableItemsChanged={videoPlayback.onViewableItemsChanged}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={actionColor} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="megaphone-outline"
            title="No posts yet"
            subtitle={page.is_owner ? 'Share your first update' : 'Check back soon.'}
          />
        }
        renderItem={({ item: row }) => {
          const item = row.post;
          return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {/* The page is speaking, not the person — show the page identity. */}
              {page.avatar_url ? (
                <Image source={{ uri: page.avatar_url }} style={styles.postAvatarImage} />
              ) : (
                <View style={styles.postAvatarFallback}>
                  <Ionicons name="storefront-outline" size={18} color={actionColor} />
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
                <Ionicons name="ellipsis-horizontal" size={18} color={mutedColor} />
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
                    <PostVideo url={item.image_url} active={videoPlayback.activeVideoId === row.post.id} />
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
                accessibilityLabel={item.liked_by_me ? 'Remove Cheer' : 'Cheer'}
              >
                <Ionicons
                  name={item.liked_by_me ? 'flame' : 'flame-outline'}
                  size={19}
                  color={item.liked_by_me ? colors.cheer : mutedColor}
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
                <Ionicons name="chatbubble-outline" size={18} color={mutedColor} />
                <Text style={styles.actionText}>{item.comment_count}</Text>
              </Pressable>
            </View>
          </View>
          );
        }}
      />
    </View>
  );
}

const AVATAR_SIZE = 64;

const createStyles = (theme: AppThemeColors, mode: AppThemeMode) => {
  const primaryInk = mode === 'light' ? colors.text : theme.ink.primary;
  const secondaryInk = mode === 'light' ? colors.textSecondary : theme.ink.secondary;
  const mutedInk = mode === 'light' ? colors.textMuted : theme.ink.muted;
  const faintInk = mode === 'light' ? colors.textFaint : theme.ink.muted;
  const softActionSurface = mode === 'light' ? colors.primarySoft : theme.surface.muted;
  const neutralSurface = mode === 'light' ? colors.surface : theme.surface.muted;

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.raised },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: theme.surface.raised,
  },
  notFound: { fontFamily: font.regular, color: mutedInk },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md },
  pageCard: {
    backgroundColor: theme.surface.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    overflow: 'hidden',
    ...shadow.card,
  },
  cover: { width: '100%', height: 180, backgroundColor: neutralSurface },
  avatarWrap: {
    // avatar sits fully on the cover — cover reaches its bottom edge
    marginTop: -(AVATAR_SIZE + 8),
    marginLeft: spacing.lg,
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: neutralSurface,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: softActionSurface,
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
  pageName: { fontFamily: font.extrabold, fontSize: 20, color: primaryInk },
  handle: { fontFamily: font.medium, fontSize: 14, color: mutedInk, marginTop: 2 },
  ownerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: softActionSurface,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  ownerChipText: { fontFamily: font.bold, fontSize: 12, color: theme.ink.action },
  followBtn: { minHeight: 44, paddingVertical: 10, paddingHorizontal: spacing.lg },
  pageMeta: { fontFamily: font.medium, fontSize: 13.5, color: mutedInk },
  bio: {
    fontFamily: font.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: secondaryInk,
  },
  composer: { gap: spacing.sm },
  composerInput: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: primaryInk,
    minHeight: 48,
    backgroundColor: theme.surface.muted,
  },
  postBtn: {
    alignSelf: 'flex-end',
    backgroundColor: theme.ink.action,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 24,
    minHeight: 44,
    justifyContent: 'center',
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 15 },
  pressed: { opacity: 0.7 },
  card: {
    backgroundColor: theme.surface.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: theme.border.subtle,
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
  postAvatarImage: { width: 40, height: 40, borderRadius: 20, backgroundColor: neutralSurface },
  postAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: softActionSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  author: { fontSize: 15, fontFamily: font.bold, color: primaryInk },
  time: { color: faintInk, fontSize: 12, fontFamily: font.medium },
  body: { fontSize: 15, lineHeight: 22, fontFamily: font.regular, color: primaryInk },
  postImage: { width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: neutralSurface },
  actions: { flexDirection: 'row', gap: spacing.xl, marginTop: 2 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
    minHeight: 32,
  },
  actionText: { fontSize: 14, color: mutedInk, fontFamily: font.semibold },
  liked: { color: colors.cheer },
  });
};
