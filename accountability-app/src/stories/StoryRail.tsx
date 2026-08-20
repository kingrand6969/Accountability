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
import { LinearGradient } from 'expo-linear-gradient';
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

export function storyTileSizeForFontScale(fontScale: number) {
  if (fontScale >= 1.75) {
    return { tileWidth: 140, tileHeight: 184, hintWidth: 112 };
  }
  if (fontScale >= 1.25) {
    return { tileWidth: 112, tileHeight: 152, hintWidth: 90 };
  }
  return { tileWidth: TILE_W, tileHeight: TILE_H, hintWidth: 72 };
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

      {/* create tile — shows your latest story as background once you have one */}
      <View style={[styles.tile, tileSize]}>
        <Pressable
          style={({ pressed }) => [styles.tileMainAction, pressed && styles.pressed]}
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
          {mine ? (
            <CachedImage
              uri={mine.stories[mine.stories.length - 1].image_url}
              style={styles.tileImage}
              contentFit="cover"
            />
          ) : (
            <LinearGradient
              colors={['#1e3a8a', '#2563eb', '#0ea5e9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.tileImage}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.tileScrim}
            pointerEvents="none"
          />
          <View style={styles.createAvatarRing}>
            {meAvatar ? (
              <CachedImage uri={meAvatar} style={styles.createAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.createAvatar, styles.createAvatarFallback]}>
                <Text style={styles.createInitial}>
                  {(meName?.trim()?.[0] ?? 'Y').toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.createLabel}>My Day</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.createPlus, pressed && styles.pressed]}
          onPress={onAddStory}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Add to My Day"
        >
          {posting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={22} color="#fff" />
          )}
        </Pressable>
      </View>

      {others.map((g) => (
        <StoryTile
          key={g.user_id}
          styles={styles}
          image={g.stories[g.stories.length - 1].image_url}
          avatar={g.avatar}
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
            onPress={() => router.push('/buddy')}
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
  avatar,
  name,
  viewed,
  tileSize,
  onPress,
}: {
  styles: StoryRailStyles;
  image: string;
  avatar: string | null;
  name: string;
  viewed: boolean;
  tileSize: { width: number; height: number };
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, tileSize, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={`${name}, ${viewed ? 'viewed' : 'unseen'} story`}
      accessibilityRole="button"
    >
      <CachedImage uri={image} style={styles.tileImage} contentFit="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={styles.tileScrim}
        pointerEvents="none"
      />
      <View style={[styles.tileAvatarRing, viewed && styles.tileAvatarRingViewed]}>
        {avatar ? (
          <CachedImage uri={avatar} style={styles.tileAvatar} />
        ) : (
          <View style={[styles.tileAvatar, styles.tileAvatarFallback]}>
            <Ionicons name="person" size={13} color="#fff" />
          </View>
        )}
      </View>
      <Text style={styles.tileName} numberOfLines={2}>
        {name}
      </Text>
    </Pressable>
  );
}

const TILE_W = 92;
const TILE_H = 132;

type StoryRailStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  rail: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: theme.surface.muted,
  },
  tileMainAction: {
    flex: 1,
  },
  tileImage: { width: '100%', height: '100%' },
  tileScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  tileAvatarRing: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: theme.ink.action,
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileAvatar: { width: 25, height: 25, borderRadius: 12.5 },
  tileAvatarRingViewed: { borderColor: theme.border.subtle },
  tileAvatarFallback: {
    backgroundColor: theme.ink.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileName: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 12.5,
    lineHeight: 16,
  },
  // frosted ➕ floating over the tile — no white strip, all gradient
  createPlus: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.ink.action,
    borderWidth: 2.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAvatarRing: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: '#fff',
    backgroundColor: theme.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  createAvatar: { width: 29, height: 29, borderRadius: 14.5 },
  createAvatarFallback: {
    backgroundColor: theme.ink.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createInitial: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  createLabel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 12,
    textAlign: 'left',
    lineHeight: 16,
  },
  hintTile: {
    width: 72,
    height: TILE_H,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    backgroundColor: theme.surface.muted,
    overflow: 'hidden',
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
    borderRadius: 20,
    backgroundColor: theme.surface.card,
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
