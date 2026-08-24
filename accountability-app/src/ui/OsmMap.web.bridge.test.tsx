import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { OsmMap } from './OsmMap.web';
import type { OsmMapHandle } from './OsmMap';

const mounted: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

describe('web OsmMap imperative bridge', () => {
  test('forwards fitPadding into the generated Leaflet document', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap fitPadding={{ top: 132, right: 82, bottom: 77, left: 44 }} />,
      );
      mounted.push(renderer);
    });

    expect(renderer.root.findByType('iframe').props.srcDoc).toContain(
      'var fitPadding = {"top":132,"right":82,"bottom":77,"left":44};',
    );
  });

  test('uses the same preserve, center, overview, and clear messages as native', () => {
    const postMessage = jest.fn();
    const ref = React.createRef<OsmMapHandle>();
    act(() => {
      mounted.push(
        TestRenderer.create(<OsmMap ref={ref} />, {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: { postMessage } } : null,
        }),
      );
    });
    postMessage.mockClear();
    const route = [
      { lat: -31.9523, lng: 115.8613 },
      { lat: -31.951, lng: 115.864 },
    ];
    const latest = route.at(-1)!;

    act(() => ref.current?.setRoute(route));
    act(() => ref.current?.centerOn(latest));
    act(() => ref.current?.fitRoute());
    act(() => ref.current?.clearRoute());

    expect(postMessage.mock.calls.map(([message]) => JSON.parse(message as string))).toEqual([
      { type: 'route', route, viewport: { mode: 'preserve' } },
      { type: 'viewport', viewport: { mode: 'center', center: latest } },
      { type: 'viewport', viewport: { mode: 'overview' } },
      { type: 'clear-route' },
    ]);
    expect(postMessage.mock.calls.every(([, origin]) => origin === '*')).toBe(true);
  });

  test('immediately clears iframe state when a declarative route becomes empty', () => {
    const postMessage = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap route={[{ lat: -31.9523, lng: 115.8613 }]} />,
        {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: { postMessage } } : null,
        },
      );
      mounted.push(renderer);
    });
    postMessage.mockClear();

    act(() => renderer.update(<OsmMap route={[]} />));

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: 'clear-route' }),
      '*',
    );
  });
});
