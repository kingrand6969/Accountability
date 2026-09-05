import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';
import { buttonAppearance } from './Button';
import { themeColors, type AppThemeMode } from './theme';

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('shared Button manual appearance', () => {
  test('dark primary and outline variants use the approved action roles', () => {
    const theme = themeColors('dark');
    const primary = buttonAppearance(theme, 'primary', false);
    const outline = buttonAppearance(theme, 'outline', false);

    expect(primary).toEqual(
      expect.objectContaining({
        backgroundColor: theme.ink.action,
        borderColor: theme.border.action,
        textColor: theme.ink.inverse,
      }),
    );
    expect(outline).toEqual(
      expect.objectContaining({
        backgroundColor: 'transparent',
        borderColor: theme.border.strong,
        borderWidth: 1,
        textColor: theme.ink.primary,
      }),
    );
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s primary and outline labels retain readable contrast',
    (mode) => {
      const theme = themeColors(mode);
      const primary = buttonAppearance(theme, 'primary', false);
      const outline = buttonAppearance(theme, 'outline', false);

      expect(primary.borderWidth).toBe(0);
      expect(contrast(primary.textColor, primary.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(outline.textColor, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s disabled labels use explicit semantic colors instead of faded content',
    (mode) => {
      const theme = themeColors(mode);
      const disabled = buttonAppearance(theme, 'primary', true);

      expect(disabled.backgroundColor).toBe(theme.surface.muted);
      expect(disabled.textColor).toBe(theme.ink.muted);
      expect(contrast(disabled.textColor, disabled.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('exposes disabled and busy state while retaining the 48-point touch contract', () => {
    const source = readFileSync(require.resolve('./Button'), 'utf8');

    expect(source).toContain('accessibilityState={{ disabled: inactive, busy: loading }}');
    expect(source).toContain('minHeight: spacing.touch');
    expect(source).not.toContain('inactive && styles.disabled');
  });
});
