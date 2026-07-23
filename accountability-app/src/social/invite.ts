import { Platform, Share } from 'react-native';
import { showToast } from '../ui/Toast';
import { myInviteUrl } from '../profiles/referrals';

const INVITE_MESSAGE =
  `I'm using AccountAbility to stay on track — workouts, meals, money and a ` +
  `daily streak, with buddies who keep me honest. 💪🔥\n\n` +
  `Join me so we can keep each other accountable!`;

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

/** Share sheet pre-filled with the invite + your personal referral link, so the
 *  friends who join are credited to you (the Ambassador medal). */
export async function inviteFriends(): Promise<void> {
  const url = await myInviteUrl();
  const message = url ? `${INVITE_MESSAGE}\n\n${url}` : INVITE_MESSAGE;
  await shareInviteText(message);
}
