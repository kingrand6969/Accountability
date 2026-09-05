import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { themeColors } from '../ui/theme';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

function luminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrast(foreground: string, background: string): number {
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

function composite(foreground: string, background: string, opacity: number): string {
  const value = (hex: string, offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  const channels = [1, 3, 5].map((offset) => Math.round(
    (value(foreground, offset) * opacity) + (value(background, offset) * (1 - opacity)),
  ));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

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

  test('plates bright Home and Menu gradients so copy and functional icons remain readable', () => {
    const home = source('src/home/HomeHeader.tsx');
    const menu = source('src/app/menu.tsx');
    const theme = themeColors('dark');
    const scrimOpacity = 0.72;
    const homeTextWorstCase = composite(theme.surface.canvas, '#9EDB2B', scrimOpacity);
    const homeIconWorstCase = composite('#FFFFFF', homeTextWorstCase, 0.12);
    const menuTextWorstCase = composite(theme.surface.canvas, '#B9FF3D', scrimOpacity);
    const menuIconWorstCase = composite('#FFFFFF', menuTextWorstCase, 0.2);

    expect(home).toContain('<View style={styles.contentPlate}>');
    expect(home).toContain("backgroundColor: 'rgba(11,13,11,0.72)'");
    expect(home).toContain("backgroundColor: 'rgba(255,255,255,0.12)'");
    expect(menu).toContain('<View style={styles.profilePlate}>');
    expect(menu).toContain("backgroundColor: 'rgba(11,13,11,0.72)'");
    expect(menu).toContain("backgroundColor: 'rgba(255,255,255,0.2)'");
    expect(contrast('#FFFFFF', homeTextWorstCase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#F2F5EE', homeIconWorstCase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', homeIconWorstCase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', menuTextWorstCase)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', menuIconWorstCase)).toBeGreaterThanOrEqual(3);
  });

  test('labels every HomeHeader navigation control as a button', () => {
    const home = source('src/home/HomeHeader.tsx');

    expect(home.match(/accessibilityRole="button"/g)).toHaveLength(3);
    expect(home).toContain('accessibilityLabel="Share your streak"');
    expect(home).toContain('accessibilityLabel="Accountability buddies"');
    expect(home).toContain('accessibilityLabel="See your full progress"');
  });

  test('uses a semantic dark foreground for the amber Trophy Case icon', () => {
    const menu = source('src/app/menu.tsx');
    const theme = themeColors('dark');

    expect(menu).toContain('name="medal" size={19} color={colors.onPrimary}');
    expect(contrast(theme.ink.inverse, '#f59e0b')).toBeGreaterThanOrEqual(3);
  });
});
