import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';

import { BrandMark } from './BrandMark';

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
    expect(source).toContain('accessible={false}');
    expect(source).not.toContain('height={size / BRAND_LOCKUP_MARK_ASPECT_RATIO}');
    expect(source).not.toContain('primaryPath');
    expect(source).not.toContain('accentPath');
  });

  test('exposes a standalone mark as one labelled accessibility element', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(BrandMark));
    });

    const wrappers = renderer.root.findAllByType(View);
    expect(wrappers).toHaveLength(1);
    const [wrapper] = wrappers;
    expect(wrapper.props.accessible).toBe(true);
    expect(wrapper.props.importantForAccessibility).toBe('yes');
    expect(wrapper.props.accessibilityRole).toBe('image');
    expect(wrapper.props.accessibilityLabel).toBe('Mantle logo');
    expect(wrapper.props.accessibilityElementsHidden).toBe(false);
  });

  test('hides a nested or decorative mark from the accessibility tree', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(BrandMark, {
          accessible: false,
          accessibilityLabel: 'Ignored nested mark',
        }),
      );
    });

    const wrapper = renderer.root.findByType(View);
    expect(wrapper.props.accessible).toBe(false);
    expect(wrapper.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(wrapper.props.accessibilityElementsHidden).toBe(true);
    expect(wrapper.props.accessibilityRole).toBeUndefined();
    expect(wrapper.props.accessibilityLabel).toBeUndefined();
  });
});
