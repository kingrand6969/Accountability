import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, jest, test } from '@jest/globals';

import {
  OsmMap,
  shouldAllowOsmNavigation,
  type OsmMapHandle,
} from './OsmMap';

const mockInjectedScripts: string[] = [];

jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => `native-osm-${++sequence}` };
});

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

type BridgeIdentity = { generation: string; nonce: string };

function nativeWebView(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findByProps({ testID: 'native-osm-webview' });
}

function identityFromHtml(html: string): BridgeIdentity {
  const generation = html.match(/var bridgeGeneration = "([^"]+)";/)?.[1];
  const nonce = html.match(/var bridgeNonce = "([^"]+)";/)?.[1];
  if (!generation || !nonce) throw new Error('OSM document is missing its bridge identity');
  return { generation, nonce };
}

function nativeIdentity(renderer: TestRenderer.ReactTestRenderer) {
  return identityFromHtml(nativeWebView(renderer).props.source.html as string);
}

function signalNativeReady(
  renderer: TestRenderer.ReactTestRenderer,
  identity = nativeIdentity(renderer),
) {
  act(() => nativeWebView(renderer).props.onMessage({
    nativeEvent: {
      data: JSON.stringify({ type: 'osm-ready', ...identity }),
    },
  }));
}

function nativeCommands() {
  return mockInjectedScripts.map((script) => {
    const json = script.match(/__handleOsmMessage\((.*)\); true;/)?.[1];
    if (!json) throw new Error(`Unexpected native bridge script: ${script}`);
    const { generation: _generation, nonce: _nonce, ...command } = JSON.parse(json) as
      Record<string, unknown>;
    return command;
  });
}

