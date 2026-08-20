import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { themeColors, type AppThemeMode } from '../ui/theme';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

const glass = source('src/ui/Glass.tsx');
const controls = source('src/compete/CompeteUI.tsx');
const compete = source('src/app/compete.tsx');
const detail = source('src/app/challenge/[id].tsx');
const create = source('src/app/challenge-new.tsx');
const carousel = source('src/achievements/ChallengesCarousel.tsx');

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
  const high = Math.max(luminance(foreground), luminance(background));
  const low = Math.min(luminance(foreground), luminance(background));
  return (high + 0.05) / (low + 0.05);
}

function composite(foreground: string, background: string, alpha: number): string {
  const fg = foreground.slice(1).match(/.{2}/g)!.map((value) => parseInt(value, 16));
  const bg = background.slice(1).match(/.{2}/g)!.map((value) => parseInt(value, 16));
  return `#${fg.map((value, index) =>
    Math.round(value * alpha + bg[index] * (1 - alpha))
      .toString(16)
      .padStart(2, '0'),
  ).join('')}`;
}

describe('competition and challenge appearance contract', () => {
  test('themes the shared glass foundation while preserving the approved Light treatment', () => {
    expect(glass).toContain("import { useAppTheme } from './AppThemeProvider'");
    expect(glass).toContain("mode === 'light'");
    expect(glass).toContain("['#EDF4FC', '#DEEAF8', '#C9DCF4']");
    expect(glass).toContain("tint={mode === 'light' ? 'light' : 'dark'}");
    expect(glass).toContain('theme.surface.canvas');
    expect(glass).toContain('theme.surface.card');
    expect(glass).toContain('theme.border.strong');
  });

  test('competition controls keep their exact Light palette and derive Dark from semantic roles', () => {
    expect(controls).toContain("export const INK = '#1e1b4b'");
    expect(controls).toContain("export const INK_SOFT = 'rgba(30,27,75,0.72)'");
    expect(controls).toContain("export const ACCENT = '#2563eb'");
    expect(controls).toContain('export function useCompetitionTheme()');
    expect(controls).toContain("mode === 'light' ? INK : theme.ink.primary");
    expect(controls).toContain("mode === 'light' ? INK_SOFT : theme.ink.secondary");
    expect(controls).toContain("mode === 'light' ? ACCENT : theme.ink.action");
    expect(controls).toContain("mode === 'light' ? '#fff' : theme.ink.inverse");
    expect(controls).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['Compete', compete],
    ['Challenge detail', detail],
    ['Challenge creation', create],
  ])('%s binds styles and inline colors to live appearance', (_label, screen) => {
    expect(screen).toContain('useCompetitionTheme');
    expect(screen).toContain('const { palette } = useCompetitionTheme()');
    expect(screen).toContain('useMemo(() => createStyles(palette), [palette])');
    expect(screen).toContain('color: palette.ink');
    expect(screen).toContain('color: palette.inkSoft');
    expect(screen).toContain('backgroundColor: palette.accent');
    expect(screen).not.toContain('const styles = StyleSheet.create({');
  });

  test.each(['light', 'dark'] satisfies AppThemeMode[])(
    '%s semantic competition text and actions meet normal-text contrast',
    (mode) => {
      const theme = themeColors(mode);
      expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('all direct competition actions and shared selectors expose 48dp targets', () => {
    expect(controls).toMatch(/segBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(controls).toMatch(/chip:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(compete).toMatch(/winBtn:\s*\{[^}]*width: spacing\.touch[^}]*height: spacing\.touch/s);
    expect(compete).toContain('<View style={styles.winIcon}>');
    expect(compete).toMatch(/winIcon:\s*\{[^}]*width: 34[^}]*height: 34[^}]*borderRadius: 17/s);
    expect(compete).toMatch(/rankBtn:\s*\{[^}]*minWidth: spacing\.touch[^}]*minHeight: spacing\.touch/s);
    expect(compete).toMatch(/secondaryBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(compete).toMatch(/joinBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(compete).toMatch(/flexBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(detail).toMatch(/retryBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(detail).toMatch(/joinBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(detail).toMatch(/inviteBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
  });

  test('competition labels can grow and wrap without colliding or truncating identity', () => {
    expect(controls).toContain('segText: { flexShrink: 1');
    expect(controls).toContain('chipText: { flexShrink: 1');
    expect(controls).toContain('<View style={styles.rankCopy}>');
    expect(controls).not.toContain('style={styles.name} numberOfLines={1}');
    expect(controls).not.toContain('style={styles.sub} numberOfLines={1}');
    expect(compete).not.toContain('style={styles.challengeTitle} numberOfLines={1}');
    expect(compete).toContain('challengeCopy: { flex: 1, minWidth: 0 }');
    expect(detail).toContain('inviteText: { flexShrink: 1');
    expect(carousel).not.toContain('style={styles.title} numberOfLines={2}');
  });

  test('Light challenge secondary and success text meet 4.5:1 on the darkest approved glass stop', () => {
    const darkestGlass = '#C9DCF4';
    const secondary = composite('#1E1B4B', darkestGlass, 0.72);
    const joinedSurface = composite('#16A34A', darkestGlass, 0.14);

    expect(contrast(secondary, darkestGlass)).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#166534', joinedSurface)).toBeGreaterThanOrEqual(4.5);
    expect(carousel).toContain("success: mode === 'dark' ? theme.status.success : '#166534'");
    expect(carousel).toContain("pillJoined: mode === 'dark' ? theme.status.successSoft : 'rgba(22,163,74,0.14)'");
  });
});
