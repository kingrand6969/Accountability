import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { OsmMap } from './OsmMap.web';
import type { OsmMapHandle } from './OsmMap';

jest.mock('expo-crypto', () => {
  let sequence = 0;
  return { randomUUID: () => `web-osm-${++sequence}` };
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
const APP_ORIGIN = 'https://app.example';
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
const originalAddEventListener = Object.getOwnPropertyDescriptor(globalThis, 'addEventListener');
const originalRemoveEventListener = Object.getOwnPropertyDescriptor(globalThis, 'removeEventListener');
type WindowMessage = { data: string; origin: string; source: object };
let messageListeners: ((event: WindowMessage) => void)[] = [];

beforeEach(() => {
  messageListeners = [];
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: APP_ORIGIN },
  });
  Object.defineProperty(globalThis, 'addEventListener', {
    configurable: true,
    value: (type: string, listener: (event: WindowMessage) => void) => {
      if (type === 'message') messageListeners.push(listener);
    },
  });
  Object.defineProperty(globalThis, 'removeEventListener', {
    configurable: true,
    value: (type: string, listener: (event: WindowMessage) => void) => {
      if (type === 'message') {
        messageListeners = messageListeners.filter((candidate) => candidate !== listener);
      }
    },
  });
});

afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
  if (originalLocation) {
    Object.defineProperty(globalThis, 'location', originalLocation);
  } else {
    delete (globalThis as { location?: unknown }).location;
  }
  if (originalAddEventListener) {
    Object.defineProperty(globalThis, 'addEventListener', originalAddEventListener);
  } else {
    delete (globalThis as { addEventListener?: unknown }).addEventListener;
  }
  if (originalRemoveEventListener) {
    Object.defineProperty(globalThis, 'removeEventListener', originalRemoveEventListener);
  } else {
    delete (globalThis as { removeEventListener?: unknown }).removeEventListener;
  }
});

type BridgeIdentity = { generation: string; nonce: string };

function webIdentity(renderer: TestRenderer.ReactTestRenderer): BridgeIdentity {
  const html = renderer.root.findByType('iframe').props.srcDoc as string;
  const generation = html.match(/var bridgeGeneration = "([^"]+)";/)?.[1];
  const nonce = html.match(/var bridgeNonce = "([^"]+)";/)?.[1];
  if (!generation || !nonce) throw new Error('OSM iframe is missing its bridge identity');
  return { generation, nonce };
}

function signalWebReady(
  renderer: TestRenderer.ReactTestRenderer,
  frameWindow: object,
  identity = webIdentity(renderer),
) {
  act(() => {
    for (const listener of [...messageListeners]) {
      listener({
        data: JSON.stringify({ type: 'osm-ready', ...identity }),
        origin: APP_ORIGIN,
        source: frameWindow,
      });
    }
  });
}

function webCommands(postMessage: jest.Mock) {
  return postMessage.mock.calls.map(([data]) => {
    const { generation: _generation, nonce: _nonce, ...command } = JSON.parse(data as string) as
      Record<string, unknown>;
    return command;
  });
}

