import fs from 'fs';
import path from 'path';

import { describe, expect, test } from '@jest/globals';

import { themeColors } from '../ui/theme';

const source = fs.readFileSync(
  path.resolve(__dirname, '../app/(app)/profile.tsx'),
  'utf8',
);

function luminance(hex: string): number {
  const rgb = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(foreground: string, background: string): number {
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

describe('Profile overview appearance and navigation contract', () => {
  test('uses the permanent semantic dark palette without light-only surface islands', () => {
    expect(source).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(source).toContain('const { colors: theme } = useAppTheme()');
    expect(source).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(source).toContain('screen: { flex: 1, backgroundColor: theme.surface.canvas }');
    expect(source).toContain('backgroundColor: theme.surface.card');
    expect(source).toContain('backgroundColor: theme.surface.muted');
    expect(source).toContain('borderColor: theme.border.subtle');
    expect(source).toContain('color: theme.ink.primary');
    expect(source).toContain('color: theme.ink.muted');
    expect(source).toContain('backgroundColor: theme.ink.action');
    expect(source).not.toMatch(/const (?:PAPER|INK|MUTED|BLUE)\s*=/);
    expect(source).not.toMatch(/#(?:FFFCF6|F7F4EC|E1DDD2|DDD8CC|EEF4FF)/i);
    expect(source).not.toContain("mode === 'light'");
  });

  test('keeps the media hero deliberately dark and readable in either appearance', () => {
    expect(source).toContain("colors={['rgba(17,20,17,0.08)', 'rgba(17,20,17,0.52)']}");
    expect(source).toContain("heroBrandText: { color: '#fff'");
    expect(source).toContain('color="#fff"');
  });

  test('preserves every approved destination, including the separate Buddy Card editor', () => {
    expect(source).toContain("route: '/achievements'");
    expect(source).toContain("route: '/activity'");
    expect(source).toContain("route: '/memories'");
    expect(source).toContain("route: '/buddy-card-edit'");
    expect(source).toContain("router.push('/edit-profile' as never)");
    expect(source).toContain('label="Account & privacy" route="/menu"');
    expect(source).toContain('label="Notifications" route="/notifications"');
    expect(source).toContain('label="Help & support" route="/help"');
    expect(source).not.toContain("route: '/buddy-card/[id]'");
  });

  test('keeps every direct Profile control at least 48dp', () => {
    expect(source).toMatch(/heroButton:\s*\{[^}]*width: spacing\.touch,[^}]*height: spacing\.touch/s);
    expect(source).toMatch(/editButton:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(source).toMatch(/tile:\s*\{[^}]*minHeight: 94/s);
    expect(source).toMatch(/settingsRow:\s*\{[^}]*minHeight: 56/s);
  });

  test('text, cards and primary controls retain accessible contrast', () => {
    const theme = themeColors('dark');
    expect(contrast(theme.ink.primary, theme.surface.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
  });
});
