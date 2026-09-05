import { describe, expect, it } from '@jest/globals';

import {
  category,
  colors,
  contentMax,
  elevation,
  icon,
  motion,
  radius,
  resolveAppThemeMode,
  semanticColors,
  shadow,
  spacing,
  themeColors,
  type,
} from './theme';
import { font, typography } from './typography';

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = channels.map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('Mantle semantic theme contract', () => {
  it('locks the approved brand and permanent dark semantic color roles', () => {
    expect(colors.primary).toBe('#B9FF3D');
    expect(colors.navy).toBe('#0B0D0B');
    expect(colors.cream).toBe('#0B0D0B');
    expect(semanticColors.surface.canvas).toBe(colors.cream);
    expect(semanticColors.surface.card).toBe(colors.card);
    expect(semanticColors.surface.inverse).toBe('#0B0D0B');
    expect(semanticColors.ink.primary).toBe(colors.text);
    expect(semanticColors.border.subtle).toBe(colors.border);
    expect(semanticColors.status.success).toBe(colors.success);
    expect(category).toEqual({
      body: '#2E7D32',
      focus: '#53634E',
      people: '#5F8F00',
    });
  });

  it('provides layout, interaction, elevation, icon, and motion roles', () => {
    expect(spacing.touch).toBe(48);
    expect(spacing.screen).toBe(spacing.lg);
    expect(radius.card).toBe(radius.lg);
    expect(radius.sheet).toBe(radius.xl);
    expect(elevation.card).toBe(shadow.card);
    expect(icon.touchTarget).toBe(spacing.touch);
    expect(icon.size.md).toBe(24);
    expect(motion.duration.fast).toBeLessThan(motion.duration.standard);
    expect(motion.reduced.duration).toBe(0);
  });

  it('returns the approved dark semantic palette for either mode', () => {
    const light = themeColors('light');
    const dark = themeColors('dark');

    expect(dark.surface.canvas).toBe('#0B0D0B');
    expect(dark.surface.card).toBe('#121512');
    expect(dark.ink.primary).toBe('#F7F8F4');
    expect(dark.ink.action).toBe('#B9FF3D');
    expect(light).toEqual(dark);
  });

  it('keeps primary actions readable in both appearances', () => {
    const light = themeColors('light');
    const dark = themeColors('dark');

    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(light.ink.inverse, light.ink.action)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dark.ink.inverse, dark.ink.action)).toBeGreaterThanOrEqual(4.5);
  });

  it('resolves every appearance value to dark mode', () => {
    expect(resolveAppThemeMode('light')).toBe('dark');
    expect(resolveAppThemeMode('dark')).toBe('dark');
    expect(resolveAppThemeMode('system')).toBe('dark');
    expect(resolveAppThemeMode(null)).toBe('dark');
    expect(resolveAppThemeMode({ mode: 'dark' })).toBe('dark');
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

  it('keeps every compatibility token while mapping it into the new brand', () => {
    expect(colors).toMatchObject({
      primary: '#B9FF3D',
      primaryDark: '#B9FF3D',
      primarySoft: '#202520',
      success: '#2E7D32',
      successSoft: '#202520',
      danger: '#dc2626',
      dangerSoft: '#202520',
      accent: '#B9FF3D',
      cheer: '#5F8F00',
      pro: '#53634E',
      proSoft: '#202520',
      ink: '#F7F8F4',
      inkSoft: '#CED4CB',
      inkFaint: '#9DA59D',
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
      shadowColor: '#0B0D0B',
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    });
  });

  it('aliases category roles through existing semantic tokens', () => {
    expect(category.body).toBe(semanticColors.status.success);
    expect(category.focus).toBe(colors.pro);
    expect(category.people).toBe(colors.cheer);
  });
});
