import { describe, expect, it } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ProgressRing } from './ProgressRing';

function arcLength(renderer: TestRenderer.ReactTestRenderer): number | null {
  const arc = renderer.root.findAll(
    (node) => node.props.stroke === 'url(#ring)',
  )[0];
  if (!arc) return null;
  return Number(String(arc.props.strokeDasharray).split(' ')[0]);
}

describe('ProgressRing', () => {
  it('renders non-animated progress directly and updates without an effect pass', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(ProgressRing, {
          size: 100,
          strokeWidth: 10,
          progress: 0.25,
          animate: false,
        }),
      );
    });

    const circumference = 2 * Math.PI * 45;
    expect(arcLength(renderer)).toBeCloseTo(circumference * 0.25);

    await act(async () => {
      renderer.update(
        createElement(ProgressRing, {
          size: 100,
          strokeWidth: 10,
          progress: 0.75,
          animate: false,
        }),
      );
    });
    expect(arcLength(renderer)).toBeCloseTo(circumference * 0.75);

    await act(async () => renderer.unmount());
  });

  it('clamps non-animated progress to the supported range', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        createElement(ProgressRing, {
          size: 80,
          progress: 2,
          animate: false,
        }),
      );
    });
    expect(arcLength(renderer)).not.toBeNull();

    await act(async () => {
      renderer.update(
        createElement(ProgressRing, {
          size: 80,
          progress: -1,
          animate: false,
        }),
      );
    });
    expect(arcLength(renderer)).toBeNull();

    await act(async () => renderer.unmount());
  });
});
