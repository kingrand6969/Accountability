import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { listStoryGroups, deleteStory, reportStory, type StoryGroup } from '../../stories/api';
import { showToast } from '../../ui/Toast';
import { timeAgo, authorLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import { font, spacing } from '../../ui/theme';
import { useAuth } from '../../auth/AuthProvider';
import { navigateBackSafely } from '../../navigation/routeAccessContract';
import { canReportContent, createReportAction } from '../../moderation/reportAction';

const STORY_DURATION_MS = 6000;

export default function StoryViewer() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const viewKey = `${ownerId ?? 'signed-out'}:${userId ?? 'missing'}`;
  const currentOwnerRef = useRef(ownerId);
  const currentViewKeyRef = useRef(viewKey);
  const loadGeneration = useRef(0);
  const lifecycleGeneration = useRef(0);
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const currentStoryIdRef = useRef<string | null>(null);

  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  // pauses auto-advance while the delete confirm is open
  const [paused, setPaused] = useState(false);
  const [dataViewKey, setDataViewKey] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reporting, setReporting] = useState(false);
  const storyReportAction = useRef<ReturnType<typeof createReportAction> | null>(null);

  useLayoutEffect(() => {
    if (storyReportAction.current !== null) return;
    storyReportAction.current = createReportAction({
      kind: 'story',
      report: reportStory,
      confirm: ({ title, message, onConfirm, onCancel, onDismiss }) => {
        setPaused(true);
        Alert.alert(title, message, [
          { text: 'Cancel', style: 'cancel', onPress: onCancel },
          { text: 'Report', style: 'destructive', onPress: () => void onConfirm() },
        ], { cancelable: true, onDismiss });
      },
      toast: showToast,
      announce: (message) => AccessibilityInfo.announceForAccessibility(message),
      alertError: (title, message) => Alert.alert(title, message),
      pendingChanged: (ids) => {
        const pending = ids.size > 0;
        setReporting(pending);
        if (!pending) setPaused(false);
      },
      getContextKey: (targetId) =>
        mountedRef.current &&
        focusedRef.current &&
        currentStoryIdRef.current === targetId
          ? `${targetId}:${currentOwnerRef.current ?? ''}:${currentViewKeyRef.current}:${lifecycleGeneration.current}`
          : null,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      focusedRef.current = false;
      storyReportAction.current?.dispose();
    };
  }, []);

  useEffect(() => {
    const lifecycle = ++lifecycleGeneration.current;
    currentOwnerRef.current = ownerId;
    currentViewKeyRef.current = viewKey;
    loadGeneration.current += 1;
    storyReportAction.current?.invalidate();
    queueMicrotask(() => {
      if (
        lifecycle !== lifecycleGeneration.current ||
        currentOwnerRef.current !== ownerId ||
        currentViewKeyRef.current !== viewKey
      )
        return;
      setGroups([]);
      setGroupIndex(0);
      setStoryIndex(0);
      setDataViewKey(null);
      setUnavailable(false);
      setPaused(false);
      setReporting(false);
      setLoading(ownerId !== null);
    });
  }, [ownerId, viewKey]);

  const load = useCallback(async () => {
    const requestOwner = ownerId;
    const requestViewKey = viewKey;
    const generation = ++loadGeneration.current;
    if (!requestOwner || !userId) {
      setUnavailable(true);
      setDataViewKey(requestViewKey);
      setLoading(false);
      return;
    }
    try {
      const all = await listStoryGroups();
      if (
        generation !== loadGeneration.current ||
        requestOwner !== currentOwnerRef.current ||
        requestViewKey !== currentViewKeyRef.current
      )
        return;
      const idx = all.findIndex((g) => g.user_id === userId);
      const missing = idx === -1 || all[idx].stories.length === 0;
      setGroups(missing ? [] : all);
      setGroupIndex(missing ? 0 : idx);
      setStoryIndex(0);
      setUnavailable(missing);
      setDataViewKey(requestViewKey);
    } catch {
      if (
        generation !== loadGeneration.current ||
        requestOwner !== currentOwnerRef.current ||
        requestViewKey !== currentViewKeyRef.current
      )
        return;
      setGroups([]);
      setUnavailable(true);
      setDataViewKey(requestViewKey);
    } finally {
      if (
        generation === loadGeneration.current &&
        requestOwner === currentOwnerRef.current &&
        requestViewKey === currentViewKeyRef.current
      )
        setLoading(false);
    }
  }, [ownerId, userId, viewKey]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      void load();
      return () => {
        focusedRef.current = false;
        loadGeneration.current += 1;
        lifecycleGeneration.current += 1;
        storyReportAction.current?.invalidate();
        if (timer.current) clearTimeout(timer.current);
        setPaused(false);
        setReporting(false);
      };
    }, [load]),
  );

  const safeClose = useCallback(() => {
    navigateBackSafely(router);
  }, [router]);

  const group: StoryGroup | undefined = groups[groupIndex];
  const story = group?.stories[storyIndex];

  useLayoutEffect(() => {
    currentStoryIdRef.current = story?.id ?? null;
  }, [story?.id]);

  const goNext = useCallback(() => {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(storyIndex + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(0);
    } else {
      safeClose();
    }
  }, [group, groups.length, groupIndex, storyIndex, safeClose]);

  const goPrev = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex(storyIndex - 1);
    } else if (groupIndex > 0) {
      const prev = groups[groupIndex - 1];
      setGroupIndex(groupIndex - 1);
      setStoryIndex(Math.max(0, prev.stories.length - 1));
    }
    // at the very first story: do nothing
  }, [groups, groupIndex, storyIndex]);

  // Auto-advance after 6s per story; cleared on any index change / unmount.
  useEffect(() => {
    if (loading || paused || !story) return;
    timer.current = setTimeout(goNext, STORY_DURATION_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [loading, paused, story, goNext]);

  function isCurrentMutation(requestOwner: string, lifecycle: number, requestViewKey: string) {
    return (
      requestOwner === currentOwnerRef.current &&
      lifecycle === lifecycleGeneration.current &&
      requestViewKey === currentViewKeyRef.current
    );
  }

  function onDelete() {
    const requestOwner = ownerId;
    const requestViewKey = viewKey;
    const lifecycle = lifecycleGeneration.current;
    const targetGroup = group;
    const target = story;
    if (!requestOwner || !targetGroup?.isMe || !target || target.user_id !== requestOwner) return;
    setPaused(true);
    Alert.alert('Delete story?', 'This story will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
          try {
            await deleteStory(target.id);
            if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
            showToast('Story deleted');
            // Remove locally, then advance (or leave if nothing is left).
            const remaining = targetGroup.stories.filter((s) => s.id !== target.id);
            if (remaining.length === 0) {
              const nextGroups = groups.filter((_, i) => i !== groupIndex);
              if (nextGroups.length === 0 || groupIndex >= nextGroups.length) {
                safeClose();
                return;
              }
              setGroups(nextGroups);
              setStoryIndex(0); // groupIndex now points at the next group
            } else {
              setGroups(groups.map((g, i) => (i === groupIndex ? { ...g, stories: remaining } : g)));
              setStoryIndex(Math.min(storyIndex, remaining.length - 1));
            }
          } catch (e) {
            if (!isCurrentMutation(requestOwner, lifecycle, requestViewKey)) return;
            Alert.alert('Could not delete story', String((e as Error).message ?? e));
          } finally {
            if (isCurrentMutation(requestOwner, lifecycle, requestViewKey)) setPaused(false);
          }
        },
      },
    ]);
  }

  function onReport() {
    const target = story;
    if (!target) return;
    storyReportAction.current?.request(target.id, ownerId, target.user_id);
  }

  if (loading || dataViewKey !== viewKey) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color="#fff" style={styles.center} />
      </View>
    );
  }
  if (unavailable || !group || !story) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableTitle}>This story is no longer available.</Text>
        <Pressable onPress={safeClose} accessibilityRole="button" accessibilityLabel="Close stories">
          <Text style={styles.unavailableAction}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Image source={{ uri: story.image_url }} style={styles.image} resizeMode="contain" />

      {/* Tap zones: left 25% = previous, right 40% = next */}
      <Pressable style={styles.tapLeft} onPress={goPrev} accessibilityLabel="Previous story" />
      <Pressable style={styles.tapRight} onPress={goNext} accessibilityLabel="Next story" />

      {/* Progress segments */}
      <View style={[styles.progressRow, { top: insets.top + spacing.sm }]}>
        {group.stories.map((s, i) => (
          <View key={s.id} style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: i < storyIndex ? '100%' : i === storyIndex ? '100%' : '0%' },
                i === storyIndex && styles.progressActive,
              ]}
            />
          </View>
        ))}
      </View>

      {/* Author (top-left) */}
      <View style={[styles.header, { top: insets.top + spacing.sm + 14 }]}>
        <Avatar url={group.avatar} name={group.name} size={34} />
        <View>
          <Text style={styles.author}>{group.isMe ? 'Your story' : authorLabel(group.name)}</Text>
          <Text style={styles.time}>{timeAgo(story.created_at)}</Text>
        </View>
      </View>

      {/* Close (top-right) */}
      <Pressable
        style={({ pressed }) => [
          styles.closeBtn,
          { top: insets.top + spacing.sm + 10 },
          pressed && styles.pressed,
        ]}
        onPress={safeClose}
        hitSlop={8}
        accessibilityLabel="Close stories"
      >
        <Ionicons name="close" size={26} color="#fff" />
      </Pressable>

      {/* Caption (bottom, scrimmed) */}
      {story.caption ? (
        <View style={[styles.captionWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.caption}>{story.caption}</Text>
        </View>
      ) : null}

      {/* Delete my story (bottom-right) */}
      {group.isMe ? (
        <Pressable
          style={({ pressed }) => [
            styles.trashBtn,
            { bottom: insets.bottom + spacing.xl },
            pressed && styles.pressed,
          ]}
          onPress={onDelete}
          hitSlop={8}
          accessibilityLabel="Delete this story"
        >
          <Ionicons name="trash-outline" size={22} color="#fff" />
        </Pressable>
      ) : null}
      {canReportContent(ownerId, story.user_id) ? (
        <Pressable
          style={({ pressed }) => [
            styles.reportBtn,
            { bottom: insets.bottom + spacing.xl },
            pressed && styles.pressed,
          ]}
          onPress={onReport}
          disabled={reporting}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Report this story"
          accessibilityState={{ disabled: reporting, busy: reporting }}
        >
          <Ionicons name="flag-outline" size={22} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  unavailable: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  unavailableTitle: { color: '#fff', fontFamily: font.bold, fontSize: 18, textAlign: 'center' },
  unavailableAction: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  center: { flex: 1 },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  tapLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '25%' },
  tapRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%' },
  progressRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: 'rgba(255,255,255,0.55)' },
  progressActive: { backgroundColor: '#fff' },
  header: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  author: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 14.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  time: {
    color: 'rgba(255,255,255,0.8)',
    fontFamily: font.medium,
    fontSize: 12,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  closeBtn: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  caption: {
    color: '#fff',
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 22,
    paddingRight: 52, // keep clear of the trash button
  },
  trashBtn: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportBtn: {
    position: 'absolute',
    right: spacing.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
