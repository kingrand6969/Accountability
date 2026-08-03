import type { ViewStyle } from 'react-native';

export const TAB_BAR_MIN_CONTENT_HEIGHT = 64;
export const TAB_BAR_MAX_CONTENT_HEIGHT = 128;
export const TAB_BAR_SAFE_AREA_ALLOWANCE = 32;

export function tabBarContentHeight(fontScale: number): number {
  const safeScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return Math.min(
    TAB_BAR_MAX_CONTENT_HEIGHT,
    Math.max(68, Math.round(TAB_BAR_MIN_CONTENT_HEIGHT * safeScale)),
  );
}

/** Fixed bottom tab bar style — shared so a screen can restore it after
 *  temporarily hiding the bar (e.g. an immersive active run). */
export function floatingTabBarStyle(
  winW: number,
  insetsBottom: number,
  fontScale = 1,
): ViewStyle {
  const contentHeight = tabBarContentHeight(fontScale);
  return {
    position: 'absolute',
    width: winW,
    left: 0,
    bottom: 0,
    height: contentHeight + insetsBottom,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  };
}

/** How far above the safe-area bottom the bar's top edge sits — so screens can
 *  keep their own bottom UI clear of the floating bar. */
export const FLOATING_BAR_CLEARANCE =
  TAB_BAR_MAX_CONTENT_HEIGHT + TAB_BAR_SAFE_AREA_ALLOWANCE;
