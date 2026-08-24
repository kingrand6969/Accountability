import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('theme-aware AccountAbility wordmark', () => {
  test('uses the active semantic ink and neon mark instead of a fixed blue image', () => {
    const source = readFileSync(require.resolve('./BrandWordmark'), 'utf8');

    expect(source).toContain('useAppTheme');
    expect(source).toContain('<BrandMark');
    expect(source).toContain('theme.border.action');
    expect(source).toContain('theme.ink.primary');
    expect(source).not.toContain('wordmark.png');
  });

  test('is used by the Feed header so Dark mode never receives a dark fixed-image wordmark', () => {
    const source = readFileSync(require.resolve('../app/(app)/_layout'), 'utf8');

    expect(source).toContain('<BrandWordmark');
    expect(source).not.toContain("require('../../../assets/images/wordmark.png')");
  });
});
