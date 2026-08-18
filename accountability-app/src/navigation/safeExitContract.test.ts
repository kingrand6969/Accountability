import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from '@jest/globals';

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');

describe('history-aware screen exit contract', () => {
  test.each([
    ['Run', 'src/app/(app)/run.tsx'],
    ['Body', 'src/app/body.tsx'],
    ['Verify email', 'src/app/verify-email.tsx'],
  ])('%s uses navigation history with a root fallback', (_name, file) => {
    const screen = source(file);

    expect(screen).toContain("import { navigateBackSafely } from");
    expect(screen).toContain('navigateBackSafely(router)');
    expect(screen).not.toContain('router.back()');
  });

  test('Composer routes hardware, close, and successful exits through one safe exit', () => {
    const compose = source('src/app/compose.tsx');

    expect(compose).toContain("import { navigateBackSafely } from '../navigation/routeAccessContract';");
    expect(compose).toContain('navigateBackSafely(routerRef.current)');
    expect(compose).not.toMatch(/(?:router|routerRef\.current)\.back\(\)/);
    expect(compose).toContain('flushDraft().finally(exitCompose)');
  });

  test('Composer cannot be dismissed while a submission is in progress', () => {
    const compose = source('src/app/compose.tsx');

    expect(compose).toContain('const postingRef = useRef(posting);');
    expect(compose).toContain('postingRef.current = posting;');
    expect(compose).toMatch(
      /hardwareBackPress'[\s\S]*?if \(postingRef\.current\) return true;[\s\S]*?return true;/,
    );
    expect(compose).toMatch(
      /function onClose\(\) \{\s*if \(postingRef\.current\) return;/,
    );
    expect(compose).toContain('disabled={posting}');
    expect(compose).toContain('accessibilityState={{ disabled: posting, busy: posting }}');
  });

  test('Composer hides the keypad before showing the draft-cancel decision', () => {
    const compose = source('src/app/compose.tsx');
    const closeBody = compose.match(/function onClose\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '';

    expect(compose).toMatch(/\bKeyboard,?\s*\n/);
    expect(closeBody.indexOf('Keyboard.dismiss()')).toBeGreaterThanOrEqual(0);
    expect(closeBody.indexOf("Alert.alert('Cancel this draft?'")).toBeGreaterThan(
      closeBody.indexOf('Keyboard.dismiss()'),
    );
  });

  test('successful food logging returns to Diet even from a cold link', () => {
    const screen = source('src/app/food-search.tsx');

    expect(screen).toContain('function exitFoodSearch()');
    expect(screen).toMatch(
      /function exitFoodSearch\(\) \{\s*if \(router\.canGoBack\(\)\) router\.back\(\);\s*else router\.replace\('\/diet' as never\);\s*\}/,
    );
    expect(screen.match(/router\.back\(\)/g)).toHaveLength(1);
  });

  test.each([
    ['Buddy Card moderation', 'src/app/buddy-card/[id].tsx'],
    ['Buddy Card editor save', 'src/app/buddy-card-edit.tsx'],
  ])('%s never exits through raw history', (_name, file) => {
    const screen = source(file);

    expect(screen).toContain('navigateBackSafely');
    expect(screen).not.toContain('router.back()');
  });
});
