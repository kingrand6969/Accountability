import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  AppState,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import {
  addComment,
  getPost,
  listComments,
  listEncouragers,
  listVoiceEncouragements,
  reportComment,
  sendVoiceEncouragement,
  setLiked,
  type PostEncourager,
  type VoiceEncouragement,
} from '../../../feed/api';
import { showPostMenu } from '../../../feed/postActions';
import { useAuth } from '../../../auth/AuthProvider';
import { SaveToMemories } from '../../../memories/SaveToMemories';
import { authorLabel, timeAgo } from '../../../feed/format';
import { Avatar } from '../../../feed/Avatar';
import type { FeedPost, PostComment } from '../../../feed/types';
import { EmptyState } from '../../../ui/EmptyState';
import { showToast } from '../../../ui/Toast';
import { font, radius, spacing, type AppThemeColors } from '../../../ui/theme';
import { useAppTheme } from '../../../ui/AppThemeProvider';
import { EncouragementSheet } from '../../../feed/EncouragementSheet';
import { VoiceEncouragementRecorder } from '../../../feed/VoiceEncouragementRecorder';
import { BroadcastSheet } from '../../../feed/BroadcastSheet';
import { canReportContent, createReportAction } from '../../../moderation/reportAction';
import {
  beginImmersiveRefresh,
  ImmersivePost,
  ImmersiveOperationCoordinator,
  deriveImmersivePostState,
  immersiveResultBelongsToView,
  postDetailStatusBarStyle,
  visibleImmersiveSnapshot,
  type ImmersiveSnapshot,
  type ImmersiveViewContext,
} from '../../../feed/ImmersivePost';
import { navigateBackSafely } from '../../../navigation/routeAccessContract';
import { userFacingErrorMessage } from '../../../ui/userFacingError';

export default function PostDetailRoute() {
  const params = useLocalSearchParams<{ id: string; encouragement?: string }>();
  const { id, encouragement } = params;
  const { comment } = params as typeof params & { comment?: string };
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const viewKey = `${id ?? ''}:${myId ?? ''}`;
  return (
    <PostDetailView
      key={viewKey}
      id={id}
      encouragement={encouragement}
      comment={comment}
      myId={myId}
    />
  );
}

