import { useCallback, useState } from 'react';
import {
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
import { colors, font, spacing } from '../ui/theme';

const RING = ['#7c3aed', '#db2777', '#fb923c'] as const; // brand story ring

/** Facebook-style horizontal story circles above the feed. */
export function StoryRail() {
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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
    >
      {editorUri ? (
        <PhotoEditor uri={editorUri} onDone={onEdited} onCancel={() => setEditorUri(null)} />
      ) : null}
      {/* your story: add, or view + ring when you have one */}
      <Pressable
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        onPress={
          mine
            ? () => router.push({ pathname: '/story/[userId]', params: { userId: mine.user_id } })
            : onAddStory
        }
        onLongPress={mine ? onAddStory : undefined}
        accessibilityLabel={mine ? 'View your story (hold to add another)' : 'Add to your story'}
      >
        {mine ? (
          <Ring>
            <Image source={{ uri: mine.stories[mine.stories.length - 1].image_url }} style={styles.thumb} />
          </Ring>
        ) : (
          <View style={styles.addCircle}>
            <Ionicons name={posting ? 'hourglass-outline' : 'add'} size={26} color={colors.primary} />
          </View>
        )}
        <Text style={styles.name} numberOfLines={1}>
          Your story
        </Text>
      </Pressable>

      {groups
        .filter((g) => !g.isMe)
        .map((g) => (
          <Pressable
            key={g.user_id}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            onPress={() =>
              router.push({ pathname: '/story/[userId]', params: { userId: g.user_id } })
            }
            accessibilityLabel={`View ${authorLabel(g.name)}'s story`}
          >
            <Ring>
              <Image source={{ uri: g.stories[g.stories.length - 1].image_url }} style={styles.thumb} />
            </Ring>
            <Text style={styles.name} numberOfLines={1}>
              {authorLabel(g.name)}
            </Text>
          </Pressable>
        ))}
    </ScrollView>
  );
}

function Ring({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient colors={[...RING]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
      <View style={styles.ringInner}>{children}</View>
    </LinearGradient>
  );
}

const SIZE = 64;

const styles = StyleSheet.create({
  rail: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  item: { alignItems: 'center', gap: 4, width: SIZE + 8 },
  pressed: { opacity: 0.75 },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: SIZE - 6,
    height: SIZE - 6,
    borderRadius: (SIZE - 6) / 2,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: SIZE - 10, height: SIZE - 10, borderRadius: (SIZE - 10) / 2 },
  addCircle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 11.5,
    fontFamily: font.medium,
    color: colors.textSecondary,
    maxWidth: SIZE + 8,
    textAlign: 'center',
  },
});
