import { describe, expect, test } from '@jest/globals';

import { buildOsmHtml } from './osmHtml';

describe('OSM route endpoint privacy', () => {
  test('draws an optional dark casing below the semantic route centerline on natural tiles', () => {
    const html = buildOsmHtml({
      route: [{ lat: -31.95, lng: 115.86 }, { lat: -31.96, lng: 115.87 }],
      tiles: 'osm',
      routeStyle: {
        color: '#B9FF3D',
        weight: 5,
        casingColor: '#0B0D0B',
        casingWeight: 9,
      },
    });

    expect(html).toContain('var routeColor = "#B9FF3D";');
    expect(html).toContain('var routeCasingColor = "#0B0D0B";');
    expect(html).toContain('var routeWeight = 5;');
    expect(html).toContain('var routeCasingWeight = 9;');
    const casing = html.indexOf('lineCasing = L.polyline');
    const centerline = html.indexOf('line = L.polyline');
    expect(casing).toBeGreaterThan(-1);
    expect(centerline).toBeGreaterThan(casing);
    expect(html).toContain('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  });

  test('can suppress the implicit latest-position dot for a shared route', () => {
    const html = buildOsmHtml({
      route: [{ lat: -31.95, lng: 115.86 }, { lat: -31.96, lng: 115.87 }],
      interactive: false,
      tiles: 'dark',
      showLatestMarker: false,
    });

    expect(html).toContain('var showLatestMarker = false;');
    expect(html).toContain('if (showLatestMarker)');
  });

  test('keeps the latest-position dot by default for live tracking maps', () => {
    expect(buildOsmHtml({ route: [] })).toContain('var showLatestMarker = true;');
  });
});
