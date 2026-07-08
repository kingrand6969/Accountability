import { getNotifications } from '../lib/expoGo';

/** Ask for notification permission if not already granted. No-op on web/Expo Go. */
export async function ensureNotificationPermission(): Promise<boolean> {
  const N = await getNotifications();
  if (!N) return false;
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  const req = await N.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return req.granted;
}

/** Schedule a one-off local notification. Returns its id, or null on web/Expo Go. */
export async function scheduleReminder(
  title: string,
  body: string,
  when: Date,
): Promise<string | null> {
  const N = await getNotifications();
  if (!N) return null;
  return N.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DATE,
      date: when,
    },
  });
}

/** Cancel a previously scheduled reminder. Safe to call with null. */
export async function cancelReminder(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const N = await getNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired or unknown id — nothing to do.
  }
}
