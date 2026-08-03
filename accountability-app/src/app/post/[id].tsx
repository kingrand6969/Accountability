import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
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
} from '../../feed/api';
import { showPostMenu } from '../../feed/postActions';
import { useAuth } from '../../auth/AuthProvider';
import { SaveToMemories } from '../../memories/SaveToMemories';
import { authorLabel, timeAgo } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import type { FeedPost, PostComment } from '../../feed/types';
import { EmptyState } from '../../ui/EmptyState';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing } from '../../ui/theme';
import { EncouragementSheet } from '../../feed/EncouragementSheet';
import { VoiceEncouragementRecorder } from '../../feed/VoiceEncouragementRecorder';
import { BroadcastSheet } from '../../feed/BroadcastSheet';
import { canReportContent, createReportAction } from '../../moderation/reportAction';
import {
  ImmersivePost,
  ImmersiveOperationCoordinator,
  deriveImmersivePostState,
  immersiveResultBelongsToView,
  visibleImmersiveSnapshot,
  type ImmersiveSnapshot,
  type ImmersiveViewContext,
} from '../../feed/ImmersivePost';

export default function PostDetailRoute() {
  const { id, encouragement } = useLocalSearchParams<{ id: string; encouragement?: string }>();
  const { session } = useAuth();
  const myId = session?.user.id ?? null;
  const viewKey = `${id ?? ''}:${myId ?? ''}`;
  return (
    <PostDetailView
      key={viewKey}
      id={id}
      encouragement={encouragement}
      myId={myId}
    />
  );
}

function PostDetailView({
  id,
  encouragement,
  myId,
}: {
  id: string;
  encouragement?: string;
  myId: string | null;
}) {
  const router = useRouter();
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
  const inputRef = useRef<TextInput>(null);
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
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

  const load = useCallback(async () => {
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
      setSnapshot({
        viewKey: requestedViewKey,
        post: loadedPost,
        comments: [],
        encouragers: [],
        voices: [],
        commentsLoading: Boolean(loadedPost),
        commentsError: false,
      });
      if (loadedPost) dataViewKeyRef.current = requestedViewKey;
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
      setLoadError(String((error as Error).message ?? error));
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
      void load();
    }
  }, [load, online]);

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
        setLoading(true);
        void load();
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
        Alert.alert('Could not update like', String((error as Error).message ?? error));
        void load();
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
        await load();
      }
    } catch (error) {
      if (operations.current.owns(token, currentView(), mountedRef.current && focusedRef.current)) {
        Alert.alert('Could not comment', String((error as Error).message ?? error));
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
      if (router.canGoBack()) router.back();
      else router.replace('/');
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
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.stateText}>Loading post…</Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
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
      </View>
    );
  }

  return (
    <View style={styles.screen}>
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
              viewerId={myId}
              supporterCount={supporters.length}
              supporterNames={
                supporters.length
                  ? `${authorLabel(supporters[0].name)}${supporters.length > 1 ? ` and ${supporters.length - 1} others` : ''}`
                  : ''
              }
              supporterAvatars={supporters}
              onBack={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/');
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
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.stateText}>Loading comments…</Text>
            </View>
          ) : viewState === 'comments-error' ? (
            <View style={styles.commentsState}>
              <Text style={styles.stateText}>Comments are unavailable. The post is still safe to view.</Text>
              <Pressable onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Retry loading comments" style={styles.commentsRetry}>
                <Text style={styles.commentsRetryText}>Retry comments</Text>
              </Pressable>
            </View>
          ) : (
            <EmptyState
            icon="chatbubble-ellipses-outline"
            title={`Be the first to encourage ${authorLabel(post.author_name)}`}
            subtitle="A little support can keep a streak going."
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
        ListFooterComponent={
          <View style={styles.inputBar}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Write an encouraging comment…"
              placeholderTextColor={colors.textFaint}
              value={text}
              onChangeText={setText}
              multiline
              accessibilityLabel="Encouraging comment"
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
              {sending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.sendText}>Send</Text>}
            </Pressable>
          </View>
        }
      />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  offlineBanner: { position: 'absolute', zIndex: 5, top: spacing.sm, alignSelf: 'center', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: 'rgba(247,244,236,.94)' },
  offlineText: { color: colors.navy, fontFamily: font.semibold, fontSize: 11 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    backgroundColor: colors.background,
  },
  stateTitle: { color: colors.text, fontFamily: font.bold, fontSize: 18, textAlign: 'center' },
  stateText: { color: colors.textMuted, fontFamily: font.regular, textAlign: 'center', lineHeight: 20 },
  retryButton: { minHeight: 44, borderRadius: radius.pill, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  retryText: { color: colors.onPrimary, fontFamily: font.bold },
  list: { paddingBottom: spacing.lg },
  memoryAction: { minHeight: 48, paddingHorizontal: spacing.lg, alignItems: 'flex-end', justifyContent: 'center' },
  commentsHeading: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.textMuted, fontFamily: font.bold, fontSize: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  commentsState: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  commentsRetry: { minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  commentsRetryText: { color: colors.primary, fontFamily: font.bold },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  commentBody: { flex: 1 },
  commentAuthor: { color: colors.text, fontFamily: font.semibold },
  commentTime: { color: colors.textFaint, fontFamily: font.regular, fontSize: 12 },
  commentText: { marginTop: 2, color: colors.text, fontFamily: font.regular, lineHeight: 20 },
  reportComment: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  reportCommentText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 13 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background },
  input: { flex: 1, maxHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: colors.text, backgroundColor: colors.surfaceAlt, fontFamily: font.regular, fontSize: 15 },
  sendButton: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendDisabled: { opacity: 0.5 },
  sendText: { color: colors.onPrimary, fontFamily: font.bold },
  pressed: { opacity: 0.7 },
});