function PostDetailView({
  id,
  encouragement,
  comment,
  myId,
}: {
  id: string;
  encouragement?: string;
  comment?: string;
  myId: string | null;
}) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { mode, colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const renderViewKey = `${id ?? ''}:${myId ?? ''}`;
  const [snapshot, setSnapshot] = useState<
    ImmersiveSnapshot<FeedPost, PostComment, PostEncourager, VoiceEncouragement>
  >({
    viewKey: '',
    post: null,
    comments: [],
    encouragers: [],
    voices: [],
    commentsLoading: false,
    commentsError: false,
  });
  const visibleSnapshot = visibleImmersiveSnapshot(snapshot, renderViewKey);
  const post = visibleSnapshot?.post ?? null;
  const comments = visibleSnapshot ? visibleSnapshot.comments : [];
  const encouragers = visibleSnapshot ? visibleSnapshot.encouragers : [];
  const voices = visibleSnapshot ? visibleSnapshot.voices : [];
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const commentsLoading = visibleSnapshot?.commentsLoading ?? false;
  const commentsError = visibleSnapshot?.commentsError ?? false;
  const [online, setOnline] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [encouragementOpen, setEncouragementOpen] = useState(encouragement === '1');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [reportingCommentIds, setReportingCommentIds] = useState<Set<string>>(() => new Set());
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const inputRef = useRef<TextInput>(null);
  const commentIntentHandledRef = useRef(false);
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (comment !== '1' || !post || !isFocused || commentIntentHandledRef.current) return;
    const frame = requestAnimationFrame(() => {
      commentIntentHandledRef.current = true;
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [comment, isFocused, post]);
  const requestGeneration = useRef(0);
  const viewGeneration = useRef(0);
  const operations = useRef(new ImmersiveOperationCoordinator());
  const wasOfflineRef = useRef(false);
  const onlineRef = useRef(true);
  const dataViewKeyRef = useRef<string | null>(null);
  const currentIdRef = useRef(id ?? '');
  const currentUserIdRef = useRef(myId);
  const commentReportAction = useRef<ReturnType<typeof createReportAction> | null>(null);

  useLayoutEffect(() => {
    if (commentReportAction.current !== null) return;
    commentReportAction.current = createReportAction({
      kind: 'comment',
      report: reportComment,
      confirm: ({ title, message, onConfirm, onCancel, onDismiss }) =>
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: onCancel },
          { text: 'Report', style: 'destructive', onPress: () => void onConfirm() },
        ], { cancelable: true, onDismiss }),
      toast: showToast,
      announce: (message) => AccessibilityInfo.announceForAccessibility(message),
      alertError: (title, message) => Alert.alert(title, message),
      pendingChanged: (ids) => setReportingCommentIds(new Set(ids)),
      getContextKey: (targetId) =>
        mountedRef.current && focusedRef.current
          ? `${targetId}:${currentUserIdRef.current ?? ''}:${viewGeneration.current}`
          : null,
    });
  }, []);

  const supporters = (() => {
    const people = new Map<string, PostEncourager>();
    encouragers.forEach((person) => people.set(person.id, person));
    comments.forEach((comment) =>
      people.set(comment.user_id, {
        id: comment.user_id,
        name: comment.author_name,
        avatar_url: comment.author_avatar,
      }),
    );
    voices.forEach((voice) =>
      people.set(voice.user_id, {
        id: voice.user_id,
        name: voice.name,
        avatar_url: voice.avatar_url,
      }),
    );
    return [...people.values()];
  })();

  const currentView = useCallback(
    (): ImmersiveViewContext => ({
      postId: currentIdRef.current,
      userId: currentUserIdRef.current,
      generation: viewGeneration.current,
    }),
    [],
  );

  useEffect(() => {
    const operationCoordinator = operations.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      focusedRef.current = false;
      requestGeneration.current += 1;
      viewGeneration.current += 1;
      operationCoordinator.rotate();
      commentReportAction.current?.dispose();
    };
  }, []);

  useLayoutEffect(() => {
    currentIdRef.current = id ?? '';
    currentUserIdRef.current = myId;
    requestGeneration.current += 1;
    viewGeneration.current += 1;
    operations.current.rotate();
    commentReportAction.current?.invalidate();
    dataViewKeyRef.current = null;
  }, [id, myId]);

  useEffect(
    () =>
      NetInfo.addEventListener((connection) => {
        const nextOnline =
          connection.isConnected !== false && connection.isInternetReachable !== false;
        onlineRef.current = nextOnline;
        setOnline(nextOnline);
      }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        navigateBackSafely(router);
        return true;
      });
      return () => subscription.remove();
    }, [router]),
  );

  const load = useCallback(async (
    { preserveVisible = false }: { preserveVisible?: boolean } = {},
  ) => {
    if (!id) return;
    const requestedId = id;
    const requestedOwnerId = myId;
    const generation = ++requestGeneration.current;
    const belongs = () =>
      immersiveResultBelongsToView(
        requestedId,
        generation,
        requestedOwnerId,
        mountedRef.current && focusedRef.current,
        currentIdRef.current,
        requestGeneration.current,
        currentUserIdRef.current,
      );
    try {
      const loadedPost = await getPost(id);
      if (!belongs()) return;
      const requestedViewKey = `${requestedId}:${requestedOwnerId ?? ''}`;
      setSnapshot((current) =>
        beginImmersiveRefresh(current, requestedViewKey, loadedPost, preserveVisible),
      );
      dataViewKeyRef.current = loadedPost ? requestedViewKey : null;
      setLoadError(null);
      setLoading(false);
      if (!loadedPost) return;
      const [loadedComments, loadedPeople, loadedVoices] = await Promise.allSettled([
        listComments(id),
        listEncouragers(id),
        listVoiceEncouragements(id),
      ]);
      if (!belongs()) return;
      setSnapshot((current) =>
        current.viewKey !== requestedViewKey
          ? current
          : {
              ...current,
              comments: loadedComments.status === 'fulfilled' ? loadedComments.value : current.comments,
              encouragers: loadedPeople.status === 'fulfilled' ? loadedPeople.value : current.encouragers,
              voices: loadedVoices.status === 'fulfilled' ? loadedVoices.value : current.voices,
              commentsLoading: false,
              commentsError: loadedComments.status === 'rejected',
            },
      );
    } catch (error) {
      if (!belongs()) return;
      setLoadError(userFacingErrorMessage(error, 'load'));
    } finally {
      if (belongs()) {
        setLoading(false);
        const requestedViewKey = `${requestedId}:${requestedOwnerId ?? ''}`;
        setSnapshot((current) =>
          current.viewKey === requestedViewKey
            ? { ...current, commentsLoading: false }
            : current,
        );
      }
    }
  }, [id, myId]);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      return;
    }
    if (wasOfflineRef.current && focusedRef.current) {
      wasOfflineRef.current = false;
      void load({
        preserveVisible: dataViewKeyRef.current === `${id ?? ''}:${myId ?? ''}`,
      });
    }
  }, [id, load, myId, online]);

  useFocusEffect(
    // This lifecycle boundary intentionally owns all transient resets.
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    useCallback(() => {
      focusedRef.current = true;
      const sameLoadedView = dataViewKeyRef.current === `${id ?? ''}:${myId ?? ''}`;
      if (!sameLoadedView) {
        setSnapshot({
          viewKey: renderViewKey,
          post: null,
          comments: [],
          encouragers: [],
          voices: [],
          commentsLoading: false,
          commentsError: false,
        });
      }
      setLoadError(null);
      setBroadcastOpen(false);
      setVoiceOpen(false);
      setSending(false);
      setSendingVoice(false);
      setReportingCommentIds(new Set());
      setText('');
      setEncouragementOpen(encouragement === '1');
      if (sameLoadedView && !onlineRef.current) {
        setLoading(false);
      } else {
        setLoading(!sameLoadedView);
        void load({ preserveVisible: sameLoadedView });
      }
      return () => {
        focusedRef.current = false;
        requestGeneration.current += 1;
        viewGeneration.current += 1;
        operations.current.rotate();
        commentReportAction.current?.invalidate();
      };
    }, [encouragement, id, load, myId, renderViewKey]),
  );

  async function onToggleLike() {
    if (!post) return;
    const token = operations.current.start('like', currentView());
    if (!token) return;
    const liked = !post.liked_by_me;
    setSnapshot((current) =>
      current.viewKey === renderViewKey && current.post
        ? {
            ...current,
            post: {
              ...current.post,
              liked_by_me: liked,
              like_count: Math.max(0, current.post.like_count + (liked ? 1 : -1)),
            },
          }
        : current,
    );
    try {
      await setLiked(post.id, liked);
      const people = await listEncouragers(post.id);
      if (operations.current.owns(token, currentView(), mountedRef.current && focusedRef.current)) {
        setSnapshot((current) =>
          current.viewKey === renderViewKey ? { ...current, encouragers: people } : current,
        );
      }
    } catch (error) {
      if (operations.current.owns(token, currentView(), mountedRef.current && focusedRef.current)) {
        Alert.alert('Could not update like', userFacingErrorMessage(error, 'update'));
        void load({ preserveVisible: true });
      }
    } finally {
      operations.current.complete(token, currentView(), mountedRef.current && focusedRef.current);
    }
  }

  async function onSendVoice(uri: string, durationMs: number) {
    if (!id) return;
    const token = operations.current.start('voice', currentView());
    if (!token) return;
    setSendingVoice(true);
    try {
      await sendVoiceEncouragement(id, uri, durationMs);
      const nextVoices = await listVoiceEncouragements(id);
      if (operations.current.owns(token, currentView(), mountedRef.current && focusedRef.current)) {
        setSnapshot((current) =>
          current.viewKey === renderViewKey ? { ...current, voices: nextVoices } : current,
        );
      }
    } finally {
      const result = operations.current.complete(
        token,
        currentView(),
        mountedRef.current && focusedRef.current,
      );
      if (result.apply) setSendingVoice(false);
    }
  }

  async function onSend() {
    if (!id || !text.trim()) return;
    const token = operations.current.start('comment', currentView());
    if (!token) return;
    setSending(true);
    try {
      await addComment(id, text.trim());
      if (operations.current.owns(token, currentView(), mountedRef.current && focusedRef.current)) {
        setText('');
        await load({ preserveVisible: true });
      }
    } catch (error) {
      if (operations.current.owns(token, currentView(), mountedRef.current && focusedRef.current)) {
        Alert.alert('Could not comment', userFacingErrorMessage(error, 'comment'));
      }
    } finally {
      const result = operations.current.complete(
        token,
        currentView(),
        mountedRef.current && focusedRef.current,
      );
      if (result.apply) setSending(false);
    }
  }

  function onOptions() {
    if (!post) return;
    operations.current.cancel('options');
    const token = operations.current.start('options', currentView());
    if (!token) return;
    showPostMenu(post, myId, () => {
      const result = operations.current.complete(
        token,
        currentView(),
        mountedRef.current && focusedRef.current,
      );
      if (!result.apply) return;
      navigateBackSafely(router);
    });
  }

  function onReportComment(target: PostComment) {
    commentReportAction.current?.request(target.id, myId, target.user_id);
  }

  const viewState = deriveImmersivePostState({
    loading,
    post,
    error: loadError,
    online,
    cached: Boolean(post),
    commentsLoading,
    commentsError,
    commentCount: comments.length,
  });

  if (viewState === 'loading') {
    return (
      <>
        {isFocused ? <StatusBar style={postDetailStatusBarStyle(post, mode)} animated /> : null}
        <PostDetailState
          topInset={insets.top}
          onBack={() => navigateBackSafely(router)}
        >
          <ActivityIndicator size="large" color={theme.ink.action} />
          <Text style={styles.stateText}>Loading post…</Text>
        </PostDetailState>
      </>
    );
  }

  if (!post) {
    return (
      <>
        {isFocused ? <StatusBar style={postDetailStatusBarStyle(post, mode)} animated /> : null}
        <PostDetailState
          topInset={insets.top}
          onBack={() => navigateBackSafely(router)}
        >
          <Text style={styles.stateTitle}>
            {viewState === 'offline-uncached'
              ? 'You are offline'
              : viewState === 'retryable-error'
                ? 'This post could not be loaded'
                : 'This post is unavailable'}
          </Text>
          <Text style={styles.stateText}>
            {viewState === 'offline-uncached'
              ? 'Reconnect to load this post. No private post copy is stored on this device.'
              : 'It may have been removed or its audience may have changed. We cannot reveal which.'}
          </Text>
          {loadError || viewState === 'offline-uncached' ? (
            <Pressable
              onPress={() => {
                setLoading(true);
                void load();
              }}
              style={styles.retryButton}
              accessibilityRole="button"
              accessibilityLabel="Retry loading post"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </PostDetailState>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      {isFocused ? <StatusBar style={postDetailStatusBarStyle(post, mode)} animated /> : null}
      {viewState === 'offline-cached' ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineText}>Offline · showing this session’s last loaded copy</Text>
        </View>
      ) : null}
      <FlatList
        data={comments}
        keyExtractor={(comment) => comment.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <ImmersivePost
              post={post}
              mediaActive={isFocused && appActive && !encouragementOpen && !voiceOpen && !broadcastOpen}
              viewerId={myId}
              supporterCount={supporters.length}
              supporterNames={
                supporters.length
                  ? `${authorLabel(supporters[0].name)}${supporters.length > 1 ? ` and ${supporters.length - 1} others` : ''}`
                  : ''
              }
              supporterAvatars={supporters}
              onBack={() => {
                navigateBackSafely(router);
              }}
              onOptions={onOptions}
              onEncourage={onToggleLike}
              onComment={() => inputRef.current?.focus()}
              onShare={() => setBroadcastOpen(true)}
              onOpenEncouragement={() => setEncouragementOpen(true)}
            />
            {post.image_url && post.post_type !== 'video' ? (
              <View style={styles.memoryAction}>
                <SaveToMemories url={post.image_url} inline />
              </View>
            ) : null}
            <Text style={styles.commentsHeading}>Comments</Text>
          </>
        }
        ListEmptyComponent={
          viewState === 'comments-loading' ? (
            <View style={styles.commentsState}>
              <ActivityIndicator color={theme.ink.action} />
              <Text style={styles.stateText}>Loading comments…</Text>
            </View>
          ) : viewState === 'comments-error' ? (
            <View style={styles.commentsState}>
              <Text style={styles.stateText}>Comments are unavailable. The post is still safe to view.</Text>
              <Pressable onPress={() => void load({ preserveVisible: true })} accessibilityRole="button" accessibilityLabel="Retry loading comments" style={styles.commentsRetry}>
                <Text style={styles.commentsRetryText}>Retry comments</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="Be the first to comment"
              subtitle="Share something supportive about this post."
            />
          )
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
              {canReportContent(myId, item.user_id) ? (
                <Pressable
                  onPress={() => onReportComment(item)}
                  disabled={reportingCommentIds.has(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Report this comment"
                  accessibilityState={{
                    disabled: reportingCommentIds.has(item.id),
                    busy: reportingCommentIds.has(item.id),
                  }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.reportComment, pressed && styles.pressed]}
                >
                  <Text style={styles.reportCommentText}>Report</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      />
      <View
        style={[
          styles.inputBar,
          { paddingBottom: Math.max(insets.bottom, spacing.sm) },
        ]}
      >
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Write a supportive comment…"
          placeholderTextColor={theme.ink.muted}
          value={text}
          onChangeText={setText}
          multiline
          accessibilityLabel="Supportive comment"
        />
        <Pressable
          onPress={onSend}
          disabled={!text.trim() || sending}
          style={({ pressed }) => [
            styles.sendButton,
            (!text.trim() || sending) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Send comment"
          accessibilityRole="button"
          accessibilityState={{ disabled: !text.trim() || sending, busy: sending }}
        >
          {sending ? <ActivityIndicator color={theme.ink.inverse} /> : <Text style={styles.sendText}>Send</Text>}
        </Pressable>
      </View>
      <EncouragementSheet
        visible={encouragementOpen}
        encouragers={encouragers}
        voices={voices}
        comments={comments}
        supporterCount={supporters.length}
        onClose={() => setEncouragementOpen(false)}
        onReply={(name) => {
          setEncouragementOpen(false);
          setText(`@${name} `);
        }}
        onThankEveryone={() => {
          setEncouragementOpen(false);
          setText('Thank you for showing up for me! ');
        }}
        onRecordVoice={() => {
          setEncouragementOpen(false);
          setVoiceOpen(true);
        }}
      />
      <VoiceEncouragementRecorder
        visible={voiceOpen}
        sending={sendingVoice}
        onClose={() => setVoiceOpen(false)}
        onSend={onSendVoice}
      />
      <BroadcastSheet post={broadcastOpen ? post : null} onClose={() => setBroadcastOpen(false)} />
    </KeyboardAvoidingView>
  );
}

function PostDetailState({
  topInset,
  onBack,
  children,
}: {
  topInset: number;
  onBack(): void;
  children: ReactNode;
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.stateScreen, { paddingTop: Math.max(topInset, spacing.sm) }]}>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.stateBack, pressed && styles.pressed]}
      >
        <Ionicons name="arrow-back" size={22} color={theme.ink.primary} />
        <Text style={styles.stateBackText}>Back</Text>
      </Pressable>
      <View style={styles.center}>{children}</View>
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.card },
  stateScreen: { flex: 1, backgroundColor: theme.surface.card },
  stateBack: {
    minWidth: 88,
    minHeight: spacing.touch,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  stateBackText: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 15 },
  offlineBanner: { position: 'absolute', zIndex: 5, top: spacing.sm, alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: theme.surface.canvas, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border.subtle },
  offlineText: { color: theme.ink.primary, fontFamily: font.semibold, fontSize: 11 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: theme.surface.card,
  },
  stateTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 18, textAlign: 'center' },
  stateText: { color: theme.ink.muted, fontFamily: font.regular, textAlign: 'center', lineHeight: 20 },
  retryButton: { minHeight: spacing.touch, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.ink.action },
  retryText: { color: theme.ink.inverse, fontFamily: font.bold },
  list: { paddingBottom: spacing.lg },
  memoryAction: { minHeight: 48, paddingHorizontal: spacing.lg, alignItems: 'flex-end', justifyContent: 'center' },
  commentsHeading: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: theme.ink.muted, fontFamily: font.bold, fontSize: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border.subtle },
  commentsState: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  commentsRetry: { minHeight: spacing.touch, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  commentsRetryText: { color: theme.ink.action, fontFamily: font.bold },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  commentBody: { flex: 1 },
  commentAuthor: { color: theme.ink.primary, fontFamily: font.semibold },
  commentTime: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12 },
  commentText: { marginTop: 2, color: theme.ink.primary, fontFamily: font.regular, lineHeight: 20 },
  reportComment: { alignSelf: 'flex-start', minHeight: spacing.touch, justifyContent: 'center' },
  reportCommentText: { color: theme.ink.muted, fontFamily: font.semibold, fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border.subtle, backgroundColor: theme.surface.card },
  input: { flex: 1, minHeight: 44, maxHeight: 100, borderWidth: 1, borderColor: theme.border.subtle, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: theme.ink.primary, backgroundColor: theme.surface.muted, fontFamily: font.regular, fontSize: 15 },
  sendButton: { minHeight: spacing.touch, borderRadius: 24, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.ink.action },
  sendDisabled: { opacity: theme.interaction.disabledOpacity },
  sendText: { color: theme.ink.inverse, fontFamily: font.bold },
  pressed: { opacity: 0.7 },
});
