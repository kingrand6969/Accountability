import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RunCard } from './RunCard';
import { formatDurationLong, formatKm, formatPace, privacySafeRoute, type Pt } from './geo';
import type { ActivityType } from './api';
import {
  createRunPostIdempotent,
  findMyPostByOperationId,
} from '../feed/api';
import { uploadPostImage } from '../feed/uploadPostImage';
import { promptCrossShare } from '../feed/crossShare';
import { recordRunSelfie } from '../achievements/api';
import { font } from '../ui/theme';
import {
  RUN_SHARE_FORMATS,
  runShareExportSize,
  runShareRatio,
  type RunMediaFit,
  type RunShareFormat,
} from './runShareFormats';
import { createShareOperationGate } from './shareOperationGate';
import { saveImageToMemories } from '../memories/api';
import { RunMediaActions } from './RunMediaActions';
import {
  createRunMediaCompletionEffects,
  createRunMediaOperationId,
  persistRunMedia,
  runMediaCache,
  runMediaRenderSizeKey,
  stageRunMedia,
  stageRunMediaForGeneration,
  retainFeedOperationContext,
  type FeedOperationContext,
  type RunMediaDestination,
} from './saveRunMedia';
import type { RunMediaCacheItem } from './runMediaCache';
import { useActivitySync } from './ActivitySyncProvider';
import { useAuth } from '../auth/AuthProvider';
import {
  createOwnerBoundary,
  runFeedAvailability,
  runSyncPresentation,
} from './runCompletion';
import type { UploadStatus } from './offlineQueueTypes';
import type { BeautyCameraProps } from './beauty/BeautyCamera.native';
import {
  BeautyEditor,
  createBeautyCaptureLeaseSlot,
  createBeautySheetExportController,
  type BeautyEditorRenderResult,
} from './beauty/BeautyEditor';
import type { BeautyCaptureSource } from './beauty/cameraMode';
import { DEFAULT_BEAUTY } from './beauty/types';
import { addStoryIdempotent } from '../stories/api';
import {
  retainAchievementStoryOperation,
  type AchievementCompletion,
  type AchievementStoryOperation,
} from '../entry/achievementCompletion';
import { ShareStudio, type ShareStudioResult } from '../share/ShareStudio';
import {
  createRunShareMediaOverrideController,
  freezeRunShareRenderInputs,
  runShareRenderModel,
  uploadRunFeedImage,
  type FrozenRunShareRenderInputs,
  type RunSharePresentation,
} from './runShareMediaOverride';
import { feedShareAvailability } from '../share/feedShareAvailability';
import {
  RUN_SHARE_FONTS,
  RUN_SHARE_LAYOUTS,
  routeEndpointVisibilityIntent,
  type RunCardTheme,
  type RunShareFont,
  type RunShareLayout,
} from './runShareAppearance';
import { RunShareOptionSelect } from './RunShareOptionSelect';
import {
  createPhonePhoto,
  requestPhonePhotoPermission,
} from '../media/phoneMediaLibrary';

const LIME = '#c6f24e';

export function runCardBackgroundButtonPlacement(layout: RunShareLayout) {
  switch (layout) {
    case 'center-stack':
    case 'editorial-stack':
      return { top: 12, left: 12 } as const;
    case 'right-rail':
      return { bottom: 12, left: 12 } as const;
    case 'data-horizon':
      return { top: '43%', right: 12 } as const;
    default:
      return { top: 12, right: 12 } as const;
  }
}

export type FinishedRun = {
  activityId: string | null;
  ownerId: string | null;
  syncStatus: UploadStatus | null;
  type: ActivityType;
  distance: number;
  elapsed: number;
  points: Pt[];
  title: string;
  completedAt: string;
  cardTheme: RunCardTheme;
  // A saved run may still be queued locally, so there is no truthful resulting
  // server streak yet. The completion remains a run until sync establishes it.
};

type Mode = 'map' | 'photo';

type RunFeedOperationMetadata = {
  body: string;
  showPublicly: boolean;
  activityId: string;
  shareData: {
    format: RunShareFormat;
    media_fit: RunMediaFit;
    route_ends_visible: boolean;
    layout: RunShareLayout;
    font: RunShareFont;
    recorded_time_visible: boolean;
    card_theme: RunCardTheme;
  };
  selfie: boolean;
  distanceKm: number;
};

/** Full-screen overlay shown after Stop & Save — turn the run into a shareable card. */
type RunEditorSafeCloserDependencies = {
  takeStaged: () => { id: string } | null;
  takeProcessedPhoto?: () => { id: string } | null;
  releaseCapturedSource?: () => Promise<void>;
  release: (id: string, owner: 'editor') => Promise<void>;
  clearLocal: () => void;
  onClose: () => void;
};

export function createRunEditorSafeCloser({
  takeStaged,
  takeProcessedPhoto = () => null,
  releaseCapturedSource = async () => undefined,
  release,
  clearLocal,
  onClose,
}: RunEditorSafeCloserDependencies): () => Promise<void> {
  let closing: Promise<void> | null = null;
  return () => {
    if (closing) return closing;
    const staged = takeStaged();
    const processedPhoto = takeProcessedPhoto();
    clearLocal();
    closing = (async () => {
      await Promise.all(
        [
          ...[staged, processedPhoto]
            .filter((item): item is { id: string } => item !== null)
            .map((item) => release(item.id, 'editor').catch(() => {})),
          releaseCapturedSource().catch(() => {}),
        ],
      );
      onClose();
    })();
    return closing;
  };
}

export function handleRunEditorHardwareBack(
  closeEditor: () => Promise<void>,
): true {
  void closeEditor();
  return true;
}

