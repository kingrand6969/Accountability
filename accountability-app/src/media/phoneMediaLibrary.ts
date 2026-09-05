import { Platform } from 'react-native';

async function phoneMediaLibrary() {
  if (Platform.OS === 'web') {
    throw new Error('Saving images to your phone is available in the mobile app.');
  }
  return await import('expo-media-library');
}

export async function requestPhonePhotoPermission(): Promise<{ granted: boolean }> {
  const mediaLibrary = await phoneMediaLibrary();
  return mediaLibrary.requestPermissionsAsync(true, ['photo']);
}

export async function createPhonePhoto(uri: string): Promise<unknown> {
  const mediaLibrary = await phoneMediaLibrary();
  return mediaLibrary.Asset.create(uri);
}
