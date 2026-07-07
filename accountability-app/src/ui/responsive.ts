import { useWindowDimensions } from 'react-native';

/**
 * Shared responsive breakpoints. The app has real phone, tablet and desktop-web
 * users, so layout decisions live here instead of being hardcoded per screen.
 *
 * Tiers (by width, in dp):
 *   phone   < 600   — single column, full-bleed
 *   tablet  600–1023 — grids (2 col) / wider reading column
 *   large   ≥ 1024  — grids (3 col) / capped reading column
 */
export type LayoutTier = 'phone' | 'tablet' | 'large';

export const BP = { tablet: 600, large: 1024 } as const;

export function layoutTier(width: number): LayoutTier {
  if (width < BP.tablet) return 'phone';
  if (width < BP.large) return 'tablet';
  return 'large';
}

/** Columns for a browse/card grid at this width (1 phone, 2 tablet, 3 large). */
export function gridColumns(width: number): number {
  if (width < BP.tablet) return 1;
  if (width < BP.large) return 2;
  return 3;
}

/** Max width for a centered grid container (full-bleed until large, then capped). */
export function gridMaxWidth(width: number): number {
  return width < BP.large ? width : 1120;
}

/** Max width for a centered reading/dashboard column. */
export function contentMaxWidth(width: number): number {
  if (width < BP.tablet) return width; // full-bleed on phones
  if (width < BP.large) return 740; // tablet reads better a touch wider
  return 800; // large / desktop
}

/** One hook that returns everything a responsive screen needs. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    tier: layoutTier(width),
    cols: gridColumns(width),
    gridMaxWidth: gridMaxWidth(width),
    maxWidth: contentMaxWidth(width),
  };
}
