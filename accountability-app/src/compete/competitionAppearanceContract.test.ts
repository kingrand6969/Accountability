import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { themeColors, type AppThemeMode } from '../ui/theme';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

const glass = source('src/ui/Glass.tsx');
const controls = source('src/compete/CompeteUI.tsx');
const compete = source('src/app/compete.tsx');
const detail = source('src/app/challenge/[id].tsx');
const create = source('src/app/challenge-new.tsx');

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
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

describe('competition and challenge appearance contract', () => {
  test('themes the shared glass foundation while preserving the approved Light treatment', () => {
    expect(glass).toContain("import { useAppTheme } from './AppThemeProvider'");
    expect(glass).toContain("mode === 'light'");
    expect(glass).toContain("['#EDF4FC', '#DEEAF8', '#C9DCF4']");
    expect(glass).toContain("tint={mode === 'light' ? 'light' : 'dark'}");
    expect(glass).toContain('theme.surface.canvas');
    expect(glass).toContain('theme.surface.card');
    expect(glass).toContain('theme.border.strong');
  });

  test('competition controls keep their exact Light palette and derive Dark from semantic roles', () => {
    expect(controls).toContain("export const INK = '#1e1b4b'");
    expect(controls).toContain("export const INK_SOFT = 'rgba(30,27,75,0.72)'");
    expect(controls).toContain("export const ACCENT = '#2563eb'");
    expect(controls).toContain('export function useCompetitionTheme()');
    expect(controls).toContain("mode === 'light' ? INK : theme.ink.primary");
    expect(controls).toContain("mode === 'light' ? INK_SOFT : theme.ink.secondary");
    expect(controls).toContain("mode === 'light' ? ACCENT : theme.ink.action");
    expect(controls).toContain("mode === 'light' ? '#fff' : theme.ink.inverse");
    expect(controls).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['Compete', compete],
    ['Challenge detail', detail],
    ['Challenge creation', create],
  ])('%s binds styles and inline colors to live appearance', (_label, screen) => {
    expect(screen).toContain('useCompetitionTheme');
    expect(screen).toContain('const { palette } = useCompetitionTheme()');
    expect(screen).toContain('useMemo(() => createStyles(palette), [palette])');
    expect(screen).toContain('color: palette.ink');
    expect(screen).toContain('color: palette.inkSoft');
    expect(screen).toContain('backgroundColor: palette.accent');
    expect(screen).not.toContain('const styles = StyleSheet.create({');
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s semantic competition text and actions meet normal-text contrast',
    (mode) => {
      const theme = themeColors(mode);
      expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
