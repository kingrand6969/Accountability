import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIsFocused } from 'expo-router';
import { Directory, File, Paths } from 'expo-file-system';
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type Photo,
} from 'react-native-vision-camera';

import { runMediaCache } from '../saveRunMedia';
import {
  getBeautyCameraCapability,
  reconcileBeautyCameraDeviceLookup,
  type BeautyCameraCapability,
} from './cameraCapability';
import {
  BEAUTY_CAPTURE_TARGET_RESOLUTION,
  canRequestCameraPermission,
  createCaptureLeaseTransaction,
  createPermissionAttemptController,
  createSingleFlightCapture,
  resolveBeautyCameraMode,
  type BeautyCameraFeatureCapabilities,
  type BeautyCameraMode,
  type BeautyCaptureSource,
} from './cameraMode';
import {
  assertBeautySourceBytes,
  NATIVE_BEAUTY_RENDER_CAPABILITIES,
} from './renderBeautyImage.native';
import type { BeautySettings } from './types';

const DEVICE_LOOKUP_GRACE_MS = 1_500;

export type BeautyCameraStatus = Readonly<{
  camera: BeautyCameraCapability;
  features: BeautyCameraFeatureCapabilities;
  mode: BeautyCameraMode;
}>;

export type BeautyCameraProps = Readonly<{
  settings: BeautySettings;
  onCapture: (
    source: BeautyCaptureSource,
  ) => void | Promise<void>;
  onCapabilityChange?: (status: BeautyCameraStatus) => void;
  onError?: (error: Error) => void;
}>;

