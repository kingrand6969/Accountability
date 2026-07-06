import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { addPostTags, listFeed, createPost, setLiked, FEED_PAGE_SIZE } from '../../feed/api';
import { createEvent, attendEvent } from '../../events/api';
import { toIsoFromLocal, toLocalDateString } from '../../timeline/datetime';
import { uploadPostImage } from '../../feed/uploadPostImage';
import { SaveToMemories } from '../../memories/SaveToMemories';
import { currentPlaceLabel, saveImageToMemories } from '../../memories/api';
import { listBuddies, type Buddy } from '../../buddy/api';
import { promptCrossShare } from '../../feed/crossShare';
import { StoryRail, type StoryRailHandle } from '../../stories/StoryRail';
import { PhotoEditor, type EditedPhoto } from '../../media/PhotoEditor';
import { showToast } from '../../ui/Toast';
import { timeAgo, authorLabel, taggedLabel } from '../../feed/format';
import { Avatar } from '../../feed/Avatar';
import type { FeedPost } from '../../feed/types';
import { colors, font, radius, spacing, shadow, contentMax } from '../../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function HeaderIcon({
  icon,
  size = 24,
  label,
  onPress,
}: {
  icon: IoniconName;
  size?: number;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minWidth: 42,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={size} color={colors.primary} />
    </Pressable>
  );
}

