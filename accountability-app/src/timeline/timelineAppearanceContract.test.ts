import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const timelineCard = readFileSync(require.resolve('./TimelineCard'), 'utf8');
const hourGrid = readFileSync(require.resolve('./HourGrid'), 'utf8');

describe('Today populated timeline appearance contract', () => {
  test('themes populated Timeline cards while preserving exact Light tokens and routing', () => {
    expect(timelineCard).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(timelineCard).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(timelineCard).toContain('const palette = useMemo(() => timelinePalette(theme, mode), [mode, theme])');
    expect(timelineCard).toContain('const styles = useMemo(() => createStyles(palette), [palette])');
    expect(timelineCard).toContain("surface: mode === 'light' ? legacyColors.surfaceAlt : theme.surface.card");
    expect(timelineCard).toContain("ink: mode === 'light' ? legacyColors.text : theme.ink.primary");
    expect(timelineCard).toContain("quietInk: mode === 'light' ? legacyColors.textFaint : theme.ink.muted");
    expect(timelineCard).toContain("badgeSurface: mode === 'light' ? legacyColors.surface : theme.surface.raised");
    expect(timelineCard).toContain("pathname: '/item/[id]'");
    expect(timelineCard).toContain('hitSlop={8}');
    expect(timelineCard).not.toMatch(/\bcolors\./);
  });

  test('themes the 24-hour grid and preserves its 48dp rows', () => {
    expect(hourGrid).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(hourGrid).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(hourGrid).toContain('const styles = useMemo(() => createStyles(theme, mode), [mode, theme])');
    expect(hourGrid).toContain("mode === 'light' ? legacyColors.textFaint : theme.ink.muted");
    expect(hourGrid).toContain("mode === 'light' ? legacyColors.surface : theme.border.subtle");
    expect(hourGrid).toContain('minHeight: 48');
    expect(hourGrid).toContain('onPress={() => onPressHour(h)}');
    expect(hourGrid).not.toMatch(/\bcolors\./);
  });
});
