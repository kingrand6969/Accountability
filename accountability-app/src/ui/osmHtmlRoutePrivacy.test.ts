import { describe, expect, test } from '@jest/globals';

import { buildOsmHtml } from './osmHtml';

describe('OSM route endpoint privacy', () => {
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
