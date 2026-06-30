import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FLAG_KEY = 'streakReminder:enabled';
const ID_KEY = 'streakReminder:id';

export async function isStreakReminderOn(): Promise<boolean> {
  return (await AsyncStorage.getItem(FLAG_KEY)) === '1';
}

/** Schedule a daily 8pm "keep your streak" reminder. Returns false if denied. */
export async function enableStreakReminder(): Promise<boolean> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(FLAG_KEY, '1');
    return true;
  }
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted
    ? true
    : (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return false;

  const existing = await AsyncStorage.getItem(ID_KEY);
  if (existing) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing);
    } catch {
      // already gone
    }
  }
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Keep your streak alive 🔥',
      body: "Log something today so your streak doesn't reset.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 20,
      minute: 0,
    },
  });
  await AsyncStorage.setItem(ID_KEY, id);
  await AsyncStorage.setItem(FLAG_KEY, '1');
  return true;
}

export async function disableStreakReminder(): Promise<void> {
  const existing = await AsyncStorage.getItem(ID_KEY);
  if (existing && Platform.OS !== 'web') {
    try {
      await Notifications.cancelScheduledNotificationAsync(existing);
    } catch {
      // already gone
    }
  }
  await AsyncStorage.removeItem(ID_KEY);
  await AsyncStorage.setItem(FLAG_KEY, '0');
}
