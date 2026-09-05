import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const timelineCard = readFileSync(require.resolve('./TimelineCard'), 'utf8');
const hourGrid = readFileSync(require.resolve('./HourGrid'), 'utf8');

describe('Today populated timeline appearance contract', () => {
  test('themes populated Timeline cards with permanent dark roles while preserving routing', () => {
    expect(timelineCard).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(timelineCard).toContain('const { colors: theme } = useAppTheme()');
    expect(timelineCard).toContain('const palette = useMemo(() => timelinePalette(theme), [theme])');
    expect(timelineCard).toContain('const styles = useMemo(() => createStyles(palette), [palette])');
    expect(timelineCard).toContain('surface: theme.surface.card');
    expect(timelineCard).toContain('ink: theme.ink.primary');
    expect(timelineCard).toContain('quietInk: theme.ink.muted');
    expect(timelineCard).toContain('badgeSurface: theme.surface.raised');
    expect(timelineCard).toContain("pathname: '/item/[id]'");
    expect(timelineCard).toContain('hitSlop={8}');
    expect(timelineCard).not.toMatch(/\bcolors\./);
    expect(timelineCard).not.toContain("mode === 'light'");
  });

  test('themes the 24-hour grid and preserves its 48dp rows', () => {
    expect(hourGrid).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(hourGrid).toContain('const { colors: theme } = useAppTheme()');
    expect(hourGrid).toContain('const styles = useMemo(() => createStyles(theme), [theme])');
    expect(hourGrid).toContain('color: theme.ink.muted');
    expect(hourGrid).toContain('backgroundColor: theme.border.subtle');
    expect(hourGrid).toContain('minHeight: 48');
    expect(hourGrid).toContain('onPress={() => onPressHour(h)}');
    expect(hourGrid).not.toMatch(/\bcolors\./);
    expect(hourGrid).not.toContain("mode === 'light'");
  });
});
