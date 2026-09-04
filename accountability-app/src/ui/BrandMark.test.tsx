import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('Mantle brand mark', () => {
  test('renders both approved ribbons and two endpoint nodes', () => {
    const source = readFileSync(require.resolve('./BrandMark'), 'utf8');

    expect(source).toContain('import Svg, { Circle, Path }');
    expect(source).toContain('BRAND_GEOMETRY.mark.paths.map');
    expect(source).toContain('BRAND_GEOMETRY.mark.strokeWidth');
    expect(source).toContain('BRAND_GEOMETRY.mark.nodes.map');
    expect(source).toContain('BRAND_LOCKUP_MARK_ASPECT_RATIO');
    expect(source).toContain('BRAND_LOCKUP_MARK_RENDER_VIEW_BOX');
    expect(source).toContain("import { View } from 'react-native'");
    expect(source).toContain(
      'style={{ width: size, aspectRatio: BRAND_LOCKUP_MARK_ASPECT_RATIO }}',
    );
    expect(source).toContain('width="100%"');
    expect(source).toContain('height="100%"');
    expect(source).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(source).toContain('color = BRAND_GEOMETRY.colors.lime');
    expect(source).toContain('stroke={color}');
    expect(source).toContain('fill={color}');
    expect(source).toContain('strokeLinecap="round"');
    expect(source).toContain('strokeLinejoin="round"');
    expect(source.match(/accessibilityRole="image"/g)).toHaveLength(1);
    expect(source.match(/accessibilityLabel=\{accessibilityLabel\}/g)).toHaveLength(
      1,
    );
    expect(source).toContain('accessible={false}');
    expect(source).not.toContain('height={size / BRAND_LOCKUP_MARK_ASPECT_RATIO}');
    expect(source).not.toContain('primaryPath');
    expect(source).not.toContain('accentPath');
  });
});
