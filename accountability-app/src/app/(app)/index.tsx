import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { listFeed, setLiked, FEED_PAGE_SIZE, type FeedMode } from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { attendEvent } from '../../events/api';
import { SaveToMemories } from '../../memories/SaveToMemories';
import { StoryRail, type StoryRailHandle } from '../../stories/StoryRail';
import { AdCard } from '../../pro/AdCard';
import { ADS_ENABLED } from '../../pro/monetization';
import { useIsPro } from '../../pro/ProProvider';
import { showToast } from '../../ui/Toast';
import { timeAgo, authorLabel, taggedLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import { BroadcastSheet } from '../../feed/BroadcastSheet';
import { PostImage } from '../../feed/PostImage';
import { useUnreadNotifications } from '../../notify/useUnread';
import { getMyProfile } from '../../profiles/api';
import type { FeedPost } from '../../feed/types';
import { colors, font, radius, spacing, shadow, contentMax } from '../../ui/theme';
import { hapticTap } from '../../ui/haptics';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type CreateItem = {
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
} & ({ kind: 'story' } | { kind: 'route'; route: string });

// a sponsored card every N posts for free members (Pro sees none)
const AD_EVERY = 5;
type FeedRow = { kind: 'post'; post: FeedPost } | { kind: 'ad'; id: string };

// warm hairline for subtle in-post lines (content ↔ actions).
const HAIRLINE = '#ece9e3';
function postTypeLabel(post: FeedPost): string | null {
  const labels: Partial<Record<FeedPost['post_type'], string>> = {
    run: 'Verified run',
    workout: 'Workout',
    milestone: 'Milestone',
    event: 'Event',
    memory: 'Memory',
    savings: 'Savings win',
  };
  return labels[post.post_type] ?? null;
}

function HeaderIcon({
  icon,
  size = 24,
  label,
  onPress,
}: {
  icon: IoniconName;
  size?: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={colors.primary} />
    </Pressable>
  );
}

/** Header bell with a live unread dot — opens the Notifications screen. */
function QuickShare({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickShare, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={styles.quickShareText}>{label}</Text>
    </Pressable>
  );
}

function NotificationsBell({ onPress }: { onPress: () => void }) {
  const { unread } = useUnreadNotifications();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel="Notifications"
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.primary} />
      {unread > 0 ? <View style={styles.headerDot} /> : null}
    </Pressable>
  );
}

