import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const task5JourneyCallers = [
  source('MomentumScreen.tsx'),
  source('JournalScreen.tsx'),
  source('JourneyPathScreen.tsx'),
  source('../app/journey-progress.tsx'),
];

describe('Journey Momentum appearance contract', () => {
  test('themes the exported athlete surface and every async state without changing its routes', () => {
    const momentum = source('MomentumScreen.tsx');

    expect(momentum).toContain('const { colors: theme } = useAppTheme();');
    expect(momentum).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(momentum).toContain('pillarDefinitions(theme)');
    expect(momentum).toContain('theme.status.success');
    expect(momentum).toContain('theme.status.attention');
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
    expect(momentum).not.toContain("mode === 'light'");
    expect(momentum).not.toContain("mode === 'dark'");
  });

  test('themes Journey tabs permanently dark while preserving tab behavior', () => {
    const tabs = source('JourneyTabs.tsx');

    expect(tabs).toContain('const { colors: theme } = useAppTheme();');
    expect(tabs).toContain('const styles = useMemo(() => createStyles(theme), [theme]);');
    expect(tabs).toContain('borderBottomColor: theme.border.subtle');
    expect(tabs).toContain('color: theme.ink.muted');
    expect(tabs).toContain('color: theme.ink.primary');
    expect(tabs).toContain('backgroundColor: theme.ink.action');
    expect(tabs).toContain('router.replace(tab.route as never)');
    expect(tabs).not.toContain('styles.rowDark');
    expect(tabs).not.toContain("color: '#FFFFFF'");
    expect(tabs).not.toContain('themeColors(');
    expect(tabs).not.toContain('dark?: boolean');
  });

  test('themes the directly-used Cheers card with no white island in Dark mode', () => {
    const encouragement = source('JourneyEncouragementBar.tsx');

    expect(encouragement).toContain('const { colors: theme } = useAppTheme();');
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
    expect(encouragement).not.toContain('themeColors(');
    expect(encouragement).not.toContain('dark?: boolean');
  });

  test('Journey callers do not pass obsolete app-theme overrides', () => {
    for (const caller of task5JourneyCallers) {
      expect(caller).not.toMatch(/<JourneyTabs\b[^>]*\bdark=/s);
      expect(caller).not.toMatch(/<JourneyEncouragementBar\b[^>]*\bdark=/s);
    }
  });
});
