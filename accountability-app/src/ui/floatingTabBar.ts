import type { ViewStyle } from 'react-native';

/** The floating-island tab bar style — shared so a screen can restore it after
 *  temporarily hiding the bar (e.g. an immersive active run). */
export function floatingTabBarStyle(winW: number, insetsBottom: number): ViewStyle {
  const barWidth = Math.min(winW - 32, 400);
  return {
    position: 'absolute',
    width: barWidth,
    left: (winW - barWidth) / 2,
    bottom: Math.max(insetsBottom, 8) + 8,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    paddingHorizontal: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  };
}

/** How far above the safe-area bottom the bar's top edge sits — so screens can
 *  keep their own bottom UI clear of the floating bar. */
export const FLOATING_BAR_CLEARANCE = 82;
