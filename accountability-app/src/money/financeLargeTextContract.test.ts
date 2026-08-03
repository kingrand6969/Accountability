import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

const financeSource = fs.readFileSync(path.join(__dirname, '../app/(app)/finance.tsx'), 'utf8');

describe('Finance large-text layout contract', () => {
  test('uses the measured pane-tab height to clear the floating navigation', () => {
    expect(financeSource).toMatch(/const\s+\[paneTabsHeight,\s*setPaneTabsHeight\]\s*=\s*useState\(44\)/);
    expect(financeSource).toMatch(/onLayout=\{\(event\)\s*=>\s*setPaneTabsHeight\(event\.nativeEvent\.layout\.height\)\}/);
    expect(financeSource).toMatch(
      /const\s+panesTop\s*=\s*insets\.top\s*\+\s*spacing\.xs\s*\+\s*paneTabsHeight\s*\+\s*spacing\.xs/,
    );
    expect(financeSource).not.toContain('const panesTop = insets.top + 44');
  });

  test('keeps all four pane tabs equal-width and allows centered two-line labels', () => {
    expect(financeSource).toMatch(/paneTabs:\s*\{[^}]*left:\s*spacing\.md[^}]*right:\s*spacing\.md/s);
    expect(financeSource).toMatch(/paneTab:\s*\{[^}]*flex:\s*1/s);
    expect(financeSource).toMatch(/paneTabText:\s*\{[^}]*textAlign:\s*'center'/s);
    expect(financeSource).toMatch(
      /<Text[^>]*numberOfLines=\{2\}[^>]*style=\{\[styles\.paneTabText/s,
    );
  });

  test('stacks the accounting heading controls at 175 percent text scale', () => {
    expect(financeSource).toMatch(
      /const\s+largeText\s*=\s*fontScale\s*>=\s*1\.75/,
    );
    expect(financeSource).toContain('largeText && styles.heroTopRowLargeText');
    expect(financeSource).toContain('largeText && styles.heroTopActionsLargeText');
  });

  test('keeps the floating add action above the font-responsive primary navigation', () => {
    expect(financeSource).toContain('tabBarContentHeight(fontScale)');
    expect(financeSource).toMatch(
      /styles\.fab,\s*\{\s*right:\s*fabRight,\s*bottom:\s*fabBottom\s*\}/s,
    );
  });

  test('uses compact visual pane labels at large text without changing accessible names', () => {
    expect(financeSource).toContain("compactTabLabels && label === 'Accounts' ? 'Banks'");
    expect(financeSource).toContain('accessibilityLabel={`Show ${label}`}');
  });

  test('keeps the final finance controls scrollable above the floating action button', () => {
    expect(financeSource).toContain('const financeBottomClearance = fabBottom + (largeText ? 112 : 88)');
    expect(financeSource).toContain('{ paddingBottom: financeBottomClearance }');
  });
});