export default function Feed() {
  const router = useRouter();
  const navigation = useNavigation();
  const { isPro } = useIsPro();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>('buddies');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [attending, setAttending] = useState<Set<string>>(new Set());
  const [broadcast, setBroadcast] = useState<FeedPost | null>(null);
  const [me, setMe] = useState<{ name: string | null; avatar: string | null }>({
    name: null,
    avatar: null,
  });
  // posts with a like request in flight — blocks double-taps from racing
  const likesInFlight = useRef<Set<string>>(new Set());
  const storyRailRef = useRef<StoryRailHandle>(null);

  // header: ☰ menu left; ＋ create, pages, groups right
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ marginLeft: 8 }}>
          <HeaderIcon icon="menu-outline" size={26} label="Menu" onPress={() => router.push('/menu' as never)} />
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', marginRight: 8 }}>
          <HeaderIcon icon="search-outline" size={24} label="Search" onPress={() => router.push('/search' as never)} />
          <HeaderIcon icon="add-circle-outline" size={25} label="Create" onPress={() => setCreateOpen(true)} />
          <NotificationsBell onPress={() => router.push('/notifications' as never)} />
        </View>
      ),
    });
  }, [navigation, router]);

  useEffect(() => {
    getMyProfile()
      .then((p) => setMe({ name: p?.display_name ?? null, avatar: p?.avatar_url ?? null }))
      .catch(() => {});
  }, []);

  const CREATE_ITEMS: CreateItem[] = [
    {
      icon: 'create-outline',
      tint: colors.primary,
      title: 'Post',
      sub: 'Share a win or an update',
      kind: 'route',
      route: '/compose',
    },
    {
      icon: 'add-circle-outline',
      tint: '#db2777',
      title: 'My Day',
      sub: 'Share a photo for 24 hours',
      kind: 'story',
    },
    {
      icon: 'flame-outline',
      tint: '#f59e0b',
      title: 'Win card',
      sub: 'Share your streak as an image',
      kind: 'route',
      route: '/win-card',
    },
    {
      icon: 'people-outline',
      tint: '#16a34a',
      title: 'Group',
      sub: 'Start a community',
      kind: 'route',
      route: '/group-new',
    },
    {
      icon: 'storefront-outline',
      tint: '#0d9488',
      title: 'Page',
      sub: 'For your gym, coaching or brand',
      kind: 'route',
      route: '/page-new',
    },
  ];

  const load = useCallback(async () => {
    try {
      const page = await listFeed(undefined, undefined, undefined, feedMode);
      setPosts(page);
      setEndReached(page.length < FEED_PAGE_SIZE);
    } catch (e) {
      Alert.alert('Could not load the feed', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedMode]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onLoadMore() {
    if (loadingMore || endReached || loading || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = posts[posts.length - 1].created_at;
      const page = await listFeed(oldest, undefined, undefined, feedMode);
      if (page.length < FEED_PAGE_SIZE) setEndReached(true);
      if (page.length > 0) {
        setPosts((cur) => {
          const seen = new Set(cur.map((p) => p.id));
          return [...cur, ...page.filter((p) => !seen.has(p.id))];
        });
      }
    } catch {
      // silent — user can scroll again to retry
    } finally {
      setLoadingMore(false);
    }
  }

  async function onAttend(post: FeedPost) {
    if (!post.event || attending.has(post.event.group_id)) return;
    setAttending((cur) => new Set(cur).add(post.event!.group_id));
    try {
      await attendEvent(post.event.group_id);
      showToast(`You're in! Added to the "${post.event.title}" group 🎉`);
    } catch (e) {
      setAttending((cur) => {
        const n = new Set(cur);
        n.delete(post.event!.group_id);
        return n;
      });
      Alert.alert('Could not join', String((e as Error).message ?? e));
    }
  }

  async function onToggleLike(post: FeedPost) {
    if (likesInFlight.current.has(post.id)) return; // one request per post at a time
    likesInFlight.current.add(post.id);
    const liked = !post.liked_by_me;
    if (liked) hapticTap();
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

  // ── post ⋮ menu: hide / report a buddy's post, remove your own ────────────
  function onPostMenu(item: FeedPost) {
    showPostMenu(item, myId, (postId) => setPosts((cur) => cur.filter((p) => p.id !== postId)));
  }

  // interleave a sponsored card every AD_EVERY posts (free members only)
  const feedData = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    posts.forEach((p, i) => {
      rows.push({ kind: 'post', post: p });
      if (ADS_ENABLED && !isPro && (i + 1) % AD_EVERY === 0) rows.push({ kind: 'ad', id: `ad-${p.id}` });
    });
    return rows;
  }, [posts, isPro]);

  return (
    <View style={styles.screen}>
      {/* ＋ create sheet */}
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <BlurView
              intensity={60}
              tint="light"
              style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
            />
            <View style={styles.sheetGlass} />
            <Text style={styles.sheetTitle}>Create</Text>
            {CREATE_ITEMS.map((item) => (
              <Pressable
                key={item.title}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                onPress={() => {
                  setCreateOpen(false);
                  setTimeout(() => {
                    if (item.kind === 'story') {
                      storyRailRef.current?.openPicker();
                    } else {
                      router.push(item.route as never);
                    }
                  }, 250); // let the sheet close first
                }}
              >
                <View style={[styles.sheetIcon, { backgroundColor: `${item.tint}15` }]}>
                  <Ionicons name={item.icon} size={20} color={item.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowTitle}>{item.title}</Text>
                  <Text style={styles.sheetRowSub}>{item.sub}</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* slim prompt row — opens the full-screen composer (FB-style, above stories) */}
      <View style={styles.feedTabsWrap}>
      <View style={styles.feedTabs} accessibilityRole="tablist">
        {(['buddies', 'discover'] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => setFeedMode(mode)}
            hitSlop={{ top: 3, bottom: 3 }}
            style={[styles.feedTab, feedMode === mode && styles.feedTabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: feedMode === mode }}
          >
            <Text style={[styles.feedTabText, feedMode === mode && styles.feedTabTextActive]}>
              {mode === 'buddies' ? 'Buddies' : 'Discover'}
            </Text>
          </Pressable>
        ))}
      </View>
      </View>
      <View style={styles.promptWrap}>
        <Pressable
          style={({ pressed }) => [styles.promptRow, pressed && styles.pressed]}
          onPress={() => router.push('/compose' as never)}
          accessibilityRole="button"
          accessibilityLabel="Share a win — create a post"
        >
          <Avatar url={me.avatar} name={me.name} size={36} />
          <Text style={styles.promptText} numberOfLines={1}>
            Inspire us today!
          </Text>
        </Pressable>
        <View style={styles.composerDivider} />
        <View style={styles.quickShareRow}>
          <QuickShare icon="create-outline" label="Post" onPress={() => router.push('/compose' as never)} />
          <View style={styles.quickShareDivider} />
          <QuickShare icon="images-outline" label="Photo" onPress={() => router.push('/compose?photo=1' as never)} />
          <View style={styles.quickShareDivider} />
          <QuickShare icon="walk-outline" label="Flex" onPress={() => router.push('/run' as never)} />
        </View>
      </View>
      <View style={styles.storyStrip}>
        <StoryRail ref={storyRailRef} meName={me.name} meAvatar={me.avatar} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={feedData}
          keyExtractor={(row) => (row.kind === 'post' ? row.post.id : row.id)}
          contentContainerStyle={feedData.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <Ionicons
                name={feedMode === 'discover' ? 'compass-outline' : 'people-outline'}
                size={38}
                color={colors.primary}
              />
              <Text style={styles.emptyTitle}>
                {feedMode === 'discover' ? 'Discover is quiet right now' : 'No buddy posts yet'}
              </Text>
              <Text style={styles.emptySub}>
                {feedMode === 'discover'
                  ? 'Public wins from outside your buddy circle appear here.'
                  : 'Share a win or add an accountability buddy.'}
              </Text>
              <View style={styles.emptyActions}>
                <Pressable
                  onPress={() => router.push('/compose' as never)}
                  style={({ pressed }) => [styles.emptyPrimary, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Share a win"
                >
                  <Ionicons name="create-outline" size={17} color="#fff" />
                  <Text style={styles.emptyPrimaryText}>Share a win</Text>
                </Pressable>
                {feedMode === 'buddies' ? (
                  <Pressable
                    onPress={() => router.push('/buddy' as never)}
                    style={({ pressed }) => [styles.emptySecondary, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Find buddies"
                  >
                    <Text style={styles.emptySecondaryText}>Find buddies</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item: row }) => {
            if (row.kind === 'ad') {
              return (
                <View style={styles.adWrap}>
                  <AdCard onGoPro={() => router.push('/paywall' as never)} />
                </View>
              );
            }
            const item = row.post;
            return (
            <View style={styles.post}>
              <View style={styles.postBody}>
              <View style={styles.cardHeader}>
                <Avatar url={item.author_avatar} name={item.author_name} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>{authorLabel(item.author_name)}</Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.time}>
                      {timeAgo(item.created_at)}
                      {item.tagged.length > 0 ? ` · ${taggedLabel(item.tagged)}` : ''}
                    </Text>
                    {postTypeLabel(item) ? (
                      <View style={[styles.typeChip, item.post_type === 'milestone' && styles.typeChipMilestone]}>
                        {item.post_type === 'run' ? <Ionicons name="shield-checkmark" size={11} color={colors.primary} /> : null}
                        <Text style={[styles.typeChipText, item.post_type === 'milestone' && styles.typeChipTextMilestone]}>
                          {postTypeLabel(item)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={() => onPostMenu(item)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Post options"
                  style={({ pressed }) => [styles.postMenuBtn, pressed && styles.pressed]}
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
              {item.event ? (
                <View style={styles.eventBox}>
                  <View style={styles.eventIconWrap}>
                    <Ionicons name="calendar" size={20} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {item.event.title}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {new Date(item.event.starts_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {item.event.location ? ` · ${item.event.location}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.attendBtn,
                      attending.has(item.event!.group_id) && styles.attendDone,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => onAttend(item)}
                    accessibilityLabel={`Attend ${item.event.title}`}
                  >
                    <Text style={styles.attendText}>
                      {attending.has(item.event.group_id) ? 'Going ✓' : 'Attend'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {item.image_url ? (
                <View style={{ alignSelf: 'stretch' }}>
                  <Pressable
                    onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                    style={({ pressed }) => [{ alignSelf: 'stretch' as const }, pressed && { opacity: 0.9 }]}
                    accessibilityRole="link"
                    accessibilityLabel="Open post"
                  >
                    <PostImage url={item.image_url} capTall />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  onPress={() => onToggleLike(item)}
                  hitSlop={8}
                  accessibilityLabel={item.liked_by_me ? 'Remove cheer' : 'Cheer'}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={item.liked_by_me ? 'flame' : 'flame-outline'}
                    size={19}
                    color={item.liked_by_me ? colors.cheer : colors.textMuted}
                  />
                  <Text style={[styles.actionText, item.liked_by_me && styles.liked]}>
                    Cheer{item.like_count > 0 ? ` ${item.like_count}` : ''}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                  hitSlop={8}
                  accessibilityLabel="View comments"
                  accessibilityRole="button"
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.actionText}>
                    Comment{item.comment_count > 0 ? ` ${item.comment_count}` : ''}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.action, styles.actionEnd, pressed && styles.pressed]}
                  onPress={() => setBroadcast(item)}
                  hitSlop={8}
                  accessibilityLabel="Share this post"
                  accessibilityRole="button"
                >
                  <Ionicons name="paper-plane-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.actionText}>Share</Text>
                </Pressable>
                {item.image_url ? <SaveToMemories url={item.image_url} inline /> : null}
              </View>
              </View>
            </View>
            );
          }}
        />
      )}

      {/* broadcast — send to buddies or blast to other apps */}
      <BroadcastSheet post={broadcast} onClose={() => setBroadcast(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceAlt },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 64,
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  },
  sheet: {
    width: 280,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    padding: spacing.sm,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // translucent tint over the blur so dark text keeps 4.5:1 contrast
  sheetGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    minHeight: 56,
  },
  sheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  sheetRowSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  // stories + composer form a white "sheet" at the top of the slate feed
  storyStrip: {
    ...contentMax,
    backgroundColor: colors.card,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerDot: {
    position: 'absolute',
    top: 8,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#db2777',
    borderWidth: 1.5,
    borderColor: colors.card,
  },
  feedTabsWrap: {
    ...contentMax,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  feedTabs: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    padding: 1,
  },
  feedTab: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  feedTabActive: { backgroundColor: colors.primary },
  feedTabText: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
  feedTabTextActive: { color: colors.onPrimary },
  promptWrap: {
    ...contentMax,
    backgroundColor: colors.card,
    width: '93%',
    alignSelf: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
  },
  promptText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: font.regular,
    color: colors.textMuted,
  },
  composerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
  quickShareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
  },
  quickShare: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.sm,
  },
  quickShareDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
  quickShareText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13.5 },
  composer: {
    ...contentMax,
    backgroundColor: colors.card,
    padding: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
  previewWrap: { alignSelf: 'flex-start' },
  memoriesCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    minHeight: 32,
  },
  memoriesCheckText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  tagEmpty: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    padding: spacing.md,
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  tagName: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },
  tagDone: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.sm,
  },
  tagDoneText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  preview: { width: 110, height: 110, borderRadius: radius.sm, backgroundColor: colors.surface },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.text,
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eventForm: { gap: spacing.sm },
  eventInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 14.5,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  eventHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  eventBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  eventIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.text },
  eventMeta: { fontFamily: font.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  attendBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
    minHeight: 38,
    justifyContent: 'center',
  },
  attendDone: { backgroundColor: colors.textMuted },
  attendText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: 44,
  },
  photoBtnText: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
  // pushes Photo/Live/Event toward the right, away from the left-anchored Post
  firstAction: { marginLeft: 'auto' },
  postBtn: {
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: 6 },
  emptyWrap: { paddingBottom: 110, ...contentMax },
  list: { paddingTop: spacing.sm, paddingBottom: 110, ...contentMax },
  post: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  postBody: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  adWrap: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  footerSpinner: { paddingVertical: spacing.lg },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptyTitle: { fontSize: 18, fontFamily: font.bold, color: colors.text, marginTop: 4 },
  emptySub: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 300,
  },
  emptyActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  emptyPrimary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  emptyPrimaryText: { color: '#fff', fontFamily: font.bold, fontSize: 13.5 },
  emptySecondary: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  emptySecondaryText: { color: colors.primary, fontFamily: font.bold, fontSize: 13.5 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  postMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  author: { fontSize: 15.5, fontFamily: font.bold, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2, flexWrap: 'wrap' },
  time: { color: colors.textMuted, fontSize: 12, fontFamily: font.medium },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: { color: colors.primary, fontFamily: font.bold, fontSize: 10.5, textTransform: 'uppercase' },
  typeChipMilestone: { backgroundColor: '#fff7df' },
  typeChipTextMilestone: { color: '#d97706' },
  body: { fontSize: 15.5, lineHeight: 22, fontFamily: font.regular, color: colors.text },
  postImage: { width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: colors.surface },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionEnd: {},
  actionText: { fontSize: 12, color: colors.textMuted, fontFamily: font.semibold },
  liked: { color: colors.cheer },
});
