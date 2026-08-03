import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addPostTags, createPost, getPost, updatePost, updatePostAudience } from '../feed/api';
import { createEvent } from '../events/api';
import { toIsoFromLocal, toLocalDateString } from '../timeline/datetime';
import { uploadPostImage } from '../feed/uploadPostImage';
import { uploadPostVideo } from '../feed/uploadPostVideo';
import { PostVideo } from '../feed/PostVideo';
import { validatePostVideo, videoExtensionForMime } from '../feed/videoPolicy';
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
import { supabase } from '../lib/supabase';
import { CreateHub } from '../entry/CreateHub';
import {
  createPickerReadinessGate,
  decideCreateContinuation,
  resolveComposeMode,
  type CreateMedia,
} from '../entry/createFlow';
import { createPickerRecoveryController, normalizePickedAsset } from '../entry/pickerRecovery';
import {
  clearComposeDraft,
  commitDraftMedia,
  completeRemoteSubmission,
  createExpoDraftFileAdapter,
  isCompatibleDraft,
  loadComposeDrafts,
  persistDraftMedia,
  removeDraftMedia,
  removeDurableMedia,
  resolveDraftContext,
  runForCurrentOwner,
  restoreForCurrentOwner,
  saveComposeDraft,
  selectDraftCleanupTarget,
  type ComposeDraftV1,
  type DurableDraftMedia,
} from '../entry/composeDraft';

