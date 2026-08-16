import { describe, expect, it } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

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
});
