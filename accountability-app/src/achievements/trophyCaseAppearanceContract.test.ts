import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

import { themeColors, type AppThemeMode } from '../ui/theme';

const source = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, file), 'utf8');

const trophy = source('../app/achievements.tsx');
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
  test('themes the Trophy Case hierarchy while retaining its approved light presentation', () => {
    expect(trophy).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(trophy).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(trophy).toContain(
      'const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);',
    );
    expect(trophy).toContain('function trophyPalette(theme: AppThemeColors, mode: AppThemeMode)');
    expect(trophy).toContain("canvas: mode === 'dark' ? theme.surface.canvas : '#F7F4EC'");
    expect(trophy).toContain("card: mode === 'dark' ? theme.surface.card : '#FFFCF6'");
    expect(trophy).toContain("ink: mode === 'dark' ? theme.ink.primary : '#081A3A'");
    expect(trophy).toContain("muted: mode === 'dark' ? theme.ink.muted : '#647084'");
    expect(trophy).toContain("border: mode === 'dark' ? theme.border.subtle : '#DED9CC'");
    expect(trophy).toContain("consistencyLockedInk: mode === 'dark' ? theme.ink.muted : '#9AA6B4'");
    expect(trophy).toContain("ladderLocked: mode === 'dark' ? theme.border.strong : 'rgba(30,27,75,0.12)'");
    expect(trophy).toContain("prestigeLockedIcon: mode === 'dark' ? theme.ink.muted : '#7C8796'");
    expect(trophy).toContain('backgroundColor: palette.canvas');
    expect(trophy).toContain('backgroundColor: palette.card');
    expect(trophy).toContain('color: palette.ink');
    expect(trophy).toContain('color: palette.muted');
    expect(trophy).not.toContain('const styles = StyleSheet.create({');
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

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s semantic copy and controls retain accessible contrast',
    (mode) => {
      const theme = themeColors(mode);
      expect(contrast(theme.ink.primary, theme.surface.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
    },
  );
});