export default function Feed() {
  const router = useRouter();
  const navigation = useNavigation();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEndReached] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [pickedBase64, setPickedBase64] = useState<string | null>(null);
  const [pickedExt, setPickedExt] = useState('jpg');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [keepInMemories, setKeepInMemories] = useState(false);
  // tag buddies on this post
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // event announcement mini-form
  const [eventOpen, setEventOpen] = useState(false);
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(() => toLocalDateString(new Date()));
  const [evTime, setEvTime] = useState('18:00');
  const [evLocation, setEvLocation] = useState('');
  const [attending, setAttending] = useState<Set<string>>(new Set());
  // posts with a like request in flight — blocks double-taps from racing
  const likesInFlight = useRef<Set<string>>(new Set());
  const storyRailRef = useRef<StoryRailHandle>(null);
  const composerRef = useRef<TextInput>(null);

  // header: ☰ menu left; ＋ create, pages, groups right
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <View style={{ marginLeft: 8 }}>
          <HeaderIcon icon="menu-outline" size={26} label="Menu" onPress={() => router.push('/menu' as never)} />
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', marginRight: 8 }}>
          <HeaderIcon icon="search-outline" size={24} label="Search" onPress={() => router.push('/search' as never)} />
          <HeaderIcon icon="add-circle-outline" size={25} label="Create" onPress={() => setCreateOpen(true)} />
          <HeaderIcon icon="storefront-outline" size={22} label="Business pages" onPress={() => router.push('/pages' as never)} />
          <HeaderIcon icon="people-circle-outline" size={25} label="Groups" onPress={() => router.push('/groups')} />
        </View>
      ),
    });
  }, [navigation, router]);

  const CREATE_ITEMS: { icon: IoniconName; tint: string; title: string; sub: string; action: () => void }[] = [
    {
      icon: 'create-outline',
      tint: colors.primary,
      title: 'Post',
      sub: 'Share a win or an update',
      action: () => composerRef.current?.focus(),
    },
    {
      icon: 'add-circle-outline',
      tint: '#db2777',
      title: 'Story',
      sub: 'A photo that lasts 24 hours',
      action: () => storyRailRef.current?.openPicker(),
    },
    {
      icon: 'flame-outline',
      tint: '#f59e0b',
      title: 'Win card',
      sub: 'Share your streak as an image',
      action: () => router.push('/win-card'),
    },
    {
      icon: 'people-outline',
      tint: '#16a34a',
      title: 'Group',
      sub: 'Start a community',
      action: () => router.push('/group-new' as never),
    },
    {
      icon: 'storefront-outline',
      tint: '#0d9488',
      title: 'Page',
      sub: 'For your gym, coaching or brand',
      action: () => router.push('/page-new' as never),
    },
  ];

  const load = useCallback(async () => {
    try {
      const page = await listFeed();
      setPosts(page);
      setEndReached(page.length < FEED_PAGE_SIZE);
    } catch (e) {
      Alert.alert('Could not load the feed', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  async function onLoadMore() {
    if (loadingMore || endReached || loading || posts.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = posts[posts.length - 1].created_at;
      const page = await listFeed(oldest);
      if (page.length < FEED_PAGE_SIZE) setEndReached(true);
      if (page.length > 0) {
        setPosts((cur) => {
          const seen = new Set(cur.map((p) => p.id));
          return [...cur, ...page.filter((p) => !seen.has(p.id))];
        });
      }
    } catch {
      // silent — user can scroll again to retry
    } finally {
      setLoadingMore(false);
    }
  }

  async function onPickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach an image.');
      return;
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
      // no view-shot on web — use the raw photo
      setPickedBase64(asset.base64);
      setPickedExt(asset.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg');
      setPreviewUri(asset.uri);
      return;
    }
    // native: filters + brand watermark get baked in by the editor
    setEditorUri(asset.uri);
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

  const canPost = eventOpen
    ? evTitle.trim().length >= 3 && !posting
    : (body.trim().length > 0 || !!pickedBase64) && !posting;

  async function onAttend(post: FeedPost) {
    if (!post.event || attending.has(post.event.group_id)) return;
    setAttending((cur) => new Set(cur).add(post.event!.group_id));
    try {
      await attendEvent(post.event.group_id);
      showToast(`You're in! Added to the "${post.event.title}" group 🎉`);
    } catch (e) {
      setAttending((cur) => {
        const n = new Set(cur);
        n.delete(post.event!.group_id);
        return n;
      });
      Alert.alert('Could not join', String((e as Error).message ?? e));
    }
  }

  async function onPost() {
    if (eventOpen) {
      if (evTitle.trim().length < 3) return;
      setPosting(true);
      try {
        await createEvent({
          title: evTitle,
          startsAtIso: toIsoFromLocal(evDate, evTime),
          location: evLocation,
          message: body.trim(),
        });
        setBody('');
        setEvTitle('');
        setEvLocation('');
        setEventOpen(false);
        await load();
        showToast('Event announced — its group is ready 🎉');
      } catch (e) {
        Alert.alert('Could not announce event', String((e as Error).message ?? e));
      } finally {
        setPosting(false);
      }
      return;
    }
    if (!body.trim() && !pickedBase64) return;
    setPosting(true);
    const postedText = body.trim();
    const postedImageUri = previewUri; // local file — shareable to FB/IG
    const keep = keepInMemories && !!previewUri;
    const tagIds = [...taggedIds];
    const tagNames = buddies
      .filter((b) => taggedIds.has(b.id))
      .map((b) => authorLabel(b.name));
    try {
      let imageUrl: string | null = null;
      if (pickedBase64) imageUrl = await uploadPostImage(pickedBase64, pickedExt);
      const postId = await createPost(postedText, imageUrl);
      if (tagIds.length > 0) {
        // best-effort: a tagging hiccup must never fail the post itself
        await addPostTags(postId, tagIds).catch(() => {});
      }
      if (keep && postedImageUri) {
        // best-effort: a Memories hiccup must never fail the post itself
        try {
          const place = await currentPlaceLabel();
          await saveImageToMemories(postedImageUri, place, tagNames);
          showToast('Posted — and kept in Memories ✨');
        } catch {
          showToast('Posted! (could not save to Memories)');
        }
      }
      setBody('');
      clearPhoto();
      await load();
      // Growth loop: offer to cross-share to Facebook/Instagram (native only).
      if (Platform.OS === 'web') {
        showToast('Posted to your feed 🎉');
      } else {
        promptCrossShare(postedText, postedImageUri);
      }
    } catch (e) {
      Alert.alert('Could not post', String((e as Error).message ?? e));
    } finally {
      setPosting(false);
    }
  }

  async function onToggleLike(post: FeedPost) {
    if (likesInFlight.current.has(post.id)) return; // one request per post at a time
    likesInFlight.current.add(post.id);
    const liked = !post.liked_by_me;
    setPosts((cur) =>
      cur.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: liked, like_count: Math.max(0, p.like_count + (liked ? 1 : -1)) }
          : p,
      ),
    );
    try {
      await setLiked(post.id, liked);
    } catch (e) {
      setPosts((cur) =>
        cur.map((p) =>
          p.id === post.id
            ? { ...p, liked_by_me: !liked, like_count: Math.max(0, p.like_count + (liked ? -1 : 1)) }
            : p,
        ),
      );
      Alert.alert('Could not update like', String((e as Error).message ?? e));
    } finally {
      likesInFlight.current.delete(post.id);
    }
  }

  return (
    <View style={styles.screen}>
      {editorUri ? (
        <PhotoEditor uri={editorUri} onDone={onEdited} onCancel={() => setEditorUri(null)} />
      ) : null}

      {/* ＋ create sheet */}
      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <BlurView
              intensity={60}
              tint="light"
              style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
            />
            <View style={styles.sheetGlass} />
            <Text style={styles.sheetTitle}>Create</Text>
            {CREATE_ITEMS.map((item) => (
              <Pressable
                key={item.title}
                style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
                onPress={() => {
                  setCreateOpen(false);
                  setTimeout(item.action, 250); // let the sheet close first
                }}
              >
                <View style={[styles.sheetIcon, { backgroundColor: `${item.tint}15` }]}>
                  <Ionicons name={item.icon} size={20} color={item.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetRowTitle}>{item.title}</Text>
                  <Text style={styles.sheetRowSub}>{item.sub}</Text>
                </View>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.storyStrip}>
        <StoryRail ref={storyRailRef} />
      </View>
      <View style={styles.composer}>
        <TextInput
          ref={composerRef}
          style={styles.composerInput}
          placeholder="Share a win or what you're up to…"
          placeholderTextColor={colors.textFaint}
          value={body}
          onChangeText={setBody}
          multiline
        />
        {previewUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
            <Pressable
              style={styles.previewRemove}
              onPress={clearPhoto}
              hitSlop={8}
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={14} color="#fff" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.memoriesCheck, pressed && styles.pressed]}
              onPress={() => setKeepInMemories((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: keepInMemories }}
              accessibilityLabel="Add to Memories"
            >
              <Ionicons
                name={keepInMemories ? 'checkbox' : 'square-outline'}
                size={19}
                color={keepInMemories ? colors.primary : colors.textMuted}
              />
              <Text
                style={[styles.memoriesCheckText, keepInMemories && { color: colors.primary }]}
              >
                Add to Memories
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.memoriesCheck, pressed && styles.pressed]}
              onPress={openTagPicker}
              accessibilityLabel="Tag buddies on this photo"
            >
              <Ionicons
                name={taggedIds.size > 0 ? 'people' : 'person-add-outline'}
                size={18}
                color={taggedIds.size > 0 ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.memoriesCheckText,
                  taggedIds.size > 0 && { color: colors.primary },
                ]}
                numberOfLines={1}
              >
                {taggedIds.size > 0
                  ? taggedLabel(buddies.filter((b) => taggedIds.has(b.id)).map((b) => ({ name: b.name })))
                  : 'Tag buddies'}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* buddy tag picker */}
        <Modal
          visible={tagPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setTagPickerOpen(false)}
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setTagPickerOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <BlurView
                intensity={60}
                tint="light"
                style={[StyleSheet.absoluteFill, { borderRadius: radius.lg }]}
              />
              <View style={styles.sheetGlass} />
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
                      accessibilityLabel={`Tag ${authorLabel(b.name)}`}
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
                accessibilityLabel="Done tagging"
              >
                <Text style={styles.tagDoneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
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
        <View style={styles.composerActions}>
          <Pressable
            style={({ pressed }) => [
              styles.postBtn,
              !canPost && styles.postBtnDisabled,
              pressed && canPost && styles.pressed,
            ]}
            onPress={onPost}
            disabled={!canPost}
          >
            {posting ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <Text style={styles.postBtnText}>Post</Text>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.photoBtn, styles.firstAction, pressed && styles.pressed]}
            onPress={onPickPhoto}
            accessibilityLabel="Attach a photo"
          >
            <Ionicons name="camera-outline" size={18} color={colors.primary} />
            <Text style={styles.photoBtnText}>Photo</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
            onPress={() =>
              showToast('Live video arrives with the next update — stay tuned 🔴')
            }
            accessibilityLabel="Go live (coming soon)"
          >
            <Ionicons name="videocam-outline" size={18} color={colors.danger} />
            <Text style={[styles.photoBtnText, { color: colors.danger }]}>Live</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.photoBtn, pressed && styles.pressed]}
            onPress={() => setEventOpen((v) => !v)}
            accessibilityLabel="Announce an event"
          >
            <Ionicons
              name={eventOpen ? 'calendar' : 'calendar-outline'}
              size={18}
              color={colors.success}
            />
            <Text style={[styles.photoBtnText, { color: colors.success }]}>Event</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={posts.length === 0 ? styles.emptyWrap : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={40} color={colors.textFaint} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>Be the first to share something.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Avatar url={item.author_avatar} name={item.author_name} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>{authorLabel(item.author_name)}</Text>
                  <Text style={styles.time}>
                    {timeAgo(item.created_at)}
                    {item.tagged.length > 0 ? ` · ${taggedLabel(item.tagged)}` : ''}
                  </Text>
                </View>
              </View>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
              {item.event ? (
                <View style={styles.eventBox}>
                  <View style={styles.eventIconWrap}>
                    <Ionicons name="calendar" size={20} color={colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {item.event.title}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {new Date(item.event.starts_at).toLocaleString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {item.event.location ? ` · ${item.event.location}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.attendBtn,
                      attending.has(item.event!.group_id) && styles.attendDone,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => onAttend(item)}
                    accessibilityLabel={`Attend ${item.event.title}`}
                  >
                    <Text style={styles.attendText}>
                      {attending.has(item.event.group_id) ? 'Going ✓' : 'Attend'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {item.image_url ? (
                <View>
                  <Image source={{ uri: item.image_url }} style={styles.postImage} resizeMode="cover" />
                  <SaveToMemories url={item.image_url} />
                </View>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  onPress={() => onToggleLike(item)}
                  hitSlop={8}
                  accessibilityLabel={item.liked_by_me ? 'Unlike' : 'Like'}
                >
                  <Ionicons
                    name={item.liked_by_me ? 'heart' : 'heart-outline'}
                    size={19}
                    color={item.liked_by_me ? colors.danger : colors.textMuted}
                  />
                  <Text style={[styles.actionText, item.liked_by_me && styles.liked]}>
                    {item.like_count}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
                  hitSlop={8}
                  accessibilityLabel="View comments"
                >
                  <Ionicons name="chatbubble-outline" size={18} color={colors.textMuted} />
                  <Text style={styles.actionText}>{item.comment_count}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-start',
    paddingTop: 64,
    alignItems: 'flex-end',
    paddingRight: spacing.md,
  },
  sheet: {
    width: 280,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    padding: spacing.sm,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  // translucent tint over the blur so dark text keeps 4.5:1 contrast
  sheetGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: 4,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    minHeight: 56,
  },
  sheetIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  sheetRowSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  storyStrip: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  composer: {
    ...contentMax,
    padding: spacing.lg,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  composerInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 48,
    backgroundColor: colors.surfaceAlt,
  },
  previewWrap: { alignSelf: 'flex-start' },
  memoriesCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    minHeight: 32,
  },
  memoriesCheckText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  tagEmpty: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    padding: spacing.md,
    lineHeight: 19,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  tagName: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },
  tagDone: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    margin: spacing.sm,
  },
  tagDoneText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  preview: { width: 110, height: 110, borderRadius: radius.sm, backgroundColor: colors.surface },
  previewRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.text,
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  eventForm: { gap: spacing.sm },
  eventInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 14.5,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  eventHint: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  eventBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  eventIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.text },
  eventMeta: { fontFamily: font.medium, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  attendBtn: {
    backgroundColor: colors.success,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
    minHeight: 38,
    justifyContent: 'center',
  },
  attendDone: { backgroundColor: colors.textMuted },
  attendText: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    minHeight: 44,
  },
  photoBtnText: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
  // pushes Photo/Live/Event toward the right, away from the left-anchored Post
  firstAction: { marginLeft: 'auto' },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: 24,
    minHeight: 44,
    justifyContent: 'center',
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { color: colors.onPrimary, fontFamily: font.bold, fontSize: 15 },
  pressed: { opacity: 0.7 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: 6 },
  emptyWrap: { flexGrow: 1 },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 110, ...contentMax },
  footerSpinner: { paddingVertical: spacing.lg },
  emptyTitle: { fontSize: 17, fontFamily: font.bold, color: colors.text, marginTop: 4 },
  emptySub: { color: colors.textMuted, fontFamily: font.regular, textAlign: 'center' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  author: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  time: { color: colors.textFaint, fontSize: 12, fontFamily: font.medium },
  body: { fontSize: 15, lineHeight: 22, fontFamily: font.regular, color: colors.text },
  postImage: { width: '100%', height: 220, borderRadius: radius.sm, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', gap: spacing.xl, marginTop: 2 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: spacing.xs,
    minHeight: 32,
  },
  actionText: { fontSize: 14, color: colors.textMuted, fontFamily: font.semibold },
  liked: { color: colors.danger },
});
