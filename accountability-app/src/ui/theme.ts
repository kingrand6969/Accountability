/**
 * Design tokens — single source of truth for colors, spacing, type, radii.
 * Screens should import from here instead of hardcoding hex values.
 */

import { font, typography } from './typography';

export { font } from './typography';

export const colors = {
  // Permanent dark foundation with one unmistakable neon signal.
  primary: '#B9FF3D',
  primaryDark: '#B9FF3D',
  primarySoft: '#202520',
  navy: '#0B0D0B',
  cream: '#0B0D0B',
  success: '#2E7D32',
  successSoft: '#202520',
  danger: '#dc2626',
  dangerSoft: '#202520',
  accent: '#B9FF3D',
  cheer: '#5F8F00',
  pro: '#53634E',
  proSoft: '#202520',

  // Compatibility ink tokens.
  ink: '#F7F8F4',
  inkSoft: '#CED4CB',
  inkFaint: '#9DA59D',

  // Dark neutral foundation.
  text: '#F7F8F4',
  textSecondary: '#CED4CB',
  textMuted: '#9DA59D',
  textFaint: '#9DA59D',
  border: '#272D27',
  surface: '#181C18',
  surfaceAlt: '#202520',
  card: '#121512',
  background: '#0B0D0B',
  onPrimary: '#0B0D0B',
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
 * Semantic roles for the permanent dark foundation. Existing flat color names
 * remain available so current feature screens keep compiling.
 */
export const semanticColors = {
  surface: {
    canvas: colors.cream,
    card: colors.card,
    raised: colors.surface,
    muted: colors.surfaceAlt,
    inverse: colors.navy,
  },
  ink: {
    primary: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    inverse: colors.onPrimary,
    action: colors.primary,
  },
  border: {
    subtle: colors.border,
    strong: '#465046',
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

const darkSemanticTheme = {
  ...semanticColors,
  status: {
    success: '#87E38D',
    successSoft: '#17351C',
    danger: '#F87171',
    dangerSoft: '#32151B',
    attention: '#FBBF24',
    attentionSoft: '#3B2B08',
  },
  interaction: {
    pressedOverlay: 'rgba(255,255,255,0.10)',
    disabledOpacity: 0.48,
    skeleton: '#252B25',
    scrim: 'rgba(0,0,0,0.64)',
    touchTarget: spacing.touch,
  },
} as const;

export type AppThemeColors = typeof darkSemanticTheme;

/** Mantle intentionally uses one permanent dark appearance. */
export function resolveAppThemeMode(_value: unknown): AppThemeMode {
  return 'dark';
}

export function themeColors(_mode: AppThemeMode): AppThemeColors {
  return darkSemanticTheme;
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
    shadowColor: '#0B0D0B',
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
