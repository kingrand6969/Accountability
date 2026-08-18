import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResolvedMediaUrl } from '../media/useResolvedMediaUrl';
import { CachedImage } from '../ui/CachedImage';
import { spacing } from '../ui/theme';
import type { BuddyCardPaletteTokens } from './palette';

const PHOTO_RING_SIZE = 95;
const PHOTO_SIZE = 84;

export function BuddyCardProfilePhoto({
  avatar,
  displayName,
  palette,
}: {
  avatar: string | null;
  displayName: string;
  palette: BuddyCardPaletteTokens;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const resolvedAvatar = useResolvedMediaUrl(avatar);
  const closeViewer = () => setViewerOpen(false);

  const photo = resolvedAvatar ? (
    <CachedImage
      uri={resolvedAvatar}
      style={styles.photo}
      contentFit="cover"
      accessibilityLabel={`${displayName}'s profile photo`}
    />
  ) : (
    <View
      testID="buddy-card-profile-photo-placeholder"
      style={[styles.photo, styles.placeholder, { backgroundColor: palette.surfaceTint }]}
    >
      <Ionicons name="person" size={35} color={palette.accent} />
    </View>
  );

  return (
    <>
      {resolvedAvatar ? (
        <Pressable
          testID="buddy-card-profile-photo-button"
          accessibilityRole="button"
          accessibilityLabel={`View ${displayName}'s profile photo`}
          accessibilityHint="Opens the photo full screen"
          onPress={() => setViewerOpen(true)}
          style={({ pressed }) => [
            styles.photoRing,
            { borderColor: palette.accent },
            pressed && styles.pressed,
          ]}
        >
          {photo}
        </Pressable>
      ) : (
        <View style={[styles.photoRing, { borderColor: palette.accent }]}>{photo}</View>
      )}

      {viewerOpen && resolvedAvatar ? (
        <Modal
          visible
          transparent
          animationType="fade"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={closeViewer}
        >
          <View
            testID="buddy-card-profile-photo-viewer"
            accessibilityViewIsModal
            style={styles.viewerBackdrop}
          >
            <SafeAreaView style={styles.viewerSafeArea}>
              <View style={styles.viewerToolbar}>
                <Pressable
                  testID="buddy-card-profile-photo-close"
                  accessibilityRole="button"
                  accessibilityLabel="Close profile photo"
                  onPress={closeViewer}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.closePressed]}
                >
                  <Ionicons name="close" size={30} color="#FFFFFF" />
                </Pressable>
              </View>
              <View style={styles.viewerImageFrame}>
                <CachedImage
                  uri={resolvedAvatar}
                  style={styles.fullPhoto}
                  contentFit="contain"
                  accessibilityLabel={`${displayName}'s profile photo, full screen`}
                  priority="high"
                />
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  photoRing: {
    width: PHOTO_RING_SIZE,
    height: PHOTO_RING_SIZE,
    padding: 3,
    borderWidth: 2,
    borderRadius: PHOTO_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerSafeArea: {
    flex: 1,
  },
  viewerToolbar: {
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closeButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closePressed: {
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  viewerImageFrame: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  fullPhoto: {
    width: '100%',
    height: '100%',
  },
});
