import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('Mantle brand mark', () => {
  test('renders the authoritative rounded path and two shared-rhythm nodes', () => {
    const source = readFileSync(require.resolve('./BrandMark'), 'utf8');

    expect(source).toContain('import Svg, { Circle, Path }');
    expect(source).toContain('BRAND_GEOMETRY.mark.path');
    expect(source).toContain('BRAND_GEOMETRY.mark.strokeWidth');
    expect(source).toContain('BRAND_GEOMETRY.mark.nodes.map');
    expect(source).toContain('BRAND_MARK_RENDER_VIEW_BOX');
    expect(source).toContain('strokeLinecap="round"');
    expect(source).toContain('strokeLinejoin="round"');
    expect(source).not.toContain('primaryPath');
    expect(source).not.toContain('accentPath');
  });
});
