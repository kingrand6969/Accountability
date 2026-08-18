import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('../app/compose'), 'utf8');

describe('Compose appearance contract', () => {
  test('uses the live manual app theme instead of module-static light colors', () => {
    expect(source).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(source).toContain('const { colors: theme } = useAppTheme()');
    expect(source).toContain('const styles = useMemo(() => createStyles(theme), [theme])');
    expect(source).toContain('function createStyles(theme: AppThemeColors)');
    expect(source).not.toMatch(/\bcolors\./);
  });

  test('themes the editor hierarchy and interaction states with semantic roles', () => {
    expect(source).toContain('backgroundColor: theme.surface.card');
    expect(source).toContain('color: theme.ink.primary');
    expect(source).toContain('borderColor: theme.border.subtle');
    expect(source).toContain('backgroundColor: theme.interaction.skeleton');
    expect(source).toContain('color: theme.status.danger');
    expect(source).toContain('tint={theme.ink.action}');
    expect(source).toContain('backgroundColor: theme.status.successSoft');
  });

  test('keeps icon controls and placeholders readable in either appearance', () => {
    expect(source).toContain('placeholderTextColor={theme.ink.muted}');
    expect(source).toContain('color={theme.ink.inverse}');
    expect(source).toContain('backgroundColor: theme.interaction.scrim');
  });
});
