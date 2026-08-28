import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const sourceRoot = path.resolve(__dirname, '..');
const illustrativeColorFiles = new Set([
  path.normalize('achievements/catalog.ts'),
  path.normalize('achievements/medalArt.ts'),
  path.normalize('achievements/rankAssets.ts'),
  path.normalize('media/PhotoEditor.tsx'),
]);

const retiredBrandColors = [
  '#155eef', '#1d4ed8', '#081a3a', '#20c7d9', '#2563eb', '#3b82f6',
  '#60a5fa', '#ea580c', '#ff642f', '#ff6334', '#f97316', '#4f8cff',
  '#0ea5e9', '#1e3a8a', '#bfdbfe', '#dbeafe', '#cfe0ff', '#a9c5ff',
  '#9ebef1', '#8db6ff', '#e7f0ff', '#cff3fa', '#bfeff7', '#7fd6e3',
  '#2f7bff', '#06152e', '#031126', '#1e40af',
  '#f7f4ec', '#1e1b4b', '#7c3aed', '#4f46e5', '#4338ca', '#aeb9ff',
  '#e4dcf7', '#edf4fc', '#deeaf8', '#c9dcf4', '#eff6ff', '#f5f8ff',
  '#eef4ff', '#f3f6fc',
  '#93c5fd', '#e1eeff', '#b7d6f7', '#d7e4f8', '#dce8ff', '#d9e7ff',
  '#071a46', '#0b4fd8', '#0a84ff', '#0d3d83', '#9cc0ff', '#bfd2f4',
  '#d9e6ff', '#5f96ff', '#76a5ff', '#72a4ff', '#0c1c2a', '#e8eef3',
  '#a855f7', '#a78bfa',
] as const;

const retiredBrandRgba = [
  'rgba(21,94,239', 'rgba(37,99,235', 'rgba(59,130,246',
  'rgba(96,165,250', 'rgba(234,88,12', 'rgba(255,100,47',
  'rgba(30,27,75', 'rgba(79,70,229', 'rgba(8,26,58',
] as const;

function productionSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(absolute);
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.(test|spec)\./.test(entry.name)) return [];
    if (/Contract\.tsx?$/.test(entry.name)) return [];
    return [absolute];
  });
}

describe('app-wide AccountAbility color identity', () => {
  test('does not hardcode the retired blue or orange brand in production UI', () => {
    const offenders = productionSources(sourceRoot).flatMap((absolute) => {
      const relative = path.normalize(path.relative(sourceRoot, absolute));
      if (illustrativeColorFiles.has(relative)) return [];
      const source = readFileSync(absolute, 'utf8').toLowerCase();
      const colors = retiredBrandColors.filter((color) => source.includes(color));
      const rgba = retiredBrandRgba.filter((color) => source.includes(color));
      return colors.length || rgba.length
        ? [`${relative}: ${[...colors, ...rgba].join(', ')}`]
        : [];
    });

    expect(offenders).toEqual([]);
  });

  test('uses the permanent dark canvas for native root, splash, and adaptive icon chrome', () => {
    const projectRoot = path.resolve(sourceRoot, '..');
    const appConfig = JSON.parse(readFileSync(path.join(projectRoot, 'app.json'), 'utf8')) as {
      expo: {
        backgroundColor: string;
        userInterfaceStyle: string;
        android: { adaptiveIcon: { backgroundColor: string } };
        plugins: Array<string | [string, Record<string, unknown>]>;
      };
    };
    const legalBuilder = readFileSync(path.join(projectRoot, 'scripts/build-legal.mjs'), 'utf8');
    const splashPlugin = appConfig.expo.plugins.find((plugin) => (
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
    ));

    expect(appConfig.expo.backgroundColor).toBe('#0B0D0B');
    expect(appConfig.expo.userInterfaceStyle).toBe('dark');
    expect(appConfig.expo.android.adaptiveIcon.backgroundColor).toBe('#0B0D0B');
    expect(splashPlugin).toEqual([
      'expo-splash-screen',
      {
        backgroundColor: '#0B0D0B',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 140,
        },
      },
    ]);
    expect(legalBuilder.toLowerCase()).not.toContain('#2563eb');
    expect(legalBuilder.toLowerCase()).toContain('#b9ff3d');
  });

  test('keeps the public theme boundary dark-only without persisted appearance preferences', () => {
    const themeSource = readFileSync(path.join(sourceRoot, 'ui/theme.ts'), 'utf8');
    const providerSource = readFileSync(path.join(sourceRoot, 'ui/AppThemeProvider.tsx'), 'utf8');

    expect(themeSource).toContain("return 'dark';");
    expect(themeSource).toContain('return darkSemanticTheme;');
    expect(providerSource).not.toContain('APP_THEME_STORAGE_KEY');
    expect(providerSource).not.toContain('AsyncStorage');
    expect(providerSource).not.toContain('useColorScheme');
  });

  test('uses semantic foregrounds on status and neon app controls', () => {
    const runTracker = readFileSync(path.join(sourceRoot, 'activity/RunTrackerOpenMap.tsx'), 'utf8');
    const buddyGallery = readFileSync(path.join(sourceRoot, 'app/buddy-medals/[id].tsx'), 'utf8');
    const trophyCase = readFileSync(path.join(sourceRoot, 'app/achievements.tsx'), 'utf8');

    expect(runTracker).toContain("danger ? colors.text : outlinedSecondary");
    expect(runTracker).toContain('actionLabelDanger: { color: colors.text }');
    expect(buddyGallery).toContain('name="refresh" size={18} color={colors.onPrimary}');
    expect(trophyCase).toContain("color={reached ? palette.prestigeReachedIcon : palette.prestigeLockedIcon}");
    expect(trophyCase).toContain('prestigeReachedIcon: theme.ink.inverse');
  });
});
