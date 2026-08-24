import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const insightsSource = readFileSync(require.resolve('../app/insights'), 'utf8');
const activitySource = readFileSync(require.resolve('../app/(app)/activity'), 'utf8');
const todaySource = readFileSync(require.resolve('../app/(app)/today'), 'utf8');

describe('authenticated progress appearance contract', () => {
  test('Insights follows manual appearance while preserving its approved Light glass palette', () => {
    expect(insightsSource).toContain("import { useAppTheme } from '../ui/AppThemeProvider'");
    expect(insightsSource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(insightsSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(insightsSource).toContain("mode === 'light' ? '#E8ECE4' : theme.surface.canvas");
    expect(insightsSource).toContain("mode === 'light' ? '#111411' : theme.ink.primary");
    expect(insightsSource).toContain('trackColor={palette.ringTrack}');
    expect(insightsSource).toContain('<ActivityIndicator size="large" color={theme.ink.action} />');
    expect(insightsSource).toContain("router.push('/paywall')");
  });

  test('the retained Activity surface is Dark-ready without changing the approved Journey route', () => {
    expect(activitySource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(activitySource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(activitySource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(activitySource).toContain("mode === 'light' ? '#F4F5F1' : theme.surface.canvas");
    expect(activitySource).toContain('trackColor={palette.ringTrack}');
    expect(activitySource).toContain('export default JourneyMomentum;');
  });

  test('the retained Today planner is Dark-ready without changing the approved Journal route', () => {
    expect(todaySource).toContain("import { useAppTheme } from '../../ui/AppThemeProvider'");
    expect(todaySource).toContain('const { colors: theme, mode } = useAppTheme();');
    expect(todaySource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(todaySource).toContain("mode === 'light' ? '#446B00' : theme.ink.action");
    expect(todaySource).toContain('backgroundColor: palette.toggle');
    expect(todaySource).toContain('borderColor: palette.glassBorder');
    expect(todaySource).toContain('color={palette.action}');
    expect(todaySource).toContain('hitSlop={{ top: 9, bottom: 9 }}');
    expect(todaySource).toContain('export default JourneyJournal;');
  });
});
