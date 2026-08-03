import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import { Camera as FaceDetectorCamera } from 'react-native-vision-camera-face-detector';

import {
  getBeautyCameraCapability,
  reconcileBeautyCameraDeviceLookup,
} from './cameraCapability';

const DEVICE_LOOKUP_GRACE_MS = 1_500;
const StableFaceDetectorCamera = memo(FaceDetectorCamera);

export function BeautyCameraSmoke() {
  const {
    status: permissionStatus,
    requestPermission,
  } = useCameraPermission();
  const frontDevice = useCameraDevice('front');
  const permissionRequestStarted = useRef(false);
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
  const [faceCount, setFaceCount] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  const requestCameraAccess = useCallback(() => {
    if (permissionRequestStarted.current) {
      return;
    }

    permissionRequestStarted.current = true;
    setIsRequestingPermission(true);

    void requestPermission()
      .catch(() => {
        setCameraError(
          'Camera permission could not be requested. Please try again.',
        );
      })
      .finally(() => {
        setIsRequestingPermission(false);
      });
  }, [requestPermission]);

  useEffect(() => {
    if (permissionStatus !== 'not-determined') {
      return;
    }

    requestCameraAccess();
  }, [permissionStatus, requestCameraAccess]);

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

  const capability = getBeautyCameraCapability({
    permissionStatus,
    isRequestingPermission,
    hasFrontCamera: frontDevice != null,
    isDeviceLookupSettled: deviceLookup.isSettled,
    cameraError,
  });

  const handleFacesDetected = useCallback((faces: readonly unknown[]) => {
    setFaceCount((currentCount) =>
      currentCount === faces.length ? currentCount : faces.length,
    );
  }, []);

  const handleCameraError = useCallback((error: Error) => {
    setCameraError(
      error.message || 'The camera preview stopped unexpectedly. Please retry.',
    );
  }, []);

  const handleRetry = useCallback(() => {
    setCameraError(null);
    setFaceCount(0);
    setCameraAttempt((attempt) => attempt + 1);
    if (permissionStatus === 'not-determined') {
      permissionRequestStarted.current = false;
      requestCameraAccess();
    }
  }, [permissionStatus, requestCameraAccess]);

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings().catch(() => {
      setCameraError('Settings could not be opened on this device.');
    });
  }, []);

  if (!capability.canRenderCamera || !frontDevice) {
    const isLoading =
      capability.code === 'requesting-permission' ||
      capability.code === 'finding-device';

    return (
      <View style={styles.statusScreen}>
        {isLoading ? (
          <ActivityIndicator
            accessibilityLabel="Preparing camera"
            color="#F7E4B5"
            size="large"
          />
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="header"
          style={styles.statusTitle}
        >
          {capability.title}
        </Text>
        <Text style={styles.statusMessage}>{capability.message}</Text>
        {capability.canOpenSettings ? (
          <Pressable
            accessibilityHint="Opens this app's system settings"
            accessibilityRole="button"
            onPress={handleOpenSettings}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>Open Settings</Text>
          </Pressable>
        ) : null}
        {capability.code === 'camera-error' ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleRetry}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>Retry camera</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StableFaceDetectorCamera
        key={cameraAttempt}
        cameraFacing="front"
        device={frontDevice}
        isActive={appState === 'active'}
        onError={handleCameraError}
        onFacesDetected={handleFacesDetected}
        outputResolution="preview"
        performanceMode="fast"
        runClassifications={false}
        runContours={false}
        runLandmarks={false}
        style={StyleSheet.absoluteFill}
        trackingEnabled={false}
      />
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="summary"
        style={styles.badge}
      >
        <Text style={styles.badgeValue}>{faceCount}</Text>
        <Text style={styles.badgeLabel}>
          {faceCount === 1 ? 'face detected' : 'faces detected'}
        </Text>
      </View>
      <View style={styles.privacyNotice}>
        <Text style={styles.privacyTitle}>Private preview</Text>
        <Text style={styles.privacyCopy}>
          Frames and face details are processed on this device and are not
          saved or uploaded.
        </Text>
      </View>
    </View>
  );
}

export default BeautyCameraSmoke;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#11110F',
    flex: 1,
    minHeight: 320,
    overflow: 'hidden',
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
  button: {
    backgroundColor: '#F7E4B5',
    borderRadius: 999,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  buttonLabel: {
    color: '#191711',
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(17, 17, 15, 0.78)',
    borderColor: 'rgba(255, 250, 236, 0.25)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  badgeValue: {
    color: '#F7E4B5',
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  badgeLabel: {
    color: '#FFFAEC',
    fontSize: 14,
    fontWeight: '600',
  },
  privacyNotice: {
    backgroundColor: 'rgba(17, 17, 15, 0.86)',
    borderColor: 'rgba(255, 250, 236, 0.2)',
    borderRadius: 18,
    borderWidth: 1,
    bottom: 16,
    left: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
    position: 'absolute',
    right: 16,
  },
  privacyTitle: {
    color: '#FFFAEC',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  privacyCopy: {
    color: '#D7D1C2',
    fontSize: 13,
    lineHeight: 18,
  },
});
