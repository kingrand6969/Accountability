import fs from 'fs';
import path from 'path';

import { describe, expect, test } from '@jest/globals';

import { themeColors, type AppThemeMode } from '../ui/theme';

const screenSource = fs.readFileSync(
  path.resolve(__dirname, '../app/buddy-chat/[id].tsx'),
  'utf8',
);
const rowSource = fs.readFileSync(path.resolve(__dirname, './ChatMessages.tsx'), 'utf8');

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

describe('BuddyChat approved appearance contract', () => {
  test('uses the shared Light/Dark provider and semantic roles across the screen shell', () => {
    expect(screenSource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(screenSource).toContain('const { colors: theme } = useAppTheme()');
    expect(screenSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(screenSource).toContain('screen: { flex: 1, backgroundColor: theme.surface.canvas }');
    expect(screenSource).toContain('backgroundColor: theme.surface.card');
    expect(screenSource).toContain('borderColor: theme.border.subtle');
    expect(screenSource).toContain('color: theme.ink.primary');
    expect(screenSource).toContain('placeholderTextColor={theme.ink.muted}');
    expect(screenSource).toContain('selectionColor={theme.ink.action}');
    expect(screenSource).toContain('color={theme.ink.action}');
    expect(screenSource).not.toMatch(/\bcolors\.(?:background|text|textMuted|textFaint|border|surfaceAlt|primary)\b/);
  });

  test('passes the active semantic palette to message rows without changing existing callers', () => {
    expect(screenSource).toMatch(/<MessageRow[\s\S]*?theme=\{theme\}/);
    expect(rowSource).toContain('theme?: AppThemeColors');
    expect(rowSource).toContain('const themedStyles = useMemo(');
    expect(rowSource).toContain('backgroundColor: theme.ink.action');
    expect(rowSource).toContain('backgroundColor: theme.surface.muted');
    expect(rowSource).toContain('color: theme.ink.inverse');
    expect(rowSource).toContain('color: theme.ink.primary');
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s outgoing and incoming bubble pairs meet normal-text contrast',
    (mode) => {
      const theme = themeColors(mode);
      expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.primary, theme.surface.muted)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
