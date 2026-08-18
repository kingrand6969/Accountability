import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('Journey Momentum appearance contract', () => {
  test('themes the exported athlete surface and every async state without changing its routes', () => {
    const momentum = source('MomentumScreen.tsx');

    expect(momentum).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(momentum).toContain('const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);');
    expect(momentum).toContain('pillarDefinitions(theme, mode)');
    expect(momentum).toContain("mode === 'dark' ? theme.status.success : '#13753D'");
    expect(momentum).toContain('<JourneyTabs active="momentum" />');
    expect(momentum).toContain('<ActivityIndicator color={theme.ink.action}');
    expect(momentum).toContain('color={theme.status.danger}');
    expect(momentum).toContain('backgroundColor: theme.surface.canvas');
    expect(momentum).toContain('backgroundColor: theme.surface.card');
    expect(momentum).toContain('borderColor: theme.border.subtle');
    expect(momentum).toContain('color: theme.ink.primary');
    expect(momentum).toContain('color: theme.ink.muted');
    expect(momentum).toContain("router.push('/notifications' as never)");
    expect(momentum).toContain("? '/body'");
    expect(momentum).toContain(": '/messages') as never");
    expect(momentum).not.toContain("backgroundColor: '#031A38'");
    expect(momentum).not.toContain("backgroundColor: 'rgba(8,43,78");
    expect(momentum).not.toContain('color="#FFFFFF"');
  });

  test('themes Journey tabs while preserving the explicit dark legacy fallback and tab behavior', () => {
    const tabs = source('JourneyTabs.tsx');

    expect(tabs).toContain('const { colors: activeTheme } = useAppTheme();');
    expect(tabs).toContain("dark ? themeColors('dark') : activeTheme");
    expect(tabs).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(tabs).toContain('borderBottomColor: theme.border.subtle');
    expect(tabs).toContain('color: theme.ink.muted');
    expect(tabs).toContain('color: theme.ink.primary');
    expect(tabs).toContain('backgroundColor: theme.ink.action');
    expect(tabs).toContain('router.replace(tab.route as never)');
    expect(tabs).not.toContain('styles.rowDark');
    expect(tabs).not.toContain("color: '#FFFFFF'");
  });

  test('themes the directly-used Cheers card with no white island in Dark mode', () => {
    const encouragement = source('JourneyEncouragementBar.tsx');

    expect(encouragement).toContain('const { colors: activeTheme } = useAppTheme();');
    expect(encouragement).toContain("dark ? themeColors('dark') : activeTheme");
    expect(encouragement).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(encouragement).toContain('backgroundColor: theme.surface.card');
    expect(encouragement).toContain('borderColor: theme.border.subtle');
    expect(encouragement).toContain('borderColor: theme.surface.card');
    expect(encouragement).toContain('backgroundColor: theme.surface.muted');
    expect(encouragement).toContain('color: theme.ink.primary');
    expect(encouragement).toContain('color: theme.ink.muted');
    expect(encouragement).toContain('color={theme.ink.action}');
    expect(encouragement).not.toContain("borderColor: '#FFFFFF'");
    expect(encouragement).not.toContain('styles.barDark');
  });
});