export function RunShareSheet({ run, onClose }: { run: FinishedRun; onClose: () => void }) {
  const { session } = useAuth();
  const currentOwnerRef = useRef<string | null>(session?.user.id ?? null);
  currentOwnerRef.current = session?.user.id ?? null;
  const ownerMatches =
    !!run.ownerId && currentOwnerRef.current === run.ownerId;
  const ownerBoundary = useCallback(
    () => createOwnerBoundary(run.ownerId ?? '', () => currentOwnerRef.current),
    [run.ownerId],
  );
  const {
    queued,
    status: activitySyncStatus,
    error: activitySyncError,
    refreshQueue,
  } = useActivitySync();
  const { width, height } = useWindowDimensions();
  const [completedQueueCheckKey, setCompletedQueueCheckKey] = useState<
    string | null
  >(null);
  const [mode, setMode] = useState<Mode>('map');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoKind, setPhotoKind] = useState<'selfie' | 'place' | 'gallery' | null>(null);
  const [originalRatio, setOriginalRatio] = useState<number | null>(null);
  const [format, setFormat] = useState<RunShareFormat>('feed');
  const [mediaFit, setMediaFit] = useState<RunMediaFit>('cover');
  const [activeDestination, setActiveDestination] = useState<RunMediaDestination | null>(null);
  const [shareStudioVisible, setShareStudioVisible] = useState(false);
  const [showEnds, setShowEnds] = useState(false); // opt in to reveal home/finish
  const [layout, setLayout] = useState<RunShareLayout>('map-focus');
  const [cardFont, setCardFont] = useState<RunShareFont>('momentum');
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [backgroundPickerVisible, setBackgroundPickerVisible] = useState(false);
  const [beautyStage, setBeautyStage] = useState<'camera' | 'editor' | null>(
    null,
  );
  const [beautySource, setBeautySource] =
    useState<BeautyCaptureSource | null>(null);
  const cardRef = useRef<View>(null);
  const stagedMedia = useRef<RunMediaCacheItem | null>(null);
  const processedPhotoMedia = useRef<RunMediaCacheItem | null>(null);
  const shareMediaOverride = useRef<ReturnType<
    typeof createRunShareMediaOverrideController
  > | null>(null);
  if (!shareMediaOverride.current) {
    shareMediaOverride.current = createRunShareMediaOverrideController();
  }
  const shareStudioRunInputs = useRef<FrozenRunShareRenderInputs | null>(null);
  const shareStudioCaptureSize = useRef<{ width: number; height: number } | null>(null);
  const renderGeneration = useRef(0);
  const capturedSourceLeases = useRef<ReturnType<
    typeof createBeautyCaptureLeaseSlot
  > | null>(null);
  if (!capturedSourceLeases.current) {
    capturedSourceLeases.current = createBeautyCaptureLeaseSlot(
      runMediaCache.release,
    );
  }
  const beautyExportController = useRef<ReturnType<
    typeof createBeautySheetExportController
  > | null>(null);
  if (!beautyExportController.current) {
    beautyExportController.current = createBeautySheetExportController({
      advanceGeneration: () => {
        renderGeneration.current += 1;
        return renderGeneration.current;
      },
      takeStaged: () => {
        const item = stagedMedia.current;
        stagedMedia.current = null;
        return item;
      },
      release: runMediaCache.release,
    });
  }
  const feedOperation = useRef<FeedOperationContext<RunFeedOperationMetadata> | null>(null);
  const storyOperation = useRef<AchievementStoryOperation | null>(null);
  const hasPersistentDestination = useRef(false);
  const editorLifecycleActive = useRef(true);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const currentOwnerToken = useCallback(() => currentOwnerRef.current, []);
  const safeCloseRef = useRef<(() => Promise<void>) | null>(null);
  if (!safeCloseRef.current) {
    safeCloseRef.current = createRunEditorSafeCloser({
      takeStaged: () => {
        const item = stagedMedia.current;
        stagedMedia.current = null;
        return item;
      },
      takeProcessedPhoto: () => {
        const item = processedPhotoMedia.current;
        processedPhotoMedia.current = null;
        return item;
      },
      releaseCapturedSource: () =>
        capturedSourceLeases.current!.releaseAll(),
      release: runMediaCache.release,
      clearLocal: () => {
        editorLifecycleActive.current = false;
        renderGeneration.current += 1;
        feedOperation.current = null;
        hasPersistentDestination.current = false;
        setCompletedQueueCheckKey(null);
        setActiveDestination(null);
        setPhotoUri(null);
        setPhotoKind(null);
        setOriginalRatio(null);
        setMode('map');
        setFormat('feed');
        setMediaFit('cover');
        setShareStudioVisible(false);
        shareMediaOverride.current!.clear();
        shareStudioRunInputs.current = null;
        shareStudioCaptureSize.current = null;
        setShowEnds(false);
        setLayout('map-focus');
        setCardFont('momentum');
        setShowTimestamp(true);
        setBackgroundPickerVisible(false);
        setBeautyStage(null);
        setBeautySource(null);
      },
      onClose: () => onCloseRef.current(),
    });
  }
  const shareOperationGate = useRef(createShareOperationGate()).current;
  const completionEffects = useMemo(
    () =>
      createRunMediaCompletionEffects((distanceKm) =>
        ownerBoundary().runSideEffect(() => recordRunSelfie(distanceKm)),
      ),
    [ownerBoundary],
  );
  const busy = activeDestination !== null;
  const syncPresentation =
    run.activityId && run.syncStatus
      ? runSyncPresentation(run.activityId, run.syncStatus, queued)
      : null;
  const currentOwnerId = session?.user.id ?? null;
  const queueCheckKey =
    run.activityId && run.ownerId && currentOwnerId === run.ownerId
      ? `${run.activityId}:${run.ownerId}`
      : null;
  const feedAvailability =
    run.activityId && run.ownerId
      ? runFeedAvailability(
          run.activityId,
          run.ownerId,
          currentOwnerId,
          {
            queueChecked:
              queueCheckKey !== null &&
              completedQueueCheckKey === queueCheckKey,
            syncStatus: activitySyncStatus,
            syncError: activitySyncError,
            queuedActivities: queued,
          },
        )
      : {
          enabled: false as const,
          reason:
            'Save a real GPS activity before posting a verified Run card.',
        };
  const feedShare = feedShareAvailability(Platform.OS);
  const activityQueued = !feedAvailability.enabled || !feedShare.available;
  const feedDisabledReason = feedShare.reason ?? feedAvailability.reason ?? undefined;
  const syncDetail =
    !currentOwnerId || currentOwnerId !== run.ownerId
      ? 'Sign in as the recording owner to upload'
      : feedAvailability.reason === 'Checking saved activity'
        ? 'Checking saved activity'
        : feedAvailability.reason === 'Uploads unavailable—retry sync'
          ? 'Uploads unavailable—retry sync'
          : syncPresentation?.detail;

  useEffect(() => {
    if (!queueCheckKey) return;
    let active = true;
    void refreshQueue().finally(() => {
      if (active) setCompletedQueueCheckKey(queueCheckKey);
    });
    return () => {
      active = false;
    };
    // Refresh once for this completed activity; live queue events update later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueCheckKey]);

  useEffect(() => {
    if (ownerMatches) {
      editorLifecycleActive.current = true;
      return;
    }
    editorLifecycleActive.current = false;
    renderGeneration.current += 1;
    const staged = stagedMedia.current;
    stagedMedia.current = null;
    if (staged) {
      void runMediaCache.release(staged.id, 'editor').catch(() => {});
    }
    const processedPhoto = processedPhotoMedia.current;
    processedPhotoMedia.current = null;
    if (processedPhoto) {
      void runMediaCache
        .release(processedPhoto.id, 'editor')
        .catch(() => {});
    }
    void capturedSourceLeases.current!.releaseAll();
    feedOperation.current = null;
    shareMediaOverride.current!.clear();
    shareStudioRunInputs.current = null;
    shareStudioCaptureSize.current = null;
    hasPersistentDestination.current = false;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setActiveDestination(null);
      setPhotoUri(null);
      setPhotoKind(null);
      setOriginalRatio(null);
      setMode('map');
      setShareStudioVisible(false);
      setShowEnds(false);
      setLayout('map-focus');
      setCardFont('momentum');
      setShowTimestamp(true);
      setBackgroundPickerVisible(false);
      setBeautyStage(null);
      setBeautySource(null);
    });
    return () => {
      active = false;
    };
  }, [ownerMatches]);

  // Keep the reviewed card large enough to judge; the editor scrolls on short
  // screens instead of shrinking the privacy and typography details away.
  const cardRatio = runShareRatio(format, originalRatio);
  const cardWidth = Math.max(240, Math.min(width - 40, 380));
  const exportSize = runShareExportSize(format, originalRatio);
  const renderSizeKey = runMediaRenderSizeKey({
    viewportWidth: width,
    viewportHeight: height,
    previewWidth: cardWidth,
    exportWidth: exportSize.width,
    exportHeight: exportSize.height,
  });

  // the shared route hides its true start/end by default (privacy zone); the
  // user can opt to reveal them, and the full route always stays in the saved activity
  const cardPoints = useMemo(
    () => (showEnds ? run.points : privacySafeRoute(run.points)),
    [run.points, showEnds],
  );
  const cardAppearance = useMemo(
    () => ({
      layout,
      font: cardFont,
      showTimestamp,
      theme: run.cardTheme,
      completedAt: run.completedAt,
    }),
    [cardFont, layout, run.cardTheme, run.completedAt, showTimestamp],
  );

  // Android hardware back closes the sheet instead of popping the run screen
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      return handleRunEditorHardwareBack(closeEditor);
    });
    return () => sub.remove();
  }, []);

  // A changed card must never reuse an older staged export. Release only that
  // item's editor owner. Destination leases are released after every attempt;
  // the editor owner keeps the staged item retryable.
  useEffect(() => {
    renderGeneration.current += 1;
    const stale = stagedMedia.current;
    stagedMedia.current = null;
    if (stale) void runMediaCache.release(stale.id, 'editor').catch(() => {});
  }, [
    cardFont,
    format,
    layout,
    mediaFit,
    showEnds,
    showTimestamp,
    mode,
    photoUri,
    originalRatio,
    run,
    renderSizeKey,
  ]);

  const caption =
    `🏃 ${run.title} · ${formatKm(run.distance)} km in ${formatDurationLong(run.elapsed)} ` +
      `· ${formatPace(run.distance, run.elapsed)} /km`;
  const completionPayload: AchievementCompletion = {
    kind: 'run',
    sourceId: run.activityId ?? `${run.ownerId}:${run.elapsed}:${run.distance}`,
    text: caption,
    mediaUri: stagedMedia.current?.uri ?? null,
  };

  function invalidateStagedBeautyExport(): void {
    beautyExportController.current!.invalidate();
  }

  function openBeautyCamera(): void {
    if (!editorLifecycleActive.current) return;
    ownerBoundary().assertOwned();
    setBeautySource(null);
    setBeautyStage('camera');
  }

  async function acceptBeautyCapture(
    source: BeautyCaptureSource,
  ): Promise<void> {
    const boundary = ownerBoundary();
    const accepting = capturedSourceLeases.current!.accept(source);
    try {
      if (!editorLifecycleActive.current) {
        await capturedSourceLeases.current!.releaseAll();
        return;
      }
      boundary.assertOwned();
      await accepting;
      if (!editorLifecycleActive.current) {
        await capturedSourceLeases.current!.releaseAll();
        return;
      }
      boundary.assertOwned();
      setBeautySource(source);
      setBeautyStage('editor');
    } catch {
      await capturedSourceLeases.current!.releaseAll();
    }
  }

  async function acceptProcessedBeautyPhoto(
    source: BeautyCaptureSource,
    processed: BeautyEditorRenderResult,
  ): Promise<void> {
    const boundary = ownerBoundary();
    if (!editorLifecycleActive.current) {
      throw new Error('Run editor is closed.');
    }
    boundary.assertOwned();
    const previous = processedPhotoMedia.current;
    processedPhotoMedia.current = processed.cacheItemId
      ? { id: processed.cacheItemId, uri: processed.uri }
      : null;
    setPhotoUri(processed.uri);
    setOriginalRatio(
      source.imageSize.width > 0 && source.imageSize.height > 0
        ? source.imageSize.width / source.imageSize.height
        : null,
    );
    setPhotoKind('selfie');
    setMode('photo');
    setBeautyStage(null);
    setBeautySource(null);
    beautyExportController.current!.acceptProcessed(processed);
    await Promise.resolve();
    boundary.assertOwned();
    if (previous && previous.id !== processed.cacheItemId) {
      await runMediaCache.release(previous.id, 'editor').catch(() => {});
    }
  }

  function releaseProcessedPhotoAfterReplacement(): void {
    const previous = processedPhotoMedia.current;
    processedPhotoMedia.current = null;
    if (previous) {
      void runMediaCache.release(previous.id, 'editor').catch(() => {});
    }
  }

  async function addPhoto(kind: 'selfie' | 'place' | 'gallery') {
    if (kind === 'selfie') {
      openBeautyCamera();
      return;
    }
    const boundary = ownerBoundary();
    boundary.assertOwned();
    try {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.85,
        cameraType: ImagePicker.CameraType.back,
      };
      let res: ImagePicker.ImagePickerResult;
      // web has no camera and needs the picker to open synchronously (an
      // await before it breaks the user-gesture) → go straight to the library
      if (Platform.OS === 'web' || kind === 'gallery') {
        res = await ImagePicker.launchImageLibraryAsync(opts);
        boundary.assertOwned();
      } else {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        boundary.assertOwned();
        res = perm.granted
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
        boundary.assertOwned();
      }
      if (!res.canceled && res.assets[0]) {
        const asset = res.assets[0];
        setPhotoUri(asset.uri);
        setOriginalRatio(asset.width && asset.height ? asset.width / asset.height : null);
        setPhotoKind(kind);
        setMode('photo');
        releaseProcessedPhotoAfterReplacement();
      }
    } catch {
      try {
        boundary.assertOwned();
      } catch {
        return;
      }
      Alert.alert('Could not open camera', 'Try choosing a photo from your gallery, or use Map only.');
    }
  }

  async function capture(result: 'base64' | 'tmpfile'): Promise<string | null> {
    if (Platform.OS === 'web' || !cardRef.current) return null;
    const boundary = ownerBoundary();
    boundary.assertOwned();
    try {
      // 4:5 at 1080×1350 — Instagram/FB portrait HD; near-lossless jpg so the
      // stats stay crisp (the on-screen preview renders small)
      const captureSize = shareStudioCaptureSize.current ?? exportSize;
      const captured = await captureRef(cardRef, {
        format: 'jpg',
        quality: 0.97,
        result,
        width: captureSize.width,
        height: captureSize.height,
      });
      boundary.assertOwned();
      return captured;
    } catch {
      boundary.assertOwned();
      return null;
    }
  }

  async function currentRunMedia(): Promise<RunMediaCacheItem> {
    const boundary = ownerBoundary();
    boundary.assertOwned();
    if (stagedMedia.current) return stagedMedia.current;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generation = renderGeneration.current;
      const result = await stageRunMediaForGeneration(generation, {
        capture: () => capture('tmpfile'),
        currentGeneration: () => renderGeneration.current,
        stage: (uri) => stageRunMedia(uri),
        release: runMediaCache.release,
      });
      try {
        boundary.assertOwned();
      } catch (cause) {
        if (result.status === 'ready') {
          await runMediaCache.release(result.item.id, 'editor').catch(() => {});
        }
        throw cause;
      }
      if (result.status === 'stale') continue;

      stagedMedia.current = result.item;
      return result.item;
    }
    throw new Error('The run image changed while rendering. Try again.');
  }

  async function discardStagedEditorMedia(): Promise<void> {
    const item = stagedMedia.current;
    stagedMedia.current = null;
    if (item) await runMediaCache.release(item.id, 'editor');
  }

  async function closeEditor() {
    await safeCloseRef.current!();
  }

  async function onDestination(destination: RunMediaDestination, draft?: ShareStudioResult) {
    const ran = await shareOperationGate.run(async () => {
      const boundary = ownerBoundary();
      boundary.assertOwned();
      setActiveDestination(destination);
      try {
        if (destination === 'feed' && (!run.activityId || activityQueued)) {
          throw new Error(
            feedDisabledReason ??
              'Save a real GPS activity on your phone before posting a verified Run card.',
          );
        }
        if (destination === 'feed' && !draft) {
          throw new Error('Review this run in Share Studio before posting.');
        }
        const feedContext =
          destination === 'feed'
            ? (feedOperation.current = retainFeedOperationContext(
                feedOperation.current,
                () => ({
                  operationId: draft!.operationId,
                  metadata: {
                    body: draft!.caption || caption,
                    showPublicly: draft!.showPublicly,
                    activityId: run.activityId!,
                    shareData: {
                      format: shareStudioRunInputs.current?.format ?? format,
                      media_fit: shareStudioRunInputs.current?.mediaFit ?? mediaFit,
                      route_ends_visible: shareStudioRunInputs.current?.showEnds ?? showEnds,
                      layout: shareStudioRunInputs.current?.appearance.layout ?? layout,
                      font: shareStudioRunInputs.current?.appearance.font ?? cardFont,
                      recorded_time_visible:
                        shareStudioRunInputs.current?.appearance.showTimestamp ?? showTimestamp,
                      card_theme: run.cardTheme,
                    },
                    selfie: draft!.media.kind === 'photo'
                      ? draft!.media.source === 'selfie'
                      : photoKind === 'selfie',
                    distanceKm: run.distance / 1000,
                  },
                }),
              ))
            : null;
        const operationId = feedContext?.operationId ?? null;

        // react-native-view-shot cannot provide a managed local file on web.
        // Preserve the existing text-share and image-less Feed behavior there.
        if (Platform.OS === 'web') {
          if (destination === 'share') {
            await boundary.runSideEffect(() =>
              Share.share({ message: `${caption}\n\n#accountability` }),
            );
            boundary.assertOwned();
            void completionEffects
              .complete('share', photoKind === 'selfie', run.distance / 1000)
              .catch(() => {});
            return;
          }
          if (destination === 'feed') {
            await boundary.runSideEffect(() => createRunPostIdempotent({
              body: feedContext!.metadata.body,
              imageUrl: null,
              operationId: operationId!,
              showPublicly: feedContext!.metadata.showPublicly,
              activityId: feedContext!.metadata.activityId,
              shareData: feedContext!.metadata.shareData,
              expectedOwnerId: run.ownerId!,
            }));
            boundary.assertOwned();
            void completionEffects
              .complete(
                'feed',
                feedContext!.metadata.selfie,
                feedContext!.metadata.distanceKm,
              )
              .catch(() => {});
            Alert.alert('Posted 🎉', 'Your run is on your feed.');
            return;
          }
          throw new Error('Saving run images is available on your phone.');
        }

        const item = await currentRunMedia();
        boundary.assertOwned();
        const result = await persistRunMedia(destination, item, {
          retain: runMediaCache.retain,
          release: runMediaCache.release,
          saveToMemories: (uri) =>
            boundary.runSideEffect(() =>
              saveImageToMemories(uri, null, null, run.ownerId!),
            ),
          requestPhonePermission: () =>
            boundary.runSideEffect(() =>
              requestPhonePhotoPermission(),
            ),
          saveToPhone: (uri) =>
            boundary.runSideEffect(() => createPhonePhoto(uri)),
          share: async (uri) => {
            boundary.assertOwned();
            if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
              boundary.assertOwned();
              await boundary.runSideEffect(() => Sharing.shareAsync(uri, {
                mimeType: 'image/jpeg',
                dialogTitle: 'Share your run',
              }));
              boundary.assertOwned();
              return;
            }
            await boundary.runSideEffect(() =>
              Share.share({ message: `${caption}\n\n#accountability` }),
            );
            boundary.assertOwned();
          },
          findExistingFeedPost: () =>
            boundary.runSideEffect(() =>
              operationId
                ? findMyPostByOperationId(operationId)
                : Promise.resolve(null),
            ),
          uploadToFeed: async (uri) => {
            return uploadRunFeedImage({
              uri,
              operationId: operationId ?? undefined,
              expectedOwnerId: run.ownerId!,
            }, {
              readBase64: async (sourceUri) => new File(sourceUri).base64(),
              uploadPostImage,
              assertOwned: boundary.assertOwned,
            });
          },
          createFeedPost: (imageUrl) =>
            boundary.runSideEffect(() => createRunPostIdempotent({
              body: feedContext!.metadata.body,
              imageUrl,
              operationId: operationId!,
              showPublicly: feedContext!.metadata.showPublicly,
              activityId: feedContext!.metadata.activityId,
              shareData: feedContext!.metadata.shareData,
              expectedOwnerId: run.ownerId!,
            })),
        });
        boundary.assertOwned();

        if (result.persisted) hasPersistentDestination.current = true;
        if (result.persisted) {
          boundary.assertOwned();
          void completionEffects
            .complete(
              destination,
              feedContext?.metadata.selfie ?? photoKind === 'selfie',
              feedContext?.metadata.distanceKm ?? run.distance / 1000,
            )
            .catch(() => {});
          if (destination === 'feed') feedOperation.current = null;
        }

        if (destination === 'share' && !hasPersistentDestination.current) {
          await discardStagedEditorMedia();
        }

        if (destination === 'feed') {
          const tmp = await capture('tmpfile');
          boundary.assertOwned();
          promptCrossShare(feedContext!.metadata.body, tmp);
        }
      } finally {
        setActiveDestination(null);
      }
    });
    if (!ran) throw new Error('Another run-image action is already in progress.');
  }

  async function onStoryDestination(): Promise<void> {
    const ran = await shareOperationGate.run(async () => {
      const boundary = ownerBoundary();
      boundary.assertOwned();
      setActiveDestination('share');
      try {
        if (Platform.OS === 'web') {
          throw new Error('Adding a run card to My Day is available on your phone.');
        }
        const item = await currentRunMedia();
        boundary.assertOwned();
        const base64 = await new File(item.uri).base64();
        boundary.assertOwned();
        const operation = (storyOperation.current = retainAchievementStoryOperation(
          storyOperation.current,
          { ...completionPayload, mediaUri: item.uri },
          createRunMediaOperationId,
        ));
        await boundary.runSideEffect(() => addStoryIdempotent({
          expectedOwnerId: run.ownerId!,
          operationId: operation.operationId,
          base64,
          ext: 'jpg',
          caption,
        }));
        boundary.assertOwned();
        hasPersistentDestination.current = true;
        await closeEditor();
      } finally {
        setActiveDestination(null);
      }
    });
    if (!ran) throw new Error('Another run-image action is already in progress.');
  }

  async function publishRunDraft(draft: ShareStudioResult): Promise<void> {
    const boundary = ownerBoundary();
    boundary.assertOwned();
    if (draft.ownerId !== run.ownerId) throw new Error('Account changed.');
    const frozen = shareStudioRunInputs.current;
    if (!frozen) throw new Error('The reviewed Run preview is no longer available.');
    const reviewed = runShareRenderModel(frozen, draft.media);
    shareStudioCaptureSize.current = runShareExportSize(
      reviewed.format,
      reviewed.presentation.originalRatio,
    );
    setFormat(reviewed.format);
    setMediaFit(reviewed.mediaFit);
    setShowEnds(reviewed.showEnds);
    setLayout(reviewed.appearance.layout);
    setCardFont(reviewed.appearance.font);
    setShowTimestamp(reviewed.appearance.showTimestamp);
    if (draft.media.kind === 'photo') {
      applyRunSharePresentation(shareMediaOverride.current!.stage(
        frozen.presentation,
        processedPhotoMedia.current,
        {
          operationId: draft.operationId,
          uri: draft.media.uri,
          source: draft.media.source,
          width: draft.media.width,
          height: draft.media.height,
        },
      ));
    } else {
      applyRunSharePresentation(reviewed.presentation);
    }
    await nextRunSharePaint();
    boundary.assertOwned();
    await onDestination('feed', draft);
    const committed = shareMediaOverride.current!.commit();
    if (committed) {
      processedPhotoMedia.current = null;
      if (committed.releasePrevious) {
        await runMediaCache.release(committed.releasePrevious.id, 'editor').catch(() => {});
      }
    }
    if (draft.media.kind === 'photo') {
      await draft.media.release().catch(() => {});
    }
    setShareStudioVisible(false);
    shareStudioRunInputs.current = null;
    shareStudioCaptureSize.current = null;
    await closeEditor();
  }

  function cancelRunShareStudio(): void {
    const restored = shareMediaOverride.current!.cancel();
    if (restored) {
      processedPhotoMedia.current = restored.processedPhoto;
      applyRunSharePresentation(restored.presentation);
    }
    feedOperation.current = null;
    shareStudioRunInputs.current = null;
    shareStudioCaptureSize.current = null;
    setShareStudioVisible(false);
  }

  function openFeedStudio(): void {
    feedOperation.current = null;
    shareStudioRunInputs.current = freezeRunShareRenderInputs({
      presentation: { mode, photoUri, photoKind, originalRatio },
      format,
      mediaFit,
      showEnds,
      appearance: cardAppearance,
      points: cardPoints,
      distanceM: run.distance,
      durationS: run.elapsed,
    });
    setShareStudioVisible(true);
  }

  function applyRunSharePresentation(presentation: RunSharePresentation): void {
    setMode(presentation.mode);
    setPhotoUri(presentation.photoUri);
    setPhotoKind(presentation.photoKind);
    setOriginalRatio(presentation.originalRatio);
  }

  function toggleRouteEndpointPrivacy(): void {
    const intent = routeEndpointVisibilityIntent(showEnds);
    if (!intent.requiresConfirmation) {
      setShowEnds(intent.next);
      return;
    }
    Alert.alert(
      'Show start and finish points?',
      'These points can reveal where you live, work, or regularly exercise. Only continue if you are comfortable sharing them.',
      [
        { text: 'Keep hidden', style: 'cancel' },
        { text: 'Show points', style: 'destructive', onPress: () => setShowEnds(intent.next) },
      ],
    );
  }

  if (!ownerMatches) {
    return (
      <View
        style={styles.ownerBoundary}
        accessibilityLiveRegion="polite"
      >
        <Ionicons name="shield-checkmark" size={24} color={LIME} />
        <Text style={styles.ownerBoundaryText}>
          Sign in as the recording owner to continue
        </Text>
        <Pressable
          onPress={() => void closeEditor()}
          style={styles.ownerBoundaryClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.ownerBoundaryCloseText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  if (beautyStage === 'camera') {
    return (
      <View style={styles.beautyOverlay}>
        <View style={styles.beautyCameraHeader}>
          <Pressable
            accessibilityLabel="Cancel selfie"
            accessibilityRole="button"
            onPress={() => {
              setBeautyStage(null);
              setBeautySource(null);
            }}
            style={styles.beautyCancel}
          >
            <Text style={styles.beautyCancelText}>Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.headerTitle}>
            Take a selfie
          </Text>
          <View style={styles.beautyHeaderSpacer} />
        </View>
        <View style={styles.beautyCamera}>
          <PlatformBeautyCamera
            settings={{ ...DEFAULT_BEAUTY }}
            onCapture={acceptBeautyCapture}
            onError={(error: Error) =>
              Alert.alert(
                'Camera unavailable',
                error.message ||
                  'Try again, or use Photo to choose from your gallery.',
              )
            }
          />
        </View>
      </View>
    );
  }

  if (beautyStage === 'editor' && beautySource) {
    return (
      <BeautyEditor
        source={beautySource}
        ownerToken={run.ownerId!}
        currentOwnerToken={currentOwnerToken}
        onSourceLeaseAccepted={() =>
          capturedSourceLeases.current!.transferToEditor(beautySource)
        }
        onDone={(processed) =>
          acceptProcessedBeautyPhoto(beautySource, processed)
        }
        onRetake={() => {
          setBeautySource(null);
          setBeautyStage('camera');
        }}
        onSettingsChange={invalidateStagedBeautyExport}
      />
    );
  }

  return (
    <ScrollView
      style={styles.overlay}
      contentContainerStyle={styles.overlayContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Share your run</Text>
        <Pressable
          onPress={() => void closeEditor()}
          style={styles.skipBtn}
          accessibilityRole="button"
          accessibilityLabel="Skip sharing"
          disabled={busy}
        >
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      {syncPresentation ? (
        <View style={styles.savedStatus} accessibilityLiveRegion="polite">
          <Ionicons name="phone-portrait-outline" size={15} color={LIME} />
          <View>
            <Text style={styles.savedTitle}>{syncPresentation.title}</Text>
            <Text style={styles.savedDetail}>{syncDetail}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.preview}>
        <RunCard
          ref={cardRef}
          mode={mode}
          photoUri={photoUri}
          distanceM={run.distance}
          durationS={run.elapsed}
          points={cardPoints}
          width={cardWidth}
          aspectRatio={cardRatio}
          mediaFit={mediaFit}
          layout={layout}
          font={cardFont}
          theme={run.cardTheme}
          title={run.title}
          completedAt={run.completedAt}
          showTimestamp={showTimestamp}
          showEndpoints={showEnds}
        />
        <Pressable
          style={[
            styles.changeBackgroundButton,
            runCardBackgroundButtonPlacement(layout),
          ]}
          onPress={() => setBackgroundPickerVisible(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Change Run card background"
          accessibilityHint="Choose the route map, take a photo, take a selfie, or choose from your gallery"
          accessibilityState={{ disabled: busy }}
        >
          <Ionicons name="camera-outline" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.appearanceRow}>
        <RunShareOptionSelect
          label="Layout"
          value={layout}
          options={RUN_SHARE_LAYOUTS}
          onChange={setLayout}
          disabled={busy}
        />
        <RunShareOptionSelect
          label="Font"
          value={cardFont}
          options={RUN_SHARE_FONTS}
          onChange={setCardFont}
          disabled={busy}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.formatRow}
        accessibilityLabel="Run card orientation"
      >
        {RUN_SHARE_FORMATS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setFormat(item.id)}
            disabled={busy}
            style={[styles.formatChip, format === item.id && styles.formatChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: format === item.id, disabled: busy }}
            accessibilityLabel={`${item.label}, ${item.short}`}
          >
            <Text style={[styles.formatLabel, format === item.id && styles.formatLabelActive]}>
              {item.label}
            </Text>
            <Text style={[styles.formatRatio, format === item.id && styles.formatLabelActive]}>
              {item.short}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {mode === 'photo' ? (
        <Pressable
          onPress={() => setMediaFit((fit) => (fit === 'cover' ? 'contain' : 'cover'))}
          disabled={busy}
          style={[styles.fitControl, busy && styles.dim]}
          accessibilityRole="switch"
          accessibilityState={{ checked: mediaFit === 'contain', disabled: busy }}
          accessibilityLabel="Fit the whole photo inside the selected orientation"
        >
          <Ionicons name={mediaFit === 'cover' ? 'crop-outline' : 'scan-outline'} size={15} color="#cbd5e1" />
          <Text style={styles.fitText}>{mediaFit === 'cover' ? 'Crop to fill' : 'Fit whole photo'}</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.preferenceRow}
        onPress={() => setShowTimestamp((visible) => !visible)}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityState={{ checked: showTimestamp, disabled: busy }}
        accessibilityLabel="Show recorded date and time"
      >
        <Ionicons name="time-outline" size={17} color={showTimestamp ? LIME : '#94a3b8'} />
        <View style={styles.preferenceCopy}>
          <Text style={styles.preferenceTitle}>Show recorded date & time</Text>
          <Text style={styles.preferenceDetail}>Run duration always stays visible</Text>
        </View>
        <View style={[styles.checkbox, showTimestamp && styles.checkboxActive]}>
          {showTimestamp ? <Ionicons name="checkmark" size={15} color="#101319" /> : null}
        </View>
      </Pressable>

      {/* privacy: start & end hidden by default; user can opt to show them */}
      <Pressable
        style={styles.preferenceRow}
        onPress={toggleRouteEndpointPrivacy}
        disabled={busy}
        accessibilityRole="switch"
        accessibilityState={{ checked: !showEnds, disabled: busy }}
        accessibilityLabel="Hide start and finish points"
      >
        <Ionicons
          name={showEnds ? 'eye-outline' : 'shield-checkmark'}
          size={17}
          color={showEnds ? '#FF966F' : LIME}
        />
        <View style={styles.preferenceCopy}>
          <Text style={styles.preferenceTitle}>Hide start & finish points</Text>
          <Text style={styles.preferenceDetail}>
            {showEnds ? 'Visible — your location privacy may be exposed' : 'Recommended for privacy'}
          </Text>
        </View>
        <View style={[styles.checkbox, !showEnds && styles.checkboxActive]}>
          {!showEnds ? <Ionicons name="checkmark" size={15} color="#101319" /> : null}
        </View>
      </Pressable>

      <Modal
        visible={backgroundPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBackgroundPickerVisible(false)}
      >
        <Pressable
          style={styles.backgroundBackdrop}
          onPress={() => setBackgroundPickerVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Close background choices"
        >
          <View style={styles.backgroundSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.backgroundSheetHeader}>
              <View>
                <Text accessibilityRole="header" style={styles.backgroundTitle}>Change background</Text>
                <Text style={styles.backgroundHint}>Your route and run stats stay visible</Text>
              </View>
              <Pressable
                style={styles.backgroundClose}
                onPress={() => setBackgroundPickerVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close background choices"
              >
                <Ionicons name="close" size={21} color="#D8E2EA" />
              </Pressable>
            </View>
            <View style={styles.modeRow}>
              <ModeBtn
                icon="map-outline"
                label="Route map"
                active={mode === 'map'}
                onPress={() => {
                  setPhotoUri(null);
                  setPhotoKind(null);
                  setMode('map');
                  releaseProcessedPhotoAfterReplacement();
                  setBackgroundPickerVisible(false);
                }}
                disabled={busy}
              />
              <ModeBtn
                icon="happy-outline"
                label="Selfie"
                active={mode === 'photo' && photoKind === 'selfie'}
                onPress={() => {
                  setBackgroundPickerVisible(false);
                  void addPhoto('selfie');
                }}
                disabled={busy}
              />
              <ModeBtn
                icon="camera-outline"
                label="Camera"
                active={mode === 'photo' && photoKind === 'place'}
                onPress={() => {
                  setBackgroundPickerVisible(false);
                  void addPhoto('place');
                }}
                disabled={busy}
              />
              <ModeBtn
                icon="images-outline"
                label="Gallery"
                active={mode === 'photo' && photoKind === 'gallery'}
                onPress={() => {
                  setBackgroundPickerVisible(false);
                  void addPhoto('gallery');
                }}
                disabled={busy}
              />
            </View>
          </View>
        </Pressable>
      </Modal>

      <RunMediaActions
        onDestination={onDestination}
        onContinueToFeed={openFeedStudio}
        onMyDay={onStoryDestination}
        disabled={busy}
        activityQueued={activityQueued}
        feedDisabledReason={feedDisabledReason}
      />
      <ShareStudio
        visible={shareStudioVisible}
        expectedOwnerId={run.ownerId!}
        presentation="feed-composer"
        context={{
          title: run.title,
          date: new Date(run.completedAt).toLocaleDateString(),
          metrics: [
            { label: 'Distance', value: `${formatKm(run.distance)} km`, sensitivity: 'standard' },
            { label: 'Time', value: formatDurationLong(run.elapsed), sensitivity: 'standard' },
            { label: 'Pace', value: `${formatPace(run.distance, run.elapsed)} /km`, sensitivity: 'standard' },
          ],
        }}
        defaultCaption={caption}
        unavailableReason={feedShare.reason}
        destinationPreviewAspectRatio={(state) => {
          const frozen = shareStudioRunInputs.current;
          if (!frozen) return 4 / 5;
          const preview = runShareRenderModel(frozen, state.media);
          return runShareRatio(preview.format, preview.presentation.originalRatio);
        }}
        renderDestinationPreview={(state) => {
          const frozen = shareStudioRunInputs.current ?? freezeRunShareRenderInputs({
            presentation: { mode, photoUri, photoKind, originalRatio },
            format,
            mediaFit,
            showEnds,
            appearance: cardAppearance,
            points: cardPoints,
            distanceM: run.distance,
            durationS: run.elapsed,
          });
          const preview = runShareRenderModel(frozen, state.media);
          return (
            <RunCard
              mode={preview.presentation.mode}
              photoUri={preview.presentation.photoUri}
              distanceM={preview.distanceM}
              durationS={preview.durationS}
              points={preview.points as Pt[]}
              width={cardWidth}
              aspectRatio={runShareRatio(preview.format, preview.presentation.originalRatio)}
              mediaFit={preview.mediaFit}
              layout={preview.appearance.layout}
              font={preview.appearance.font}
              theme={preview.appearance.theme}
              title={run.title}
              completedAt={preview.appearance.completedAt}
              showTimestamp={preview.appearance.showTimestamp}
              showEndpoints={preview.showEnds}
            />
          );
        }}
        onContinue={publishRunDraft}
        onCancel={cancelRunShareStudio}
      />
    </ScrollView>
  );
}

function nextRunSharePaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function ModeBtn({
  icon,
  label,
  active,
  onPress,
  disabled,
}: {
  icon: 'happy-outline' | 'camera-outline' | 'images-outline' | 'map-outline';
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.modeBtn, active && styles.modeBtnActive]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
    >
      <Ionicons name={icon} size={18} color={active ? '#101319' : '#cbd5e1'} />
      <Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PlatformBeautyCamera(props: BeautyCameraProps) {
  // Kept lazy so pure RunShareSheet helper tests never initialize native camera
  // modules. Metro resolves this path to .native or .web for the app bundle.
  const CameraComponent = (
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Metro selects the native/web camera at runtime.
    require('./beauty/BeautyCamera') as {
      BeautyCamera: ComponentType<BeautyCameraProps>;
    }
  ).BeautyCamera;
  return <CameraComponent {...props} />;
}

const styles = StyleSheet.create({
  beautyOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0b0e14',
    paddingTop: 42,
    zIndex: 30,
  },
  beautyCameraHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  beautyCancel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
  },
  beautyCancelText: {
    color: '#e2e8f0',
    fontFamily: font.bold,
    fontSize: 14,
  },
  beautyHeaderSpacer: { minHeight: 44, minWidth: 72 },
  beautyCamera: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0b0e14',
  },
  overlayContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
  },
  ownerBoundary: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0b0e14',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 28,
  },
  ownerBoundaryText: {
    color: '#fff',
    fontFamily: font.bold,
    fontSize: 16,
    textAlign: 'center',
  },
  ownerBoundaryClose: {
    minWidth: 96,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: LIME,
    paddingHorizontal: 20,
  },
  ownerBoundaryCloseText: {
    color: '#101319',
    fontFamily: font.extrabold,
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
  },
  headerTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 18 },
  savedStatus: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(198,242,78,0.1)',
  },
  savedTitle: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  savedDetail: { color: '#94a3b8', fontFamily: font.medium, fontSize: 11 },
  skip: { color: '#94a3b8', fontFamily: font.bold, fontSize: 15 },
  skipBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  preview: { position: 'relative', justifyContent: 'center' },
  changeBackgroundButton: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,20,28,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
  },
  appearanceRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
    gap: 8,
  },
  formatRow: { gap: 7, paddingHorizontal: 2 },
  formatChip: {
    minWidth: 68,
    minHeight: 44,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,36,48,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formatChipActive: { borderColor: LIME, backgroundColor: 'rgba(198,242,78,0.14)' },
  formatLabel: { color: '#e2e8f0', fontFamily: font.bold, fontSize: 12 },
  formatRatio: { color: '#94a3b8', fontFamily: font.medium, fontSize: 10 },
  formatLabelActive: { color: LIME },
  fitControl: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
  fitText: { color: '#cbd5e1', fontFamily: font.semibold, fontSize: 12 },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 48,
    width: '100%',
    maxWidth: 560,
    borderRadius: 13,
    backgroundColor: '#13212B',
    borderWidth: 1,
    borderColor: '#2E414F',
  },
  preferenceCopy: { flex: 1, minWidth: 0, paddingVertical: 8 },
  preferenceTitle: { color: '#F7FAFC', fontFamily: font.bold, fontSize: 12 },
  preferenceDetail: { marginTop: 2, color: '#92A5B2', fontFamily: font.medium, fontSize: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5C6D78',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: LIME, borderColor: LIME },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignSelf: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
  },
  backgroundBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.68)',
    padding: 16,
  },
  backgroundSheet: {
    borderRadius: 23,
    backgroundColor: '#101D27',
    borderWidth: 1,
    borderColor: '#304553',
    padding: 16,
    gap: 16,
  },
  backgroundSheetHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  backgroundTitle: { color: '#FFFFFF', fontFamily: font.extrabold, fontSize: 18 },
  backgroundHint: { marginTop: 3, color: '#91A4B0', fontFamily: font.medium, fontSize: 11 },
  backgroundClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1B2A35' },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(30,36,48,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
    minHeight: 48,
    minWidth: 128,
    flexGrow: 1,
  },
  modeBtnActive: { backgroundColor: LIME, borderColor: LIME },
  modeText: { color: '#cbd5e1', fontFamily: font.bold, fontSize: 13.5 },
  modeTextActive: { color: '#101319' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: LIME,
    borderRadius: 999,
    paddingVertical: 16,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
  },
  primaryText: { color: '#101319', fontFamily: font.extrabold, fontSize: 16 },
  secondary: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: 14,
    alignSelf: 'stretch',
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  secondaryText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  dim: { opacity: 0.6 },
});
