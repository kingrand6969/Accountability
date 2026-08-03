import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getGroup,
  getGroupGatekey,
  joinGroup,
  joinGroupWithKey,
  leaveGroup,
  type Group,
} from '../../groups/api';
import { listFeed, createPost, setLiked } from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { SaveToMemories } from '../../memories/SaveToMemories';
import { PostImage } from '../../feed/PostImage';
import { PostVideo } from '../../feed/PostVideo';
import { shareInviteText } from '../../social/invite';
import { showToast } from '../../ui/Toast';
import { timeAgo, authorLabel, taggedLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import type { FeedPost } from '../../feed/types';
import { EmptyState } from '../../ui/EmptyState';
import { Button } from '../../ui/Button';
import { colors, font, radius, spacing, shadow } from '../../ui/theme';

export default function GroupDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
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
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [keyInput, setKeyInput] = useState('');
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
      setGroup(null);
      setPosts([]);
      setDataViewKey(null);
      setBody('');
      setKeyInput('');
      setPosting(false);
      setJoining(false);
      setLeaving(false);
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
      setGroup(null);
      setPosts([]);
      setDataViewKey(requestViewKey);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const g = await getGroup(id);
      // Non-members can't see posts (RLS) — don't even ask.
      const nextPosts = g?.is_member ? await listFeed(undefined, id) : [];
      if (generation !== loadGeneration.current || currentOwnerRef.current !== myId) return;
      setGroup(g);
      setPosts(nextPosts);
      setDataViewKey(requestViewKey);
    } catch (e) {
      if (generation !== loadGeneration.current || currentOwnerRef.current !== myId) return;
      setGroup(null);
      setPosts([]);
      setDataViewKey(requestViewKey);
      Alert.alert('Could not load group', String((e as Error).message ?? e));
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
        setJoining(false);
        setLeaving(false);
      };
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onJoin() {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    const target = group;
    if (!requestOwner || !target || joining) return;
    setJoining(true);
    try {
      if (target.privacy === 'private') {
        const ok = await joinGroupWithKey(target.id, keyInput);
        if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
        if (!ok) {
          Alert.alert('Wrong gatekey', 'That key didn’t match. Ask the group admin for the right one.');
          return;
        }
      } else {
        await joinGroup(target.id);
      }
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      setKeyInput('');
      setJoining(false);
      showToast(`Welcome to ${target.name} 🎉`);
      void load();
    } catch (e) {
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      Alert.alert('Could not join group', String((e as Error).message ?? e));
    } finally {
      if (isCurrentMutation(requestOwner, lifecycle, requestViewKey)) {
        setJoining(false);
      }
    }
  }

  async function onInvite() {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    const target = group;
    if (!requestOwner || !target) return;
    let message =
      `Join my group "${target.name}" on AccountAbility! ` +
      `Search "AccountAbility" in your app store.`;
    if (target.privacy === 'private') {
      const key = await getGroupGatekey(target.id).catch(() => null);
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      if (key) message += `\n\nGatekey to get in: ${key}`;
    }
    if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
    await shareInviteText(message);
  }

  function onLeave() {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    const target = group;
    if (!requestOwner || !target || leaving) return;
    Alert.alert('Leave group?', `You'll stop seeing posts from ${target.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
          setLeaving(true);
          try {
            await leaveGroup(target.id);
            if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
            setLeaving(false);
            showToast('Left the group');
            void load();
          } catch (e) {
            if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
            Alert.alert('Could not leave group', String((e as Error).message ?? e));
          } finally {
            if (isCurrentMutation(requestOwner, lifecycle, requestViewKey)) {
              setLeaving(false);
            }
          }
        },
      },
    ]);
  }

  const canPost = body.trim().length > 0 && !posting;

  async function onPost() {
    const requestOwner = myId;
    const lifecycle = lifecycleGeneration.current;
    const requestViewKey = viewKey;
    const targetId = id;
    const text = body.trim();
    if (!requestOwner || !targetId || !group?.is_member || !text) return;
    setPosting(true);
    try {
      await createPost(text, null, targetId);
      if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
      setBody('');
      setPosting(false);
      showToast('Posted to the group');
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

  function backToGroups() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/groups' as never);
    }
  }

  if (loading || dataViewKey !== viewKey) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>This group was not found or is no longer available.</Text>
        <Button title="Back to groups" onPress={backToGroups} />
      </View>
    );
  }

  const header = (
    <View style={styles.headerBlock}>
      <View style={styles.groupCard}>
        <View style={styles.groupTitleRow}>
          <View style={styles.iconCircle}>
            <Ionicons name="people" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.groupName}>{group.name}</Text>
            <View style={styles.metaRow}>
              {group.privacy === 'private' ? (
                <Ionicons name="lock-closed" size={12} color={colors.textMuted} />
              ) : null}
              <Text style={styles.groupMeta}>
                {group.privacy === 'private' ? 'Private · ' : ''}
                {group.member_count} member{group.member_count === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          {group.is_admin ? (
            <View style={styles.adminChip}>
              <Ionicons name="shield-checkmark" size={12} color={colors.primary} />
              <Text style={styles.adminChipText}>Admin</Text>
            </View>
          ) : null}
        </View>
        {group.description?.trim() ? (
          <Text style={styles.groupDescription}>{group.description.trim()}</Text>
        ) : null}
        {!group.is_member ? (
          group.privacy === 'private' ? (
            <View style={styles.keyBlock}>
              <TextInput
                style={styles.keyInput}
                placeholder="Enter the gatekey to join"
                placeholderTextColor={colors.textFaint}
                value={keyInput}
                onChangeText={setKeyInput}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Group gatekey"
              />
              <Button
                title="Join with gatekey"
                onPress={onJoin}
                loading={joining}
                disabled={keyInput.trim().length === 0}
              />
              <Text style={styles.keyHint}>
                This is a private group — ask a member for the key.
              </Text>
            </View>
          ) : (
            <Button title="Join group" onPress={onJoin} loading={joining} />
          )
        ) : (
          <View style={styles.memberActions}>
            <Button title="Invite buddies" onPress={onInvite} style={{ flex: 1 }} />
            {!group.is_admin ? (
              <Button
                title="Leave"
                variant="ghost"
                onPress={onLeave}
                loading={leaving}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        )}
      </View>

      {group.is_member ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder={`Share something with ${group.name}…`}
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
            accessibilityLabel="Post to the group"
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
        data={group.is_member ? posts : []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          group.is_member ? (
            <EmptyState
              icon="chatbubbles-outline"
              title="No posts yet"
              subtitle="Be the first to post to the group."
            />
          ) : group.privacy === 'private' ? (
            <EmptyState
              icon="lock-closed-outline"
              title="Members only"
              subtitle="Enter the gatekey above to join and see posts."
            />
          ) : (
            <EmptyState
              icon="lock-closed-outline"
              title="Members only"
              subtitle="Join the group to see and share posts."
              actionTitle="Join group"
              onAction={onJoin}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Avatar url={item.author_avatar} name={item.author_name} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.author}>{authorLabel(item.author_name)}</Text>
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
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupName: { fontFamily: font.extrabold, fontSize: 20, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  groupMeta: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  keyBlock: { gap: spacing.sm },
  keyInput: {
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
  keyHint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  memberActions: { flexDirection: 'row', gap: spacing.sm },
  adminChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  adminChipText: { fontFamily: font.bold, fontSize: 12, color: colors.primary },
  groupDescription: {
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