describe('web OsmMap imperative bridge', () => {
  test('does not clear an initially marker-only map or clear it again when marker layout changes', () => {
    const postMessage = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap
          markers={[{ lat: -31.9523, lng: 115.8613, label: 'You' }]}
          fitPadding={{ top: 20, right: 20, bottom: 20, left: 20 }}
        />,
        {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: { postMessage } } : null,
        },
      );
      mounted.push(renderer);
    });

    expect(postMessage).not.toHaveBeenCalled();

    act(() => renderer.update(
      <OsmMap
        markers={[{ lat: -31.951, lng: 115.864, label: 'You' }]}
        fitPadding={{ top: 40, right: 24, bottom: 60, left: 24 }}
      />,
    ));

    expect(postMessage).not.toHaveBeenCalled();
  });

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
    expect(renderer.root.findByType('iframe').props.srcDoc).toContain(
      `var parentOrigin = "${APP_ORIGIN}";`,
    );
    const iframeProps = renderer.root.findByType('iframe').props;
    expect(iframeProps).toEqual(expect.objectContaining({
      referrerPolicy: 'no-referrer',
      sandbox: 'allow-scripts allow-same-origin',
    }));
    const permissionDirectives = String(iframeProps.allow)
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean);
    expect(permissionDirectives).toEqual(expect.arrayContaining([
      "accelerometer 'none'",
      "ambient-light-sensor 'none'",
      "camera 'none'",
      "geolocation 'none'",
      "gyroscope 'none'",
      "magnetometer 'none'",
      "microphone 'none'",
    ]));
    expect(permissionDirectives.every(
      (directive) => /^[a-z][a-z-]* 'none'$/.test(directive),
    )).toBe(true);
  });

  test('uses the same preserve, center, overview, and clear messages as native', () => {
    const postMessage = jest.fn();
    const frameWindow = { postMessage };
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />, {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: frameWindow } : null,
        });
      mounted.push(renderer);
    });
    signalWebReady(renderer, frameWindow);
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

    expect(webCommands(postMessage)).toEqual([
      { type: 'route', route, viewport: { mode: 'preserve' } },
      { type: 'viewport', viewport: { mode: 'center', center: latest } },
      { type: 'viewport', viewport: { mode: 'overview' } },
      { type: 'clear-route' },
    ]);
    expect(postMessage.mock.calls.every(([, origin]) => origin === APP_ORIGIN)).toBe(true);
  });

  test('queues a declarative clear until the replacement iframe is ready', () => {
    const postMessage = jest.fn();
    const frameWindow = { postMessage };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap route={[{ lat: -31.9523, lng: 115.8613 }]} />,
        {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: frameWindow } : null,
        },
      );
      mounted.push(renderer);
    });
    signalWebReady(renderer, frameWindow);
    postMessage.mockClear();

    act(() => renderer.update(<OsmMap route={[]} />));

    expect(postMessage).not.toHaveBeenCalled();
    signalWebReady(renderer, frameWindow);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'clear-route',
        ...webIdentity(renderer),
      }),
      APP_ORIGIN,
    );
  });

  test('does not replay a completed declarative clear on a later marker-only reload', () => {
    const postMessage = jest.fn();
    const frameWindow = { postMessage };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap route={[{ lat: -31.9523, lng: 115.8613 }]} />,
        {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: frameWindow } : null,
        },
      );
      mounted.push(renderer);
    });
    signalWebReady(renderer, frameWindow);

    act(() => renderer.update(
      <OsmMap
        route={[]}
        markers={[{ lat: -31.951, lng: 115.864, label: 'You' }]}
      />,
    ));
    signalWebReady(renderer, frameWindow);
    expect(webCommands(postMessage).at(-1)).toEqual({ type: 'clear-route' });
    postMessage.mockClear();

    act(() => renderer.update(
      <OsmMap
        route={[]}
        markers={[{ lat: -31.949, lng: 115.868, label: 'You' }]}
      />,
    ));
    signalWebReady(renderer, frameWindow);

    expect(postMessage).not.toHaveBeenCalled();
  });

  test('holds the latest route and explicit center until the iframe proves readiness', () => {
    const postMessage = jest.fn();
    const frameWindow = { postMessage };
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />, {
        createNodeMock: (element) =>
          element.type === 'iframe' ? { contentWindow: frameWindow } : null,
      });
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

    expect(postMessage).not.toHaveBeenCalled();
    signalWebReady(renderer, frameWindow);
    expect(webCommands(postMessage)).toEqual([
      { type: 'route', route: latestRoute, viewport: { mode: 'preserve' } },
      {
        type: 'viewport',
        viewport: { mode: 'center', center: latestRoute.at(-1)! },
      },
    ]);
  });

  test('rejects an old iframe ready signal and replays overview only to the new generation', () => {
    const postMessage = jest.fn();
    const frameWindow = { postMessage };
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <OsmMap ref={ref} fitPadding={{ top: 20, right: 20, bottom: 20, left: 20 }} />,
        {
          createNodeMock: (element) =>
            element.type === 'iframe' ? { contentWindow: frameWindow } : null,
        },
      );
      mounted.push(renderer);
    });
    const route = [
      { lat: -31.9523, lng: 115.8613 },
      { lat: -31.951, lng: 115.864 },
    ];
    const oldIdentity = webIdentity(renderer);
    signalWebReady(renderer, frameWindow, oldIdentity);
    act(() => ref.current?.setRoute(route, { viewport: 'overview' }));
    postMessage.mockClear();

    act(() => renderer.update(
      <OsmMap ref={ref} fitPadding={{ top: 48, right: 24, bottom: 72, left: 24 }} />,
    ));
    const newIdentity = webIdentity(renderer);
    expect(newIdentity).not.toEqual(oldIdentity);

    signalWebReady(renderer, frameWindow, oldIdentity);
    expect(postMessage).not.toHaveBeenCalled();
    signalWebReady(renderer, frameWindow, newIdentity);
    expect(webCommands(postMessage)).toEqual([
      { type: 'route', route, viewport: { mode: 'preserve' } },
      { type: 'viewport', viewport: { mode: 'overview' } },
    ]);
  });

  test('rejects ready signals from the wrong source or origin', () => {
    const postMessage = jest.fn();
    const frameWindow = { postMessage };
    const ref = React.createRef<OsmMapHandle>();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap ref={ref} />, {
        createNodeMock: (element) =>
          element.type === 'iframe' ? { contentWindow: frameWindow } : null,
      });
      mounted.push(renderer);
    });
    const route = [{ lat: -31.9523, lng: 115.8613 }];
    act(() => ref.current?.setRoute(route));
    const readyData = JSON.stringify({ type: 'osm-ready', ...webIdentity(renderer) });

    act(() => {
      for (const listener of [...messageListeners]) {
        listener({ data: readyData, origin: APP_ORIGIN, source: {} });
        listener({ data: readyData, origin: 'https://attacker.example', source: frameWindow });
      }
    });

    expect(postMessage).not.toHaveBeenCalled();
    signalWebReady(renderer, frameWindow);
    expect(webCommands(postMessage)).toEqual([
      { type: 'route', route, viewport: { mode: 'preserve' } },
    ]);
  });

  test('invalidates a generation when the iframe loads again without a remount', () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<OsmMap />);
      mounted.push(renderer);
    });
    const before = webIdentity(renderer);

    act(() => renderer.root.findByType('iframe').props.onLoad());
    act(() => renderer.root.findByType('iframe').props.onLoad());

    expect(webIdentity(renderer)).not.toEqual(before);
  });
});
