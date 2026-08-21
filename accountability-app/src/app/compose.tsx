import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addPostTags, createPost, getPost, updatePost, updatePostVisibility } from '../feed/api';
import { markFeedPostPublished } from '../feed/feedPublishSignal';
import { createEvent } from '../events/api';
import { toIsoFromLocal, toLocalDateString } from '../timeline/datetime';
import { uploadPostImageWithDigest } from '../feed/uploadPostImage';
import { uploadPostVideoWithDigest } from '../feed/uploadPostVideo';
import { PostVideo } from '../feed/PostVideo';
import { validatePostVideo, videoExtensionForMime } from '../feed/videoPolicy';
import { currentPlaceLabel, saveImageToMemories } from '../memories/api';
import { listBuddies, type Buddy } from '../buddy/api';
import { promptCrossShare } from '../feed/crossShare';
import { PhotoEditor, type EditedPhoto } from '../media/PhotoEditor';
import { getMyProfile } from '../profiles/api';
import { showToast } from '../ui/Toast';
import { authorLabel, selfAuthorLabel, taggedLabel } from '../feed/format';
import { Avatar } from '../feed/Avatar';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { supabase } from '../lib/supabase';
import { CreateHub } from '../entry/CreateHub';
import {
  composerMediaChoices,
  composerCreateActions,
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
  hasRestorableDraftContent,
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
  type ComposeDraftV2,
  type DurableDraftMedia,
} from '../entry/composeDraft';
import { navigateBackSafely } from '../navigation/routeAccessContract';
import { userFacingErrorMessage } from '../ui/userFacingError';
import {
  DEFAULT_SHOW_PUBLICLY,
  normalizeStoredPostVisibility,
  postVisibility,
  postVisibilityCopy,
} from '../progress/visibility';
import { PhotoPermissionDeniedError } from '../progress/photoCapture';
import { PostVisibilitySwitch } from '../share/PostVisibilitySwitch';
import { captureComposerSelfie } from '../entry/composerSelfie';
import { ComposerMediaActions, type ComposerMediaActionItem } from '../entry/ComposerMediaActions';
import {
  composerMediaLeaseIsCurrent,
  createComposerMediaLease,
  type ComposerMediaLease,
} from '../entry/composerMediaLease';

type CleanupRecovery = {
  successMessage: string;
  submittedDraft: ComposeDraftV2 | null;
  expectedOwner: string | null;
  expectedToken: number;
};

