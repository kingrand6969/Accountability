import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { CachedImage } from '../ui/CachedImage';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { listStoryGroups, addStory, type StoryGroup } from './api';
import { authorLabel } from '../feed/format';
import { PhotoEditor, type EditedPhoto } from '../media/PhotoEditor';
import { showToast } from '../ui/Toast';
import { font, radius, spacing, contentMax, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type StoryRailHandle = { openPicker: () => void };
type StoryRailProps = {
  meName?: string | null;
  meAvatar?: string | null;
};

const STORY_BUBBLE = 52;
const STORY_ITEM = 64;
const STORY_ADD_TARGET = 44;
const STORY_ADD_VISUAL = 22;

export function storyTileSizeForFontScale(fontScale: number) {
  if (fontScale >= 1.75) return { tileWidth: 104, tileHeight: 104, hintWidth: 104 };
  if (fontScale >= 1.25) return { tileWidth: 80, tileHeight: 88, hintWidth: 80 };
  return { tileWidth: STORY_ITEM, tileHeight: 76, hintWidth: STORY_ITEM };
}

/** Compact, photo-first My Day rail. It supports the feed without becoming the feed. */
export const StoryRail = forwardRef<StoryRailHandle, StoryRailProps>(function StoryRail(
  { meName, meAvatar },
  ref,
) {
  const router = useRouter();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { fontScale } = useWindowDimensions();
  const {
    tileWidth,
    tileHeight,
    hintWidth,
  } = storyTileSizeForFontScale(fontScale);
  const tileSize = { width: tileWidth, height: tileHeight };
  const createPlusVisualItemLeft = (tileWidth - STORY_BUBBLE) / 2 + 32;
  const createPlusTargetLeft = Math.min(
    tileWidth - STORY_ADD_TARGET,
    createPlusVisualItemLeft - (STORY_ADD_TARGET - STORY_ADD_VISUAL) / 2,
  );
  const createPlusVisualTargetLeft = createPlusVisualItemLeft - createPlusTargetLeft;
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [posting, setPosting] = useState(false);
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const loadGeneration = useRef(0);
  const mutationGeneration = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    AsyncStorage.getItem('story-buddy-hint-dismissed').then((value) => {
      if (mountedRef.current) setShowHint(value !== '1');
    });
    return () => {
      mountedRef.current = false;
      loadGeneration.current += 1;
      mutationGeneration.current += 1;
    };
  }, []);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (mountedRef.current) setLoadError(false);
    try {
      const nextGroups = await listStoryGroups();
      if (!mountedRef.current || generation !== loadGeneration.current) return;
      setGroups(nextGroups);
    } catch {
      if (!mountedRef.current || generation !== loadGeneration.current) return;
      setLoadError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        loadGeneration.current += 1;
        mutationGeneration.current += 1;
        setEditorUri(null);
        setPosting(false);
      };
    }, [load]),
  );

  async function onAddStory() {
    if (posting) return;
    const generation = ++mutationGeneration.current;
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mountedRef.current || generation !== mutationGeneration.current) return;
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to post a story.');
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (!mountedRef.current || generation !== mutationGeneration.current) return;
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read image', 'Please try a different photo.');
      return;
    }
    if (Platform.OS !== 'web') {
      // native: run through filters + brand watermark first
      setEditorUri(asset.uri);
      return;
    }
    const ext = asset.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
    setPosting(true);
    try {
      await addStory(asset.base64, ext);
      if (!mountedRef.current || generation !== mutationGeneration.current) return;
      showToast('Flex posted — visible for 24 hours');
      void load();
    } catch (e) {
      if (!mountedRef.current || generation !== mutationGeneration.current) return;
      Alert.alert('Could not post story', String((e as Error).message ?? e));
    } finally {
      if (mountedRef.current && generation === mutationGeneration.current) setPosting(false);
    }
  }

  useImperativeHandle(ref, () => ({ openPicker: onAddStory }));

  async function postStory(base64: string, ext: string) {
    const generation = ++mutationGeneration.current;
    setPosting(true);
    try {
      await addStory(base64, ext);
      if (!mountedRef.current || generation !== mutationGeneration.current) return;
      showToast('Flex posted — visible for 24 hours');
      void load();
    } catch (e) {
      if (!mountedRef.current || generation !== mutationGeneration.current) return;
      Alert.alert('Could not post story', String((e as Error).message ?? e));
    } finally {
      if (mountedRef.current && generation === mutationGeneration.current) setPosting(false);
    }
  }

  function onEdited(photo: EditedPhoto) {
    setEditorUri(null);
    void postStory(photo.base64, 'jpg');
  }

  const mine = groups.find((g) => g.isMe);
  const others = groups.filter((g) => !g.isMe);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // keep the rail inside the same centered column as the feed on wide screens
      style={contentMax}
      contentContainerStyle={styles.rail}
    >
      {editorUri ? (
        <PhotoEditor uri={editorUri} onDone={onEdited} onCancel={() => setEditorUri(null)} />
      ) : null}

      <View style={[styles.storyItem, tileSize]}>
        <Pressable
          style={({ pressed }) => [styles.createBubble, pressed && styles.pressed]}
          onPress={() => {
            if (mine) {
              router.push({ pathname: '/story/[userId]', params: { userId: mine.user_id } });
            } else {
              onAddStory();
            }
          }}
          accessibilityLabel={mine ? 'View My Day' : 'Add to My Day'}
          accessibilityRole="button"
        >
          <View style={styles.createBubbleRing}>
            {mine ? (
              <CachedImage
                uri={mine.stories[mine.stories.length - 1].image_url}
                style={styles.bubbleImage}
                contentFit="cover"
              />
            ) : meAvatar ? (
              <CachedImage uri={meAvatar} style={styles.bubbleImage} contentFit="cover" />
            ) : (
              <View style={[styles.bubbleImage, styles.createAvatarFallback]}>
                <Text style={styles.createInitial}>
                  {(meName?.trim()?.[0] ?? 'Y').toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
        <Text style={styles.createLabel}>My Day</Text>
        <Pressable
          testID="story-create-plus-target"
          style={[styles.createPlusTarget, { left: createPlusTargetLeft }]}
          onPress={onAddStory}
          accessibilityRole="button"
          accessibilityLabel="Add to My Day"
        >
          <View
            testID="story-create-plus-visual"
            style={[styles.createPlusVisual, { left: createPlusVisualTargetLeft }]}
          >
            {posting ? (
              <ActivityIndicator size="small" color={theme.ink.inverse} />
            ) : (
              <Ionicons name="add" size={14} color={theme.ink.inverse} />
            )}
          </View>
        </Pressable>
      </View>

      {others.map((g) => (
        <StoryTile
          key={g.user_id}
          styles={styles}
          image={g.stories[g.stories.length - 1].image_url}
          name={authorLabel(g.name)}
          viewed={g.viewed}
          tileSize={tileSize}
          onPress={() =>
            router.push({ pathname: '/story/[userId]', params: { userId: g.user_id } })
          }
        />
      ))}

      {loadError ? (
        <Pressable
          style={[styles.retryTile, { height: tileHeight }]}
          onPress={() => void load()}
          accessibilityRole="button"
          accessibilityLabel="Couldn’t load My Day. Retry"
        >
          <Text style={styles.retryText}>Couldn’t load My Day · Retry</Text>
        </Pressable>
      ) : null}

      {/* no buddies' stories yet — turn the empty rail into a useful nudge */}
      {others.length === 0 && showHint ? (
        <View style={[styles.hintTile, { width: hintWidth, height: tileHeight }]}>
          <Pressable
            style={({ pressed }) => [styles.hintContent, pressed && styles.pressed]}
            onPress={() => router.push('/discover')}
            accessibilityLabel="Find accountability buddies"
            accessibilityRole="button"
          >
            <View style={styles.hintIcon}>
              <Ionicons name="people" size={22} color={theme.ink.action} />
            </View>
            <Text style={styles.hintText}>Find{'\n'}buddies</Text>
          </Pressable>
          <Pressable
            style={styles.hintClose}
            onPress={() => {
              setShowHint(false);
              AsyncStorage.setItem('story-buddy-hint-dismissed', '1').catch(() => {});
            }}
            hitSlop={6}
            accessibilityLabel="Dismiss My Day suggestion"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={16} color={theme.ink.muted} />
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
});

function StoryTile({
  styles,
  image,
  name,
  viewed,
  tileSize,
  onPress,
}: {
  styles: StoryRailStyles;
  image: string;
  name: string;
  viewed: boolean;
  tileSize: { width: number; height: number };
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.storyItem, tileSize, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={`${name}, ${viewed ? 'viewed' : 'unseen'} story`}
      accessibilityRole="button"
    >
      <View style={[styles.storyBubbleRing, viewed && styles.storyBubbleRingViewed]}>
        <CachedImage uri={image} style={styles.bubbleImage} contentFit="cover" />
      </View>
      <Text style={styles.storyName} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

type StoryRailStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  rail: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.md,
    backgroundColor: theme.surface.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border.subtle,
  },
  pressed: { opacity: 0.85 },
  storyItem: {
    width: STORY_ITEM,
    height: 76,
    alignItems: 'center',
  },
  storyBubbleRing: {
    width: STORY_BUBBLE,
    height: STORY_BUBBLE,
    borderRadius: STORY_BUBBLE / 2,
    borderWidth: 2,
    borderColor: theme.ink.action,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 2,
  },
  storyBubbleRingViewed: { borderColor: theme.border.strong },
  bubbleImage: {
    width: '100%',
    height: '100%',
    borderRadius: (STORY_BUBBLE - 8) / 2,
  },
  storyName: {
    marginTop: 4,
    width: '100%',
    color: theme.ink.muted,
    fontFamily: font.medium,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  createBubble: {
    width: STORY_BUBBLE,
    height: STORY_BUBBLE,
  },
  createBubbleRing: {
    flex: 1,
    borderRadius: STORY_BUBBLE / 2,
    borderWidth: 2,
    borderColor: theme.ink.action,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    padding: 2,
  },
  createAvatarFallback: {
    backgroundColor: theme.ink.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlusTarget: {
    position: 'absolute',
    top: 23,
    width: STORY_ADD_TARGET,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPlusVisual: {
    position: 'absolute',
    top: 11,
    width: STORY_ADD_VISUAL,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.ink.action,
    borderWidth: 2,
    borderColor: theme.surface.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createInitial: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 13 },
  createLabel: {
    marginTop: 4,
    width: '100%',
    color: theme.ink.secondary,
    fontFamily: font.semibold,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
  hintTile: {
    width: STORY_ITEM,
    height: 76,
  },
  retryTile: {
    width: 112,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  retryText: {
    color: theme.ink.action,
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  hintContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 6,
    paddingVertical: spacing.md,
  },
  hintClose: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    color: theme.ink.muted,
    fontFamily: font.semibold,
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 17,
  },
});
