/**
 * Design tokens — single source of truth for colors, spacing, type, radii.
 * Screens should import from here instead of hardcoding hex values.
 */

import { font, typography } from './typography';

export { font } from './typography';

export const colors = {
  // brand — logo blue, one language everywhere
  primary: '#155EEF',
  primaryDark: '#1d4ed8',
  primarySoft: '#eff6ff',
  navy: '#081A3A',
  cream: '#F7F4EC',
  success: '#16a34a',
  successSoft: '#f0fdf4',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  accent: '#fbbf24', // amber flame
  cheer: '#ea580c', // flame orange — the Encourage reaction
  pro: '#7c3aed',
  proSoft: '#f5f3ff',

  // glass ink — text on lavender glass surfaces
  ink: '#1e1b4b',
  inkSoft: 'rgba(30,27,75,0.72)',
  inkFaint: 'rgba(30,27,75,0.12)',

  // slate neutrals
  text: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  border: '#e2e8f0',
  surface: '#f1f5f9',
  surfaceAlt: '#f8fafc',
  card: '#ffffff',
  background: '#ffffff',
  onPrimary: '#ffffff',
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
  touch: 44,
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
    inverse: colors.onPrimary,
    action: colors.primary,
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

export const category = {
  body: semanticColors.status.success,
  money: colors.primary,
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
    color: colors.primary,
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
    shadowColor: '#0f172a',
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
