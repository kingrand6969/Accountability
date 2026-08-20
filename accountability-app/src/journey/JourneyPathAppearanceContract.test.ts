import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const journeyPath = readFileSync(require.resolve('./JourneyPathScreen'), 'utf8');

describe('Journey Path appearance contract', () => {
  test('binds Journey Path to the live manual appearance without changing the route layout', () => {
    expect(journeyPath).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(journeyPath).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(journeyPath).toContain('const palette = useMemo(() => pathPalette(theme, mode), [mode, theme])');
    expect(journeyPath).toContain('const styles = useMemo(() => createStyles(theme, mode), [mode, theme])');
    expect(journeyPath).toContain('function pathPalette(theme: AppThemeColors, mode: AppThemeMode)');
    expect(journeyPath).toContain('<JourneyTabs active="path" />');
    expect(journeyPath).toContain("router.push('/today' as never)");
    expect(journeyPath).toContain("router.push('/achievements' as never)");
    expect(journeyPath).not.toMatch(/\bcolors\./);
  });

  test('keeps the approved Light artwork exactly and maps Dark surfaces to semantic roles', () => {
    expect(journeyPath).toContain("canvas: mode === 'light' ? legacyColors.cream : theme.surface.canvas");
    expect(journeyPath).toContain("filterSurface: mode === 'light' ? 'rgba(255,255,255,0.62)' : theme.surface.card");
    expect(journeyPath).toContain("errorSurface: mode === 'light' ? '#FFFFFF' : theme.status.dangerSoft");
    expect(journeyPath).toContain("progressSurface: mode === 'light' ? 'rgba(255,255,255,0.72)' : theme.surface.card");
    expect(journeyPath).toContain("currentSurface: mode === 'light' ? '#FFFFFF' : theme.surface.raised");
    expect(journeyPath).toContain('color: palette.ink');
    expect(journeyPath).toContain('color: palette.inkSoft');
    expect(journeyPath).toContain('borderColor: palette.border');
    expect(journeyPath).toContain('minHeight: 52');
  });
});
