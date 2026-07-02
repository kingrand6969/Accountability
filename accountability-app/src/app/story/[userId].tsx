import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listStoryGroups, deleteStory, type StoryGroup } from '../../stories/api';
import { showToast } from '../../ui/Toast';
import { timeAgo, authorLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import { font, spacing } from '../../ui/theme';

const STORY_DURATION_MS = 6000;

export default function StoryViewer() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const insets = useSafeAreaInsets();

  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  // pauses auto-advance while the delete confirm is open
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await listStoryGroups();
        if (cancelled) return;
        const idx = all.findIndex((g) => g.user_id === userId);
        if (idx === -1 || all[idx].stories.length === 0) {
          router.back();
          return;
        }
        setGroups(all);
        setGroupIndex(idx);
        setStoryIndex(0);
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Could not load stories', String((e as Error).message ?? e));
          router.back();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const group: StoryGroup | undefined = groups[groupIndex];
  const story = group?.stories[storyIndex];

  const goNext = useCallback(() => {
    if (!group) return;
    if (storyIndex < group.stories.length - 1) {
      setStoryIndex(storyIndex + 1);
    } else if (groupIndex < groups.length - 1) {
      setGroupIndex(groupIndex + 1);
      setStoryIndex(0);
    } else {
      router.back();
    }
  }, [group, groups.length, groupIndex, storyIndex, router]);

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

  function onDelete() {
    if (!story) return;
    setPaused(true);
    Alert.alert('Delete story?', 'This story will be removed for everyone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => setPaused(false) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteStory(story.id);
            showToast('Story deleted');
            // Remove locally, then advance (or leave if nothing is left).
            const remaining = group!.stories.filter((s) => s.id !== story.id);
            if (remaining.length === 0) {
              const nextGroups = groups.filter((_, i) => i !== groupIndex);
              if (nextGroups.length === 0 || groupIndex >= nextGroups.length) {
                router.back();
                return;
              }
              setGroups(nextGroups);
              setStoryIndex(0); // groupIndex now points at the next group
            } else {
              setGroups(groups.map((g, i) => (i === groupIndex ? { ...g, stories: remaining } : g)));
              setStoryIndex(Math.min(storyIndex, remaining.length - 1));
            }
          } catch (e) {
            Alert.alert('Could not delete story', String((e as Error).message ?? e));
          } finally {
            setPaused(false);
          }
        },
      },
    ]);
  }

  if (loading || !group || !story) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color="#fff" style={styles.center} />
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
        onPress={() => router.back()}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
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
  pressed: { opacity: 0.7 },
});
