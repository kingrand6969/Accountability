import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const source = readFileSync(require.resolve('./AppLaunchState'), 'utf8');

describe('AppLaunchState brand lockup', () => {
  test('renders one canonical Mantle lockup without fixed or tinted duplicate images', () => {
    expect(source).toContain("import { BrandWordmark } from './BrandWordmark'");
    expect(source.match(/<BrandWordmark\s*\/>/g)).toHaveLength(1);
    expect(source).not.toContain('LOGO_MARK');
    expect(source).not.toContain('WORDMARK');
    expect(source).not.toContain('tintColor');
  });
});
