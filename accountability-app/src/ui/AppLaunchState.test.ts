import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const source = readFileSync(require.resolve('./AppLaunchState'), 'utf8');

describe('AppLaunchState brand lockup', () => {
  test('renders one generated horizontal lockup without depending on unloaded fonts', () => {
    expect(source).toContain("const MANTLE_LOCKUP = require('../../assets/images/logo.png')");
    expect(source.match(/<Image\b/g)).toHaveLength(1);
    expect(source).toContain('source={MANTLE_LOCKUP}');
    expect(source).toContain('accessibilityLabel="Mantle"');
    expect(source).toContain('width: 196');
    expect(source).toContain('height: 42');
    expect(source).not.toContain('BrandWordmark');
    expect(source).not.toContain('tintColor');
  });
});