export function BeautyCamera({
  settings: _settings,
  onCapture,
  onCapabilityChange,
  onError,
}: BeautyCameraProps) {
  const { status: permissionStatus, requestPermission } =
    useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const photoOutput = usePhotoOutput({
    containerFormat: 'jpeg',
    quality: 1,
    qualityPrioritization: 'quality',
    targetResolution: BEAUTY_CAPTURE_TARGET_RESOLUTION,
  });
  const isFocused = useIsFocused();
  const mounted = useRef(true);
  const permissionRequestStarted = useRef(false);
  const permissionController = useRef(createPermissionAttemptController());
  const captureLifecycleActive = useRef(false);
  const captureAbort = useRef<AbortController | null>(null);
  const captureImplementation = useRef<() => Promise<BeautyCaptureSource>>(
    async () => {
      throw new Error('The camera is not ready yet.');
    },
  );
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [deviceLookup, setDeviceLookup] = useState(() => ({
    permissionStatus,
    isSettled: permissionStatus === 'authorized' && frontDevice != null,
  }));
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [permissionAttemptNonce, setPermissionAttemptNonce] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  captureLifecycleActive.current = isFocused && appState === 'active';

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', setAppState);
    return () => {
      mounted.current = false;
      captureAbort.current?.abort();
      subscription.remove();
    };
  }, []);

  const reportError = useCallback(
    (value: unknown, fallback: string) => {
      const error =
        value instanceof Error
          ? value
          : new Error(fallback);
      const safeError = new Error(error.message || fallback);
      if (mounted.current) {
        setCameraError(safeError.message);
        onError?.(safeError);
      }
    },
    [onError],
  );

  const requestCameraAccess = useCallback(() => {
    if (
      !canRequestCameraPermission({
        permissionStatus,
        isFocused,
        appState,
        requestStarted: permissionRequestStarted.current,
        hasError: cameraError !== null,
      }) ||
      !permissionController.current.begin(permissionAttemptNonce)
    ) {
      return;
    }
    permissionRequestStarted.current = true;
    setIsRequestingPermission(true);
    void requestPermission()
      .catch((error) => {
        reportError(
          error,
          'Camera permission could not be requested. Please try again.',
        );
      })
      .finally(() => {
        permissionRequestStarted.current = false;
        permissionController.current.settle(permissionAttemptNonce);
        if (mounted.current) setIsRequestingPermission(false);
      });
  }, [
    appState,
    cameraError,
    isFocused,
    permissionAttemptNonce,
    permissionStatus,
    reportError,
    requestPermission,
  ]);

  useEffect(() => {
    requestCameraAccess();
  }, [requestCameraAccess]);

  const reconciledDeviceLookup = reconcileBeautyCameraDeviceLookup(
    deviceLookup,
    permissionStatus,
    frontDevice != null,
  );
  if (reconciledDeviceLookup !== deviceLookup) {
    setDeviceLookup(reconciledDeviceLookup);
  }

  useEffect(() => {
    if (permissionStatus !== 'authorized' || frontDevice) return;
    const timeout = setTimeout(() => {
      setDeviceLookup((current) =>
        current.permissionStatus === permissionStatus
          ? { ...current, isSettled: true }
          : current,
      );
    }, DEVICE_LOOKUP_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [frontDevice, permissionStatus]);

  const cameraCapability = useMemo(
    () =>
      getBeautyCameraCapability({
        permissionStatus,
        isRequestingPermission,
        hasFrontCamera: frontDevice != null,
        isDeviceLookupSettled: deviceLookup.isSettled,
        cameraError,
      }),
    [
      cameraError,
      deviceLookup.isSettled,
      frontDevice,
      isRequestingPermission,
      permissionStatus,
    ],
  );
  const mode = resolveBeautyCameraMode(NATIVE_BEAUTY_RENDER_CAPABILITIES);
  const status = useMemo<BeautyCameraStatus>(
    () => ({
      camera: cameraCapability,
      features: NATIVE_BEAUTY_RENDER_CAPABILITIES,
      mode,
    }),
    [cameraCapability, mode],
  );

  useEffect(() => {
    onCapabilityChange?.(status);
  }, [onCapabilityChange, status]);

  captureImplementation.current = async () => {
    if (!frontDevice || !cameraCapability.canRenderCamera) {
      throw new Error('The front camera is not ready yet.');
    }
    if (!isFocused || appState !== 'active') {
      throw new Error('Return to the camera before taking a photo.');
    }

    const controller = new AbortController();
    captureAbort.current?.abort();
    captureAbort.current = controller;
    let photo: Photo | null = null;
    let savedOutput: File | null = null;
    try {
      photo = await photoOutput.capturePhoto(
        { enableShutterSound: true },
        {},
      );
      throwIfCancelled(controller.signal, mounted.current);
      if (photo.isMirrored) {
        throw new Error(
          'This device returned a mirrored photo. Please retry the capture.',
        );
      }

      const orientation = cameraOrientationDegrees(photo.orientation);
      const imageSize =
        orientation === 90 || orientation === 270
          ? { width: photo.height, height: photo.width }
          : { width: photo.width, height: photo.height };
      const directory = new Directory(Paths.cache, 'run-share');
      directory.create({ idempotent: true, intermediates: true });
      const output = new File(directory, createCaptureFilename());
      await photo.saveToFileAsync(fileUriToPath(output.uri));
      savedOutput = output;
      assertBeautySourceBytes(output.size ?? Number.NaN);
      throwIfCancelled(controller.signal, mounted.current);
      const source = await createCaptureLeaseTransaction({
        register: () => runMediaCache.register(output.uri, 'editor'),
        isAlive: () =>
          mounted.current &&
          captureLifecycleActive.current &&
          !controller.signal.aborted,
        buildSource: (cacheItem) => ({
          cacheItemId: cacheItem.id,
          sourceUri: cacheItem.uri,
          imageSize,
          orientation,
          mirrored: false,
          faces: null,
        }),
        dispatch: onCapture,
        release: (id) => runMediaCache.release(id, 'editor'),
      })();
      savedOutput = null;
      return source;
    } catch (error) {
      if (savedOutput?.exists) {
        try {
          savedOutput.delete();
        } catch {
          // The managed cache lifecycle will remove an abandoned capture.
        }
      }
      throw error;
    } finally {
      photo?.dispose();
      if (captureAbort.current === controller) {
        captureAbort.current = null;
      }
    }
  };

  const singleFlightCapture = useMemo(
    () => createSingleFlightCapture(() => captureImplementation.current()),
    [],
  );
  const handleCapture = useCallback(() => {
    if (isCapturing) return;
    setIsCapturing(true);
    void singleFlightCapture()
      .catch((error) => {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          reportError(error, 'The photo could not be captured. Please retry.');
        }
      })
      .finally(() => {
        if (mounted.current) setIsCapturing(false);
      });
  }, [isCapturing, reportError, singleFlightCapture]);

  const handleRetry = () => {
    setCameraError(null);
    setCameraAttempt((attempt) => attempt + 1);
    setPermissionAttemptNonce((nonce) => nonce + 1);
  };

  if (!cameraCapability.canRenderCamera || !frontDevice) {
    const isLoading =
      cameraCapability.code === 'requesting-permission' ||
      cameraCapability.code === 'finding-device';
    return (
      <View style={styles.statusScreen}>
        {isLoading ? (
          <ActivityIndicator
            accessibilityLabel="Preparing camera"
            color="#F7E4B5"
            size="large"
          />
        ) : null}
        <Text accessibilityRole="header" style={styles.statusTitle}>
          {cameraCapability.title}
        </Text>
        <Text style={styles.statusMessage}>{cameraCapability.message}</Text>
        {cameraCapability.canOpenSettings ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void Linking.openSettings().catch((error) =>
                reportError(error, 'Settings could not be opened.'),
              );
            }}
            style={styles.actionButton}
          >
            <Text style={styles.actionLabel}>Open Settings</Text>
          </Pressable>
        ) : null}
        {cameraCapability.code === 'camera-error' ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleRetry}
            style={styles.actionButton}
          >
            <Text style={styles.actionLabel}>Retry camera</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View pointerEvents="none" style={styles.mirroredPreview}>
        <Camera
          key={cameraAttempt}
          device={frontDevice}
          isActive={isFocused && appState === 'active'}
          mirrorMode="off"
          onError={(error) =>
            reportError(
              error,
              'The camera preview stopped unexpectedly. Please retry.',
            )
          }
          outputs={[photoOutput]}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      </View>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Beauty after capture</Text>
        <Text style={styles.noticeCopy}>
          The live view is unfiltered. Your beauty settings are applied
          privately on this device after you take the photo.
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Take photo"
        accessibilityRole="button"
        disabled={isCapturing}
        onPress={handleCapture}
        style={[styles.shutter, isCapturing && styles.shutterDisabled]}
      >
        {isCapturing ? (
          <ActivityIndicator color="#191711" />
        ) : (
          <View style={styles.shutterCore} />
        )}
      </Pressable>
    </View>
  );
}