export default function Compose() {
  const router = useRouter();
  const windowMetrics = useWindowDimensions();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const postingRef = useRef(posting);
  postingRef.current = posting;
  const [remoteSucceeded, setRemoteSucceeded] = useState(false);
  const remoteSucceededRef = useRef(false);
  const [cleanupRecovery, setCleanupRecovery] = useState<CleanupRecovery | null>(null);
  const [cleanupRetrying, setCleanupRetrying] = useState(false);
  const cleanupRetryingRef = useRef(false);
  const [pickedBase64, setPickedBase64] = useState<string | null>(null);
  const [pickedExt, setPickedExt] = useState('jpg');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [pickedVideo, setPickedVideo] = useState<{ uri: string; mimeType: string } | null>(null);
  const [keepInMemories, setKeepInMemories] = useState(false);
  const [showPublicly, setShowPublicly] = useState(DEFAULT_SHOW_PUBLICLY);
  const [visibilityChanged, setVisibilityChanged] = useState(false);
  const [editingScoped, setEditingScoped] = useState(Boolean(editingId));
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [eventOpen, setEventOpen] = useState(composeMode === 'event');
  const eventOpenRef = useRef(eventOpen);
  eventOpenRef.current = eventOpen;
  const [evTitle, setEvTitle] = useState('');
  const [evDate, setEvDate] = useState(() => toLocalDateString(new Date()));
  const [evTime, setEvTime] = useState('18:00');
  const [evLocation, setEvLocation] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState(() => randomUUID());
  const [draftMedia, setDraftMedia] = useState<DurableDraftMedia | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [screenFocused, setScreenFocused] = useState(false);
  const hasAttachedMedia = Boolean(draftMedia || previewUri || pickedBase64 || pickedVideo);
  const draftRef = useRef<ComposeDraftV2 | null>(null);
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
  const editorPhotoReleaseRef = useRef<(() => Promise<void>) | null>(null);
  const editorMediaLeaseRef = useRef<ComposerMediaLease | null>(null);
  const mediaRequestTokenRef = useRef(0);
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
          setEditingScoped(Boolean(post.group_id || post.page_id || post.audience === 'group'));
          setShowPublicly(normalizeStoredPostVisibility(post).showOnCard);
          setVisibilityChanged(false);
        })
        .catch((e) => {
          if (mounted && mountTokenRef.current === hydrationToken) {
            Alert.alert('Could not edit post', userFacingErrorMessage(e, 'load'));
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
      mediaRequestTokenRef.current += 1;
      postingRef.current = false;
      setPosting(false);
      remoteSucceededRef.current = false;
      setRemoteSucceeded(false);
      setCleanupRecovery(null);
      cleanupRetryingRef.current = false;
      setCleanupRetrying(false);
      setDraftNotice(null);
      suppressNextDebounce.current = true;
      setDraftReady(false);
      setDraftId(randomUUID());
      setDraftMedia(null);
      setPickedBase64(null);
      setPickedVideo(null);
      setPreviewUri(null);
      setEditorUri(null);
      editorMediaLeaseRef.current = null;
      releaseEditorPhoto();
      setBody(typeof params.text === 'string' ? params.text : '');
      setShowPublicly(DEFAULT_SHOW_PUBLICLY);
      setVisibilityChanged(false);
      setEditingScoped(Boolean(editingId));
      setTaggedIds(new Set());
      setKeepInMemories(false);
      setEventOpen(!editingId && params.event === '1');
      setOwnerId(nextOwner);
      if (ownerId) {
        pickerReadinessGate.clear();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [editingId, ownerId, params.event, params.text, pickerReadinessGate]);

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
                  const restoredEventOpen = draft.event.open && !draft.media;
                  restoreChosenRef.current = true;
                  setDraftId(draft.draftId);
                  setBody(draft.body);
                  setShowPublicly(draft.showPublicly);
                  setVisibilityChanged(draft.visibilityChanged);
                  setDraftMedia(draft.media);
                  setPreviewUri(draft.media?.uri ?? null);
                  setPickedVideo(draft.media?.kind === 'video'
                    ? { uri: draft.media.uri, mimeType: draft.media.mimeType }
                    : null);
                  setPickedBase64(base64);
                  setEventOpen(restoredEventOpen);
                  setEvTitle(draft.event.title);
                  setEvDate(draft.event.date);
                  setEvTime(draft.event.time);
                  setEvLocation(draft.event.location);
                  setTaggedIds(restoredEventOpen ? new Set() : new Set(draft.tagIds));
                  setKeepInMemories(restoredEventOpen ? false : draft.keepInMemories);
                  if (draft.event.open && draft.media) {
                    setDraftNotice('Event mode was turned off because this draft contains media.');
                  }
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

  function currentDraft(): ComposeDraftV2 | null {
    if (!ownerId || !draftReady) return null;
    return {
      version: 2,
      draftId,
      ownerId,
      ...draftContext,
      body,
      showPublicly,
      visibilityChanged,
      audience: showPublicly ? 'public' : 'buddies',
      showOnCard: showPublicly,
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

  function exitCompose() {
    navigateBackSafely(routerRef.current);
  }

  function submissionIsCurrent(expectedOwner: string | null, expectedToken: number) {
    return (
      mountedRef.current
      && ownerRef.current === expectedOwner
      && mountTokenRef.current === expectedToken
    );
  }

  function markRemoteSucceeded(expectedOwner: string | null, expectedToken: number) {
    if (!submissionIsCurrent(expectedOwner, expectedToken)) return;
    remoteSucceededRef.current = true;
    setRemoteSucceeded(true);
  }

  function closeAfterRemoteSuccess() {
    Keyboard.dismiss();
    exitCompose();
  }

  function releaseEditorPhoto() {
    const release = editorPhotoReleaseRef.current;
    editorPhotoReleaseRef.current = null;
    if (release) void release();
  }

  function mediaLeaseIsCurrent(lease: ComposerMediaLease | null) {
    return composerMediaLeaseIsCurrent(lease, {
      owner: ownerRef.current,
      mountToken: mountTokenRef.current,
      requestToken: mediaRequestTokenRef.current,
      active: mountedRef.current,
      editing: Boolean(editingIdRef.current),
    });
  }

  function discardDurableUri(uri: string) {
    try {
      if (Platform.OS !== 'web' && /^file:\/\//i.test(uri)) {
        const file = new File(uri);
        if (file.exists) file.delete();
      }
    } catch {
      // Stale picker cleanup is best-effort and never touches the active draft.
    }
  }

  function discardPickerResult(result: ImagePicker.ImagePickerResult) {
    if (Platform.OS !== 'web' || result.canceled) return;
    for (const asset of result.assets) {
      if (/^blob:/i.test(asset.uri)) URL.revokeObjectURL(asset.uri);
    }
  }

  function releaseEditedPhotoUri(uri: string) {
    try {
      if (Platform.OS === 'web') {
        if (/^blob:/i.test(uri)) URL.revokeObjectURL(uri);
        return;
      }
      if (!/^file:\/\//i.test(uri)) return;
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // A best-effort temp cleanup must never erase or hide the saved draft.
    }
  }

  function changeVisibility(next: boolean) {
    setShowPublicly(next);
    if (editingId) setVisibilityChanged(true);
  }

  useEffect(() => {
    if (!draftReady) return;
    if (suppressNextDebounce.current) {
      suppressNextDebounce.current = false;
      return;
    }
    const timer = setTimeout(() => { if (!postingRef.current) void flushDraft(); }, 500);
    return () => clearTimeout(timer);
    // Every persisted field intentionally triggers the debounce.
  }, [draftReady, body, showPublicly, visibilityChanged, draftMedia, eventOpen, evTitle, evDate, evTime, evLocation, taggedIds, keepInMemories]);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state !== 'active' && !postingRef.current) void flushDraft();
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (remoteSucceededRef.current) {
        Keyboard.dismiss();
        exitCompose();
        return true;
      }
      if (postingRef.current) return true;
      Keyboard.dismiss();
      void flushDraft().finally(exitCompose);
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
      setScreenFocused(true);
      if (
        Platform.OS !== 'web'
        && !editingIdRef.current
        && ownerId
        && draftReady
        && draftId.length > 0
      ) {
        void recoveryControllerRef.current?.recover();
      }
      return () => {
        focusedRef.current = false;
        setScreenFocused(false);
      };
    }, [ownerId, draftId, draftReady]),
  );

  useEffect(() => {
    recoveryControllerRef.current?.resetContext(ownerId, draftId);
  }, [ownerId, draftId]);

  useEffect(() => () => {
    mountTokenRef.current += 1;
    mediaRequestTokenRef.current += 1;
    editorMediaLeaseRef.current = null;
    mountedRef.current = false;
    focusedRef.current = false;
    draftRef.current = null;
    releaseEditorPhoto();
    recoveryControllerRef.current?.dispose();
  }, []);

  const composeVideoActive =
    screenFocused && appActive
    && !posting && !tagPickerOpen && !editorUri
    && !eventOpen && !showCreateHub;

  async function clearSavedDraft(deleteMedia = true, submittedDraft?: ComposeDraftV2 | null) {
    const draft = selectDraftCleanupTarget(submittedDraft, currentDraft(), draftRef.current);
    if (!draft) return;
    await clearComposeDraft(draft, AsyncStorage);
    if (deleteMedia) await removeDurableMedia(draft.media, fileAdapter);
    if (ownerRef.current === draft.ownerId && draftRef.current?.draftId === draft.draftId) {
      draftRef.current = null;
    }
  }

  async function clearSavedDraftForSubmission(
    deleteMedia: boolean,
    submittedDraft: ComposeDraftV2 | null,
    expectedOwner: string | null,
    expectedToken: number,
  ) {
    if (!submissionIsCurrent(expectedOwner, expectedToken)) return;
    await clearSavedDraft(deleteMedia, submittedDraft);
  }

  async function retryRemoteCleanup(recovery: CleanupRecovery) {
    if (cleanupRetryingRef.current) return;
    if (
      ownerRef.current !== recovery.expectedOwner
      || mountTokenRef.current !== recovery.expectedToken
    ) return;
    cleanupRetryingRef.current = true;
    setCleanupRetrying(true);
    try {
      await clearSavedDraft(true, recovery.submittedDraft);
      if (
        ownerRef.current === recovery.expectedOwner
        && mountTokenRef.current === recovery.expectedToken
      ) {
        showToast(recovery.successMessage);
        exitCompose();
      }
    } catch {
      if (
        ownerRef.current === recovery.expectedOwner
        && mountTokenRef.current === recovery.expectedToken
      ) {
        setDraftNotice('Local draft cleanup still needs retry');
      }
    } finally {
      if (
        mountedRef.current
        && ownerRef.current === recovery.expectedOwner
        && mountTokenRef.current === recovery.expectedToken
      ) {
        cleanupRetryingRef.current = false;
        setCleanupRetrying(false);
      }
    }
  }

  function finishAfterRemoteSuccess(
    successMessage: string,
    cleanupError: string | null,
    submittedDraft: ComposeDraftV2 | null,
    expectedOwner: string | null,
    expectedToken: number,
  ) {
    if (!submissionIsCurrent(expectedOwner, expectedToken)) return;
    if (!cleanupError) {
      showToast(successMessage);
      exitCompose();
      return;
    }
    const recovery: CleanupRecovery = {
      successMessage,
      submittedDraft,
      expectedOwner,
      expectedToken,
    };
    setCleanupRecovery(recovery);
    setDraftNotice('Remote save succeeded, but the local draft could not be cleared');
    Alert.alert('Saved successfully', 'Your update is live. Only local draft cleanup failed; do not submit again.', [
      { text: 'Close', onPress: () => closeRecoveryAfterRemoteSuccess(recovery) },
      {
        text: 'Retry cleanup',
        onPress: () => {
          void retryRemoteCleanup(recovery);
        },
      },
    ]);
  }

  function closeRecoveryAfterRemoteSuccess(recovery: CleanupRecovery) {
    if (!submissionIsCurrent(recovery.expectedOwner, recovery.expectedToken)) return;
    closeAfterRemoteSuccess();
  }

  async function makeMediaDurable(
    uri: string,
    extension: string,
    mimeType: string,
    kind: 'photo' | 'video',
    lease: ComposerMediaLease,
    recoveryCurrent: () => boolean = () => true,
  ) {
    if (eventOpenRef.current) throw new Error('Turn off Event before attaching media.');
    const stillAttached = () => mediaLeaseIsCurrent(lease) && recoveryCurrent();
    if (!stillAttached()) throw new Error('Compose account detached');
    const expectedBytes = new File(uri).size;
    const base = currentDraft();
    if (!base || base.ownerId !== lease.owner) throw new Error('Draft is not ready');
    const result = await persistDraftMedia(base, {
      ownerId: lease.owner, draftId: base.draftId, sourceUri: uri, extension, expectedBytes,
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
    if (!stillAttached()) {
      await saveComposeDraft(base, AsyncStorage);
      await removeDurableMedia(media, fileAdapter);
      throw new Error('Compose account detached');
    }
    draftRef.current = committed;
    setDraftMedia(committed.media);
    setPreviewUri(committed.media?.uri ?? null);
    if (base.media && base.media.uri !== media.uri) {
      void removeDurableMedia(base.media, fileAdapter);
    }
    return media;
  }

  function onClose() {
    if (remoteSucceededRef.current) {
      closeAfterRemoteSuccess();
      return;
    }
    if (postingRef.current) return;
    Keyboard.dismiss();
    const draft = currentDraft();
    if (!draft || !hasRestorableDraftContent(draft)) {
      void clearSavedDraft().finally(exitCompose);
      return;
    }
    Alert.alert('Cancel this draft?', 'You can keep it for next time or discard it now.', [
      { text: 'Keep draft', onPress: () => { void flushDraft().finally(exitCompose); } },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => { void clearSavedDraft().finally(exitCompose); },
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
    const requestToken = ++mediaRequestTokenRef.current;
    const lease = createComposerMediaLease(ownerRef.current, mountTokenRef.current, requestToken);
    if (!lease || !mediaLeaseIsCurrent(lease) || !isCurrent()) return;
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const durable = await makeMediaDurable(asset.uri, extension, mimeType, 'photo', lease, isCurrent);
    setPickedVideo(null);
    setPickedBase64(null);
    setPickedExt(extension);
    setPreviewUri(durable.uri);
    editorMediaLeaseRef.current = lease;
    setEditorUri(durable.uri);
  }

  async function attachVideoAsset(
    asset: ImagePicker.ImagePickerAsset,
    lease: ComposerMediaLease,
    recoveryCurrent: () => boolean = () => true,
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
    const durable = await makeMediaDurable(
      asset.uri, extension, inferredMime, 'video', lease, recoveryCurrent,
    );
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
    const requestToken = ++mediaRequestTokenRef.current;
    const lease = createComposerMediaLease(expectedOwner, expectedToken, requestToken);
    if (!lease || !mediaLeaseIsCurrent(lease) || !isCurrent()) return;
    await attachVideoAsset(asset, lease, isCurrent);
    if (!isCurrent()) return;
  }

  attachRecoveredPhotoRef.current = attachRecoveredPhoto;
  attachRecoveredVideoRef.current = attachRecoveredVideo;

  async function onPickPhoto(lease: ComposerMediaLease) {
    if (!mediaLeaseIsCurrent(lease) || eventOpenRef.current) return;
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaLeaseIsCurrent(lease)) return;
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
    if (!mediaLeaseIsCurrent(lease)) {
      discardPickerResult(res);
      return;
    }
    const normalized = normalizePickedAsset(res, 'image');
    if (eventOpenRef.current) return;
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
      if (!mediaLeaseIsCurrent(lease)) return;
      setPickedBase64(asset.base64);
      setPickedExt(asset.uri.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg');
      setPreviewUri(asset.uri);
      return;
    }
    releaseEditorPhoto();
    editorMediaLeaseRef.current = lease;
    setEditorUri(asset.uri); // native: filters + brand watermark
  }

  async function onTakeSelfie(lease: ComposerMediaLease) {
    if (!mediaLeaseIsCurrent(lease) || eventOpenRef.current) return;
    try {
      const captured = await captureComposerSelfie({
        expectedOwner: lease.owner,
        expectedToken: lease.mountToken,
        currentOwner: () => ownerRef.current,
        currentToken: () => mountTokenRef.current,
        eventOpen: () => eventOpenRef.current,
      });
      if (!captured) return;
      if (!mediaLeaseIsCurrent(lease)) {
        await captured.release();
        return;
      }
      releaseEditorPhoto();
      editorPhotoReleaseRef.current = captured.release;
      editorMediaLeaseRef.current = lease;
      setEditorUri(captured.uri);
    } catch (error) {
      if (!mediaLeaseIsCurrent(lease)) return;
      if (error instanceof PhotoPermissionDeniedError) {
        Alert.alert(
          'Camera permission needed',
          'Allow camera access in Settings to take a selfie. Your draft has not changed.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => { void Linking.openSettings(); } },
          ],
        );
        return;
      }
      Alert.alert('Selfie not added', userFacingErrorMessage(error, 'media'));
    }
  }

  async function onPickVideo(lease: ComposerMediaLease) {
    if (!mediaLeaseIsCurrent(lease) || eventOpenRef.current) return;
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!mediaLeaseIsCurrent(lease)) return;
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
    if (!mediaLeaseIsCurrent(lease)) {
      discardPickerResult(res);
      return;
    }
    const normalized = normalizePickedAsset(res, 'video');
    if (eventOpenRef.current) return;
    if (normalized.status === 'canceled') return;
    if (normalized.status === 'invalid') {
      Alert.alert('Video not added', normalized.message);
      return;
    }
    try {
      await attachVideoAsset(normalized.asset, lease);
    } catch (error) {
      if (mediaLeaseIsCurrent(lease)) {
        Alert.alert('Video not added', userFacingErrorMessage(error, 'media'));
      }
    }
  }

  async function launchMediaPicker(media: CreateMedia) {
    if (editingIdRef.current) return;
    const requestToken = ++mediaRequestTokenRef.current;
    const lease = createComposerMediaLease(ownerRef.current, mountTokenRef.current, requestToken);
    if (!lease) return;
    if (media === 'selfie') {
      if (Platform.OS !== 'web') await onTakeSelfie(lease);
      return;
    }
    if (media === 'photo') await onPickPhoto(lease);
    else await onPickVideo(lease);
  }

  function requestMediaPicker(media: CreateMedia) {
    if (
      editingIdRef.current
      || eventOpenRef.current
      || !composerMediaChoices(Platform.OS, false).includes(media)
    ) return;
    const ready = Boolean(ownerRef.current && draftReadyRef.current);
    const launch = pickerReadinessGate.request(media, ready);
    if (launch) void launchMediaPicker(launch);
  }

  function onEdited(photo: EditedPhoto) {
    const lease = editorMediaLeaseRef.current;
    if (!mediaLeaseIsCurrent(lease)) {
      setEditorUri(null);
      releaseEditorPhoto();
      releaseEditedPhotoUri(photo.uri);
      return;
    }
    void makeMediaDurable(photo.uri, 'jpg', 'image/jpeg', 'photo', lease)
      .then(async (durable) => {
        if (!mediaLeaseIsCurrent(lease)) {
          discardDurableUri(durable.uri);
          return;
        }
        setPickedVideo(null);
        setPickedBase64(photo.base64);
        setPickedExt('jpg');
        setPreviewUri(durable.uri);
        setEditorUri(null);
      })
      .catch((error) => {
        if (mediaLeaseIsCurrent(lease)) {
          setEditorUri(null);
          Alert.alert('Photo not added', userFacingErrorMessage(error, 'media'));
        }
      })
      .finally(() => {
        editorMediaLeaseRef.current = null;
        releaseEditorPhoto();
        releaseEditedPhotoUri(photo.uri);
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

  function toggleEventMode() {
    if (editingIdRef.current) return;
    if (eventOpen) {
      setEventOpen(false);
      return;
    }
    if (hasAttachedMedia) return;
    setTaggedIds(new Set());
    setKeepInMemories(false);
    setEventOpen(true);
  }

  const canPost = !remoteSucceeded && (editingId
    ? body.trim().length > 0 && !posting
    : eventOpen
    ? evTitle.trim().length >= 3
      && !hasAttachedMedia
      && taggedIds.size === 0
      && !keepInMemories
      && !posting
    : (body.trim().length > 0 || !!pickedBase64 || !!pickedVideo) && !posting);

  async function onPost() {
    if (!canPost || remoteSucceededRef.current) return;
    const submittedDraft = currentDraft();
    const submittedOwner = ownerRef.current;
    const submittedToken = mountTokenRef.current;
    const operationId = submittedDraft?.draftId ?? draftId;
    const submittedShowPublicly = submittedDraft?.showPublicly ?? showPublicly;
    const submittedVisibilityChanged = submittedDraft?.visibilityChanged ?? visibilityChanged;
    const submittedVisibility = postVisibility(submittedShowPublicly);
    postingRef.current = true;
    setPosting(true);
    if (editingId) {
      try {
        if (!submittedOwner) throw new Error('Sign in again before updating this post.');
        const result = await completeRemoteSubmission(async () => {
          await updatePost(editingId, body.trim());
          if (!editingScoped && submittedVisibilityChanged) await updatePostVisibility(editingId, submittedShowPublicly, submittedOwner);
        }, () => clearSavedDraftForSubmission(
          true,
          submittedDraft,
          submittedOwner,
          submittedToken,
        ));
        markRemoteSucceeded(submittedOwner, submittedToken);
        finishAfterRemoteSuccess('Post updated', result.cleanupError, submittedDraft, submittedOwner, submittedToken);
      } catch (e) {
        if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
          postingRef.current = false;
          Alert.alert('Could not update post', userFacingErrorMessage(e, 'update'));
          setPosting(false);
        }
      }
      return;
    }
    if (eventOpen) {
      try {
        if (!submittedOwner) throw new Error('Sign in again before announcing this event.');
        const result = await completeRemoteSubmission(() => createEvent({
          expectedOwnerId: submittedOwner,
          operationId,
          title: evTitle,
          startsAtIso: toIsoFromLocal(evDate, evTime),
          location: evLocation,
          message: body.trim(),
          audience: submittedVisibility.audience,
          showOnCard: submittedVisibility.showOnCard,
          showPublicly: submittedShowPublicly,
        }), () => clearSavedDraftForSubmission(
          true,
          submittedDraft,
          submittedOwner,
          submittedToken,
        ));
        markFeedPostPublished(submittedOwner, result.value.postId);
        markRemoteSucceeded(submittedOwner, submittedToken);
        if (result.cleanupError) {
          finishAfterRemoteSuccess('Event announced', result.cleanupError, submittedDraft, submittedOwner, submittedToken);
          return;
        }
        if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
          showToast('Event announced — its group is ready 🎉');
          exitCompose();
        }
      } catch (e) {
        if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
          postingRef.current = false;
          Alert.alert('Could not announce event', userFacingErrorMessage(e, 'publish'));
          setPosting(false);
        }
      }
      return;
    }
    const postedText = body.trim();
    const postedImageUri = previewUri;
    const submittedMedia = submittedDraft?.media ?? draftMedia;
    const keep = keepInMemories && !!previewUri;
    const tagIds = [...taggedIds];
    const tagNames = buddies.filter((b) => taggedIds.has(b.id)).map((b) => authorLabel(b.name));
    try {
      if (!submittedOwner) throw new Error('Sign in again before posting.');
      let imageUrl: string | null = null;
      let mediaUpload: { mediaRef: string; sha256: string } | null = null;
      if (pickedBase64) {
        mediaUpload = await uploadPostImageWithDigest(pickedBase64, pickedExt, operationId, submittedOwner);
      }
      if (pickedVideo) {
        mediaUpload = await uploadPostVideoWithDigest(
          pickedVideo.uri,
          pickedVideo.mimeType,
          operationId,
          submittedOwner,
        );
      }
      imageUrl = mediaUpload?.mediaRef ?? null;
      const postId = await createPost(
        postedText,
        imageUrl,
        null,
        null,
        null,
        submittedVisibility.showOnCard,
        {
          audience: submittedVisibility.audience,
          postType: pickedVideo ? 'video' : imageUrl ? 'photo' : 'post',
          shareData: mediaUpload ? { client_media_sha256: mediaUpload.sha256 } : undefined,
          operationId,
          expectedOwnerId: submittedOwner,
          showPublicly: submittedShowPublicly,
        },
      );
      markFeedPostPublished(submittedOwner, postId);
      if (!submissionIsCurrent(submittedOwner, submittedToken)) return;
      markRemoteSucceeded(submittedOwner, submittedToken);
      try {
        // The post is now durable and retry-safe. Remove the draft from its
        // restore index before optional side effects so a process restart can
        // never repeat Memories or cross-share work. Keep the local media file
        // until those side effects have finished using it.
        await clearSavedDraft(false, submittedDraft);
      } catch (cleanupError) {
        finishAfterRemoteSuccess(
          'Posted to your feed',
          userFacingErrorMessage(cleanupError, 'update'),
          submittedDraft,
          submittedOwner,
          submittedToken,
        );
        return;
      }
      if (tagIds.length > 0) await addPostTags(postId, tagIds).catch(() => {});
      if (keep && postedImageUri) {
        try {
          const place = await currentPlaceLabel();
          await saveImageToMemories(postedImageUri, place, tagNames, submittedOwner);
        } catch {
          // a Memories hiccup must never fail the post
        }
      }
      if (
        Platform.OS !== 'web'
        && ownerRef.current === submittedOwner
        && mountTokenRef.current === submittedToken
      ) {
        await promptCrossShare(postedText, postedImageUri, pickedVideo?.mimeType);
      }
      await removeDurableMedia(submittedMedia, fileAdapter).catch(() => {
        // The now-unindexed file is safe to remove during orphan cleanup.
      });
      if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
        if (Platform.OS === 'web') showToast('Posted to your feed 🎉');
        exitCompose();
      }
    } catch (e) {
      if (ownerRef.current === submittedOwner && mountTokenRef.current === submittedToken) {
        postingRef.current = false;
        Alert.alert('Could not post', userFacingErrorMessage(e, 'publish'));
        setPosting(false);
      }
    }
  }

  const tagged = buddies.filter((b) => taggedIds.has(b.id));
  const visibilityCopy = postVisibilityCopy(showPublicly);
  const primaryActionLabel = editingId
    ? 'Save'
    : eventOpen
      ? showPublicly ? 'Announce publicly' : 'Announce to buddies'
      : visibilityCopy.postAction;
  const allComposerActions: ComposerMediaActionItem[] = [
    {
      id: 'selfie', icon: 'camera-outline', tone: 'action', label: 'Take selfie',
      disabled: eventOpen || !draftReady || !ownerId,
      onPress: () => requestMediaPicker('selfie'),
    },
    {
      id: 'photo', icon: 'image-outline', tone: 'action', label: 'Choose photo',
      disabled: eventOpen, onPress: () => requestMediaPicker('photo'),
    },
    {
      id: 'video', icon: 'videocam-outline', tone: 'danger', label: 'Choose video',
      disabled: eventOpen, onPress: () => requestMediaPicker('video'),
    },
    {
      id: 'event', icon: eventOpen ? 'calendar' : 'calendar-outline', tone: 'success', label: 'Event',
      active: eventOpen, disabled: hasAttachedMedia, onPress: toggleEventMode,
    },
  ];
  const composerActions = allComposerActions.filter((action) => (
    composerCreateActions(Platform.OS, Boolean(editingId)).includes(action.id)
  ));

  if (showCreateHub) {
    return (
      <CreateHub
        onClose={onClose}
        onContinue={(choice, media) => {
          const decision = decideCreateContinuation({
            choiceId: choice.id,
            media,
          });
          if (decision.kind === 'route') {
            router.replace(decision.route as never);
            return;
          }
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
        <PhotoEditor
          uri={editorUri}
          onDone={onEdited}
          onCancel={() => {
            setEditorUri(null);
            editorMediaLeaseRef.current = null;
            releaseEditorPhoto();
          }}
        />
      ) : null}

      {/* top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={onClose}
          disabled={posting && !remoteSucceeded}
          hitSlop={10}
          style={({ pressed }) => [
            styles.close,
            posting && !remoteSucceeded && styles.closeDisabled,
            pressed && (!posting || remoteSucceeded) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityState={{ disabled: posting && !remoteSucceeded, busy: posting && !remoteSucceeded }}
        >
          <Ionicons name="close" size={26} color={theme.ink.primary} />
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
          accessibilityLabel={primaryActionLabel}
        >
          {posting ? (
            <ActivityIndicator size="small" color={theme.ink.inverse} />
          ) : (
            <Text style={styles.postBtnText}>{primaryActionLabel}</Text>
          )}
        </Pressable>
      </View>

      {cleanupRecovery ? (
        <View style={styles.cleanupRecovery} accessibilityLiveRegion="assertive">
          <View style={styles.cleanupRecoveryCopy}>
            <Text style={styles.cleanupRecoveryTitle}>{cleanupRecovery.successMessage}</Text>
            <Text style={styles.cleanupRecoveryText}>
              The server saved it. Only the copy on this phone still needs cleanup. Do not submit again.
            </Text>
          </View>
          <View style={styles.cleanupRecoveryActions}>
            <Pressable
              onPress={() => closeRecoveryAfterRemoteSuccess(cleanupRecovery)}
              style={({ pressed }) => [styles.cleanupClose, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Close composer"
            >
              <Text style={styles.cleanupCloseText}>Close</Text>
            </Pressable>
            <Pressable
              onPress={() => { void retryRemoteCleanup(cleanupRecovery); }}
              disabled={cleanupRetrying}
              style={({ pressed }) => [
                styles.cleanupRetry,
                cleanupRetrying && styles.actionDisabled,
                pressed && !cleanupRetrying && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry local draft cleanup"
              accessibilityState={{ disabled: cleanupRetrying, busy: cleanupRetrying }}
            >
              {cleanupRetrying ? (
                <ActivityIndicator size="small" color={theme.ink.inverse} />
              ) : (
                <Text style={styles.cleanupRetryText}>Retry cleanup</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        pointerEvents={remoteSucceeded ? 'none' : 'auto'}
      >
        {draftNotice ? <Text style={styles.draftNotice} accessibilityLiveRegion="polite">{draftNotice}</Text> : null}
        <View style={styles.authorRow}>
          <Avatar url={me.avatar} name={selfAuthorLabel(me.name)} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.author}>{selfAuthorLabel(me.name)}</Text>
            {editingScoped ? <Text style={styles.scopedAudience}>Visible in its original group or page</Text> : null}
          </View>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Share a win or what you're up to…"
          placeholderTextColor={theme.ink.muted}
          value={body}
          onChangeText={setBody}
          multiline
          autoFocus
        />

        {!editingScoped ? (
          <PostVisibilitySwitch
            showPublicly={showPublicly}
            onChange={changeVisibility}
            disabled={posting || remoteSucceeded}
          />
        ) : null}

        {previewUri ? (
          <View style={styles.previewWrap}>
            {pickedVideo ? (
              <View style={styles.videoPreview}>
                <PostVideo url={pickedVideo.uri} active={composeVideoActive} />
              </View>
            ) : (
              <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="cover" />
            )}
            {!editingId ? <Pressable
              style={styles.previewRemove}
              onPress={clearPhoto}
              accessibilityRole="button"
              accessibilityLabel={pickedVideo ? 'Remove video' : 'Remove photo'}
            >
              <View style={styles.previewRemoveVisual}>
                <Ionicons name="close" size={15} color={theme.ink.inverse} />
              </View>
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
                  color={keepInMemories ? theme.ink.action : theme.ink.muted}
                />
                <Text style={[styles.optText, keepInMemories && { color: theme.ink.action }]}>
                  Add to Memories
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.optRow, pressed && styles.pressed]}
                onPress={openTagPicker}
                accessibilityRole="button"
                accessibilityLabel={tagged.length > 0 ? 'Change tagged buddies' : 'Tag buddies'}
              >
                <Ionicons
                  name={tagged.length > 0 ? 'people' : 'person-add-outline'}
                  size={18}
                  color={tagged.length > 0 ? theme.ink.action : theme.ink.muted}
                />
                <Text
                  style={[styles.optText, tagged.length > 0 && { color: theme.ink.action }]}
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
              placeholderTextColor={theme.ink.muted}
              value={evTitle}
              onChangeText={setEvTitle}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                style={[styles.eventInput, { flex: 1 }]}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.ink.muted}
                autoCapitalize="none"
                value={evDate}
                onChangeText={setEvDate}
              />
              <TextInput
                style={[styles.eventInput, { flex: 1 }]}
                placeholder="HH:MM"
                placeholderTextColor={theme.ink.muted}
                autoCapitalize="none"
                value={evTime}
                onChangeText={setEvTime}
              />
            </View>
            <TextInput
              style={styles.eventInput}
              placeholder="Location (park, gym, meet point…)"
              placeholderTextColor={theme.ink.muted}
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
      {!remoteSucceeded && !editingId ? (
        <ComposerMediaActions
          availableWidth={windowMetrics.width}
          fontScale={windowMetrics.fontScale}
          bottomInset={insets.bottom}
          actions={composerActions}
        />
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
                      color={selected ? theme.ink.action : theme.ink.muted}
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

function createStyles(theme: AppThemeColors) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.surface.card },
  pressed: { opacity: 0.65 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border.subtle,
  },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  closeDisabled: { opacity: theme.interaction.disabledOpacity },
  title: { flex: 1, fontSize: 17, fontFamily: font.bold, color: theme.ink.primary },
  postBtn: {
    backgroundColor: theme.ink.action,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 20,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnDisabled: { backgroundColor: theme.interaction.skeleton },
  postBtnText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 15 },
  body: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  draftNotice: { color: theme.status.danger, fontFamily: font.semibold, fontSize: 13 },
  cleanupRecovery: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: theme.status.successSoft,
    borderWidth: 1,
    borderColor: theme.status.success,
    borderRadius: radius.md,
  },
  cleanupRecoveryCopy: { gap: 3 },
  cleanupRecoveryTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 15 },
  cleanupRecoveryText: { color: theme.ink.secondary, fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  cleanupRecoveryActions: { flexDirection: 'row', gap: spacing.sm },
  cleanupClose: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    backgroundColor: theme.surface.card,
  },
  cleanupCloseText: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 14 },
  cleanupRetry: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: theme.ink.action,
  },
  cleanupRetryText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 14 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  author: { fontSize: 16, fontFamily: font.bold, color: theme.ink.primary },
  scopedAudience: { marginTop: 3, fontSize: 12.5, lineHeight: 18, fontFamily: font.regular, color: theme.ink.muted },
  input: {
    fontSize: 19,
    lineHeight: 26,
    fontFamily: font.regular,
    color: theme.ink.primary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  previewWrap: { alignSelf: 'flex-start', gap: spacing.sm },
  preview: { width: 200, height: 200, borderRadius: radius.md, backgroundColor: theme.surface.muted },
  videoPreview: { width: 200 },
  previewRemove: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRemoveVisual: {
    backgroundColor: theme.ink.primary,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOpts: { gap: 4 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
  optText: { flexShrink: 1, fontFamily: font.semibold, fontSize: 13.5, lineHeight: 19, color: theme.ink.secondary },
  eventForm: { gap: spacing.sm },
  eventInput: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: theme.ink.primary,
    backgroundColor: theme.surface.muted,
  },
  eventHint: { fontFamily: font.regular, fontSize: 12.5, color: theme.ink.muted, lineHeight: 18 },
  actionDisabled: { opacity: theme.interaction.disabledOpacity },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: theme.interaction.scrim,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.surface.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: 2,
    paddingBottom: spacing.xxl,
  },
  sheetTitle: {
    fontFamily: font.bold,
    fontSize: 13,
    color: theme.ink.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  tagEmpty: { fontFamily: font.regular, fontSize: 13.5, color: theme.ink.muted, paddingVertical: 8, lineHeight: 19 },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  tagName: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: theme.ink.primary },
  tagDone: {
    backgroundColor: theme.ink.action,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  tagDoneText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 15 },
  });
}
