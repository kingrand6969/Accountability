import { describe, expect, test } from '@jest/globals';

import { buildOsmHtml, type LatLng } from './osmHtml';

type BridgeEvent =
  | { kind: 'fit'; points: LatLng[] }
  | { kind: 'remove'; layer: 'line' | 'marker' }
  | { kind: 'view'; point: [number, number]; zoom: number };

type BridgeWindow = {
  __handleOsmMessage?: (message: unknown) => void;
  parent: object;
  addEventListener: (type: string, listener: (event: { data: string }) => void) => void;
};

function executeBridge(initialRoute: LatLng[], parentOrigin = 'https://app.example') {
  const events: BridgeEvent[] = [];
  const listeners: Record<string, (event: { data: string }) => void> = {};
  const map = {
    fitBounds(bounds: { points: LatLng[] }) {
      events.push({ kind: 'fit', points: bounds.points });
    },
    getZoom: () => 15,
    removeLayer(layer: { kind: 'line' | 'marker' }) {
      events.push({ kind: 'remove', layer: layer.kind });
    },
    setView(point: [number, number], zoom: number) {
      events.push({ kind: 'view', point, zoom });
    },
  };
  const leaflet = {
    divIcon: () => ({}),
    map: () => map,
    marker: () => {
      const marker = {
        kind: 'marker' as const,
        addTo: () => marker,
        bindPopup: () => marker,
        setLatLng: () => marker,
      };
      return marker;
    },
    polyline: (points: [number, number][]) => {
      const line = {
        kind: 'line' as const,
        addTo: () => line,
        getBounds: () => ({
          points: points.map(([lat, lng]) => ({ lat, lng })),
        }),
        getLatLngs: () => points.map(([lat, lng]) => ({ lat, lng })),
      };
      return line;
    },
    tileLayer: () => ({ addTo: () => undefined }),
  };
  const parentWindow = {};
  const bridgeWindow: BridgeWindow = {
    parent: parentWindow,
    addEventListener(type, listener) {
      listeners[`window:${type}`] = listener;
    },
  };
  const document = {
    addEventListener(type: string, listener: (event: { data: string }) => void) {
      listeners[`document:${type}`] = listener;
    },
    createElement: () => ({ textContent: '' }),
  };
  const html = buildOsmHtml({
    route: initialRoute,
    showLatestMarker: true,
    parentOrigin,
  });
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Generated OSM page did not include its bridge script');

  // This executes the actual generated bridge with a small Leaflet test double.
  Function('window', 'document', 'L', script)(bridgeWindow, document, leaflet);
  events.length = 0;

  return {
    events,
    message(
      message: unknown,
      event: { origin?: string; source?: object } = {},
    ) {
      const listener = listeners['window:message'];
      if (!listener) throw new Error('Generated OSM page did not register its message bridge');
      listener({
        data: JSON.stringify(message),
        origin: event.origin ?? parentOrigin,
        source: event.source ?? parentWindow,
      } as { data: string });
    },
  };
}

describe('generated OSM route bridge', () => {
  const routeA = [
    { lat: -31.9523, lng: 115.8613 },
    { lat: -31.951, lng: 115.864 },
  ];
  const routeB = [
    { lat: -31.95, lng: 115.865 },
    { lat: -31.948, lng: 115.868 },
  ];

  test('empty route atomically clears the line and latest-position marker before neutralising the viewport', () => {
    const bridge = executeBridge(routeA);

    bridge.message({ type: 'route', route: [], viewport: { mode: 'preserve' } });

    expect(bridge.events).toEqual([
      { kind: 'remove', layer: 'line' },
      { kind: 'remove', layer: 'marker' },
      { kind: 'view', point: [20, 0], zoom: 2 },
    ]);
  });

  test('preserves a user-controlled viewport during live route updates', () => {
    const bridge = executeBridge(routeA);

    bridge.message({ type: 'route', route: routeB, viewport: { mode: 'preserve' } });

    expect(bridge.events).toEqual([
      { kind: 'remove', layer: 'line' },
    ]);
  });

  test('centers and fits only when the matching explicit viewport command is sent', () => {
    const bridge = executeBridge(routeA);
    const latest = routeA.at(-1)!;

    bridge.message({ type: 'viewport', viewport: { mode: 'center', center: latest } });
    bridge.message({ type: 'viewport', viewport: { mode: 'overview' } });

    expect(bridge.events).toEqual([
      { kind: 'view', point: [latest.lat, latest.lng], zoom: 15 },
      { kind: 'fit', points: routeA },
    ]);
  });

  test('clear-route command removes route location evidence and resets the viewport', () => {
    const bridge = executeBridge(routeA);

    bridge.message({ type: 'clear-route' });

    expect(bridge.events).toEqual([
      { kind: 'remove', layer: 'line' },
      { kind: 'remove', layer: 'marker' },
      { kind: 'view', point: [20, 0], zoom: 2 },
    ]);
  });

  test('rejects route messages that are not from the exact same-origin parent', () => {
    const bridge = executeBridge(routeA);

    bridge.message(
      { type: 'clear-route' },
      { origin: 'https://attacker.example' },
    );
    bridge.message(
      { type: 'clear-route' },
      { source: {} },
    );

    expect(bridge.events).toEqual([]);
  });

  test('normalizes the legacy route center field to an explicit center viewport', () => {
    const bridge = executeBridge(routeA);
    const latest = routeB.at(-1)!;

    bridge.message({ type: 'route', route: routeB, center: latest });

    expect(bridge.events).toEqual([
      { kind: 'remove', layer: 'line' },
      { kind: 'view', point: [latest.lat, latest.lng], zoom: 15 },
    ]);
  });
});
