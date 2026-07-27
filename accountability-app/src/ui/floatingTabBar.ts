import type { ViewStyle } from 'react-native';

/** The floating-island tab bar style — shared so a screen can restore it after
 *  temporarily hiding the bar (e.g. an immersive active run). */
export function floatingTabBarStyle(winW: number, insetsBottom: number): ViewStyle {
  return {
    position: 'absolute',
    width: winW,
    left: 0,
    bottom: 0,
    height: 64 + insetsBottom,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  };
}

/** How far above the safe-area bottom the bar's top edge sits — so screens can
 *  keep their own bottom UI clear of the floating bar. */
export const FLOATING_BAR_CLEARANCE = 72;
