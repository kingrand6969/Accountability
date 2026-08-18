import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = (file: string) => readFileSync(path.resolve(__dirname, file), 'utf8');

const dietSource = source('../app/diet.tsx');
const searchSource = source('../app/food-search.tsx');
const scanSheetSource = source('../scan/FoodScanSheet.tsx');

describe('Nutrition manual appearance contract', () => {
  test.each([
    ['diet tracker', dietSource],
    ['food search', searchSource],
    ['food scan review', scanSheetSource],
  ])('%s follows the live Light/Dark appearance', (_name, screenSource) => {
    expect(screenSource).toContain('useAppTheme');
    expect(screenSource).toContain('const { colors: theme, mode } = useAppTheme()');
    expect(screenSource).toContain('useMemo(() => createStyles(theme, mode), [theme, mode])');
    expect(screenSource).not.toContain('const styles = StyleSheet.create({');
  });

  test.each([
    ['diet tracker', dietSource],
    ['food search', searchSource],
  ])('%s preserves its exact white Light canvas and gains semantic Dark surfaces', (_name, screenSource) => {
    expect(screenSource).toContain(
      "background: mode === 'light' ? legacyColors.background : theme.surface.canvas",
    );
    expect(screenSource).toContain(
      "card: mode === 'light' ? legacyColors.card : theme.surface.card",
    );
    expect(screenSource).toContain(
      "field: mode === 'light' ? legacyColors.surfaceAlt : theme.surface.raised",
    );
    expect(screenSource).toContain(
      "ink: mode === 'light' ? legacyColors.text : theme.ink.primary",
    );
    expect(screenSource).toContain(
      "border: mode === 'light' ? legacyColors.border : theme.border.subtle",
    );
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

  test('scan review themes the sheet and scrim without changing correction or save semantics', () => {
    expect(scanSheetSource).toContain(
      "scrim: mode === 'light' ? 'rgba(15,23,42,0.45)' : theme.interaction.scrim",
    );
    expect(scanSheetSource).toContain(
      "card: mode === 'light' ? legacyColors.card : theme.surface.card",
    );
    expect(scanSheetSource).toContain('backgroundColor: palette.scrim');
    expect(scanSheetSource).toContain('backgroundColor: palette.card');
    expect(scanSheetSource).toContain('const k = grams / base');
    expect(scanSheetSource).toContain('onPress={() => onSave(kept)}');
    expect(scanSheetSource).toContain('disabled={kept.length === 0 || saving}');
  });

  test('primary nutrition controls retain at least a 48dp touch target', () => {
    expect(dietSource).toMatch(
      /delete:\s*\{[^}]*minWidth: spacing\.touch,[^}]*minHeight: spacing\.touch/s,
    );
    expect(dietSource).toMatch(/scanFab:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(dietSource).toMatch(/fab:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(searchSource).toMatch(/searchBtn:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(searchSource).toMatch(/result:\s*\{[^}]*minHeight: spacing\.touch/s);
    expect(scanSheetSource).toContain('hitSlop={13}');
    expect(scanSheetSource).toContain('hitSlop={11}');
    expect(scanSheetSource).toMatch(/save:\s*\{[^}]*minHeight: 52/s);
  });
});
