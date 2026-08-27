import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {
  FEED_PAGE_SIZE,
  getPost,
  listEncouragementPreviews,
  listPersonalFeed,
  setLiked,
  type EncouragementPreview,
  type UnifiedFeedPost,
} from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { attendEvent } from '../../events/api';
import { StoryRail, type StoryRailHandle } from '../../stories/StoryRail';
import { createStoryPickerQueue } from '../../stories/storyPickerQueue';
import { AdCard } from '../../pro/AdCard';
import { useFeedAdsReady } from '../../pro/adAdapter';
import { useIsPro } from '../../pro/ProProvider';
import { showToast } from '../../ui/Toast';
import { BroadcastSheet } from '../../feed/BroadcastSheet';
import { useUnreadNotifications } from '../../notify/useUnread';
import { getMyProfile } from '../../profiles/api';
import type { FeedPost } from '../../feed/types';
import {
  font,
  radius,
  spacing,
  shadow,
  contentMax,
  type AppThemeColors,
} from '../../ui/theme';
import { useAppTheme } from '../../ui/AppThemeProvider';
import { hapticTap } from '../../ui/haptics';
import { SocialBrandHeader } from '../../feed/SocialBrandHeader';
import {
  deriveFeedViewState,
  feedRowsBelongToView,
  scheduleIdentityBoundAction,
} from '../../feed/SocialModeSelector';
import { FeedProofCard } from '../../feed/FeedProofCard';
import { PostImage } from '../../feed/PostImage';
import { activeVideoPost } from '../../feed/videoPolicy';
import { runFeedCriticalLoad } from '../../feed/feedLoadCoordinator';
import { reconcileFeedPostsPublished } from '../../feed/feedPublishSignal';
import { DIRECT_POST_HREF, type DirectPostHref } from '../../entry/createFlow';
import { userFacingErrorMessage } from '../../ui/userFacingError';
import { listDiscoveryCandidates, sendRequest, type Candidate } from '../../buddy/api';
import {
  createFeedBuddySuggestionCoordinator,
  rankFeedBuddySuggestions,
} from '../../feed/feedBuddySuggestions';
import { authorLabel } from '../../feed/format';
import { FeedBuddyRail } from '../../feed/FeedBuddyRail';
import { buildQuietFeedRows, type QuietFeedRow } from '../../feed/quietFeedRows';

type IoniconName = keyof typeof Ionicons.glyphMap;
type CreateItem = {
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
} & ({ kind: 'story' } | { kind: 'route'; route: string | DirectPostHref });
type FeedRow = QuietFeedRow<UnifiedFeedPost>;

const AD_EVERY = 5;
const FEED_SESSION_KEY = 'feed-session-v1';
function createItems(theme: AppThemeColors): CreateItem[] {
  return [
    { icon: 'create-outline', tint: theme.ink.action, title: 'Post', sub: 'Share a win or an update', kind: 'route', route: DIRECT_POST_HREF },
    { icon: 'add-circle-outline', tint: theme.ink.action, title: 'My Day', sub: 'Share a photo for 24 hours', kind: 'story' },
    { icon: 'flame-outline', tint: theme.status.attention, title: 'Win card', sub: 'Share your streak as an image', kind: 'route', route: '/win-card' },
    { icon: 'people-outline', tint: theme.status.success, title: 'Group', sub: 'Start a community', kind: 'route', route: '/group-new' },
    { icon: 'storefront-outline', tint: theme.ink.secondary, title: 'Page', sub: 'For your gym, coaching or brand', kind: 'route', route: '/page-new' },
  ];
}
const FEED_SKELETON_ROWS = [0, 1] as const;

