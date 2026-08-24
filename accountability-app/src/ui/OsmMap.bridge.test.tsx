import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import { OsmMap, type OsmMapHandle } from './OsmMap';

const mockInjectedScripts: string[] = [];

jest.mock('react-native-webview', () => {
  const ReactModule = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    WebView: ReactModule.forwardRef(
      (props: Record<string, unknown>, ref: React.ForwardedRef<unknown>) => {
        ReactModule.useImperativeHandle(ref, () => ({
          injectJavaScript(script: string) {
            mockInjectedScripts.push(script);
          },
        }));
        return ReactModule.createElement(View, { ...props, testID: 'native-osm-webview' });
      },
    ),
  };
});

const mounted: TestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
  mockInjectedScripts.length = 0;
});

function lastNativeMessage() {
  const script = mockInjectedScripts.at(-1);
  const json = script?.match(/__handleOsmMessage\((.*)\); true;/)?.[1];
  if (!json) throw new Error(`Unexpected native bridge script: ${script}`);
  return JSON.parse(json) as unknown;
}

describe('native OsmMap imperative bridge', () => {
  test('uses preserve as the live-update default and exposes explicit viewport actions', () => {
    const ref = React.createRef<OsmMapHandle>();
    act(() => {
      mounted.push(TestRenderer.create(<OsmMap ref={ref} />));
    });
    const route = [
      { lat: -31.9523, lng: 115.8613 },
      { lat: -31.951, lng: 115.864 },
    ];
    const latest = route.at(-1)!;

    act(() => ref.current?.setRoute(route));
    expect(lastNativeMessage()).toEqual({
      type: 'route',
      route,
      viewport: { mode: 'preserve' },
    });

    act(() => ref.current?.centerOn(latest));
    expect(lastNativeMessage()).toEqual({
      type: 'viewport',
      viewport: { mode: 'center', center: latest },
    });

    act(() => ref.current?.fitRoute());
    expect(lastNativeMessage()).toEqual({
      type: 'viewport',
      viewport: { mode: 'overview' },
    });
  });

  test('maps an empty route and explicit clear to the same privacy-safe command', () => {
    const ref = React.createRef<OsmMapHandle>();
    act(() => {
      mounted.push(TestRenderer.create(<OsmMap ref={ref} />));
    });

    act(() => ref.current?.setRoute([]));
    expect(lastNativeMessage()).toEqual({ type: 'clear-route' });

    act(() => ref.current?.clearRoute());
    expect(lastNativeMessage()).toEqual({ type: 'clear-route' });
  });

  test('immediately clears bridge state when a declarative route becomes empty', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap route={[{ lat: -31.9523, lng: 115.8613 }]} />,
      );
      mounted.push(renderer);
    });
    mockInjectedScripts.length = 0;

    act(() => renderer.update(<OsmMap route={[]} />));

    expect(lastNativeMessage()).toEqual({ type: 'clear-route' });
  });

  test('keeps the legacy center argument while making its viewport effect explicit', () => {
    const ref = React.createRef<OsmMapHandle>();
    act(() => {
      mounted.push(TestRenderer.create(<OsmMap ref={ref} />));
    });
    const route = [{ lat: -31.9523, lng: 115.8613 }];

    act(() => ref.current?.setRoute(route, route[0]));

    expect(lastNativeMessage()).toEqual({
      type: 'route',
      route,
      viewport: { mode: 'center', center: route[0] },
    });
  });
});
