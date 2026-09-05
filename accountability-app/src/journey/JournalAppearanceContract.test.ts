import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

import { themeColors } from '../ui/theme';

const journal = readFileSync(require.resolve('./JournalScreen'), 'utf8');
const backdrop = readFileSync(require.resolve('./EditorialBackdrop'), 'utf8');

function luminance(hex: string): number {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((part) => parseInt(part, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe('Journey Journal appearance contract', () => {
  test('binds the live appearance to the exported Journal screen', () => {
    expect(journal).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(journal).toContain('const { colors: theme } = useAppTheme()');
    expect(journal).toContain('const styles = useMemo(() => createStyles(theme), [theme])');
    expect(journal).toContain('const createStyles = (theme: AppThemeColors)');
    expect(journal).not.toContain("mode === 'light'");
    expect(journal).not.toMatch(/\bcolors\./);
  });

  test('uses semantic card, ink, border, status and action roles', () => {
    expect(journal).toContain('backgroundColor: theme.surface.card');
    expect(journal).toContain('color: theme.ink.primary');
    expect(journal).toContain('borderColor: theme.border.subtle');
    expect(journal).toContain('backgroundColor: theme.status.dangerSoft');
    expect(journal).toContain('borderColor: theme.border.danger');
    expect(journal).toContain('color: theme.status.danger');
    expect(journal).toContain('backgroundColor: theme.ink.action');
    expect(journal).toContain('tintColor={theme.ink.action}');
  });

  test('themes the paper backdrop while preserving its quiet contour treatment', () => {
    expect(backdrop).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(backdrop).toContain('backgroundColor: theme.surface.canvas');
    expect(backdrop).toContain('borderColor: theme.border.subtle');
    expect(backdrop).not.toContain("mode === 'light'");
    expect(backdrop).not.toContain("mode === 'dark'");
  });

  test('keeps editorial photography natural while app chrome stays permanently dark', () => {
    expect(journal).toContain("source={require('../../assets/images/auth-mountain-hero.png')}");
    expect(journal).toContain('backgroundColor: theme.surface.canvas');
    expect(journal).toContain('backgroundColor: theme.surface.muted');
    expect(journal).toContain('backgroundColor: theme.ink.action');
  });

  test('permanent-dark error copy meets normal-text contrast', () => {
    const theme = themeColors('dark');
    expect(contrast(theme.status.danger, theme.status.dangerSoft)).toBeGreaterThanOrEqual(4.5);
  });
});
