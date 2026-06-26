import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Ask for notification permission if not already granted. No-op on web. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted;
}

/** Schedule a one-off local notification. Returns its id, or null on web. */
export async function scheduleReminder(
  title: string,
  body: string,
  when: Date,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: when,
    },
  });
}

/** Cancel a previously scheduled reminder. Safe to call with null. */
export async function cancelReminder(id: string | null | undefined): Promise<void> {
  if (!id || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or unknown id — nothing to do.
  }
}
