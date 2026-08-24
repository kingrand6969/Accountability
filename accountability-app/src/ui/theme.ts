/**
 * Design tokens — single source of truth for colors, spacing, type, radii.
 * Screens should import from here instead of hardcoding hex values.
 */

import { font, typography } from './typography';

export { font } from './typography';

export const colors = {
  // Brand — warm monochrome surfaces with one unmistakable neon signal.
  primary: '#B9FF3D',
  primaryDark: '#446B00',
  primarySoft: '#EEFFD1',
  navy: '#111411',
  cream: '#F4F5F1',
  success: '#2E7D32',
  successSoft: '#EAF6E9',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  accent: '#B9FF3D',
  cheer: '#5F8F00',
  pro: '#53634E',
  proSoft: '#EEF1EC',

  // glass ink — text on warm translucent surfaces
  ink: '#111411',
  inkSoft: 'rgba(17,20,17,0.72)',
  inkFaint: 'rgba(17,20,17,0.12)',

  // warm neutral foundation
  text: '#111411',
  textSecondary: '#3F4741',
  textMuted: '#626B64',
  textFaint: '#7E887F',
  border: '#D9DED7',
  surface: '#ECEFEA',
  surfaceAlt: '#F7F8F5',
  card: '#ffffff',
  background: '#ffffff',
  onPrimary: '#111411',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  screen: 16,
  touch: 48,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
  card: 18,
  sheet: 24,
} as const;

/**
 * Semantic roles for new foundation primitives. Existing flat color names
 * remain stable so current feature screens keep their established behavior.
 */
export const semanticColors = {
  surface: {
    canvas: colors.cream,
    card: colors.card,
    raised: colors.background,
    muted: colors.surfaceAlt,
    inverse: colors.navy,
  },
  ink: {
    primary: colors.navy,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    inverse: '#FFFFFF',
    action: colors.primaryDark,
  },
  border: {
    subtle: colors.border,
    strong: colors.inkFaint,
    action: colors.primary,
    danger: colors.danger,
  },
  status: {
    success: colors.success,
    successSoft: colors.successSoft,
    danger: colors.danger,
    dangerSoft: colors.dangerSoft,
    attention: colors.accent,
  },
} as const;

export type AppThemeMode = 'light' | 'dark';

const lightInteraction = {
  pressedOverlay: 'rgba(17,20,17,0.08)',
  disabledOpacity: 0.48,
  skeleton: '#E4E8E1',
  scrim: 'rgba(17,20,17,0.48)',
  touchTarget: spacing.touch,
} as const;

const darkSemanticColors = {
  surface: {
    canvas: '#0B0D0B',
    card: '#121512',
    raised: '#181C18',
    muted: '#202520',
    inverse: '#F4F5F1',
  },
  ink: {
    primary: '#F7F8F4',
    secondary: '#CED4CB',
    muted: '#9DA59D',
    inverse: '#0B0D0B',
    action: '#B9FF3D',
  },
  border: {
    subtle: '#272D27',
    strong: '#465046',
    action: '#B9FF3D',
    danger: '#F87171',
  },
  status: {
    success: '#87E38D',
    successSoft: '#17351C',
    danger: '#F87171',
    dangerSoft: '#32151B',
    attention: '#FBBF24',
  },
  interaction: {
    pressedOverlay: 'rgba(255,255,255,0.10)',
    disabledOpacity: 0.48,
    skeleton: '#252B25',
    scrim: 'rgba(0,0,0,0.64)',
    touchTarget: spacing.touch,
  },
} as const;

const lightSemanticTheme = {
  ...semanticColors,
  interaction: lightInteraction,
} as const;

export type AppThemeColors = typeof lightSemanticTheme | typeof darkSemanticColors;

/** Manual appearance only: AccountAbility intentionally offers Light or Dark. */
export function resolveAppThemeMode(value: unknown): AppThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

export function themeColors(mode: AppThemeMode): AppThemeColors {
  return mode === 'dark' ? darkSemanticColors : lightSemanticTheme;
}

export const category = {
  body: semanticColors.status.success,
  focus: colors.pro,
  people: colors.cheer,
} as const;

export const type = {
  title: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  heading: { fontFamily: font.bold, fontSize: 17, color: colors.text },
  body: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  label: { fontFamily: font.semibold, fontSize: 14, color: colors.textSecondary },
  caption: { fontFamily: font.medium, fontSize: 12.5, color: colors.textMuted },
  editorialTitle: {
    ...typography.editorialTitle,
    color: semanticColors.ink.primary,
  },
  editorialHeading: {
    ...typography.editorialHeading,
    color: semanticColors.ink.primary,
  },
  interfaceTitle: {
    ...typography.interfaceTitle,
    color: semanticColors.ink.primary,
  },
  interfaceHeading: {
    ...typography.interfaceHeading,
    color: semanticColors.ink.primary,
  },
  annotation: {
    ...typography.annotation,
    color: colors.primaryDark,
  },
  metric: {
    ...typography.metric,
    color: semanticColors.ink.primary,
  },
  heroMetric: {
    ...typography.heroMetric,
    color: semanticColors.ink.primary,
  },
} as const;

/** Cap content width on tablets/wide screens — apply to scroll containers. */
export const contentMax = {
  width: '100%' as const,
  maxWidth: 720,
  alignSelf: 'center' as const,
};

export const shadow = {
  card: {
    shadowColor: '#111411',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const elevation = {
  none: {
    shadowOpacity: 0,
    elevation: 0,
  },
  card: shadow.card,
  floating: {
    shadowColor: colors.navy,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

export const icon = {
  size: {
    sm: 18,
    md: 24,
    lg: 28,
  },
  touchTarget: spacing.touch,
  strokeWidth: 2,
} as const;

export const motion = {
  duration: {
    fast: 120,
    standard: 220,
    deliberate: 360,
  },
  reduced: {
    duration: 0,
  },
} as const;