function cameraOrientationDegrees(
  orientation: Photo['orientation'],
): 0 | 90 | 180 | 270 {
  switch (orientation) {
    case 'right':
      return 90;
    case 'down':
      return 180;
    case 'left':
      return 270;
    default:
      return 0;
  }
}

function fileUriToPath(uri: string): string {
  const withoutScheme = decodeURIComponent(uri.replace(/^file:\/\//i, ''));
  return withoutScheme.replace(/^\/([A-Za-z]:\/)/, '$1');
}

function randomToken(): string {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
    .toString(36)
    .padStart(10, '0')
    .slice(-10);
}

function createCaptureFilename(): string {
  return `camera-original-${Date.now()}-${randomToken()}.jpg`;
}

function throwIfCancelled(signal: AbortSignal, isMounted: boolean): void {
  if (!signal.aborted && isMounted) return;
  const error = new Error('Camera capture was cancelled.');
  error.name = 'AbortError';
  throw error;
}

export default BeautyCamera;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#11110F',
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
  },
  mirroredPreview: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    transform: [{ scaleX: -1 }],
  },
  statusScreen: {
    alignItems: 'center',
    backgroundColor: '#11110F',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: 320,
    padding: 28,
  },
  statusTitle: {
    color: '#FFFAEC',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusMessage: {
    color: '#D7D1C2',
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 360,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#F7E4B5',
    borderRadius: 999,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  actionLabel: {
    color: '#191711',
    fontSize: 16,
    fontWeight: '700',
  },
  notice: {
    backgroundColor: 'rgba(17, 17, 15, 0.82)',
    borderColor: 'rgba(255, 250, 236, 0.2)',
    borderRadius: 16,
    borderWidth: 1,
    left: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    position: 'absolute',
    right: 16,
    top: 16,
  },
  noticeTitle: {
    color: '#FFFAEC',
    fontSize: 14,
    fontWeight: '700',
  },
  noticeCopy: {
    color: '#D7D1C2',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  shutter: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#F7E4B5',
    borderColor: '#FFFAEC',
    borderRadius: 42,
    borderWidth: 4,
    bottom: 24,
    height: 76,
    justifyContent: 'center',
    position: 'absolute',
    width: 76,
  },
  shutterCore: {
    backgroundColor: '#191711',
    borderRadius: 27,
    height: 54,
    width: 54,
  },
  shutterDisabled: {
    opacity: 0.65,
  },
});
