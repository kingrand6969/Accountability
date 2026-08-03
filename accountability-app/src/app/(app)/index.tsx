import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  FEED_PAGE_SIZE,
  listEncouragementPreviews,
  listFeed,
  setLiked,
  type EncouragementPreview,
  type FeedMode,
} from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { attendEvent } from '../../events/api';
import { StoryRail, type StoryRailHandle } from '../../stories/StoryRail';
import { AdCard } from '../../pro/AdCard';
import { useFeedAdsReady } from '../../pro/adAdapter';
import { useIsPro } from '../../pro/ProProvider';
import { showToast } from '../../ui/Toast';
import { BroadcastSheet } from '../../feed/BroadcastSheet';
import { Avatar } from '../../feed/Avatar';
import { useUnreadNotifications } from '../../notify/useUnread';
import { getMyProfile } from '../../profiles/api';
import type { FeedPost } from '../../feed/types';
import { colors, font, radius, spacing, shadow, contentMax } from '../../ui/theme';
import { hapticTap } from '../../ui/haptics';
import { DiscoverExperience } from '../../discover/DiscoverExperience';
import { SocialBrandHeader } from '../../feed/SocialBrandHeader';
import {
  SocialModeSelector,
  deriveFeedViewState,
  deriveMyDayValues,
  feedRowsBelongToView,
  restoreFeedSession,
  scheduleIdentityBoundAction,
} from '../../feed/SocialModeSelector';
import { MyDayRail } from '../../feed/MyDayRail';
import { FeedProofCard } from '../../feed/FeedProofCard';

type IoniconName = keyof typeof Ionicons.glyphMap;
type CreateItem = {
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
} & ({ kind: 'story' } | { kind: 'route'; route: string });
type FeedRow = { kind: 'post'; post: FeedPost } | { kind: 'ad'; id: string };

const AD_EVERY = 5;
const FEED_SESSION_KEY = 'feed-session-v1';
const CREATE_ITEMS: CreateItem[] = [
  { icon: 'create-outline', tint: colors.primary, title: 'Post', sub: 'Share a win or an update', kind: 'route', route: '/compose' },
  { icon: 'add-circle-outline', tint: '#db2777', title: 'My Day', sub: 'Share a photo for 24 hours', kind: 'story' },
  { icon: 'flame-outline', tint: '#f59e0b', title: 'Win card', sub: 'Share your streak as an image', kind: 'route', route: '/win-card' },
  { icon: 'people-outline', tint: '#16a34a', title: 'Group', sub: 'Start a community', kind: 'route', route: '/group-new' },
  { icon: 'storefront-outline', tint: '#0d9488', title: 'Page', sub: 'For your gym, coaching or brand', kind: 'route', route: '/page-new' },
];

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

