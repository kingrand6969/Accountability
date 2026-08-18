import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

import { themeColors, type AppThemeMode } from '../ui/theme';

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
    expect(journal).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(journal).toContain('const styles = useMemo(() => createStyles(theme, mode), [mode, theme])');
    expect(journal).toContain('const createStyles = (theme: AppThemeColors, mode: AppThemeMode)');
    expect(journal).not.toMatch(/\bcolors\./);
  });

  test('uses semantic card, ink, border, status and action roles', () => {
    expect(journal).toMatch(/backgroundColor: mode === 'light'[^\n]+: theme\.surface\.card/);
    expect(journal).toContain('color: theme.ink.primary');
    expect(journal).toMatch(/borderColor: mode === 'light'[^\n]+: theme\.border\.subtle/);
    expect(journal).toContain('color: theme.status.danger');
    expect(journal).toContain('backgroundColor: theme.ink.action');
    expect(journal).toContain('tintColor={theme.ink.action}');
  });

  test('themes the paper backdrop while preserving its quiet contour treatment', () => {
    expect(backdrop).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(backdrop).toContain('backgroundColor: theme.surface.canvas');
    expect(backdrop).toContain("mode === 'dark'");
  });

  test('preserves the approved translucent editorial treatment in Light mode', () => {
    expect(journal).toContain("mode === 'light' ? 'rgba(255,255,255,0.58)' : theme.surface.card");
    expect(journal).toContain("mode === 'light' ? 'rgba(255,255,255,0.86)' : theme.surface.card");
    expect(journal).toContain("mode === 'light' ? '#F0E9DC' : theme.surface.card");
    expect(journal).toContain("mode === 'light' ? legacyColors.primarySoft : theme.surface.muted");
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s error copy meets normal-text contrast',
    (mode) => {
      const theme = themeColors(mode);
      const background = mode === 'light' ? '#FFFFFF' : theme.status.dangerSoft;
      expect(contrast(theme.status.danger, background)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
