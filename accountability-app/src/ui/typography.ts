import type { TextStyle } from 'react-native';

/**
 * Approved runtime font names.
 *
 * Root layout owns loading these exact families. Semantic roles intentionally
 * have no fallback family: a failed runtime font must stay visible to the
 * integration gate rather than silently changing the approved design.
 */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  display: 'Anton_400Regular',
  serif: 'PlayfairDisplay_700Bold',
  handwritten: 'Caveat_600SemiBold',
} as const;

export const typography = {
  editorialTitle: {
    fontFamily: font.serif,
    fontSize: 34,
    lineHeight: 40,
  },
  editorialHeading: {
    fontFamily: font.serif,
    fontSize: 28,
    lineHeight: 34,
  },
  interfaceTitle: {
    fontFamily: font.bold,
    fontSize: 22,
    lineHeight: 28,
  },
  interfaceHeading: {
    fontFamily: font.semibold,
    fontSize: 17,
    lineHeight: 22,
  },
  body: {
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 14,
    lineHeight: 18,
  },
  caption: {
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  annotation: {
    fontFamily: font.handwritten,
    fontSize: 22,
    lineHeight: 28,
  },
  metric: {
    fontFamily: font.semibold,
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
  heroMetric: {
    fontFamily: font.display,
    fontSize: 42,
    lineHeight: 46,
    fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyRole = keyof typeof typography;
