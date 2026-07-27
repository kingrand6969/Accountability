import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addPostTags, createPost, getPost, updatePost, updatePostAudience } from '../feed/api';
import { createEvent } from '../events/api';
import { toIsoFromLocal, toLocalDateString } from '../timeline/datetime';
import { uploadPostImage } from '../feed/uploadPostImage';
import { currentPlaceLabel, saveImageToMemories } from '../memories/api';
import { listBuddies, type Buddy } from '../buddy/api';
import { promptCrossShare } from '../feed/crossShare';
import { PhotoEditor, type EditedPhoto } from '../media/PhotoEditor';
import { getMyProfile } from '../profiles/api';
import { showToast } from '../ui/Toast';
import { authorLabel, taggedLabel } from '../feed/format';
import { Avatar } from '../feed/Avatar';
import { colors, font, radius, spacing } from '../ui/theme';
import type { PostAudience } from '../feed/types';

export default function Compose() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ photo?: string; event?: string; text?: string; edit?: string }>();
  const editingId = typeof params.edit === 'string' ? params.edit : null;

  const [me, setMe] = useState<{ name: string | null; avatar: string | null }>({
    name: null,
    avatar: null,
  });
  const [body, setBody] = useState(typeof params.text === 'string' ? params.text : '');
  const [posting, setPosting] = useState(false);
  const [pickedBase64, setPickedBase64] = useState<string | null>(null);
  const [pickedExt, setPickedExt] = useState('jpg');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [keepInMemories, setKeepInMemories] = useState(false);
  const [showOnCard, setShowOnCard] = useState(false);
  const [audience, setAudience] = useState<Exclude<PostAudience, 'group'>>('buddies');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(params.event === '1');
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(() => toLocalDateString(new Date()));
  const [evTime, setEvTime] = useState('18:00');
  const [evLocation, setEvLocation] = useState('');

  useEffect(() => {
    getMyProfile()
      .then((p) => setMe({ name: p?.display_name ?? null, avatar: p?.avatar_url ?? null }))
      .catch(() => {});
    if (editingId) {
      getPost(editingId)
        .then((post) => {
          if (!post) throw new Error('Post not found.');
          setBody(post.body);
          setPreviewUri(post.image_url);
          if (post.audience !== 'group') setAudience(post.audience);
        })
        .catch((e) => Alert.alert('Could not edit post', String((e as Error).message ?? e)));
      return;
    }
    if (params.photo === '1') onPickPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPickPhoto() {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to attach an image.');
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset.base64) {
      Alert.alert('Could not read image', 'Please try a different photo.');
      return;
    }
    if (Platform.OS === 'web') {
      setPickedBase64(asset.base64);
      setPickedExt(asset.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg');
      setPreviewUri(asset.uri);
      return;
    }
    setEditorUri(asset.uri); // native: filters + brand watermark
  }

  function onEdited(photo: EditedPhoto) {
    setPickedBase64(photo.base64);
    setPickedExt('jpg');
    setPreviewUri(photo.uri);
    setEditorUri(null);
  }

  function clearPhoto() {
    setPickedBase64(null);
    setPreviewUri(null);
    setKeepInMemories(false);
    setTaggedIds(new Set());
  }

  async function openTagPicker() {
    setTagPickerOpen(true);
    if (buddies.length === 0) {
      try {
        setBuddies(await listBuddies());
      } catch {
        // list stays empty — the sheet explains how to add buddies
      }
    }
  }

  function toggleTag(id: string) {
    setTaggedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const canPost = editingId
    ? body.trim().length > 0 && !posting
    : eventOpen
    ? evTitle.trim().length >= 3 && !posting
    : (body.trim().length > 0 || !!pickedBase64) && !posting;

  async function onPost() {
    if (!canPost) return;
    if (editingId) {
      setPosting(true);
      try {
        await updatePost(editingId, body.trim());
        await updatePostAudience(editingId, audience);
        showToast('Post updated');
        router.back();
      } catch (e) {
        Alert.alert('Could not update post', String((e as Error).message ?? e));
        setPosting(false);
      }
      return;
    }
    if (eventOpen) {
      setPosting(true);
      try {
        await createEvent({
          title: evTitle,
          startsAtIso: toIsoFromLocal(evDate, evTime),
          location: evLocation,
          message: body.trim(),
        });
        showToast('Event announced — its group is ready 🎉');
        router.back();
      } catch (e) {
        Alert.alert('Could not announce event', String((e as Error).message ?? e));
        setPosting(false);
      }
      return;
    }
    setPosting(true);
    const postedText = body.trim();
    const postedImageUri = previewUri;
    const keep = keepInMemories && !!previewUri;
    const tagIds = [...taggedIds];
    const tagNames = buddies.filter((b) => taggedIds.has(b.id)).map((b) => authorLabel(b.name));
    try {
      let imageUrl: string | null = null;
      if (pickedBase64) imageUrl = await uploadPostImage(pickedBase64, pickedExt);
      const postId = await createPost(postedText, imageUrl, null, null, null, showOnCard, {
        audience,
        postType: imageUrl ? 'photo' : 'post',
      });
      if (tagIds.length > 0) await addPostTags(postId, tagIds).catch(() => {});
      if (keep && postedImageUri) {
        try {
          const place = await currentPlaceLabel();
          await saveImageToMemories(postedImageUri, place, tagNames);
        } catch {
          // a Memories hiccup must never fail the post
        }
      }
      if (Platform.OS === 'web') showToast('Posted to your feed 🎉');
      else promptCrossShare(postedText, postedImageUri);
      router.back();
    } catch (e) {
      Alert.alert('Could not post', String((e as Error).message ?? e));
      setPosting(false);
    }
  }

  const tagged = buddies.filter((b) => taggedIds.has(b.id));

  return (
    <View style={styles.screen}>
      {editorUri ? (
        <PhotoEditor uri={editorUri} onDone={onEdited} onCancel={() => setEditorUri(null)} />
      ) : null}

      {/* top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>{editingId ? 'Edit post' : eventOpen ? 'Announce event' : 'New post'}</Text>
        <Pressable
          onPress={onPost}
          disabled={!canPost}
          style={({ pressed }) => [
            styles.postBtn,
            !canPost && styles.postBtnDisabled,
            pressed && canPost && styles.pressed,
          ]}
          accessibilityLabel="Post"
        >
          {posting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.postBtnText}>{editingId ? 'Save' : eventOpen ? 'Announce' : 'Post'}</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.authorRow}>
          <Avatar url={me.avatar} name={me.name} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{authorLabel(me.name)}</Text>
            <View style={styles.audiencePicker} accessibilityRole="radiogroup">
              {(['buddies', 'public'] as const).map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setAudience(value);
                    if (value === 'buddies') setShowOnCard(false);
                  }}
                  style={[styles.privacyChip, audience === value && styles.privacyChipActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: audience === value }}
                  accessibilityLabel={value === 'buddies' ? 'Buddies only' : 'Public, also appears in Discover'}
                >
                  <Ionicons
                    name={value === 'buddies' ? 'people' : 'earth'}
                    size={12}
                    color={audience === value ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.privacyText, audience === value && styles.privacyTextActive]}>
                    {value === 'buddies' ? 'Buddies' : 'Public'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Share a win or what you're up to…"
          placeholderTextColor={colors.textFaint}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
        />

        {/* per-post grant: lets non-buddies see this post on your buddy card */}
        {!editingId ? <Pressable
          style={({ pressed }) => [styles.cardOptRow, pressed && styles.pressed]}
          onPress={() => {
            setShowOnCard((v) => {
              if (!v) setAudience('public');
              return !v;
            });
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: showOnCard }}
          accessibilityLabel="Show on Buddy Card"
        >
          <Ionicons
            name={showOnCard ? 'checkbox' : 'square-outline'}
            size={19}
            color={showOnCard ? colors.primary : colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardOptText, showOnCard && { color: colors.primary }]}>
              Show on Buddy Card
            </Text>
            <Text style={styles.cardOptHint}>
              This makes the post Public and may show it to people viewing your card
            </Text>
          </View>
        </Pressable> : null}

        {previewUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
            {!editingId ? <Pressable
              style={styles.previewRemove}
              onPress={clearPhoto}
              hitSlop={8}
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={15} color="#fff" />
            </Pressable> : null}
            {!editingId ? <View style={styles.photoOpts}>
              <Pressable
                style={({ pressed }) => [styles.optRow, pressed && styles.pressed]}
                onPress={() => setKeepInMemories((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: keepInMemories }}
              >
                <Ionicons
                  name={keepInMemories ? 'checkbox' : 'square-outline'}
                  size={19}
                  color={keepInMemories ? colors.primary : colors.textMuted}
                />
                <Text style={[styles.optText, keepInMemories && { color: colors.primary }]}>
                  Add to Memories
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.optRow, pressed && styles.pressed]}
                onPress={openTagPicker}
              >
                <Ionicons
                  name={tagged.length > 0 ? 'people' : 'person-add-outline'}
                  size={18}
                  color={tagged.length > 0 ? colors.primary : colors.textMuted}
                />
                <Text
                  style={[styles.optText, tagged.length > 0 && { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {tagged.length > 0
                    ? taggedLabel(tagged.map((b) => ({ name: b.name })))
                    : 'Tag buddies'}
                </Text>
              </Pressable>
            </View> : null}
          </View>
        ) : null}

        {eventOpen ? (
          <View style={styles.eventForm}>
            <TextInput
              style={styles.eventInput}
              placeholder="Event title (e.g. Saturday 5k group run)"
              placeholderTextColor={colors.textFaint}
              value={evTitle}
              onChangeText={setEvTitle}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                style={[styles.eventInput, { flex: 1 }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                value={evDate}
                onChangeText={setEvDate}
              />
              <TextInput
                style={[styles.eventInput, { flex: 1 }]}
                placeholder="HH:MM"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                value={evTime}
                onChangeText={setEvTime}
              />
            </View>
            <TextInput
              style={styles.eventInput}
              placeholder="Location (park, gym, meet point…)"
              placeholderTextColor={colors.textFaint}
              value={evLocation}
              onChangeText={setEvLocation}
            />
            <Text style={styles.eventHint}>
              Announcing creates a group — everyone who taps Attend joins it automatically.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* bottom action bar */}
      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <Action icon="image-outline" tint={colors.primary} label="Photo" onPress={onPickPhoto} />
        <Action
          icon="videocam-outline"
          tint={colors.danger}
          label="Live"
          onPress={() => showToast('Live video arrives with the next update — stay tuned 🔴')}
        />
        <Action
          icon={eventOpen ? 'calendar' : 'calendar-outline'}
          tint={colors.success}
          label="Event"
          active={eventOpen}
          onPress={() => setEventOpen((v) => !v)}
        />
      </View>

      {/* buddy tag picker */}
      <Modal
        visible={tagPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTagPickerOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setTagPickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Tag buddies</Text>
            {buddies.length === 0 ? (
              <Text style={styles.tagEmpty}>
                No buddies yet — add some from the Buddies page first.
              </Text>
            ) : (
              buddies.map((b) => {
                const selected = taggedIds.has(b.id);
                return (
                  <Pressable
                    key={b.id}
                    style={({ pressed }) => [styles.tagRow, pressed && styles.pressed]}
                    onPress={() => toggleTag(b.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Avatar url={b.avatar} name={b.name} size={32} />
                    <Text style={styles.tagName}>{authorLabel(b.name)}</Text>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={selected ? colors.primary : colors.textFaint}
                    />
                  </Pressable>
                );
              })
            )}
            <Pressable
              style={({ pressed }) => [styles.tagDone, pressed && styles.pressed]}
              onPress={() => setTagPickerOpen(false)}
            >
              <Text style={styles.tagDoneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Action({
  icon,
  tint,
  label,
  active,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tint: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, active && styles.actionActive, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.65 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  close: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontFamily: font.bold, color: colors.text },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 20,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnDisabled: { backgroundColor: '#cbd5e1' },
  postBtnText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  body: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  author: { fontSize: 16, fontFamily: font.bold, color: colors.text },
  audiencePicker: { flexDirection: 'row', gap: 6, marginTop: 4 },
  privacyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minHeight: 44,
  },
  privacyChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  privacyText: { fontSize: 12, fontFamily: font.semibold, color: colors.textMuted },
  privacyTextActive: { color: colors.primary },
  input: {
    fontSize: 19,
    lineHeight: 26,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  previewWrap: { alignSelf: 'flex-start', gap: spacing.sm },
  preview: { width: 200, height: 200, borderRadius: radius.md, backgroundColor: colors.surface },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.text,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOpts: { gap: 4 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34 },
  optText: { fontFamily: font.semibold, fontSize: 13.5, color: colors.textMuted },
  cardOptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    minHeight: 44,
  },
  cardOptText: { fontFamily: font.semibold, fontSize: 13.5, color: colors.textMuted },
  cardOptHint: { fontFamily: font.regular, fontSize: 12, color: colors.textFaint, marginTop: 1 },
  eventForm: { gap: spacing.sm },
  eventInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  eventHint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 12,
    minHeight: 48,
  },
  actionActive: { backgroundColor: colors.successSoft, borderColor: colors.success },
  actionLabel: { fontFamily: font.bold, fontSize: 14, color: colors.text },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  tagEmpty: { fontFamily: font.regular, fontSize: 13.5, color: colors.textMuted, paddingVertical: 8, lineHeight: 19 },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  tagName: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },
  tagDone: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  tagDoneText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
});
