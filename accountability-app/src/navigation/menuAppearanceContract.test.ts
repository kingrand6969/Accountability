import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('permanent dark appearance shell contract', () => {
  test('does not expose app appearance controls in Menu', () => {
    const menu = source('src/app/menu.tsx');
    const feed = source('src/app/(app)/index.tsx');

    expect(menu).not.toContain('APPEARANCE_OPTIONS');
    expect(menu).not.toContain('setMode');
    expect(menu).not.toContain('Light appearance');
    expect(menu).not.toContain('Dark appearance');
    expect(feed).not.toContain('APPEARANCE_OPTIONS');
  });

  test('forces dark native chrome, splash, and adaptive icon canvases', () => {
    const config = JSON.parse(source('app.json')) as {
      expo: {
        backgroundColor?: string;
        userInterfaceStyle?: string;
        android?: {
          adaptiveIcon?: { backgroundColor?: string; backgroundImage?: string };
        };
        plugins?: unknown[];
      };
    };
    const splashPlugin = config.expo.plugins?.find(
      (plugin): plugin is [string, { backgroundColor?: string }] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );

    expect(config.expo.backgroundColor).toBe('#0B0D0B');
    expect(config.expo.userInterfaceStyle).toBe('dark');
    expect(config.expo.android?.adaptiveIcon?.backgroundColor).toBe('#0B0D0B');
    expect(config.expo.android?.adaptiveIcon?.backgroundImage).toBeUndefined();
    expect(splashPlugin?.[1]?.backgroundColor).toBe('#0B0D0B');
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
