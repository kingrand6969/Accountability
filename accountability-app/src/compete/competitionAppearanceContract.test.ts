import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { themeColors } from '../ui/theme';

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

describe('competition and challenge appearance contract', () => {
  test('themes the shared glass foundation with permanent dark semantic roles', () => {
    expect(glass).toContain("import { useAppTheme } from './AppThemeProvider'");
    expect(glass).toContain('[theme.surface.canvas, theme.surface.card, theme.surface.raised]');
    expect(glass).toContain('[theme.ink.action, theme.surface.muted]');
    expect(glass).toContain('tint="dark"');
    expect(glass).toContain('theme.surface.canvas');
    expect(glass).toContain('theme.surface.card');
    expect(glass).toContain('theme.border.strong');
    expect(glass).not.toContain("mode === 'light'");
    expect(glass).not.toContain("tint='light'");
  });

  test('competition controls use permanent dark semantic roles', () => {
    expect(controls).toContain("export const INK = '#111411'");
    expect(controls).toContain("export const INK_SOFT = 'rgba(17,20,17,0.72)'");
    expect(controls).toContain("export const ACCENT = '#446B00'");
    expect(controls).toContain('export function useCompetitionTheme()');
    expect(controls).toContain('const { colors: theme } = useAppTheme()');
    expect(controls).toContain('const palette = useMemo(() => competitionPalette(theme), [theme])');
    expect(controls).toContain('ink: theme.ink.primary');
    expect(controls).toContain('inkSoft: theme.ink.secondary');
    expect(controls).toContain('accent: theme.ink.action');
    expect(controls).toContain('onAccent: theme.ink.inverse');
    expect(controls).toContain('segmentSurface: theme.surface.card');
    expect(controls).toContain('chipSurface: theme.surface.raised');
    expect(controls).toContain('selectedRow: theme.surface.muted');
    expect(controls).toContain('inputBorder: theme.border.strong');
    expect(controls).not.toContain("mode === 'light'");
    expect(controls).not.toContain('rgba(255,255,255');
    expect(controls).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['Compete', compete],
    ['Challenge detail', detail],
    ['Challenge creation', create],
  ])('%s binds all route chrome to the permanent competition palette', (_label, screen) => {
    expect(screen).toContain('useCompetitionTheme');
    expect(screen).toContain('const { palette } = useCompetitionTheme()');
    expect(screen).toContain('useMemo(() => createStyles(palette), [palette])');
    expect(screen).toContain('color: palette.ink');
    expect(screen).toContain('color: palette.inkSoft');
    expect(screen).toContain('backgroundColor: palette.accent');
    expect(screen).not.toContain("mode === 'light'");
    expect(screen).not.toContain("mode === 'dark'");
    expect(screen).not.toContain('const styles = StyleSheet.create({');
  });

  test('permanent dark competition text and actions meet normal-text contrast', () => {
    const theme = themeColors('dark');
    expect(contrast(theme.ink.primary, theme.surface.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme.ink.inverse, theme.ink.action)).toBeGreaterThanOrEqual(4.5);
  });

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

  test('competition status colors remain status-semantic and distinct from neon actions', () => {
    const theme = themeColors('dark');
    expect(contrast(theme.status.attention, theme.surface.raised)).toBeGreaterThanOrEqual(4.5);
    expect(controls).toContain('statusAttention: theme.status.attention');
    expect(compete).toContain('color={palette.statusAttention}');
    expect(compete).toContain('borderColor: palette.statusAttention');
    expect(carousel).toContain('theme.status.success');
  });
});
