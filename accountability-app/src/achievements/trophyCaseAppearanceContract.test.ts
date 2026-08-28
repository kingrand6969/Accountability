import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

import { themeColors } from '../ui/theme';

const source = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, file), 'utf8');

const trophy = source('../app/achievements.tsx');
const books = source('../app/books.tsx');
const rankCarousel = source('RankCarousel.tsx');
const missions = source('MissionsList.tsx');
const challenges = source('ChallengesCarousel.tsx');

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

describe('Trophy Case manual appearance contract', () => {
  test('uses permanent dark semantic roles for the Trophy Case route and medal sheet', () => {
    expect(trophy).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(trophy).toContain('const { colors: theme } = useAppTheme();');
    expect(trophy).toContain(
      'const styles = useMemo(() => createStyles(theme), [theme]);',
    );
    expect(trophy).toContain('function trophyPalette(theme: AppThemeColors)');
    expect(trophy).toContain('canvas: theme.surface.canvas');
    expect(trophy).toContain('card: theme.surface.card');
    expect(trophy).toContain('sheet: theme.surface.raised');
    expect(trophy).toContain('scrim: theme.interaction.scrim');
    expect(trophy).toContain('ink: theme.ink.primary');
    expect(trophy).toContain('muted: theme.ink.muted');
    expect(trophy).toContain('primary: theme.ink.action');
    expect(trophy).toContain('actionInk: theme.ink.inverse');
    expect(trophy).toContain('backgroundColor: palette.canvas');
    expect(trophy).toContain('backgroundColor: palette.card');
    expect(trophy).toContain('color: palette.ink');
    expect(trophy).toContain('color: palette.muted');
    expect(trophy).not.toContain("mode === 'light'");
    expect(trophy).not.toContain("mode === 'dark'");
    expect(trophy).not.toContain("backgroundColor: '#fff'");
    expect(trophy).not.toContain('const styles = StyleSheet.create({');
  });

  test('uses permanent dark semantic roles for the Books route while preserving cover media', () => {
    expect(books).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(books).toContain('const { colors: theme } = useAppTheme();');
    expect(books).toContain('const palette = useMemo(() => booksPalette(theme), [theme]);');
    expect(books).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(books).toContain('function booksPalette(theme: AppThemeColors)');
    expect(books).toContain('background: theme.surface.canvas');
    expect(books).toContain('card: theme.surface.card');
    expect(books).toContain('field: theme.surface.raised');
    expect(books).toContain('mutedSurface: theme.surface.muted');
    expect(books).toContain('action: theme.ink.action');
    expect(books).toContain('onAction: theme.ink.inverse');
    expect(books).toContain('<Image source={{ uri: feed.pick.coverUrl }} style={styles.cover} resizeMode="cover" />');
    expect(books).toContain('<Image source={{ uri: b.coverUrl }} style={styles.rowCover} resizeMode="cover" />');
    expect(books).not.toContain("mode === 'light'");
    expect(books).not.toContain('legacyColors');
  });

  test('keeps real Trophy Case art, tier color, data and navigation behavior intact', () => {
    expect(trophy).toContain('<Medal state={state} size={72} />');
    expect(trophy).toContain('<Medal state={s} size={92} />');
    expect(trophy).toContain('<RankCarousel points={points}');
    expect(trophy).toContain('TIER_META[medalMetal(s.def, s.tierIndex)]');
    expect(trophy).toContain('MEDALS.map((def) => medalState(def, m[def.metric]))');
    expect(trophy).toContain("router.push('/activity' as never)");
    expect(trophy).toContain("router.push('/compete' as never)");
    expect(trophy).toContain("pathname: '/challenge/[id]'");
    expect(trophy).not.toContain('/compose?text=');
  });

  test('routes both medal share actions through one typed idempotent Flex context', () => {
    expect(trophy).toContain("pathname: '/win-card'");
    expect(trophy).toContain("achievementKind: 'medal'");
    expect(trophy).toContain(
      'achievementSourceId: `medal:${state.def.id}:tier:${state.tierIndex}`',
    );
    expect(trophy).toContain('achievementTitle: medalTitle');
    expect(trophy).toContain('achievementText: `Just earned the ${medalTitle} medal`');
    expect(trophy).toContain("autoPrompt: '1'");
    expect(trophy.match(/onShare=\{openMedalFlex\}/g)).toHaveLength(2);
  });

  test.each([
    ['rank carousel', rankCarousel],
    ['missions', missions],
    ['challenges', challenges],
  ])('%s removes light-only card and copy islands in Dark mode', (_name, fileSource) => {
    expect(fileSource).toContain('useAppTheme');
    expect(fileSource).toContain('createStyles(theme, mode)');
    expect(fileSource).toContain("plateOpacity={mode === 'dark' ? 0 : 0.45}");
    expect(fileSource).toContain("mode === 'dark' ? theme.surface.card : 'transparent'");
    expect(fileSource).toContain("mode === 'dark' ? theme.ink.primary");
    expect(fileSource).toContain("mode === 'dark' ? theme.ink.muted");
    expect(fileSource).not.toContain('const styles = StyleSheet.create({');
  });

  test('keeps Trophy Case action controls at least 48dp', () => {
    expect(trophy).toMatch(/pathLink:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(trophy).toMatch(/seeAllButton:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(trophy).toMatch(/shareBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(trophy).toMatch(/doneBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(missions).toMatch(/flexBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(challenges).toMatch(/btn:\s*\{[^}]*minHeight: spacing\.touch/s);
  });

  test('permanent dark semantic copy and controls retain accessible contrast', () => {
    const theme = themeColors('dark');
    expect(contrast(theme.ink.primary, theme.surface.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
  });
});
