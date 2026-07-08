import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True when running inside the Expo Go sandbox app (not a dev/standalone build).
 * Several native features — remote notifications, background location — were
 * removed from Expo Go (SDK 53+) and THROW when touched, which would crash the
 * app on launch. We detect Expo Go and no-op those features here; they work in a
 * development build.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Lazily load expo-notifications, returning null on web or in Expo Go so callers
 * can gracefully no-op. Loading it dynamically means the module is never even
 * evaluated in Expo Go, avoiding the import-time crash.
 */
export async function getNotifications(): Promise<typeof import('expo-notifications') | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;
  return import('expo-notifications');
}
