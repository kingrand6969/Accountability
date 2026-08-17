import { describe, expect, it } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

import { RankBadge } from './RankBadge';

function renderBadge(props: React.ComponentProps<typeof RankBadge>) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(createElement(RankBadge, props));
  });
  return renderer;
}

describe('RankBadge effect modes', () => {
  it('removes every decorative aura layer in explicit effect-free mode', () => {
    const renderer = renderBadge({
      rank: 'Mythical',
      size: 32,
      animated: false,
      effects: 'none',
    });

    expect(renderer.root.findAllByProps({ testID: 'rank-badge-static-aura' })).toHaveLength(0);
    expect(renderer.root.findAll(
      (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('rank-badge-smoke-'),
    )).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'rank-badge-shine' })).toHaveLength(0);
    expect(renderer.root.findAll(
      (node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('rank-badge-twinkle-'),
    )).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'rank-badge-artwork' }).length).toBeGreaterThan(0);
  });

  it('preserves the legacy default static aura for a high rank', () => {
    const renderer = renderBadge({ rank: 'Mythical', size: 32, animated: false });

    expect(renderer.root.findAllByProps({ testID: 'rank-badge-static-aura' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'rank-badge-artwork' }).length).toBeGreaterThan(0);
  });

  it('centers the complete left emblem inside the square crest frame', () => {
    const renderer = renderBadge({
      rank: 'Mythical',
      size: 32,
      animated: false,
      effects: 'none',
      variant: 'crest',
    } as React.ComponentProps<typeof RankBadge>);
    const frame = renderer.root.findByProps({ testID: 'rank-badge-frame' });
    const mask = renderer.root.findByProps({ testID: 'rank-badge-crest-mask' });
    const artwork = renderer.root.findByProps({ testID: 'rank-badge-artwork' });

    expect(StyleSheet.flatten(frame.props.style)).toEqual(expect.objectContaining({
      width: 32,
      height: 32,
      overflow: 'hidden',
      borderRadius: 16,
    }));
    expect(StyleSheet.flatten(artwork.props.style)).toEqual(expect.objectContaining({
      width: 163.2,
      height: 54.4,
      left: -27.2,
      top: -10.24,
      right: undefined,
      bottom: undefined,
    }));
    expect(StyleSheet.flatten(mask.props.style)).toEqual(expect.objectContaining({
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: 'hidden',
    }));
    expect(frame.props.accessibilityRole).toBe('image');
    expect(frame.props.accessibilityLabel).toBe('Rank: Mythical');
    expect(renderer.root.findAllByProps({ testID: 'rank-badge-static-aura' })).toHaveLength(0);
  });

  it('keeps the legacy nameplate geometry when no variant is supplied', () => {
    const renderer = renderBadge({ rank: 'Mythical', size: 32, animated: false });
    const frame = renderer.root.findByProps({ testID: 'rank-badge-frame' });
    const artwork = renderer.root.findByProps({ testID: 'rank-badge-artwork' });

    expect(StyleSheet.flatten(frame.props.style)).toEqual(expect.objectContaining({
      width: 96,
      height: 32,
    }));
    expect(StyleSheet.flatten(frame.props.style).overflow).not.toBe('hidden');
    expect(StyleSheet.flatten(artwork.props.style)).toEqual(expect.objectContaining({
      width: 96,
      height: 32,
    }));
  });
});
