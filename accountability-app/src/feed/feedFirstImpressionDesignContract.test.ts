import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';

const header = readFileSync(require.resolve('./SocialBrandHeader'), 'utf8');
const feed = readFileSync(require.resolve('../app/(app)/index'), 'utf8');

describe('Feed first-impression design', () => {
  test('renders the approved Accountability lockup instead of the legacy casing', () => {
    expect(header).toContain("import { BRAND_WORDMARK } from '../ui/brandGeometry'");
    expect(header).toContain('{BRAND_WORDMARK}');
    expect(header).not.toContain('Account<Text style={styles.ability}>Ability</Text>');
    expect(header).not.toContain('accessibilityLabel="AccountAbility"');
  });

  test('centres the composer prompt copy without stretching the Text node', () => {
    expect(feed).toContain('promptCopy: {');
    expect(feed).toContain('justifyContent: \'center\'');
    expect(feed).toContain('promptText: { fontFamily: font.regular');
    expect(feed).not.toContain('promptText: { flex: 1');
  });
});
