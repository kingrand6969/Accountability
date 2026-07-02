import { Alert, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';

/**
 * After something is posted in-app, offer to cross-share it to Facebook /
 * Instagram / anywhere via the native share sheet.
 *
 * Meta shut down auto-posting to personal profiles years ago, so the share
 * sheet IS the sanctioned path (it's what Strava/BeReal do): the user taps
 * Share, picks Facebook or Instagram, and the photo/text is pre-filled.
 *
 * No-op on web (no share sheet).
 */
export function promptCrossShare(message: string, imageUri: string | null): void {
  if (Platform.OS === 'web') return;
  Alert.alert(
    'Posted 🎉',
    'Share it to Facebook or Instagram too?',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Share…',
        onPress: async () => {
          try {
            if (imageUri && (await Sharing.isAvailableAsync())) {
              // Sharing the image opens the sheet with FB/IG as targets;
              // Instagram accepts images (not plain text).
              await Sharing.shareAsync(imageUri, {
                mimeType: 'image/jpeg',
                dialogTitle: 'Share your post',
              });
              return;
            }
            await Share.share({ message: `${message}\n\n#accountability` });
          } catch {
            // user dismissed the sheet — nothing to do
          }
        },
      },
    ],
  );
}