export default function Feed() {
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<FeedMode | null>(null);
  const [encouragementPreviews, setEncouragementPreviews] = useState<Map<string, EncouragementPreview>>(new Map());
  const [feedMode, setFeedMode] = useState<FeedMode>('buddies');
  const [discoverVisited, setDiscoverVisited] = useState(false);
  const [restored, setRestored] = useState(false);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [attending, setAttending] = useState<Set<string>>(new Set());
  const [broadcast, setBroadcast] = useState<FeedPost | null>(null);
  const [me, setMe] = useState<{ name: string | null; avatar: string | null }>({ name: null, avatar: null });
  const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);
  const likesInFlight = useRef<Set<string>>(new Set());
  const loadGeneration = useRef(0);
  const storyRailRef = useRef<StoryRailHandle>(null);
  const feedListRef = useRef<FlatList<FeedRow>>(null);
  const buddiesOffset = useRef(0);
  const pendingBuddiesOffset = useRef<number | null>(null);
  const listContentReady = useRef(false);
  const connectivityRef = useRef(true);
  const profileGeneration = useRef(0);
  const currentUserIdRef = useRef(myId);
  // This latest-value ref prevents a prior identity's delayed action during the render-to-effect gap.
  // eslint-disable-next-line react-hooks/refs
  currentUserIdRef.current = myId;
  const pendingCreateAction = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { unread } = useUnreadNotifications();
  const { isPro, loading: proLoading } = useIsPro();

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    return () => {
      currentUserIdRef.current = null;
      if (pendingCreateAction.current) clearTimeout(pendingCreateAction.current);
      pendingCreateAction.current = null;
    };
  }, [myId]);

  useEffect(() => {
    const generation = ++profileGeneration.current;
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!alive || generation !== profileGeneration.current) return;
      setMe({ name: null, avatar: null });
      setProfileOwnerId(null);
      if (!myId) return;
      try {
        const profile = await getMyProfile();
        if (!alive || generation !== profileGeneration.current) return;
        setMe({ name: profile?.display_name ?? null, avatar: profile?.avatar_url ?? null });
        setProfileOwnerId(myId);
      } catch {
        // The signed-in feed remains usable without profile decoration.
      }
    });
    return () => {
      alive = false;
      profileGeneration.current += 1;
    };
  }, [myId]);

  useEffect(() => {
    let alive = true;
    loadGeneration.current += 1;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      setRestored(false);
      setPosts([]);
      setDataOwnerId(null);
      setDataMode(null);
      setEncouragementPreviews(new Map());
      setLoadError(null);
      setLoadingMore(false);
      setRefreshing(false);
      setEndReached(false);
      setLoading(!!myId);
      setMe({ name: null, avatar: null });
      setProfileOwnerId(null);
      setBroadcast(null);
      setAttending(new Set());
      setCreateOpen(false);
      likesInFlight.current.clear();
      pendingBuddiesOffset.current = null;
      listContentReady.current = false;
      try {
        const raw = await AsyncStorage.getItem(FEED_SESSION_KEY);
        const saved = restoreFeedSession(raw ? JSON.parse(raw) : null);
        if (!alive) return;
        buddiesOffset.current = saved.buddiesOffset;
        pendingBuddiesOffset.current = saved.buddiesOffset;
        setFeedMode(saved.mode);
        setDiscoverVisited(saved.mode === 'discover');
      } catch {
        // Harmless preferences are optional.
      } finally {
        if (alive) setRestored(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [myId]);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (feedMode === 'buddies') {
      pendingBuddiesOffset.current = buddiesOffset.current;
      listContentReady.current = false;
    }
    setLoadError(null);
    setLoadingMore(false);
    if (!myId) {
      setPosts([]);
      setDataOwnerId(null);
      setDataMode(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const page = await listFeed(undefined, undefined, undefined, feedMode);
      if (generation !== loadGeneration.current) return;
      setPosts(page);
      setDataOwnerId(myId);
      setDataMode(feedMode);
      setEndReached(page.length < FEED_PAGE_SIZE);
      try {
        const previews = await listEncouragementPreviews(page.map((post) => post.id));
        if (generation !== loadGeneration.current) return;
        setEncouragementPreviews(previews);
      } catch {
        if (generation !== loadGeneration.current) return;
        setEncouragementPreviews(new Map());
      }
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      setLoadError(String((error as Error).message ?? error));
    } finally {
      if (generation !== loadGeneration.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedMode, myId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const nextOnline = state.isConnected !== false && state.isInternetReachable !== false;
      connectivityRef.current = nextOnline;
      setOnline(nextOnline);
    });
    return unsubscribe;
  }, []);

  const previousOnline = useRef(true);
  useEffect(() => {
    const reconnected = !previousOnline.current && online;
    previousOnline.current = online;
    if (reconnected && restored && myId) void load();
  }, [load, myId, online, restored]);

  const persistFeedPosition = useCallback(() => {
    void AsyncStorage.setItem(
      FEED_SESSION_KEY,
      JSON.stringify({ mode: feedMode, buddiesOffset: buddiesOffset.current }),
    );
  }, [feedMode]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        loadGeneration.current += 1;
        pendingBuddiesOffset.current = buddiesOffset.current;
        listContentReady.current = false;
        persistFeedPosition();
        return;
      }
      if (restored && myId && connectivityRef.current) void load();
    });
    return () => subscription.remove();
  }, [load, myId, persistFeedPosition, restored]);

  useFocusEffect(
    useCallback(() => {
      if (restored) {
        setLoading(true);
        void load();
      }
      return () => {
        loadGeneration.current += 1;
        pendingBuddiesOffset.current = buddiesOffset.current;
        listContentReady.current = false;
        persistFeedPosition();
      };
    }, [load, persistFeedPosition, restored]),
  );

  function changeFeedMode(mode: FeedMode) {
    if (mode === feedMode) return;
    if (feedMode === 'buddies') {
      pendingBuddiesOffset.current = buddiesOffset.current;
      listContentReady.current = false;
    }
    if (mode === 'discover') setDiscoverVisited(true);
    setFeedMode(mode);
    void AsyncStorage.setItem(FEED_SESSION_KEY, JSON.stringify({ mode, buddiesOffset: buddiesOffset.current }));
    if (mode === 'buddies') {
      pendingBuddiesOffset.current = buddiesOffset.current;
    }
  }

  function rememberModeOffset(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (feedMode === 'buddies') {
      buddiesOffset.current = event.nativeEvent.contentOffset.y;
    }
  }

  function restorePendingBuddiesOffset() {
    if (
      feedMode !== 'buddies' ||
      pendingBuddiesOffset.current == null ||
      !listContentReady.current ||
      !feedListRef.current
    ) return;
    const offset = pendingBuddiesOffset.current;
    requestAnimationFrame(() => {
      const list = feedListRef.current;
      if (!list) return;
      list.scrollToOffset({ offset, animated: false });
      if (pendingBuddiesOffset.current === offset) pendingBuddiesOffset.current = null;
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onLoadMore() {
    if (loadingMore || endReached || loading || posts.length === 0) return;
    setLoadingMore(true);
    const generation = loadGeneration.current;
    try {
      const oldest = posts[posts.length - 1].created_at;
      const page = await listFeed(oldest, undefined, undefined, feedMode);
      if (generation !== loadGeneration.current) return;
      if (page.length < FEED_PAGE_SIZE) setEndReached(true);
      if (page.length > 0) {
        setPosts((current) => {
          const seen = new Set(current.map((post) => post.id));
          return [...current, ...page.filter((post) => !seen.has(post.id))];
        });
        try {
          const previews = await listEncouragementPreviews(page.map((post) => post.id));
          if (generation !== loadGeneration.current) return;
          setEncouragementPreviews((current) => new Map([...current, ...previews]));
        } catch {
          // Posts remain available when supporter summaries cannot refresh.
        }
      }
    } catch {
      // A later scroll can retry without replacing already loaded posts.
    } finally {
      setLoadingMore(false);
    }
  }

  async function onAttend(post: FeedPost) {
    if (!post.event || attending.has(post.event.group_id)) return;
    setAttending((current) => new Set(current).add(post.event!.group_id));
    try {
      await attendEvent(post.event.group_id);
      showToast(`You're in! Added to the "${post.event.title}" group 🎉`);
    } catch (error) {
      setAttending((current) => {
        const next = new Set(current);
        next.delete(post.event!.group_id);
        return next;
      });
      Alert.alert('Could not join', String((error as Error).message ?? error));
    }
  }

  async function onToggleLike(post: FeedPost) {
    if (likesInFlight.current.has(post.id)) return;
    likesInFlight.current.add(post.id);
    const liked = !post.liked_by_me;
    if (liked) hapticTap();
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, liked_by_me: liked, like_count: Math.max(0, item.like_count + (liked ? 1 : -1)) }
          : item,
      ),
    );
    try {
      await setLiked(post.id, liked);
    } catch (error) {
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id
            ? { ...item, liked_by_me: !liked, like_count: Math.max(0, item.like_count + (liked ? -1 : 1)) }
            : item,
        ),
      );
      Alert.alert('Could not update like', String((error as Error).message ?? error));
    } finally {
      likesInFlight.current.delete(post.id);
    }
  }

  function onPostMenu(post: FeedPost) {
    showPostMenu(post, myId, (postId) => setPosts((current) => current.filter((item) => item.id !== postId)));
  }

  const adsReady = useFeedAdsReady();
  const visiblePosts = useMemo(
    () => (feedRowsBelongToView(dataOwnerId, myId, dataMode, feedMode) ? posts : []),
    [dataMode, dataOwnerId, feedMode, myId, posts],
  );
  const feedData = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    visiblePosts.forEach((post, index) => {
      rows.push({ kind: 'post', post });
      if (adsReady && !isPro && !proLoading && (index + 1) % AD_EVERY === 0) {
        rows.push({ kind: 'ad', id: `ad-${post.id}` });
      }
    });
    return rows;
  }, [adsReady, isPro, proLoading, visiblePosts]);
  const connectionCount = useMemo(
    () => [...encouragementPreviews.values()].reduce((total, preview) => total + preview.count, 0),
    [encouragementPreviews],
  );
  const myDayValues = useMemo(
    () => deriveMyDayValues(visiblePosts, myId, connectionCount),
    [connectionCount, myId, visiblePosts],
  );
  const viewState = deriveFeedViewState({
    loading,
    loadingMore,
    postCount: visiblePosts.length,
    error: loadError,
    online,
  });

  const feedHeader = (
    <>
      <View style={styles.promptWrap}>
        <Pressable
          style={({ pressed }) => [styles.promptRow, pressed && styles.pressed]}
          onPress={() => router.push('/compose' as never)}
          accessibilityRole="button"
          accessibilityLabel="Share a win — create a post"
        >
          <Avatar
            url={profileOwnerId === myId ? me.avatar : null}
            name={profileOwnerId === myId ? me.name : null}
            size={36}
          />
          <Text style={styles.promptText} numberOfLines={1}>Inspire us today!</Text>
        </Pressable>
        <View style={styles.composerDivider} />
        <View style={styles.quickShareRow}>
          <QuickShare icon="create-outline" label="Post" onPress={() => router.push('/compose' as never)} />
          <View style={styles.quickShareDivider} />
          <QuickShare icon="images-outline" label="Photo" onPress={() => router.push('/compose?photo=1' as never)} />
          <View style={styles.quickShareDivider} />
          <QuickShare icon="sparkles-outline" label="Flex" onPress={() => router.push('/win-card' as never)} />
        </View>
      </View>
      <MyDayRail values={myDayValues} />
      {viewState === 'offline-cached' || viewState === 'offline-uncached' ? (
        <View style={styles.offlineNotice} accessible accessibilityLabel="Offline">
          <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
          <Text style={styles.offlineText}>
            {viewState === 'offline-cached' ? 'Offline · showing saved posts' : 'Offline · no saved posts available'}
          </Text>
        </View>
      ) : null}
      {loadError ? (
        <Pressable style={styles.inlineError} onPress={load} accessibilityRole="button" accessibilityLabel="Feed could not refresh. Retry">
          <Ionicons name="cloud-offline-outline" size={19} color={colors.danger} />
          <View style={styles.inlineErrorCopy}>
            <Text style={styles.inlineErrorTitle}>Feed could not refresh</Text>
            <Text style={styles.inlineErrorText} numberOfLines={2}>{loadError} Tap to retry.</Text>
          </View>
        </Pressable>
      ) : null}
    </>
  );

  return (
    <View style={styles.screen}>
      <SocialBrandHeader
        unread={unread}
        onMenu={() => router.push('/menu' as never)}
        onSearch={() => router.push('/search' as never)}
        onCreate={() => setCreateOpen(true)}
        onNotifications={() => router.push('/notifications' as never)}
      />
      <Modal visible={!!myId && createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <BlurView intensity={60} tint="light" style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]} />
            <View style={styles.sheetGlass} />
            <Text style={styles.sheetTitle}>Create</Text>
            {CREATE_ITEMS.map((item) => (
              <Pressable
                key={item.title}
                disabled={item.kind === 'story' && !myId}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                onPress={() => {
                  const requestedUserId = myId;
                  if (!requestedUserId) return;
                  setCreateOpen(false);
                  if (pendingCreateAction.current) clearTimeout(pendingCreateAction.current);
                  pendingCreateAction.current = scheduleIdentityBoundAction(
                    requestedUserId,
                    () => currentUserIdRef.current,
                    () => {
                      if (item.kind === 'story') {
                        storyRailRef.current?.openPicker();
                      } else {
                        router.push(item.route as never);
                      }
                    },
                    250,
                    () => {
                      pendingCreateAction.current = null;
                    },
                  );
                }}
              >
                <View style={[styles.sheetIcon, { backgroundColor: `${item.tint}15` }]}>
                  <Ionicons name={item.icon} size={20} color={item.tint} />
                </View>
                <View style={styles.sheetCopy}>
                  <Text style={styles.sheetRowTitle}>{item.title}</Text>
                  <Text style={styles.sheetRowSub}>{item.sub}</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      {myId ? (
        <View style={styles.hiddenStoryController} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <StoryRail
            key={myId}
            ref={storyRailRef}
            meName={profileOwnerId === myId ? me.name : null}
            meAvatar={profileOwnerId === myId ? me.avatar : null}
            controllerOnly
          />
        </View>
      ) : null}

      <SocialModeSelector value={feedMode} onChange={changeFeedMode} />
      {/* Discover owns its ScrollView; explicit offset persistence is deferred to Task 3.3. */}
      <View style={feedMode === 'discover' ? styles.modeVisible : styles.modeHidden}>
        {discoverVisited ? <DiscoverExperience /> : null}
      </View>
      <View style={feedMode === 'buddies' ? styles.modeVisible : styles.modeHidden}>
        {feedMode !== 'buddies' ? null : loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : (
          <FlatList
            ref={feedListRef}
            data={feedData}
            onScroll={rememberModeOffset}
            onScrollEndDrag={persistFeedPosition}
            onMomentumScrollEnd={persistFeedPosition}
            onContentSizeChange={() => {
              listContentReady.current = true;
              restorePendingBuddiesOffset();
            }}
            scrollEventThrottle={16}
            ListHeaderComponent={feedHeader}
            keyExtractor={(row) => (row.kind === 'post' ? row.post.id : row.id)}
            contentContainerStyle={feedData.length === 0 ? styles.emptyWrap : styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null}
            ListEmptyComponent={loadError ? null : (
              <View style={styles.emptyCard}>
                <Ionicons name="people-outline" size={38} color={colors.primary} />
                <Text style={styles.emptyTitle}>No buddy posts yet</Text>
                <Text style={styles.emptySub}>Share a win or add an accountability buddy.</Text>
                <View style={styles.emptyActions}>
                  <Pressable onPress={() => router.push('/compose' as never)} style={styles.emptyPrimary} accessibilityRole="button">
                    <Text style={styles.emptyPrimaryText}>Share a win</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push('/buddy' as never)} style={styles.emptySecondary} accessibilityRole="button">
                    <Text style={styles.emptySecondaryText}>Find buddies</Text>
                  </Pressable>
                </View>
              </View>
            )}
            renderItem={({ item: row }) => {
              if (row.kind === 'ad') return <View style={styles.adWrap}><AdCard /></View>;
              const item = row.post;
              return (
                <FeedProofCard
                  post={item}
                  currentUserId={myId}
                  preview={encouragementPreviews.get(item.id)}
                  attending={!!item.event && attending.has(item.event.group_id)}
                  onOpen={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                  onMenu={() => onPostMenu(item)}
                  onAttend={() => onAttend(item)}
                  onToggleLike={() => onToggleLike(item)}
                  onShare={() => setBroadcast(item)}
                  onOpenEncouragement={() => router.push({ pathname: '/post/[id]', params: { id: item.id, encouragement: '1' } } as never)}
                />
              );
            }}
          />
        )}
      </View>
      <BroadcastSheet
        post={dataOwnerId === myId && myId ? broadcast : null}
        onClose={() => setBroadcast(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceAlt },
  modeVisible: { flex: 1 },
  modeHidden: { display: 'none' },
  hiddenStoryController: { width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,.45)', paddingTop: 64, alignItems: 'flex-end', paddingRight: spacing.md },
  sheet: { width: 280, borderRadius: radius.lg, overflow: 'hidden', padding: spacing.sm, ...shadow.card },
  sheetGlass: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,.82)' },
  sheetTitle: { fontFamily: font.bold, fontSize: 13, color: colors.textMuted, padding: spacing.md },
  sheetRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.sm },
  sheetIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sheetCopy: { flex: 1 },
  sheetRowTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  sheetRowSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  promptWrap: { ...contentMax, width: '93%', alignSelf: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.card, overflow: 'hidden', ...shadow.card },
  promptRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  promptText: { flex: 1, fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  composerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  quickShareRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  quickShare: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  quickShareDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: colors.border },
  quickShareText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13.5 },
  inlineError: { minHeight: 58, margin: spacing.md, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  inlineErrorCopy: { flex: 1 },
  inlineErrorTitle: { color: colors.danger, fontFamily: font.bold, fontSize: 13 },
  inlineErrorText: { color: colors.textSecondary, fontFamily: font.medium, fontSize: 11.5 },
  offlineNotice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  offlineText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 12 },
  pressed: { opacity: 0.7 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  list: { paddingTop: spacing.sm, paddingBottom: 110, ...contentMax },
  emptyWrap: { paddingBottom: 110, ...contentMax },
  adWrap: { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden' },
  footerSpinner: { paddingVertical: spacing.lg },
  emptyCard: { alignItems: 'center', gap: spacing.sm, margin: spacing.lg, padding: spacing.xxl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  emptyTitle: { color: colors.text, fontFamily: font.bold, fontSize: 18 },
  emptySub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 14, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: spacing.sm },
  emptyPrimary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primary },
  emptyPrimaryText: { color: '#fff', fontFamily: font.bold, fontSize: 13.5 },
  emptySecondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  emptySecondaryText: { color: colors.primary, fontFamily: font.bold, fontSize: 13.5 },
});
