import { describe, expect, it } from '@jest/globals';

import {
  category,
  colors,
  contentMax,
  elevation,
  icon,
  motion,
  radius,
  semanticColors,
  shadow,
  spacing,
  type,
} from './theme';
import { font, typography } from './typography';

describe('AccountAbility semantic theme contract', () => {
  it('locks the approved brand and semantic color roles', () => {
    expect(colors.primary).toBe('#155EEF');
    expect(colors.navy).toBe('#081A3A');
    expect(colors.cream).toBe('#F7F4EC');
    expect(semanticColors.surface.canvas).toBe(colors.cream);
    expect(semanticColors.surface.card).toBe(colors.card);
    expect(semanticColors.ink.primary).toBe(colors.navy);
    expect(semanticColors.border.subtle).toBe(colors.border);
    expect(semanticColors.status.success).toBe(colors.success);
    expect(category).toEqual({
      body: '#16a34a',
      money: '#155EEF',
      focus: '#7c3aed',
      people: '#ea580c',
    });
  });

  it('provides layout, interaction, elevation, icon, and motion roles', () => {
    expect(spacing.touch).toBeGreaterThanOrEqual(44);
    expect(spacing.screen).toBe(spacing.lg);
    expect(radius.card).toBe(radius.lg);
    expect(radius.sheet).toBe(radius.xl);
    expect(elevation.card).toBe(shadow.card);
    expect(icon.touchTarget).toBe(spacing.touch);
    expect(icon.size.md).toBe(24);
    expect(motion.duration.fast).toBeLessThan(motion.duration.standard);
    expect(motion.reduced.duration).toBe(0);
  });

  it('uses only approved typography families for semantic roles', () => {
    expect(type.editorialTitle.fontFamily).toBe(font.serif);
    expect(type.interfaceHeading.fontFamily).toBe(font.semibold);
    expect(type.body.fontFamily).toBe(font.regular);
    expect(type.annotation.fontFamily).toBe(font.handwritten);
    expect(type.metric.fontFamily).toBe(font.semibold);
    expect(type.metric.fontVariant).toContain('tabular-nums');
    expect(typography.metric.fontVariant).toContain('tabular-nums');
  });

  it('retains every legacy token and its established value', () => {
    expect(colors).toMatchObject({
      primary: '#155EEF',
      primaryDark: '#1d4ed8',
      primarySoft: '#eff6ff',
      success: '#16a34a',
      successSoft: '#f0fdf4',
      danger: '#dc2626',
      dangerSoft: '#fef2f2',
      accent: '#fbbf24',
      cheer: '#ea580c',
      pro: '#7c3aed',
      proSoft: '#f5f3ff',
      ink: '#1e1b4b',
      inkSoft: 'rgba(30,27,75,0.72)',
      inkFaint: 'rgba(30,27,75,0.12)',
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
    });
    expect(spacing).toMatchObject({
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      xxl: 24,
    });
    expect(radius).toMatchObject({
      sm: 10,
      md: 14,
      lg: 18,
      xl: 24,
      pill: 999,
    });
    expect(font).toMatchObject({
      regular: 'Inter_400Regular',
      medium: 'Inter_500Medium',
      semibold: 'Inter_600SemiBold',
      bold: 'Inter_700Bold',
      extrabold: 'Inter_800ExtraBold',
      display: 'Anton_400Regular',
    });
    expect(type.title).toEqual({
      fontFamily: font.bold,
      fontSize: 22,
      color: colors.text,
    });
    expect(type.heading).toEqual({
      fontFamily: font.bold,
      fontSize: 17,
      color: colors.text,
    });
    expect(type.body).toEqual({
      fontFamily: font.regular,
      fontSize: 15,
      color: colors.text,
    });
    expect(type.label).toEqual({
      fontFamily: font.semibold,
      fontSize: 14,
      color: colors.textSecondary,
    });
    expect(type.caption).toEqual({
      fontFamily: font.medium,
      fontSize: 12.5,
      color: colors.textMuted,
    });
    expect(font.display).toBe('Anton_400Regular');
    expect(contentMax).toEqual({
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
    });
    expect(shadow.card).toEqual({
      shadowColor: '#0f172a',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    });
  });

  it('aliases category roles through existing semantic tokens', () => {
    expect(category.body).toBe(semanticColors.status.success);
    expect(category.money).toBe(colors.primary);
    expect(category.focus).toBe(colors.pro);
    expect(category.people).toBe(colors.cheer);
  });
});
