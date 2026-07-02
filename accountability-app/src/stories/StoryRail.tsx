import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { listStoryGroups, addStory, type StoryGroup } from './api';
import { authorLabel } from '../feed/format';
import { PhotoEditor, type EditedPhoto } from '../media/PhotoEditor';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

export type StoryRailHandle = { openPicker: () => void };

/** Facebook-style story cards: tall image tiles, "Create story" first. */
export const StoryRail = forwardRef<StoryRailHandle>(function StoryRail(_props, ref) {
  const router = useRouter();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [posting, setPosting] = useState(false);
  const [editorUri, setEditorUri] = useState<string | null>(null);

  const load = useCallback(() => {
    listStoryGroups().then(setGroups).catch(() => {});
  }, []);

  useFocusEffect(load);

  async function onAddStory() {
    if (posting) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to post a story.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
      allowsEditing: true,
      aspect: [9, 16],
    });
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
    await postStory(asset.base64, ext);
  }

  useImperativeHandle(ref, () => ({ openPicker: onAddStory }));

  async function postStory(base64: string, ext: string) {
    setPosting(true);
    try {
      await addStory(base64, ext);
      showToast('Story posted — visible for 24 hours');
      load();
    } catch (e) {
      Alert.alert('Could not post story', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  function onEdited(photo: EditedPhoto) {
    setEditorUri(null);
    postStory(photo.base64, 'jpg');
  }

  const mine = groups.find((g) => g.isMe);
  const others = groups.filter((g) => !g.isMe);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {editorUri ? (
        <PhotoEditor uri={editorUri} onDone={onEdited} onCancel={() => setEditorUri(null)} />
      ) : null}

      {/* create tile — shows your latest story as background once you have one */}
      <Pressable
        style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
        onPress={onAddStory}
        accessibilityLabel="Create a story"
      >
        {mine ? (
          <Image
            source={{ uri: mine.stories[mine.stories.length - 1].image_url }}
            style={styles.tileImage}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#312e81', '#7c3aed', '#db2777']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.tileImage}
          />
        )}
        <View style={styles.createBottom}>
          <View style={styles.createPlus}>
            {posting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="add" size={20} color="#fff" />
            )}
          </View>
          <Text style={styles.createLabel}>Create{'\n'}story</Text>
        </View>
      </Pressable>

      {/* my story as a viewable tile */}
      {mine ? (
        <StoryTile
          image={mine.stories[mine.stories.length - 1].image_url}
          avatar={mine.avatar}
          name="Your story"
          onPress={() =>
            router.push({ pathname: '/story/[userId]', params: { userId: mine.user_id } })
          }
        />
      ) : null}

      {others.map((g) => (
        <StoryTile
          key={g.user_id}
          image={g.stories[g.stories.length - 1].image_url}
          avatar={g.avatar}
          name={authorLabel(g.name)}
          onPress={() =>
            router.push({ pathname: '/story/[userId]', params: { userId: g.user_id } })
          }
        />
      ))}
    </ScrollView>
  );
});

function StoryTile({
  image,
  avatar,
  name,
  onPress,
}: {
  image: string;
  avatar: string | null;
  name: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={`View ${name}`}
    >
      <Image source={{ uri: image }} style={styles.tileImage} resizeMode="cover" />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={styles.tileScrim}
        pointerEvents="none"
      />
      <View style={styles.tileAvatarRing}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.tileAvatar} />
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

const TILE_W = 104;
const TILE_H = 156;

const styles = StyleSheet.create({
  rail: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  tile: {
    width: TILE_W,
    height: TILE_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tileImage: { width: '100%', height: '100%' },
  tileScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  tileAvatarRing: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: colors.primary,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileAvatar: { width: 29, height: 29, borderRadius: 14.5 },
  tileAvatarFallback: {
    backgroundColor: colors.primary,
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
  createBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 18,
  },
  createPlus: {
    position: 'absolute',
    top: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createLabel: {
    color: colors.text,
    fontFamily: font.bold,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 15,
  },
});
