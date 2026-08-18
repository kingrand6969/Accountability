import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('manual appearance shell contract', () => {
  test('offers exactly Light and Dark as accessible selected controls in Menu', () => {
    const menu = source('src/app/menu.tsx');
    const feed = source('src/app/(app)/index.tsx');

    expect(menu).toContain("const APPEARANCE_OPTIONS: AppearanceOption[] = [");
    expect(menu).toContain("{ mode: 'light', label: 'Light'");
    expect(menu).toContain("{ mode: 'dark', label: 'Dark'");
    expect(menu).not.toContain("mode: 'system'");
    expect(menu).toContain('accessibilityRole="radio"');
    expect(menu).toContain('accessibilityState={{ selected }}');
    expect(menu).toContain('onPress={() => setMode(option.mode)}');
    expect(feed).not.toContain('APPEARANCE_OPTIONS');
  });

  test('wraps the app in the non-blocking theme provider and themes the root stack', () => {
    const root = source('src/app/_layout.tsx');

    expect(root).toContain("from '../ui/AppThemeProvider'");
    expect(root).toContain('<AppThemeProvider>');
    expect(root).toContain('headerStyle: { backgroundColor: theme.surface.raised }');
    expect(root).toContain('contentStyle: { backgroundColor: theme.surface.canvas }');
    expect(root).not.toContain('themeLoading');
  });
});
