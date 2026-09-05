import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8');

const bodySource = source('../app/body.tsx');
const librarySource = source('../app/gym.tsx');
const planSource = source('../app/gym-plan.tsx');
const detailSource = source('../app/exercise/[id].tsx');
const titleModalSource = source('WorkoutTitleModal.tsx');

describe('Body and workout permanent dark appearance contract', () => {
  test.each([
    ['Body', bodySource],
    ['exercise library', librarySource],
    ['plan builder', planSource],
    ['exercise detail', detailSource],
    ['workout title modal', titleModalSource],
  ])('%s consumes semantic dark colors without a live light branch', (_name, screenSource) => {
    expect(screenSource).toContain('useAppTheme');
    expect(screenSource).toContain('const { colors: theme } = useAppTheme()');
    expect(screenSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(screenSource).not.toContain("mode === 'light'");
    expect(screenSource).not.toContain('legacyColors');
    expect(screenSource).not.toContain('const styles = StyleSheet.create({');
  });

  test('workout title modal uses permanent dark semantic sheet chrome', () => {
    expect(titleModalSource).toContain('background: theme.surface.canvas');
    expect(titleModalSource).toContain('card: theme.surface.card');
    expect(titleModalSource).toContain('field: theme.surface.raised');
    expect(titleModalSource).toContain('ink: theme.ink.primary');
    expect(titleModalSource).toContain('border: theme.border.subtle');
    expect(titleModalSource).toContain('scrim: theme.interaction.scrim');
    expect(titleModalSource).toContain('backgroundColor: palette.scrim');
    expect(titleModalSource).toContain('borderWidth: 1');
    expect(titleModalSource).toContain('backgroundColor: palette.field');
  });

  test('selected muscle filters use one semantic action treatment while unselected dots keep identity', () => {
    expect(librarySource).not.toContain('active && tint ? { backgroundColor: tint } : null');
    expect(librarySource).not.toContain('active && tint ? { color: palette.ink } : null');
    expect(librarySource).toContain('active && (star ? styles.chipStarActive : styles.chipActive)');
    expect(librarySource).toContain('chipActive: { backgroundColor: palette.action }');
    expect(librarySource).toContain('tint && !active ? (');
    expect(librarySource).toContain('styles.chipDot, { backgroundColor: tint }');
    expect(librarySource).toContain('chipTextActive: { color: palette.onAction');
  });

  test('Body uses the approved dark editorial surfaces', () => {
    expect(bodySource).toContain('canvas: theme.surface.canvas');
    expect(bodySource).toContain('card: theme.surface.card');
    expect(bodySource).toContain('ink: theme.ink.primary');
    expect(bodySource).toContain('muted: theme.ink.muted');
    expect(bodySource).toContain('border: theme.border.subtle');
    expect(bodySource).toContain('backgroundColor: palette.canvas');
    expect(bodySource).toContain('backgroundColor: palette.card');
    expect(bodySource).toContain('color: palette.ink');
  });

  test.each([
    ['exercise library', librarySource],
    ['plan builder', planSource],
    ['exercise detail', detailSource],
  ])('%s uses approved semantic dark surfaces', (_name, screenSource) => {
    expect(screenSource).toContain('background: theme.surface.canvas');
    expect(screenSource).toContain('card: theme.surface.card');
    expect(screenSource).toContain('field: theme.surface.raised');
    expect(screenSource).toContain('ink: theme.ink.primary');
    expect(screenSource).toContain('border: theme.border.subtle');
    expect(screenSource).toContain('action: theme.ink.action');
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

  test('workout naming keeps validation, trimming and save behavior', () => {
    expect(titleModalSource).toContain('const canSave = title.trim().length > 0 && !saving');
    expect(titleModalSource).toContain('onSubmitEditing={() => canSave && onSave(title.trim())}');
    expect(titleModalSource).toContain('onPress={() => onSave(title.trim())}');
    expect(titleModalSource).toContain('disabled={!canSave}');
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
    expect(titleModalSource).toMatch(/closeButton:\s*\{[^}]*width: spacing\.touch,[^}]*height: spacing\.touch/s);
    expect(titleModalSource).toMatch(/input:\s*\{[^}]*minHeight: 48/s);
  });
});
