import { getNotifications } from '../lib/expoGo';

// How notifications behave when they fire while the app is foregrounded.
// Imported once for its side effect (see app/_layout.tsx). Loaded lazily so
// expo-notifications is never evaluated in Expo Go / on web, where it throws.
getNotifications().then((N) => {
  N?.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
});
