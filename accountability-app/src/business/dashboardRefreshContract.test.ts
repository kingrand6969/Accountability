import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const source = readFileSync(require.resolve('./BusinessPane'), 'utf8');

describe('Business dashboard refresh contract', () => {
  test('reloads the focused dashboard when the selected business changes', () => {
    expect(source).toContain('}, [selectedId]);');
    expect(source).toMatch(
      /useFocusEffect\(\s*useCallback\(\(\) => \{\s*if \(isPro\) load\(\);\s*else setLoading\(false\);\s*\}, \[isPro, load\]\),\s*\);/,
    );
  });

  test('switches selection without scheduling a duplicate effect refresh', () => {
    expect(source).toMatch(
      /const switchTo = useCallback\(\(id: string\) => \{\s*setSelectedId\(id\);\s*setShowSwitcher\(false\);\s*setLoading\(true\);\s*\}, \[\]\);/,
    );
    expect(source).not.toMatch(
      /useEffect\(\(\) => \{\s*if \(isPro && selectedId\) load\(\);/,
    );
  });
});
