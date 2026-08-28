import fs from 'fs';
import path from 'path';

import { describe, expect, test } from '@jest/globals';

import { themeColors } from '../ui/theme';

function route(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../app/${relativePath}`), 'utf8');
}

const groupNew = route('group-new.tsx');
const pageNew = route('page-new.tsx');

function privacySelector(source: string): string {
  const start = source.indexOf('function PrivacySelector');
  const end = source.indexOf('const createStyles', start);
  return source.slice(start, end).trim();
}

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

describe('Group and Page creation appearance contract', () => {
  test.each([
    ['group creation', groupNew],
    ['page creation', pageNew],
  ])('%s uses permanent dark form, field, selection and action roles', (_name, source) => {
    expect(source).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(source).toContain('const { colors: theme } = useAppTheme()');
    expect(source).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(source).toContain('backgroundColor: theme.surface.canvas');
    expect(source).toContain('backgroundColor: theme.surface.raised');
    expect(source).toContain('backgroundColor: theme.surface.muted');
    expect(source).toContain('borderColor: theme.border.subtle');
    expect(source).toContain('color: theme.ink.primary');
    expect(source).toContain('color: theme.ink.muted');
    expect(source).toContain('color: theme.status.danger');
    expect(source).toContain('backgroundColor: theme.ink.action');
    expect(source).toContain('color: theme.ink.inverse');
    expect(source).not.toContain("mode === 'light'");
    expect(source).not.toContain("mode === 'dark'");
    expect(source).not.toContain('type AppThemeMode');
    expect(source).not.toMatch(/#(?:fff|ffffff)\b/i);
    expect(source).not.toContain('const styles = StyleSheet.create');
    expect(source).not.toContain('backgroundColor: colors.background');
    expect(source).not.toContain('placeholderTextColor={colors.textFaint}');
  });

  test('uses one symmetric, theme-aware privacy control in both forms', () => {
    expect(groupNew).toContain('<PrivacySelector');
    expect(pageNew).toContain('<PrivacySelector');
    expect(groupNew).not.toContain("from '../ui/PrivacyToggle'");
    expect(pageNew).not.toContain("from '../ui/PrivacyToggle'");
    expect(privacySelector(groupNew)).toBe(privacySelector(pageNew));
    for (const source of [groupNew, pageNew]) {
      expect(source).toContain('accessibilityState={{ selected }}');
      expect(source).toContain('hitSlop={2}');
      expect(source).toMatch(/privacySegment:\s*\{[^}]*minHeight: 44/s);
    }
  });

  test('keeps every direct form control at least 48dp', () => {
    for (const source of [groupNew, pageNew]) {
      expect(source).toMatch(/input:\s*\{[^}]*minHeight: spacing\.touch/s);
      expect(source).toMatch(/privacySegment:\s*\{[^}]*minHeight: 44/s);
      expect(source).toContain('hitSlop={2}');
    }
    expect(pageNew).toMatch(/chip:\s*\{[^}]*minHeight: 44/s);
    expect(pageNew.match(/hitSlop=\{2\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('permanent dark inputs, labels, help and error text retain accessible contrast', () => {
    const theme = themeColors('dark');
    expect(contrast(theme.ink.primary, theme.surface.muted)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.secondary, theme.surface.raised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.muted, theme.surface.raised)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.status.danger, theme.surface.raised)).toBeGreaterThanOrEqual(4.5);
  });

  test('preserves validation, privacy payloads, account guards, keyboard behavior and destinations', () => {
    expect(groupNew).toContain("privacy === 'private'");
    expect(groupNew).toContain("gatekey: privacy === 'private' ? keyTrimmed : undefined");
    expect(groupNew).toContain("router.replace(`/group/${newId}` as never)");
    expect(pageNew).toContain('HANDLE_RE.test(handle)');
    expect(pageNew).toContain('privacy,');
    expect(pageNew).toContain("router.replace(`/page/${newId}` as never)");
    for (const source of [groupNew, pageNew]) {
      expect(source).toContain('currentOwnerRef');
      expect(source).toContain("behavior={Platform.OS === 'ios' ? 'padding' : undefined}");
      expect(source).toContain('keyboardShouldPersistTaps="handled"');
    }
  });
});
