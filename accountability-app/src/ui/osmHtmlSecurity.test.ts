import { describe, expect, test } from '@jest/globals';

import { buildOsmHtml } from './osmHtml';

describe('generated OSM document isolation', () => {
  test('pins Leaflet 1.9.4 with the official integrity hashes and anonymous CORS', () => {
    const html = buildOsmHtml({
      bridgeGeneration: 'generation-1',
      bridgeNonce: 'capability-1',
    });

    expect(html).toContain(
      'href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous"',
    );
    expect(html).toContain(
      'src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"',
    );
  });

  test('uses a nonce-scoped CSP and blocks map attribution from navigating its document', () => {
    const html = buildOsmHtml({
      bridgeGeneration: 'generation-1',
      bridgeNonce: 'capability-1',
    });

    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'nonce-capability-1' https://unpkg.com");
    expect(html).toContain("style-src 'nonce-capability-1' https://unpkg.com");
    expect(html).toContain("style-src-attr 'unsafe-inline'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("navigate-to 'none'");
    expect(html).toContain('<style nonce="capability-1">');
    expect(html).toContain('<script nonce="capability-1">');
    expect(html).toContain("document.addEventListener('click', blockNavigation, true)");
    expect(html).toContain('map.attributionControl.setPrefix(false)');
  });

  test('can hide Leaflet zoom chrome without disabling map gestures', () => {
    const html = buildOsmHtml({
      interactive: true,
      showZoomControl: false,
    });

    expect(html).toContain('var showZoomControl = false;');
    expect(html).toContain('zoomControl: showZoomControl');
    expect(html).toContain('dragging: interactive');
    expect(buildOsmHtml({ interactive: false })).toContain(
      'var showZoomControl = false;',
    );
  });
});