export default function Compose() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ photo?: string; event?: string; text?: string; edit?: string }>();
  const composeMode = resolveComposeMode(params);
  const draftContext = resolveDraftContext(params);
  const editingId = typeof params.edit === 'string' ? params.edit : null;
  const [showCreateHub, setShowCreateHub] = useState(composeMode === 'hub');

  const [me, setMe] = useState<{ name: string | null; avatar: string | null }>({
    name: null,
    avatar: null,
  });
  const [body, setBody] = useState(typeof params.text === 'string' ? params.text : '');
  const [posting, setPosting] = useState(false);
  const [pickedBase64, setPickedBase64] = useState<string | null>(null);
  const [pickedExt, setPickedExt] = useState('jpg');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [pickedVideo, setPickedVideo] = useState<{ uri: string; mimeType: string } | null>(null);
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
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => randomUUID());
  const [draftMedia, setDraftMedia] = useState<DurableDraftMedia | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const draftRef = useRef<ComposeDraftV1 | null>(null);
  const ownerRef = useRef<string | null>(null);
  ownerRef.current = ownerId;
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const draftReadyRef = useRef(draftReady);
  draftReadyRef.current = draftReady;
  const editingIdRef = useRef(editingId);
  editingIdRef.current = editingId;
  const mountTokenRef = useRef(0);
  const restoreChosenRef = useRef(false);
  const editHydrationRef = useRef<Promise<void>>(Promise.resolve());
  const suppressNextDebounce = useRef(true);
  const flushDraftRef = useRef<() => Promise<void>>(async () => {});
  const mountedRef = useRef(true);
  const focusedRef = useRef(false);
  const attachRecoveredPhotoRef = useRef<
    (asset: ImagePicker.ImagePickerAsset, isCurrent: () => boolean) => Promise<void>
  >(async () => {});
  const attachRecoveredVideoRef = useRef<
    (asset: ImagePicker.ImagePickerAsset, isCurrent: () => boolean) => Promise<void>
  >(async () => {});
  const recoveryControllerRef = useRef<ReturnType<typeof createPickerRecoveryController> | null>(null);
  const pickerReadinessGate = useRef(
    createPickerReadinessGate(params.photo === '1' ? 'photo' : null),
  ).current;
  if (!recoveryControllerRef.current) {
    recoveryControllerRef.current = createPickerRecoveryController({
      getPendingResult: () => ImagePicker.getPendingResultAsync(),
      getContext: () => ({
        ownerId: ownerRef.current,
        draftId: draftIdRef.current,
        mountToken: mountTokenRef.current,
        active:
          mountedRef.current
          && focusedRef.current
          && draftReadyRef.current
          && !editingIdRef.current,
      }),
      attachPhoto: (asset, isCurrent) => attachRecoveredPhotoRef.current(asset, isCurrent),
      attachVideo: (asset, isCurrent) => attachRecoveredVideoRef.current(asset, isCurrent),
      onInvalid: (message) => Alert.alert('Media not recovered', message),
    });
  }
  const fileAdapter = useRef(createExpoDraftFileAdapter()).current;

  useEffect(() => {
    const hydrationToken = mountTokenRef.current;
    let mounted = true;
    getMyProfile()
      .then((p) => {
        if (!mounted || mountTokenRef.current !== hydrationToken) return;
        setMe({ name: p?.display_name ?? null, avatar: p?.avatar_url ?? null });
        setDraftReady(false);
        suppressNextDebounce.current = true;
        setOwnerId(p?.id ?? null);
      })
      .catch(() => {});
    if (editingId) {
      editHydrationRef.current = getPost(editingId)
        .then((post) => {
          if (!post) throw new Error('Post not found.');
          if (!mounted || mountTokenRef.current !== hydrationToken || restoreChosenRef.current) return;
          setBody(post.body);
          setPreviewUri(post.image_url);
          if (post.audience !== 'group') setAudience(post.audience);
        })
        .catch((e) => {
          if (mounted && mountTokenRef.current === hydrationToken) {
            Alert.alert('Could not edit post', String((e as Error).message ?? e));
          }
        })
        .then(() => undefined);
      return () => { mounted = false; };
    }
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextOwner = session?.user.id ?? null;
      if (nextOwner === ownerId) return;
      // Detach live state and the old draft reference; never delete another account's files.
      draftRef.current = null;
      mountTokenRef.current += 1;
      suppressNextDebounce.current = true;
      setDraftReady(false);
      setDraftId(randomUUID());
      setDraftMedia(null);
      setPickedBase64(null);
      setPickedVideo(null);
      setPreviewUri(null);
      setBody(typeof params.text === 'string' ? params.text : '');
      setAudience('buddies');
      setTaggedIds(new Set());
      setKeepInMemories(false);
      setOwnerId(nextOwner);
      if (ownerId) {
        pickerReadinessGate.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [ownerId, params.text, pickerReadinessGate]);

  useEffect(() => {
    if (!ownerId) return;
    let attached = true;
    loadComposeDrafts(ownerId, AsyncStorage, fileAdapter)
      .then(async (loaded) => {
        await editHydrationRef.current;
        if (!attached) return;
        if (loaded.cleanedInvalid) setDraftNotice('A corrupt or unsupported saved draft was removed');
        const compatible = loaded.drafts.find((draft) => isCompatibleDraft(draft, { ...draftContext, ownerId }));
        if (!compatible) {
          setDraftReady(true);
          if (loaded.drafts.length) setDraftNotice('Other saved draft available');
          return;
        }
        const promptOwner = ownerId;
        Alert.alert('Restore saved draft?', 'Continue where you left off, or discard this saved draft.', [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              void runForCurrentOwner(promptOwner, () => ownerRef.current, async () => {
                await clearComposeDraft(compatible, AsyncStorage);
                await removeDurableMedia(compatible.media, fileAdapter);
              })
                .then((applied) => { if (applied) setDraftReady(true); })
                .catch(() => setDraftNotice('Draft could not be discarded'));
            },
          },
          {
            text: 'Restore',
            onPress: () => {
              void restoreForCurrentOwner(
                promptOwner,
                () => ownerRef.current,
                async () => ({
                  draft: compatible,
                  base64: compatible.media?.kind === 'photo'
                    ? await new File(compatible.media.uri).base64()
                    : null,
                }),
                ({ draft, base64 }) => {
                  restoreChosenRef.current = true;
                  setDraftId(draft.draftId);
                  setBody(draft.body);
                  setAudience(draft.audience);
                  setDraftMedia(draft.media);
                  setPreviewUri(draft.media?.uri ?? null);
                  setPickedVideo(draft.media?.kind === 'video'
                    ? { uri: draft.media.uri, mimeType: draft.media.mimeType }
                    : null);
                  setPickedBase64(base64);
                  setEventOpen(draft.event.open);
                  setEvTitle(draft.event.title);
                  setEvDate(draft.event.date);
                  setEvTime(draft.event.time);
                  setEvLocation(draft.event.location);
                  setTaggedIds(new Set(draft.tagIds));
                  setKeepInMemories(draft.keepInMemories);
                  setShowCreateHub(false);
                  setDraftReady(true);
                },
                () => setDraftNotice('Saved media could not be read. Remove it and try again.'),
              );
            },
          },
        ]);
      })
      .catch(() => {
        if (attached) {
          setDraftNotice('Saved draft could not be read');
          setDraftReady(true);
        }
      });
    return () => { attached = false; };
    // Context is fixed for this mounted cold link. Owner changes detach the previous account.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId || !draftReady) return;
    const intent = pickerReadinessGate.resolve(Boolean(ownerId && draftReady));
    if (intent) void launchMediaPicker(intent);
    // Picker launch is intentionally deferred until owner/draft restore resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, draftReady, pickerReadinessGate]);

  function currentDraft(): ComposeDraftV1 | null {
    if (!ownerId || !draftReady) return null;
    return {
      version: 1,
      draftId,
      ownerId,
      ...draftContext,
      body,
      audience,
      media: draftMedia,
      event: { open: eventOpen, title: evTitle, date: evDate, time: evTime, location: evLocation },
      tagIds: [...taggedIds],
      keepInMemories,
      updatedAt: new Date().toISOString(),
    };
  }

  async function flushDraftSnapshot() {
    const draft = currentDraft();
    if (!draft) return;
    draftRef.current = draft;
    try {
      await saveComposeDraft(draft, AsyncStorage);
      setDraftNotice(null);
    } catch {
      setDraftNotice('Draft could not be saved');
    }
  }
  flushDraftRef.current = flushDraftSnapshot;

  function flushDraft() {
    return flushDraftRef.current();
  }

  useEffect(() => {
    if (!draftReady) return;
    if (suppressNextDebounce.current) {
      suppressNextDebounce.current = false;
      return;
    }
    const timer = setTimeout(() => { void flushDraft(); }, 500);
    return () => clearTimeout(timer);
    // Every persisted field intentionally triggers the debounce.
  }, [draftReady, body, audience, draftMedia, eventOpen, evTitle, evDate, evTime, evLocation, taggedIds, keepInMemories]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void flushDraft();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      void flushDraft().finally(() => routerRef.current.back());
      return true;
    });
    return () => {
      appState.remove();
      back.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recoveryControllerRef.current?.recover();
    });
    return () => appState.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      if (
        Platform.OS !== 'web'
        && !editingIdRef.current
        && ownerId
        && draftReady
        && draftId.length > 0
      ) {
        void recoveryControllerRef.current?.recover();
      }
      return () => { focusedRef.current = false; };
    }, [ownerId, draftId, draftReady]),
  );

  useEffect(() => {
    recoveryControllerRef.current?.resetContext(ownerId, draftId);
  }, [ownerId, draftId]);

  useEffect(() => () => {
    mountTokenRef.current += 1;
    mountedRef.current = false;
    focusedRef.current = false;
    draftRef.current = null;
    recoveryControllerRef.current?.dispose();
  }, []);

  async function clearSavedDraft(deleteMedia = true, submittedDraft?: ComposeDraftV1 | null) {
    const draft = selectDraftCleanupTarget(submittedDraft, currentDraft(), draftRef.current);
    if (!draft) return;
    await clearComposeDraft(draft, AsyncStorage);
    if (deleteMedia) await removeDurableMedia(draft.media, fileAdapter);
    if (ownerRef.current === draft.ownerId && draftRef.current?.draftId === draft.draftId) {
      draftRef.current = null;
    }
  }

  function finishAfterRemoteSuccess(
    successMessage: string,
    cleanupError: string | null,
    submittedDraft: ComposeDraftV1 | null,
    expectedOwner: string | null,
    expectedToken: number,
  ) {
    if (ownerRef.current !== expectedOwner || mountTokenRef.current !== expectedToken) return;
    if (!cleanupError) {
      showToast(successMessage);
      router.back();
      return;
    }
    setDraftNotice('Remote save succeeded, but the local draft could not be cleared');
    Alert.alert('Saved successfully', 'Your post is live. Only local draft cleanup failed; do not submit again.', [
      { text: 'Close', onPress: () => router.back() },
      {
        text: 'Retry cleanup',
        onPress: () => {
          void clearSavedDraft(true, submittedDraft)
            .then(() => {
              if (ownerRef.current === expectedOwner && mountTokenRef.current === expectedToken) {
                showToast(successMessage);
                router.back();
              }
            })
            .catch(() => {
              if (ownerRef.current === expectedOwner && mountTokenRef.current === expectedToken) {
                setDraftNotice('Local draft cleanup still needs retry');
              }
            });
        },
      },
    ]);
  }

  async function makeMediaDurable(uri: string, extension: string, mimeType: string, kind: 'photo' | 'video') {
    if (!ownerId) throw new Error('Sign in again before attaching media.');
    const expectedOwner = ownerId;
    const expectedToken = mountTokenRef.current;
    const stillAttached = () => ownerRef.current === expectedOwner && mountTokenRef.current === expectedToken;
    const expectedBytes = new File(uri).size;
    const base = currentDraft();
    if (!base) throw new Error('Draft is not ready');
    const result = await persistDraftMedia(base, {
      ownerId, draftId, sourceUri: uri, extension, expectedBytes,
      maxBytes: kind === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024,
      mimeType,
      kind,
    }, AsyncStorage, fileAdapter);
    if (!stillAttached()) {
      const detachedMedia: DurableDraftMedia = { ...result, extension: extension.toLowerCase(), mimeType, kind };
      await removeDurableMedia(detachedMedia, fileAdapter);
      throw new Error('Compose account detached');
    }
    const media: DurableDraftMedia = { ...result, extension: extension.toLowerCase(), mimeType, kind };
    const committed = await commitDraftMedia(base, media, AsyncStorage, fileAdapter, stillAttached);
    if (!stillAttached()) throw new Error('Compose account detached');
    draftRef.current = committed;
    setDraftMedia(committed.media);
    setPreviewUri(committed.media?.uri ?? null);
    return media;
  }

  function onClose() {
    Alert.alert('Cancel this draft?', 'You can keep it for next time or discard it now.', [
      { text: 'Keep draft', onPress: () => { void flushDraft().finally(() => router.back()); } },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => { void clearSavedDraft().finally(() => router.back()); },
      },
    ]);
  }

  function showMediaPermissionExplanation(kind: 'photo' | 'video') {
    Alert.alert(
      'Permission needed',
      `Allow ${kind} access in Settings to attach a ${kind}.`,
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
      ],
    );
  }

  async function attachRecoveredPhoto(
    asset: ImagePicker.ImagePickerAsset,
    isCurrent: () => boolean,
  ) {
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const durable = await makeMediaDurable(asset.uri, extension, mimeType, 'photo');
    if (!isCurrent()) return;
    setPickedVideo(null);
    setPickedBase64(null);
    setPickedExt(extension);
    setPreviewUri(durable.uri);
    setEditorUri(durable.uri);
  }

  async function attachVideoAsset(
    asset: ImagePicker.ImagePickerAsset,
    expectedOwner: string | null,
    expectedToken: number,
  ) {
    const inferredMime =
      asset.mimeType ??
      (asset.uri.toLowerCase().includes('.mov')
        ? 'video/quicktime'
        : asset.uri.toLowerCase().includes('.webm')
          ? 'video/webm'
          : 'video/mp4');
    const validation = validatePostVideo({
      mimeType: inferredMime,
      durationMs: asset.duration,
      fileSize: asset.fileSize,
    });
    if (!validation.ok) throw new Error(validation.message);
    const extension = videoExtensionForMime(inferredMime);
    if (!extension) throw new Error('This video format is not supported');
    const durable = await makeMediaDurable(asset.uri, extension, inferredMime, 'video');
    if (ownerRef.current !== expectedOwner || mountTokenRef.current !== expectedToken) return;
    setPickedBase64(null);
    setEditorUri(null);
    setKeepInMemories(false);
    setPickedVideo({ uri: durable.uri, mimeType: inferredMime });
  }

  async function attachRecoveredVideo(
    asset: ImagePicker.ImagePickerAsset,
    isCurrent: () => boolean,
  ) {
    const expectedOwner = ownerRef.current;
    const expectedToken = mountTokenRef.current;
    await attachVideoAsset(asset, expectedOwner, expectedToken);
    if (!isCurrent()) return;
  }

  attachRecoveredPhotoRef.current = attachRecoveredPhoto;
  attachRecoveredVideoRef.current = attachRecoveredVideo;

  async function onPickPhoto() {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showMediaPermissionExplanation('photo');
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    });
    const normalized = normalizePickedAsset(res, 'image');
    if (normalized.status === 'canceled') return;
    if (normalized.status === 'invalid') {
      Alert.alert('Photo not added', normalized.message);
      return;
    }
    const asset = normalized.asset;
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

  async function onPickVideo() {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showMediaPermissionExplanation('video');
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    const normalized = normalizePickedAsset(res, 'video');
    if (normalized.status === 'canceled') return;
    if (normalized.status === 'invalid') {
      Alert.alert('Video not added', normalized.message);
      return;
    }
    const operationOwner = ownerRef.current;
    const operationToken = mountTokenRef.current;
    try {
      await attachVideoAsset(normalized.asset, operationOwner, operationToken);
    } catch (error) {
      if (ownerRef.current === operationOwner && mountTokenRef.current === operationToken) {
        Alert.alert('Video not added', `${String((error as Error).message ?? error)}. Retry or remove the media.`);
      }
    }
  }

  async function launchMediaPicker(media: CreateMedia) {
    if (media === 'photo') await onPickPhoto();
    else await onPickVideo();
  }

  function requestMediaPicker(media: CreateMedia) {
    const ready = Boolean(ownerRef.current && draftReadyRef.current);
    const launch = pickerReadinessGate.request(media, ready);
    if (launch) void launchMediaPicker(launch);
  }

  function onEdited(photo: EditedPhoto) {
    const operationOwner = ownerRef.current;
    const operationToken = mountTokenRef.current;
    void makeMediaDurable(photo.uri, 'jpg', 'image/jpeg', 'photo')
      .then(async (durable) => {
        if (ownerRef.current !== operationOwner || mountTokenRef.current !== operationToken) return;
        setPickedVideo(null);
        setPickedBase64(photo.base64);
        setPickedExt('jpg');
        setPreviewUri(durable.uri);
        setEditorUri(null);
      })
      .catch((error) => {
        if (ownerRef.current === operationOwner && mountTokenRef.current === operationToken) {
          Alert.alert('Photo not added', `${String((error as Error).message ?? error)}. Retry or remove the media.`);
        }
      });
  }

  function clearPhoto() {
    const base = currentDraft();
    if (!base || !base.media) return;
    void removeDraftMedia(base, AsyncStorage, fileAdapter)
      .then((next) => {
        draftRef.current = next;
        setPickedBase64(null);
        setPickedVideo(null);
        setPreviewUri(null);
        setDraftMedia(null);
        setKeepInMemories(false);
        setTaggedIds(new Set());
      })
      .catch(() => setDraftNotice('Media could not be removed from the saved draft'));
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
    : (body.trim().length > 0 || !!pickedBase64 || !!pickedVideo) && !posting;

  async function onPost() {
    if (!canPost) return;
    const submittedDraft = currentDraft();
    const submittedOwner = ownerRef.current;
    const submittedToken = mountTokenRef.current;
    if (editingId) {
      setPosting(true);
      try {
        const result = await completeRemoteSubmission(async () => {
          await updatePost(editingId, body.trim());
          await updatePostAudience(editingId, audience);
        }, () => clearSavedDraft(true, submittedDraft));
        finishAfterRemoteSuccess('Post updated', result.cleanupError, submittedDraft, submittedOwner, submittedToken);
      } catch (e) {
        if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
          Alert.alert('Could not update post', String((e as Error).message ?? e));
          setPosting(false);
        }
      }
      return;
    }
    if (eventOpen) {
      setPosting(true);
      try {
        const result = await completeRemoteSubmission(() => createEvent({
          title: evTitle,
          startsAtIso: toIsoFromLocal(evDate, evTime),
          location: evLocation,
          message: body.trim(),
        }), () => clearSavedDraft(true, submittedDraft));
        if (result.cleanupError) {
          finishAfterRemoteSuccess('Event announced', result.cleanupError, submittedDraft, submittedOwner, submittedToken);
          return;
        }
        if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
          showToast('Event announced — its group is ready 🎉');
          router.back();
        }
      } catch (e) {
        if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
          Alert.alert('Could not announce event', String((e as Error).message ?? e));
          setPosting(false);
        }
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
      if (pickedVideo) imageUrl = await uploadPostVideo(pickedVideo.uri, pickedVideo.mimeType);
      const postId = await createPost(postedText, imageUrl, null, null, null, showOnCard, {
        audience,
        postType: pickedVideo ? 'video' : imageUrl ? 'photo' : 'post',
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
      try {
        await clearSavedDraft(true, submittedDraft);
      } catch (cleanupError) {
        finishAfterRemoteSuccess('Posted to your feed', String((cleanupError as Error).message ?? cleanupError), submittedDraft, submittedOwner, submittedToken);
        return;
      }
      if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
        if (Platform.OS === 'web') showToast('Posted to your feed 🎉');
        else promptCrossShare(postedText, postedImageUri, pickedVideo?.mimeType);
        router.back();
      }
    } catch (e) {
      if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
        Alert.alert('Could not post', String((e as Error).message ?? e));
        setPosting(false);
      }
    }
  }

  const tagged = buddies.filter((b) => taggedIds.has(b.id));

  if (showCreateHub) {
    return (
      <CreateHub
        onClose={onClose}
        onContinue={(choice, media, selectedAudience) => {
          const decision = decideCreateContinuation({
            choiceId: choice.id,
            media,
            audience: selectedAudience,
          });
          if (decision.kind === 'route') {
            router.replace(decision.route as never);
            return;
          }
          setAudience(decision.audience);
          setShowCreateHub(false);
          if (decision.kind === 'picker') {
            requestMediaPicker(decision.media);
          }
        }}
      />
    );
  }

  return (
    <View style={styles.screen}>
      {editorUri ? (
        <PhotoEditor uri={editorUri} onDone={onEdited} onCancel={() => setEditorUri(null)} />
      ) : null}

      {/* top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={onClose}
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
        {draftNotice ? <Text style={styles.draftNotice} accessibilityLiveRegion="polite">{draftNotice}</Text> : null}
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
            {pickedVideo ? (
              <View style={styles.videoPreview}>
                <PostVideo url={pickedVideo.uri} />
              </View>
            ) : (
              <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
            )}
            {!editingId ? <Pressable
              style={styles.previewRemove}
              onPress={clearPhoto}
              hitSlop={8}
              accessibilityLabel={pickedVideo ? 'Remove video' : 'Remove photo'}
            >
              <Ionicons name="close" size={15} color="#fff" />
            </Pressable> : null}
            {!editingId && !pickedVideo ? <View style={styles.photoOpts}>
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
        <Action
          icon="image-outline"
          tint={colors.primary}
          label="Photo"
          onPress={() => requestMediaPicker('photo')}
        />
        <Action
          icon="videocam-outline"
          tint={colors.danger}
          label="Video"
          onPress={() => requestMediaPicker('video')}
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
  draftNotice: { color: colors.danger, fontFamily: font.semibold, fontSize: 13 },
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
  videoPreview: { width: 200 },
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
