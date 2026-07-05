import { Platform, Share } from 'react-native';
import { showToast } from '../ui/Toast';

// TODO(launch): append the real store links once the app is listed
// (Play Store URL + App Store URL). Until then the invite is text-only so
// we never send friends to a dead link.
const INVITE_MESSAGE =
  `I'm using AccountAbility to stay on track — workouts, meals, money and a ` +
  `daily streak, with buddies who keep me honest. 💪🔥\n\n` +
  `Join me so we can keep each other accountable! Search "AccountAbility" ` +
  `in your app store.`;

/**
 * Opens the native share sheet (Messenger, WhatsApp, TikTok, SMS — whatever
 * is installed) with the given text. Falls back to the clipboard on web.
 */
export async function shareInviteText(message: string): Promise<void> {
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ text: message });
        return;
      }
      await navigator.clipboard.writeText(message);
      showToast('Invite copied — paste it anywhere');
    } catch {
      // clipboard/share unavailable (permissions) — still respond
      showToast('Invite sharing opens the share sheet on your phone');
    }
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    // user dismissed the sheet — nothing to do
  }
}

/** Share sheet pre-filled with the generic "join me on AccountAbility" invite. */
export async function inviteFriends(): Promise<void> {
  await shareInviteText(INVITE_MESSAGE);
}
