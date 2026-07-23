/**
 * Design tokens — single source of truth for colors, spacing, type, radii.
 * Screens should import from here instead of hardcoding hex values.
 */

export const colors = {
  // brand — logo blue, one language everywhere
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primarySoft: '#eff6ff',
  success: '#16a34a',
  successSoft: '#f0fdf4',
  danger: '#dc2626',
  dangerSoft: '#fef2f2',
  accent: '#fbbf24', // amber flame
  cheer: '#ea580c', // flame orange — the "Cheer" reaction (our like)
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
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

/** Inter-based type scale. Fonts are loaded globally in the root layout. */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  display: 'Anton_400Regular', // big numbers / hero stats only
} as const;

export const type = {
  title: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  heading: { fontFamily: font.bold, fontSize: 17, color: colors.text },
  body: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  label: { fontFamily: font.semibold, fontSize: 14, color: colors.textSecondary },
  caption: { fontFamily: font.medium, fontSize: 12.5, color: colors.textMuted },
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
