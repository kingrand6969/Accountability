import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const insightsSource = readFileSync(require.resolve('../app/insights'), 'utf8');
const activitySource = readFileSync(require.resolve('../app/(app)/activity'), 'utf8');
const todaySource = readFileSync(require.resolve('../app/(app)/today'), 'utf8');
const progressSource = readFileSync(require.resolve('../app/journey-progress'), 'utf8');
const vaultSource = readFileSync(require.resolve('../progress/ProgressPhotoVault'), 'utf8');

describe('authenticated progress appearance contract', () => {
  test('Insights uses the permanent dark progress palette', () => {
    expect(insightsSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(insightsSource).toContain('const { colors: theme } = useAppTheme();');
    expect(insightsSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(insightsSource).toContain('canvas: theme.surface.canvas');
    expect(insightsSource).toContain('ink: theme.ink.primary');
    expect(insightsSource).toContain('daySuccess: theme.status.success');
    expect(insightsSource).toContain('trackColor={palette.ringTrack}');
    expect(insightsSource).toContain('<ActivityIndicator size="large" color={theme.ink.action} />');
    expect(insightsSource).toContain("router.push('/paywall')");
    expect(insightsSource).not.toContain("mode === 'light'");
  });

  test('the retained Activity surface is Dark-ready without changing the approved Journey route', () => {
    expect(activitySource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(activitySource).toContain('const { colors: theme } = useAppTheme();');
    expect(activitySource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(activitySource).toContain('canvas: theme.surface.canvas');
    expect(activitySource).toContain('trackColor={palette.ringTrack}');
    expect(activitySource).toContain('export default JourneyMomentum;');
    expect(activitySource).not.toContain("mode === 'light'");
  });

  test('the retained Today planner is Dark-ready without changing the approved Journal route', () => {
    expect(todaySource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(todaySource).toContain('const { colors: theme } = useAppTheme();');
    expect(todaySource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(todaySource).toContain('action: theme.ink.action');
    expect(todaySource).toContain('backgroundColor: palette.toggle');
    expect(todaySource).toContain('borderColor: palette.glassBorder');
    expect(todaySource).toContain('color={palette.action}');
    expect(todaySource).toContain('hitSlop={{ top: 9, bottom: 9 }}');
    expect(todaySource).toContain('export default JourneyJournal;');
    expect(todaySource).not.toContain("mode === 'light'");
  });

  test('Journey progress and its private photo vault use permanent dark semantic chrome', () => {
    for (const source of [progressSource, vaultSource]) {
      expect(source).toContain('const { colors: theme } = useAppTheme()');
      expect(source).toContain('createStyles(theme)');
      expect(source).toContain('backgroundColor: theme.surface.card');
      expect(source).toContain('borderColor: theme.border.subtle');
      expect(source).toContain('color: theme.ink.primary');
      expect(source).not.toContain("mode === 'light'");
    }
    expect(progressSource).toContain('backgroundColor: theme.surface.canvas');
    expect(vaultSource).toContain('backgroundColor: theme.interaction.scrim');
    expect(vaultSource).toContain('Private · Only you can see this');
  });
});
