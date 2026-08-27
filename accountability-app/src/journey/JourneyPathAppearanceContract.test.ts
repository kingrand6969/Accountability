import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const journeyPath = readFileSync(require.resolve('./JourneyPathScreen'), 'utf8');

describe('Journey Path appearance contract', () => {
  test('binds Journey Path to the live manual appearance without changing the route layout', () => {
    expect(journeyPath).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(journeyPath).toContain('const { colors: theme } = useAppTheme()');
    expect(journeyPath).toContain('const palette = useMemo(() => pathPalette(theme), [theme])');
    expect(journeyPath).toContain('const styles = useMemo(() => createStyles(theme), [theme])');
    expect(journeyPath).toContain('function pathPalette(theme: AppThemeColors)');
    expect(journeyPath).toContain('<JourneyTabs active="path" />');
    expect(journeyPath).toContain("router.push('/today' as never)");
    expect(journeyPath).toContain("router.push('/achievements' as never)");
    expect(journeyPath).not.toMatch(/\bcolors\./);
    expect(journeyPath).not.toContain("mode === 'light'");
  });

  test('maps the canvas, summary, filters, errors and milestones to permanent dark roles', () => {
    expect(journeyPath).toContain('canvas: theme.surface.canvas');
    expect(journeyPath).toContain('filterSurface: theme.surface.card');
    expect(journeyPath).toContain('errorSurface: theme.status.dangerSoft');
    expect(journeyPath).toContain('progressSurface: theme.surface.card');
    expect(journeyPath).toContain('currentSurface: theme.surface.raised');
    expect(journeyPath).toContain('backgroundColor: theme.surface.raised');
    expect(journeyPath).toContain('backgroundColor: theme.ink.action');
    expect(journeyPath).toContain('color: palette.ink');
    expect(journeyPath).toContain('color: palette.inkSoft');
    expect(journeyPath).toContain('borderColor: palette.border');
    expect(journeyPath).toContain('minHeight: 52');
  });
});
