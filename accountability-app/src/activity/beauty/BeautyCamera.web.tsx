import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import type { BeautyCameraProps, BeautyCameraStatus } from './BeautyCamera.native';
import type { BeautyCaptureSource } from './cameraMode';

export const WEB_BEAUTY_CAMERA_STATUS = Object.freeze({
  camera: {
    code: 'device-unavailable',
    canRenderCamera: false,
    canOpenSettings: false,
    title: 'Choose a photo',
    message: 'Camera capture is not available here. Choose a photo instead.',
  },
  features: {
    livePreview: false,
    finalRender: false,
    maxFaces: 0,
  },
  mode: 'plain-camera',
} satisfies BeautyCameraStatus);

export function BeautyCamera({
  onCapture,
  onCapabilityChange,
  onError,
}: BeautyCameraProps) {
  useEffect(() => {
    onCapabilityChange?.(WEB_BEAUTY_CAMERA_STATUS);
  }, [onCapabilityChange]);

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri || !asset.width || !asset.height) {
        throw new Error('That photo could not be opened.');
      }
      const source: BeautyCaptureSource = {
        sourceUri: asset.uri,
        imageSize: { width: asset.width, height: asset.height },
        orientation: 0,
        mirrored: false,
        faces: null,
      };
      await onCapture(source);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error
          : new Error('That photo could not be opened.'),
      );
    }
  };

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Choose a photo
      </Text>
      <Text style={styles.message}>
        Live camera and beauty rendering are available in the mobile app. You
        can still choose an existing photo here.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void choosePhoto()}
        style={styles.button}
      >
        <Text style={styles.buttonLabel}>Choose photo</Text>
      </Pressable>
    </View>
  );
}

export default BeautyCamera;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#11110F',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    minHeight: 320,
    padding: 28,
  },
  title: {
    color: '#FFFAEC',
    fontSize: 22,
    fontWeight: '700',
  },
  message: {
    color: '#D7D1C2',
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 420,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#F7E4B5',
    borderRadius: 999,
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  buttonLabel: {
    color: '#191711',
    fontSize: 16,
    fontWeight: '700',
  },
});
