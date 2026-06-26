import * as Notifications from 'expo-notifications';

// How notifications behave when they fire while the app is foregrounded.
// Imported once for its side effect (see app/_layout.tsx).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