function FeedLoadingSkeleton() {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View
      style={styles.skeletonList}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading Feed posts"
      accessibilityState={{ busy: true }}
    >
      {FEED_SKELETON_ROWS.map((row) => (
        <View key={row} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonCopy}>
              <View style={[styles.skeletonLine, styles.skeletonLineLong]} />
              <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
            </View>
          </View>
          <View style={styles.skeletonMedia} />
          <View style={styles.skeletonActions}>
            <View style={styles.skeletonAction} />
            <View style={styles.skeletonAction} />
            <View style={styles.skeletonAction} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Feed() {
  const router = useRouter();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const createMenuItems = useMemo(() => createItems(theme), [theme]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const navigation = useNavigation();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const isFocused = useIsFocused();
  const [posts, setPosts] = useState<UnifiedFeedPost[]>([]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [encouragementPreviews, setEncouragementPreviews] = useState<Map<string, EncouragementPreview>>(new Map());
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
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [visiblePostIds, setVisiblePostIds] = useState<string[]>([]);
  const [visibilityGeneration, setVisibilityGeneration] = useState('');
  const [buddySuggestions, setBuddySuggestions] = useState<Candidate[]>([]);
  const [suggestionOwnerId, setSuggestionOwnerId] = useState<string | null>(null);
  const [buddyRequestsInFlight, setBuddyRequestsInFlight] = useState<Set<string>>(new Set());
  const likesInFlight = useRef<Set<string>>(new Set());
  const loadGeneration = useRef(0);
  const suggestionCoordinator = useMemo(() => createFeedBuddySuggestionCoordinator(), []);
  const storyPickerQueue = useMemo(() => createStoryPickerQueue(myId), [myId]);
  const feedListRef = useRef<FlatList<FeedRow>>(null);
  const feedOffset = useRef(0);
  const pendingFeedOffset = useRef<number | null>(null);
  const listContentReady = useRef(false);
  const connectivityRef = useRef(true);
  const profileGeneration = useRef(0);
  const currentUserIdRef = useRef(myId);
  const attendanceIdentity = useMemo(() => ({ ownerId: myId }), [myId]);
  const attendanceIdentityRef = useRef(attendanceIdentity);
  const dataOwnerIdRef = useRef(dataOwnerId);
  const postCountRef = useRef(posts.length);
  const [viewabilityConfig] = useState({ itemVisiblePercentThreshold: 65, minimumViewTime: 180 });
  const [onViewableItemsChanged] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<FeedRow>[] }) => {
    const ids = viewableItems.flatMap(({ item }) => item?.kind === 'post' ? [item.post.id] : []);
    const firstPost = viewableItems.find(({ item }) => item?.kind === 'post')?.item;
    setVisiblePostIds((current) => current.join('|') === ids.join('|') ? current : ids);
    setVisibilityGeneration(firstPost?.kind === 'post' ? firstPost.generation : '');
  });
  // Latest-value refs prevent stale owner work during the render-to-effect gap and keep load stable.
  // eslint-disable-next-line react-hooks/refs
  currentUserIdRef.current = myId;
  // eslint-disable-next-line react-hooks/refs
  attendanceIdentityRef.current = attendanceIdentity;
  const pendingCreateAction = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { unread } = useUnreadNotifications();
  const { isPro, loading: proLoading } = useIsPro();
  const attachStoryRail = useCallback((handle: StoryRailHandle | null) => {
    storyPickerQueue.attach(handle);
  }, [storyPickerQueue]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    dataOwnerIdRef.current = dataOwnerId;
    postCountRef.current = posts.length;
  }, [dataOwnerId, posts.length]);

  useEffect(() => {
    return () => {
      currentUserIdRef.current = null;
      if (pendingCreateAction.current) clearTimeout(pendingCreateAction.current);
      pendingCreateAction.current = null;
    };
  }, []);

  const feedGeneration = `${myId ?? ''}:${dataOwnerId ?? ''}`;

  useEffect(() => {
    return () => storyPickerQueue.reset();
  }, [storyPickerQueue]);

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
    const ownerGeneration = suggestionCoordinator.activateOwner(myId);
    setBuddySuggestions([]);
    setSuggestionOwnerId(null);
    setBuddyRequestsInFlight(new Set());
    if (!ownerGeneration) {
      return () => {
        suggestionCoordinator.invalidate();
      };
    }
    void suggestionCoordinator.runDiscovery(ownerGeneration, listDiscoveryCandidates).then((result) => {
      if (result.status !== 'loaded') return;
      const { candidates, viewerArea } = result.value;
      setBuddySuggestions(rankFeedBuddySuggestions(candidates, viewerArea));
      setSuggestionOwnerId(ownerGeneration.ownerId);
    });
    return () => {
      suggestionCoordinator.invalidate(ownerGeneration);
    };
  }, [myId, suggestionCoordinator]);

  useEffect(() => {
    let alive = true;
    loadGeneration.current += 1;
    void Promise.resolve().then(async () => {
      if (!alive) return;
      setRestored(false);
      setPosts([]);
      setDataOwnerId(null);
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
      pendingFeedOffset.current = null;
      listContentReady.current = false;
      try {
        const raw = await AsyncStorage.getItem(FEED_SESSION_KEY);
        const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
        const savedOffset = typeof parsed.feedOffset === 'number' && Number.isFinite(parsed.feedOffset)
          ? Math.max(0, parsed.feedOffset)
          : 0;
        if (!alive) return;
        feedOffset.current = savedOffset;
        pendingFeedOffset.current = savedOffset;
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

  const load = useCallback(async (
    { forceFresh = false }: { forceFresh?: boolean } = {},
  ) => {
    const generation = ++loadGeneration.current;
    const requestedOwnerId = myId;
    pendingFeedOffset.current = feedOffset.current;
    listContentReady.current = false;
    setLoadError(null);
    setLoadingMore(false);
    if (!requestedOwnerId) {
      setPosts([]);
      setDataOwnerId(null);
      setEncouragementPreviews(new Map());
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (
      !feedRowsBelongToView(dataOwnerIdRef.current, requestedOwnerId)
      || postCountRef.current === 0
    ) {
      setLoading(true);
    }

    await runFeedCriticalLoad({
      loadPage: () => listPersonalFeed(requestedOwnerId, undefined, { forceFresh }),
      loadPreviews: listEncouragementPreviews,
      isCurrent: () =>
        generation === loadGeneration.current
        && currentUserIdRef.current === requestedOwnerId,
      onPage: (page) => {
        setPosts(page);
        setDataOwnerId(requestedOwnerId);
        setEndReached(page.length < FEED_PAGE_SIZE);
      },
      onPageError: (error) => {
        setLoadError(userFacingErrorMessage(error, 'load'));
      },
      onPreviews: setEncouragementPreviews,
      onVisibleSettled: () => {
        setLoading(false);
        setRefreshing(false);
      },
    });
  }, [myId]);

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
    if (reconnected && restored && myId) void load({ forceFresh: true });
  }, [load, myId, online, restored]);

  const persistFeedPosition = useCallback(() => {
    void AsyncStorage.setItem(
      FEED_SESSION_KEY,
      JSON.stringify({ feedOffset: feedOffset.current }),
    );
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active');
      if (nextState !== 'active') {
        loadGeneration.current += 1;
        pendingFeedOffset.current = feedOffset.current;
        listContentReady.current = false;
        persistFeedPosition();
        return;
      }
      if (restored && myId && connectivityRef.current) void load();
    });
    return () => subscription.remove();
  }, [load, myId, persistFeedPosition, restored]);

  useEffect(() => {
    if (restored) {
      void Promise.resolve().then(() => load());
    }
  }, [load, restored]);

  const reconcilePublishedPosts = useCallback(async () => {
    const requestedOwnerId = myId;
    if (!requestedOwnerId) return;
    const generation = loadGeneration.current;
    await reconcileFeedPostsPublished({
      ownerId: requestedOwnerId,
      fetchPost: getPost,
      isCurrent: () =>
        currentUserIdRef.current === requestedOwnerId
        && loadGeneration.current === generation,
      onPosts: (rows) => {
        // The authoritative single-row result wins over any older page request
        // that may still be resolving behind the composer.
        loadGeneration.current += 1;
        const published = [...rows]
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .map((post, index): UnifiedFeedPost => ({
            ...post,
            feed_source: 'self',
            suggested: false,
            feed_position: -(index + 1),
            feed_session_id: `published:${post.id}`,
          }));
        const publishedIds = new Set(published.map(({ id }) => id));
        setPosts((current) => [
          ...published,
          ...current.filter((post) => !publishedIds.has(post.id)),
        ]);
        setDataOwnerId(requestedOwnerId);
        setLoadError(null);
        setLoading(false);
        setRefreshing(false);
        feedOffset.current = 0;
        pendingFeedOffset.current = 0;
        listContentReady.current = false;
      },
    });
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      void reconcilePublishedPosts();
      return () => {
        pendingFeedOffset.current = feedOffset.current;
        listContentReady.current = false;
        persistFeedPosition();
      };
    }, [persistFeedPosition, reconcilePublishedPosts]),
  );

  function rememberFeedOffset(event: NativeSyntheticEvent<NativeScrollEvent>) {
    feedOffset.current = event.nativeEvent.contentOffset.y;
  }

  function restorePendingFeedOffset() {
    if (
      pendingFeedOffset.current == null ||
      !listContentReady.current ||
      !feedListRef.current
    ) return;
    const offset = pendingFeedOffset.current;
    requestAnimationFrame(() => {
      const list = feedListRef.current;
      if (!list) return;
      list.scrollToOffset({ offset, animated: false });
      if (pendingFeedOffset.current === offset) pendingFeedOffset.current = null;
    });
  }

  async function onRefresh() {
    setRefreshing(true);
    await load({ forceFresh: true });
  }

  async function onLoadMore() {
    if (!myId || loadingMore || endReached || loading || posts.length === 0) return;
    setLoadingMore(true);
    const generation = loadGeneration.current;
    try {
      const oldest = posts[posts.length - 1].created_at;
      const page = await listPersonalFeed(myId, oldest);
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
    const requestedViewer = myId;
    if (!post.event) return;
    const eventId = post.event.id;
    const expectedOwner = post.user_id;
    const eventTitle = post.event.title;
    const requestedIdentity = attendanceIdentity;
    if (
      !requestedViewer
      || currentUserIdRef.current !== requestedViewer
      || !feedRowsBelongToView(dataOwnerIdRef.current, requestedViewer)
      || attending.has(eventId)
    ) return;
    setAttending((current) => new Set(current).add(eventId));
    try {
      await attendEvent(eventId, expectedOwner);
      if (
        currentUserIdRef.current !== requestedViewer
        || attendanceIdentityRef.current !== requestedIdentity
      ) return;
      showToast(`You're in! Added to the "${eventTitle}" group 🎉`);
    } catch (error) {
      if (
        currentUserIdRef.current !== requestedViewer
        || attendanceIdentityRef.current !== requestedIdentity
      ) return;
      setAttending((current) => {
        const next = new Set(current);
        next.delete(eventId);
        return next;
      });
      Alert.alert('Could not join', userFacingErrorMessage(error, 'update'));
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
      Alert.alert('Could not update like', userFacingErrorMessage(error, 'update'));
    } finally {
      likesInFlight.current.delete(post.id);
    }
  }

  async function addSuggestedBuddy(candidate: Candidate) {
    const requestedOwner = myId;
    if (!requestedOwner || suggestionOwnerId !== requestedOwner) return;
    const request = suggestionCoordinator.startRequest(
      requestedOwner,
      candidate.id,
      (ownerId) => sendRequest(candidate.id, ownerId),
    );
    if (!request.started) return;
    setBuddyRequestsInFlight(request.inFlightIds);
    const result = await request.completion;
    if (result.status === 'stale') return;

    setBuddyRequestsInFlight(result.inFlightIds);
    if (result.status === 'succeeded') {
      setBuddySuggestions((current) => current.filter((item) => item.id !== candidate.id));
      showToast(`Request sent to ${authorLabel(candidate.display_name)}`);
      return;
    }
    Alert.alert('Could not send', userFacingErrorMessage(result.error, 'update'));
  }

  function onPostMenu(post: FeedPost) {
    showPostMenu(post, myId, (postId) => setPosts((current) => current.filter((item) => item.id !== postId)));
  }

  const adsReady = useFeedAdsReady();
  const visiblePosts = useMemo(
    () => (feedRowsBelongToView(dataOwnerId, myId) ? posts : []),
    [dataOwnerId, myId, posts],
  );
  const suggestionsVisible = suggestionOwnerId === myId && buddySuggestions.length > 0;
  const feedData = useMemo(
    () => buildQuietFeedRows({
      posts: visiblePosts,
      showBuddyRail: suggestionsVisible,
      showAds: adsReady && !isPro && !proLoading,
      generation: feedGeneration,
      adEvery: AD_EVERY,
    }),
    // suggestion length deliberately triggers rail insertion/removal; candidate details render from current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adsReady, buddySuggestions.length, feedGeneration, isPro, proLoading, suggestionsVisible, visiblePosts],
  );
  const viewState = deriveFeedViewState({
    loading,
    loadingMore,
    postCount: visiblePosts.length,
    error: loadError,
    online,
  });
  const activeVideoId = activeVideoPost({
    focused: isFocused,
    appActive,
    overlayOpen: createOpen || broadcast !== null,
    generation: feedGeneration,
    visibilityGeneration,
    visiblePostIds,
    eligibleVideoIds: visiblePosts.flatMap((post) =>
      post.post_type === 'video' && post.image_url ? [post.id] : [],
    ),
  });

  function openOwnBuddyCard() {
    const ownerId = currentUserIdRef.current;
    if (!ownerId) return;
    router.push({ pathname: '/buddy-card/[id]', params: { id: ownerId } } as never);
  }

  const feedHeader = (
    <>
      {myId ? (
        <StoryRail
          key={myId}
          ref={attachStoryRail}
          meName={profileOwnerId === myId ? me.name : null}
          meAvatar={profileOwnerId === myId ? me.avatar : null}
        />
      ) : null}
      {viewState === 'offline-cached' || viewState === 'offline-uncached' ? (
        <View style={styles.offlineNotice} accessible accessibilityLabel="Offline">
          <Ionicons name="cloud-offline-outline" size={18} color={theme.ink.muted} />
          <Text style={styles.offlineText}>
            {viewState === 'offline-cached' ? 'Offline · showing saved posts' : 'Offline · no saved posts available'}
          </Text>
        </View>
      ) : null}
      {loadError ? (
        <Pressable style={styles.inlineError} onPress={() => void load({ forceFresh: true })} accessibilityRole="button" accessibilityLabel="Feed could not refresh. Retry">
          <Ionicons name="cloud-offline-outline" size={19} color={theme.status.danger} />
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
        profileName={profileOwnerId === myId ? me.name : null}
        profileAvatar={profileOwnerId === myId ? me.avatar : null}
        onProfile={openOwnBuddyCard}
        onMenu={() => router.push('/menu' as never)}
        onSearch={() => router.push('/search' as never)}
        onCreate={() => setCreateOpen(true)}
        onNotifications={() => router.push('/notifications' as never)}
      />
      <Modal visible={!!myId && createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
            <BlurView intensity={60} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]} />
            <View style={styles.sheetGlass} />
            <Text style={styles.sheetTitle}>Create</Text>
            {createMenuItems.map((item) => (
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
                        storyPickerQueue.request();
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
      <View style={styles.feedContent}>
        <FlatList
            ref={feedListRef}
            data={feedData}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            onScroll={rememberFeedOffset}
            onScrollEndDrag={persistFeedPosition}
            onMomentumScrollEnd={persistFeedPosition}
            onContentSizeChange={() => {
              listContentReady.current = true;
              restorePendingFeedOffset();
            }}
            scrollEventThrottle={16}
            ListHeaderComponent={feedHeader}
            ItemSeparatorComponent={() => <View style={styles.feedDivider} />}
            keyExtractor={(row) => (row.kind === 'post' ? row.post.id : row.id)}
            contentContainerStyle={feedData.length === 0 ? styles.emptyWrap : styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.ink.action} />}
            onEndReached={onLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={theme.ink.action} /> : null}
            ListEmptyComponent={loadError ? null : (
              viewState === 'initial-loading' ? (
                <FeedLoadingSkeleton />
              ) : (
                <View style={styles.emptyCard}>
                  <Ionicons name="people-outline" size={38} color={theme.ink.action} />
                  <Text style={styles.emptyTitle}>Your Feed is ready</Text>
                  <Text style={styles.emptySub}>Share a win or discover people and communities to follow.</Text>
                  <View style={styles.emptyActions}>
                    <Pressable onPress={() => router.push(DIRECT_POST_HREF as never)} style={styles.emptyPrimary} accessibilityRole="button">
                      <Text style={styles.emptyPrimaryText}>Share a win</Text>
                    </Pressable>
                    <Pressable onPress={() => router.push('/discover' as never)} style={styles.emptySecondary} accessibilityRole="button">
                      <Text style={styles.emptySecondaryText}>Find buddies</Text>
                    </Pressable>
                  </View>
                </View>
              )
            )}
            renderItem={({ item: row }) => {
              if (row.kind === 'buddies') {
                return (
                  <FeedBuddyRail
                    candidates={buddySuggestions}
                    busyIds={buddyRequestsInFlight}
                    onOpen={(candidate) => router.push({ pathname: '/buddy-card/[id]', params: { id: candidate.id } } as never)}
                    onAdd={(candidate) => void addSuggestedBuddy(candidate)}
                    onSeeAll={() => router.push('/discover' as never)}
                  />
                );
              }
              if (row.kind === 'ad') return <View style={styles.adWrap}><AdCard /></View>;
              const item = row.post;
              return (
                <FeedProofCard
                  post={item}
                  mediaActive={activeVideoId === item.id}
                  currentUserId={myId}
                  preview={encouragementPreviews.get(item.id)}
                  attending={!!item.event && attending.has(item.event.id)}
                  onOpen={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                  onComment={() => router.push({ pathname: '/post/[id]', params: { id: item.id, comment: '1' } } as never)}
                  onOpenMedia={item.post_type === 'video' || !item.image_url ? undefined : () => setPreviewPhoto(item.image_url)}
                  onMenu={() => onPostMenu(item)}
                  onAttend={() => onAttend(item)}
                  onToggleLike={() => onToggleLike(item)}
                  onShare={() => setBroadcast(item)}
                  onOpenEncouragement={() => router.push({ pathname: '/post/[id]', params: { id: item.id, encouragement: '1' } } as never)}
                />
              );
            }}
        />
      </View>
      <Modal
        visible={previewPhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPreviewPhoto(null)}
      >
        <View style={styles.photoPreview}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPreviewPhoto(null)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          />
          <Pressable
            style={styles.photoClose}
            onPress={() => setPreviewPhoto(null)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <View style={styles.photoFrame} pointerEvents="box-none">
            {previewPhoto ? <PostImage url={previewPhoto} immersive /> : null}
          </View>
        </View>
      </Modal>
      <BroadcastSheet
        post={dataOwnerId === myId && myId ? broadcast : null}
        onClose={() => setBroadcast(null)}
      />
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.canvas },
  feedContent: { flex: 1 },
  photoPreview: { flex: 1, justifyContent: 'center', backgroundColor: '#000' },
  photoFrame: { width: '100%' },
  photoClose: {
    position: 'absolute',
    top: 54,
    right: spacing.md,
    zIndex: 2,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,.72)',
  },
  sheetBackdrop: { flex: 1, backgroundColor: theme.interaction.scrim, paddingTop: 64, alignItems: 'flex-end', paddingRight: spacing.md },
  sheet: { width: 280, borderRadius: radius.lg, overflow: 'hidden', padding: spacing.sm, ...shadow.card },
  sheetGlass: { ...StyleSheet.absoluteFill, backgroundColor: theme.surface.card, opacity: 0.82 },
  sheetTitle: { fontFamily: font.bold, fontSize: 13, color: theme.ink.muted, padding: spacing.md },
  sheetRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.sm },
  sheetIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  sheetCopy: { flex: 1 },
  sheetRowTitle: { fontFamily: font.bold, fontSize: 15, color: theme.ink.primary },
  sheetRowSub: { fontFamily: font.regular, fontSize: 12.5, color: theme.ink.muted },
  inlineError: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: theme.status.dangerSoft,
  },
  inlineErrorCopy: { flex: 1 },
  inlineErrorTitle: { color: theme.status.danger, fontFamily: font.bold, fontSize: 13 },
  inlineErrorText: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 11.5 },
  offlineNotice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: theme.surface.muted,
  },
  offlineText: { color: theme.ink.muted, fontFamily: font.semibold, fontSize: 12 },
  pressed: { opacity: 0.7 },
  list: { paddingBottom: 110, ...contentMax },
  feedDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
    backgroundColor: theme.border.subtle,
  },
  emptyWrap: { paddingBottom: 110, ...contentMax },
  skeletonList: { backgroundColor: theme.surface.canvas },
  skeletonCard: {
    overflow: 'hidden',
    backgroundColor: theme.surface.canvas,
  },
  skeletonHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.interaction.skeleton },
  skeletonCopy: { flex: 1, gap: spacing.sm },
  skeletonLine: { height: 10, borderRadius: radius.pill, backgroundColor: theme.interaction.skeleton },
  skeletonLineLong: { width: '68%' },
  skeletonLineShort: { width: '38%' },
  skeletonMedia: { height: 220, backgroundColor: theme.interaction.skeleton },
  skeletonActions: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border.subtle,
  },
  skeletonAction: { width: 28, height: 8, borderRadius: radius.pill, backgroundColor: theme.interaction.skeleton },
  adWrap: { overflow: 'hidden', backgroundColor: theme.surface.canvas },
  footerSpinner: { paddingVertical: spacing.lg },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl, paddingVertical: spacing.section, backgroundColor: theme.surface.canvas },
  emptyTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 18 },
  emptySub: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 14, textAlign: 'center' },
  emptyActions: { flexDirection: 'row', gap: spacing.sm },
  emptyPrimary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: theme.ink.action },
  emptyPrimaryText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 13.5 },
  emptySecondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card },
  emptySecondaryText: { color: theme.ink.action, fontFamily: font.bold, fontSize: 13.5 },
});
