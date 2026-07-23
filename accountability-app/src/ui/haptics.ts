import { Platform } from 'react-native';

/**
 * Tactile feedback, award-jury style: rewards and key actions get a physical
 * echo. Fire-and-forget — every call is safe on web (no-op) and swallows
 * device errors, so haptics can never break a flow.
 */

type HapticsModule = typeof import('expo-haptics');

let mod: HapticsModule | null | undefined;

async function haptics(): Promise<HapticsModule | null> {
  if (Platform.OS === 'web') return null;
  if (mod !== undefined) return mod;
  try {
    mod = await import('expo-haptics');
  } catch {
    mod = null;
  }
  return mod;
}

/** Subtle tick — tab switches, segmented controls, pickers. */
export function hapticSelect(): void {
  haptics().then((h) => h?.selectionAsync().catch(() => {}));
}

/** Light tap — likes, toggles, small confirmations. */
export function hapticTap(): void {
  haptics().then((h) => h?.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {}));
}

/** Firm knock — starting/stopping a run, committing something. */
export function hapticImpact(): void {
  haptics().then((h) => h?.impactAsync(h.ImpactFeedbackStyle.Medium).catch(() => {}));
}

/** Celebration — medal unlocks, mission complete, posted a flex. */
export function hapticSuccess(): void {
  haptics().then((h) => h?.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {}));
}
