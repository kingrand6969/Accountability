import fs from 'fs';
import path from 'path';

import { describe, expect, test } from '@jest/globals';

import { themeColors, type AppThemeMode } from '../ui/theme';

function route(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../app/${relativePath}`), 'utf8');
}

const groups = route('groups.tsx');
const pages = route('pages.tsx');
const groupDetail = route('group/[id].tsx');
const pageDetail = route('page/[id].tsx');
const allScreens = [groups, pages, groupDetail, pageDetail];

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

describe('Groups and Pages appearance contract', () => {
  test.each([
    ['groups list', groups],
    ['pages list', pages],
    ['group detail', groupDetail],
    ['page detail', pageDetail],
  ])('%s follows the live manual Light/Dark theme', (_name, source) => {
    const providerPath = source === groupDetail || source === pageDetail
      ? '../../ui/AppThemeProvider'
      : '../ui/AppThemeProvider';
    expect(source).toContain(`import { useAppTheme } from '${providerPath}'`);
    expect(source).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(source).toContain('useMemo(() => createStyles(theme, mode), [mode, theme])');
    expect(source).toContain('backgroundColor: theme.surface.raised');
    expect(source).toContain('backgroundColor: theme.surface.card');
    expect(source).toContain('borderColor: theme.border.subtle');
    expect(source).toContain("const primaryInk = mode === 'light' ? colors.text : theme.ink.primary");
    expect(source).toContain("const mutedInk = mode === 'light' ? colors.textMuted : theme.ink.muted");
    expect(source).toContain('color: primaryInk');
    expect(source).toContain('color: mutedInk');
    expect(source).toContain('backgroundColor: theme.ink.action');
    expect(source).not.toContain('const styles = StyleSheet.create');
    expect(source).not.toContain('colors.background');
    expect(source).not.toContain('color: colors.textMuted');
    expect(source).not.toContain('color: colors.textFaint');
  });

  test('retains the exact light surfaces and blue accents while supplying dark equivalents', () => {
    for (const source of allScreens) {
      expect(source).toContain("mode === 'light' ? colors.primarySoft : theme.surface.muted");
      expect(source).toContain("mode === 'light' ? colors.textFaint : theme.ink.muted");
      expect(source).toContain('theme.surface.raised');
      expect(source).toContain('theme.ink.action');
    }
  });

  test('keeps every compact action at least 48dp through its visible size or hit area', () => {
    expect(groups).toMatch(/joinBtn:\s*\{[^}]*minHeight: 36/s);
    expect(groups).toContain('hitSlop={6}');
    expect(pages).toMatch(/followBtn:\s*\{[^}]*minHeight: 36/s);
    expect(pages).toContain('hitSlop={6}');
    for (const source of [groups, pages]) {
      expect(source).toMatch(/fab:\s*\{[^}]*minHeight: spacing\.touch/s);
    }
    for (const source of [groupDetail, pageDetail]) {
      expect(source).toMatch(/postBtn:\s*\{[^}]*minHeight: 44/s);
      expect(source).toContain('hitSlop={2}');
      expect(source).toContain('hitSlop={8}');
      expect(source).toContain('hitSlop={10}');
    }
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s cards, text and actions retain accessible contrast',
    (mode) => {
      const theme = themeColors(mode);
      expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.muted, theme.surface.card)).toBeGreaterThanOrEqual(3);
      expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('preserves the established group/page destinations and privacy gates', () => {
    expect(groups).toContain("router.push('/group-new' as never)");
    expect(pages).toContain("router.push('/page-new' as never)");
    expect(groupDetail).toContain("router.replace('/groups' as never)");
    expect(pageDetail).toContain("router.replace('/pages' as never)");
    expect(groupDetail).toContain("target.privacy === 'private'");
    expect(groupDetail).toContain('joinGroupWithKey(target.id, keyInput)');
    expect(pageDetail).toContain('page.is_owner');
  });
});
