import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8');

const bodySource = source('../app/body.tsx');
const librarySource = source('../app/gym.tsx');
const planSource = source('../app/gym-plan.tsx');
const detailSource = source('../app/exercise/[id].tsx');
const titleModalSource = source('WorkoutTitleModal.tsx');

describe('Body and workout manual appearance contract', () => {
  test.each([
    ['Body', bodySource],
    ['exercise library', librarySource],
    ['plan builder', planSource],
    ['exercise detail', detailSource],
    ['workout title modal', titleModalSource],
  ])('%s follows the live Light/Dark appearance', (_name, screenSource) => {
    expect(screenSource).toContain('useAppTheme');
    expect(screenSource).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(screenSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(screenSource).not.toContain('const styles = StyleSheet.create({');
  });

  test('Body retains its editorial Light canvas while replacing light-only cards in Dark mode', () => {
    expect(bodySource).toContain("canvas: mode === 'light' ? legacyColors.cream : theme.surface.canvas");
    expect(bodySource).toContain("card: mode === 'light' ? '#FFFFFF' : theme.surface.card");
    expect(bodySource).toContain("ink: mode === 'light' ? legacyColors.navy : theme.ink.primary");
    expect(bodySource).toContain("muted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted");
    expect(bodySource).toContain("border: mode === 'light' ? 'rgba(17,20,17,0.10)' : theme.border.subtle");
    expect(bodySource).toContain('backgroundColor: palette.canvas');
    expect(bodySource).toContain('backgroundColor: palette.card');
    expect(bodySource).toContain('color: palette.ink');
  });

  test.each([
    ['exercise library', librarySource],
    ['plan builder', planSource],
    ['exercise detail', detailSource],
    ['workout title modal', titleModalSource],
  ])('%s keeps its white Light presentation and gains readable Dark surfaces', (_name, screenSource) => {
    expect(screenSource).toContain("background: mode === 'light' ? legacyColors.background : theme.surface.canvas");
    expect(screenSource).toContain("card: mode === 'light' ? legacyColors.card : theme.surface.card");
    expect(screenSource).toContain("field: mode === 'light'");
    expect(screenSource).toContain('theme.surface.raised');
    expect(screenSource).toContain("ink: mode === 'light' ? legacyColors.text : theme.ink.primary");
    expect(screenSource).toContain("border: mode === 'light' ? legacyColors.border : theme.border.subtle");
  });

  test('the workout title modal themes its keyboard field and modal scrim without changing validation', () => {
    expect(titleModalSource).toContain('backgroundColor: palette.scrim');
    expect(titleModalSource).toContain('backgroundColor: palette.field');
    expect(titleModalSource).toContain('placeholderTextColor={palette.placeholder}');
    expect(titleModalSource).toContain("const canSave = title.trim().length > 0 && !saving");
    expect(titleModalSource).toContain('onSubmitEditing={() => canSave && onSave(title.trim())}');
    expect(titleModalSource).toContain('width: spacing.touch');
    expect(titleModalSource).toContain('height: spacing.touch');
  });

  test('workout navigation, selection and logging behavior stays intact', () => {
    expect(bodySource).toContain("route: '/gym-plan'");
    expect(bodySource).toContain("route: '/gym'");
    expect(bodySource).toContain("router.push('/win-card' as never)");
    expect(librarySource).toContain("router.push({ pathname: '/exercise/[id]'"
    );
    expect(librarySource).toContain("router.navigate('/today' as never)");
    expect(planSource).toContain('accessibilityRole="checkbox"');
    expect(planSource).toContain("router.navigate('/today' as never)");
    expect(detailSource).toContain("router.navigate('/today' as never)");
    expect(detailSource).toContain('checklist: [{ text: ex.name, done: false }]');
  });

  test('direct workout controls retain at least a 48dp target', () => {
    expect(bodySource).toMatch(/iconButton:\s*\{[^}]*width: spacing\.touch,[^}]*height: spacing\.touch/s);
    expect(librarySource).toMatch(/chip:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(librarySource).toMatch(/starBtn:\s*\{[^}]*minWidth: spacing\.touch,[^}]*minHeight: spacing\.touch/s);
    expect(librarySource).toMatch(/addBtn:\s*\{[^}]*width: spacing\.touch,[^}]*height: spacing\.touch/s);
    expect(planSource).toMatch(/chip:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(planSource).toMatch(/toggleBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(planSource).toMatch(/checkBox:\s*\{[^}]*width: spacing\.touch,[^}]*height: spacing\.touch/s);
    expect(detailSource).toMatch(/starBtn:\s*\{[^}]*minWidth: spacing\.touch,[^}]*minHeight: spacing\.touch/s);
  });
});