describe('native OsmMap imperative bridge', () => {
  test('denies sensor, media-capture, and file permissions without blocking map tiles', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap />);
      mounted.push(renderer);
    });

    expect(nativeWebView(renderer).props).toEqual(expect.objectContaining({
      allowFileAccess: false,
      allowFileAccessFromFileURLs: false,
      allowUniversalAccessFromFileURLs: false,
      geolocationEnabled: false,
      javaScriptCanOpenWindowsAutomatically: false,
      mediaCapturePermissionGrantType: 'deny',
    }));
    expect(nativeWebView(renderer).props.source.html).toContain(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    );
  });

  test('does not clear an initially marker-only map or clear it again when marker layout changes', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap
          markers={[{ lat: -31.9523, lng: 115.8613, label: 'You' }]}
          fitPadding={{ top: 20, right: 20, bottom: 20, left: 20 }}
        />,
      );
      mounted.push(renderer);
    });

    expect(mockInjectedScripts).toEqual([]);

    act(() => renderer.update(
      <OsmMap
        markers={[{ lat: -31.951, lng: 115.864, label: 'You' }]}
        fitPadding={{ top: 40, right: 24, bottom: 60, left: 24 }}
      />,
    ));

    expect(mockInjectedScripts).toEqual([]);
  });

  test('uses preserve as the live-update default and exposes explicit viewport actions', () => {
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />);
      mounted.push(renderer);
    });
    signalNativeReady(renderer);
    const route = [
      { lat: -31.9523, lng: 115.8613 },
      { lat: -31.951, lng: 115.864 },
    ];
    const latest = route.at(-1)!;

    act(() => ref.current?.setRoute(route));
    expect(nativeCommands().at(-1)).toEqual({
      type: 'route',
      route,
      viewport: { mode: 'preserve' },
    });

    act(() => ref.current?.centerOn(latest));
    expect(nativeCommands().at(-1)).toEqual({
      type: 'viewport',
      viewport: { mode: 'center', center: latest },
    });

    act(() => ref.current?.fitRoute());
    expect(nativeCommands().at(-1)).toEqual({
      type: 'viewport',
      viewport: { mode: 'overview' },
    });
  });

  test('maps an empty route and explicit clear to the same privacy-safe command', () => {
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />);
      mounted.push(renderer);
    });
    signalNativeReady(renderer);

    act(() => ref.current?.setRoute([]));
    expect(nativeCommands().at(-1)).toEqual({ type: 'clear-route' });

    act(() => ref.current?.clearRoute());
    expect(nativeCommands().at(-1)).toEqual({ type: 'clear-route' });
  });

  test('queues a declarative clear for the new document instead of racing its reload', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap route={[{ lat: -31.9523, lng: 115.8613 }]} />,
      );
      mounted.push(renderer);
    });
    signalNativeReady(renderer);
    mockInjectedScripts.length = 0;

    act(() => renderer.update(<OsmMap route={[]} />));

    expect(mockInjectedScripts).toEqual([]);
    signalNativeReady(renderer);
    expect(nativeCommands()).toEqual([{ type: 'clear-route' }]);
  });

  test('does not replay a completed declarative clear on a later marker-only reload', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap route={[{ lat: -31.9523, lng: 115.8613 }]} />,
      );
      mounted.push(renderer);
    });
    signalNativeReady(renderer);

    act(() => renderer.update(
      <OsmMap
        route={[]}
        markers={[{ lat: -31.951, lng: 115.864, label: 'You' }]}
      />,
    ));
    signalNativeReady(renderer);
    expect(nativeCommands().at(-1)).toEqual({ type: 'clear-route' });
    mockInjectedScripts.length = 0;

    act(() => renderer.update(
      <OsmMap
        route={[]}
        markers={[{ lat: -31.949, lng: 115.868, label: 'You' }]}
      />,
    ));
    signalNativeReady(renderer);

    expect(mockInjectedScripts).toEqual([]);
  });

  test('cancels a queued declarative clear if the route is restored before ready', () => {
    const route = [{ lat: -31.9523, lng: 115.8613 }];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap route={route} />);
      mounted.push(renderer);
    });
    signalNativeReady(renderer);
    mockInjectedScripts.length = 0;

    act(() => renderer.update(<OsmMap route={[]} />));
    act(() => renderer.update(<OsmMap route={route} />));
    signalNativeReady(renderer);

    expect(mockInjectedScripts).toEqual([]);
  });

  test('keeps the legacy center argument while making its viewport effect explicit', () => {
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />);
      mounted.push(renderer);
    });
    signalNativeReady(renderer);
    const route = [{ lat: -31.9523, lng: 115.8613 }];

    act(() => ref.current?.setRoute(route, route[0]));

    expect(nativeCommands().slice(-2)).toEqual([
      { type: 'route', route, viewport: { mode: 'preserve' } },
      { type: 'viewport', viewport: { mode: 'center', center: route[0] } },
    ]);
  });

  test('holds the latest route until ready without losing its first explicit center', () => {
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />);
      mounted.push(renderer);
    });
    const firstRoute = [
      { lat: -31.9523, lng: 115.8613 },
      { lat: -31.951, lng: 115.864 },
    ];
    const latestRoute = [...firstRoute, { lat: -31.949, lng: 115.868 }];

    act(() => ref.current?.setRoute(firstRoute, {
      viewport: 'center',
      center: firstRoute.at(-1)!,
    }));
    act(() => ref.current?.setRoute(latestRoute, { viewport: 'preserve' }));

    expect(mockInjectedScripts).toEqual([]);
    signalNativeReady(renderer);
    expect(nativeCommands()).toEqual([
      { type: 'route', route: latestRoute, viewport: { mode: 'preserve' } },
      {
        type: 'viewport',
        viewport: { mode: 'center', center: latestRoute.at(-1)! },
      },
    ]);
  });

  test('rejects an old document ready signal and replays route overview only to the new generation', () => {
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap ref={ref} fitPadding={{ top: 20, right: 20, bottom: 20, left: 20 }} />,
      );
      mounted.push(renderer);
    });
    const route = [
      { lat: -31.9523, lng: 115.8613 },
      { lat: -31.951, lng: 115.864 },
    ];
    const oldIdentity = nativeIdentity(renderer);
    signalNativeReady(renderer, oldIdentity);
    act(() => ref.current?.setRoute(route, { viewport: 'overview' }));
    mockInjectedScripts.length = 0;

    act(() => renderer.update(
      <OsmMap ref={ref} fitPadding={{ top: 48, right: 24, bottom: 72, left: 24 }} />,
    ));
    const newIdentity = nativeIdentity(renderer);
    expect(newIdentity).not.toEqual(oldIdentity);

    signalNativeReady(renderer, oldIdentity);
    expect(mockInjectedScripts).toEqual([]);
    signalNativeReady(renderer, newIdentity);
    expect(nativeCommands()).toEqual([
      { type: 'route', route, viewport: { mode: 'preserve' } },
      { type: 'viewport', viewport: { mode: 'overview' } },
    ]);
  });

  test('allows only internal top-level HTML navigation while leaving approved resources available as subresources', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap />);
      mounted.push(renderer);
    });
    const webViewProps = renderer.root.findByProps({ testID: 'native-osm-webview' }).props;

    expect(webViewProps.originWhitelist).toEqual(['about:*', 'data:*']);
    expect(shouldAllowOsmNavigation({ url: 'about:blank', isTopFrame: true })).toBe(true);
    expect(shouldAllowOsmNavigation({
      url: 'data:text/html;charset=utf-8,%3Chtml%3E',
      isTopFrame: true,
    }))
      .toBe(true);
    expect(shouldAllowOsmNavigation({
      url: 'https://a.tile.openstreetmap.org/12/2048/2048.png',
      isTopFrame: false,
    })).toBe(true);
    expect(shouldAllowOsmNavigation({
      url: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      isTopFrame: false,
    })).toBe(true);
    expect(shouldAllowOsmNavigation({
      url: 'https://www.openstreetmap.org/copyright',
      isTopFrame: true,
    })).toBe(false);
    expect(shouldAllowOsmNavigation({
      url: 'https://a.tile.openstreetmap.org/12/2048/2048.png',
      isTopFrame: true,
    })).toBe(false);
    expect(shouldAllowOsmNavigation({
      url: 'https://attacker.example/payload.js',
      isTopFrame: false,
    })).toBe(false);
  });

  test('rotates the document identity when a top-level external navigation is attempted', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap />);
      mounted.push(renderer);
    });
    const before = nativeIdentity(renderer);
    let allowed = true;

    act(() => {
      allowed = nativeWebView(renderer).props.onShouldStartLoadWithRequest({
        isTopFrame: true,
        url: 'https://www.openstreetmap.org/copyright',
      });
    });

    expect(allowed).toBe(false);
    expect(nativeIdentity(renderer)).not.toEqual(before);
  });

  test('invalidates a loaded generation instead of allowing an internal self-navigation', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap />);
      mounted.push(renderer);
    });
    const before = nativeIdentity(renderer);
    act(() => nativeWebView(renderer).props.onLoadEnd());
    let allowed = true;

    act(() => {
      allowed = nativeWebView(renderer).props.onShouldStartLoadWithRequest({
        isTopFrame: true,
        url: 'about:blank',
      });
    });

    expect(allowed).toBe(false);
    expect(nativeIdentity(renderer)).not.toEqual(before);
  });
});
