import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8');

const dietSource = source('../app/diet.tsx');
const searchSource = source('../app/food-search.tsx');

describe('Nutrition permanent dark appearance contract', () => {
  test.each([
    ['diet tracker', dietSource],
    ['food search', searchSource],
  ])('%s consumes semantic dark colors without a live light branch', (_name, screenSource) => {
    expect(screenSource).toContain('useAppTheme');
    expect(screenSource).toContain('const { colors: theme } = useAppTheme()');
    expect(screenSource).toContain('useMemo(() => createStyles(theme), [theme])');
    expect(screenSource).not.toContain("mode === 'light'");
    expect(screenSource).not.toContain('legacyColors');
    expect(screenSource).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['diet tracker', dietSource],
    ['food search', searchSource],
  ])('%s uses approved semantic dark surfaces', (_name, screenSource) => {
    expect(screenSource).toContain('background: theme.surface.canvas');
    expect(screenSource).toContain('card: theme.surface.card');
    expect(screenSource).toContain('field: theme.surface.raised');
    expect(screenSource).toContain('ink: theme.ink.primary');
    expect(screenSource).toContain('border: theme.border.subtle');
    expect(screenSource).toContain('action: theme.ink.action');
    expect(screenSource).toContain('onAction: theme.ink.inverse');
    expect(screenSource).toContain('backgroundColor: palette.background');
    expect(screenSource).toContain('backgroundColor: palette.field');
    expect(screenSource).toContain('borderColor: palette.border');
  });

  test('diet logging, account gates, camera consent and confirmation remain unchanged', () => {
    expect(dietSource).toContain('const { isPro, loading: proLoading } = useIsPro()');
    expect(dietSource).toContain('const out = await scanFood(true)');
    expect(dietSource).toContain('if (!out) return; // cancelled the camera');
    expect(dietSource).toContain('await addFoodLog({');
    expect(dietSource).toContain('onSave={saveScannedItems}');
    expect(dietSource).toContain("router.push('/paywall')");
  });

  test('food search keeps validation, logging and history-safe exit behavior', () => {
    expect(searchSource).toContain('setResults(await searchFoods(query.trim()))');
    expect(searchSource).toContain("Alert.alert('Add a name', 'What did you eat?')");
    expect(searchSource).toContain("Alert.alert('Add calories', 'Enter the calories for this food.')");
    expect(searchSource).toContain('if (router.canGoBack()) router.back()');
    expect(searchSource).toContain("else router.replace('/diet' as never)");
    expect(searchSource).toContain('Food data © Open Food Facts contributors (ODbL)');
  });

  test('primary nutrition controls retain at least a 48dp touch target', () => {
    expect(dietSource).toMatch(
      /delete:\s*\{[^}]*minWidth: spacing\.touch,[^}]*minHeight: spacing\.touch/s,
    );
    expect(dietSource).toMatch(/scanFab:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(dietSource).toMatch(/fab:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(searchSource).toMatch(/searchBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(searchSource).toMatch(/result:\s*\{[^}]*minHeight: spacing\.touch/s);
  });
});
