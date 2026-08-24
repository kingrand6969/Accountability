export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { label?: string; color?: string };
export type MapFitPadding = { top: number; right: number; bottom: number; left: number };

export type OsmMapViewport =
  | { mode: 'preserve' }
  | { mode: 'center'; center: LatLng }
  | { mode: 'overview' };

export type OsmRouteUpdateOptions =
  | { viewport?: 'preserve' }
  | { viewport: 'center'; center: LatLng }
  | { viewport: 'overview' };

export type OsmBridgeMessage =
  | { type: 'route'; route: LatLng[]; viewport: OsmMapViewport }
  | { type: 'clear-route' }
  | { type: 'viewport'; viewport: Exclude<OsmMapViewport, { mode: 'preserve' }> };

function isLegacyCenter(value: OsmRouteUpdateOptions | LatLng): value is LatLng {
  return 'lat' in value && 'lng' in value;
}

export function createOsmRouteMessage(
  route: LatLng[],
  options?: OsmRouteUpdateOptions | LatLng,
): OsmBridgeMessage {
  if (route.length === 0) return { type: 'clear-route' };
  if (!options) {
    return { type: 'route', route, viewport: { mode: 'preserve' } };
  }
  if (isLegacyCenter(options)) {
    return { type: 'route', route, viewport: { mode: 'center', center: options } };
  }
  if (options.viewport === 'center') {
    return {
      type: 'route',
      route,
      viewport: { mode: 'center', center: options.center },
    };
  }
  if (options.viewport === 'overview') {
    return { type: 'route', route, viewport: { mode: 'overview' } };
  }
  return { type: 'route', route, viewport: { mode: 'preserve' } };
}

export function createOsmViewportMessage(
  viewport: Exclude<OsmMapViewport, { mode: 'preserve' }>,
): OsmBridgeMessage {
  return { type: 'viewport', viewport };
}

const ACCENT = '#6F9F00';

/**
 * A self-contained Leaflet map page (OpenStreetMap raster tiles — no API key,
 * no billing). Rendered inside a WebView on native and an iframe on web. Exposes
 * `window.__updateRoute(points, center)` and listens for postMessage so the live
 * run tracker can push new points without reloading.
 */
export function buildOsmHtml(opts: {
  markers?: MapMarker[];
  route?: LatLng[];
  interactive?: boolean;
  tiles?: 'osm' | 'dark';
  showLatestMarker?: boolean;
  fitPadding?: MapFitPadding;
}): string {
  const markers = opts.markers ?? [];
  const route = opts.route ?? [];
  const interactive = opts.interactive !== false;
  const showLatestMarker = opts.showLatestMarker !== false;
  const dark = opts.tiles === 'dark';
  const fitPadding = opts.fitPadding ?? { top: 28, right: 28, bottom: 28, left: 28 };
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttr = dark ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap';
  const bg = dark ? '#101410' : '#E7EAE4';
  // Embed data inside an inline <script> safely: JSON.stringify does NOT escape
  // the sequence "</script>", so a user-controlled marker label could otherwise
  // break out of the script tag and inject markup. Escaping "<" closes that hole.
  const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  #map, .leaflet-container { background: ${bg}; font-family: -apple-system, Roboto, sans-serif; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  var route = ${safeJson(route)};
  var markers = ${safeJson(markers)};
  var interactive = ${interactive ? 'true' : 'false'};
  var showLatestMarker = ${showLatestMarker ? 'true' : 'false'};
  var fitPadding = ${safeJson(fitPadding)};
  var map = L.map('map', {
    zoomControl: interactive, dragging: interactive, scrollWheelZoom: interactive,
    doubleClickZoom: interactive, boxZoom: interactive, keyboard: interactive, tap: interactive,
    attributionControl: true
  });
  L.tileLayer('${tileUrl}', {
    maxZoom: 19, attribution: '${tileAttr}'
  }).addTo(map);

  var line = null;
  var posMarker = null;
  function drawRoute(pts) {
    if (line) { map.removeLayer(line); line = null; }
    if (!pts || !pts.length) {
      if (posMarker) { map.removeLayer(posMarker); posMarker = null; }
      return;
    }
    var ll = pts.map(function (p) { return [p.lat, p.lng]; });
    line = L.polyline(ll, { color: '${dark ? '#c6f24e' : ACCENT}', weight: 5, opacity: 0.95, lineJoin: 'round' }).addTo(map);
    if (showLatestMarker) {
      // a "you are here" dot at the latest point
      var last = ll[ll.length - 1];
      if (posMarker) { posMarker.setLatLng(last); }
      else {
        posMarker = L.marker(last, { icon: L.divIcon({ className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid ${dark ? '#c6f24e' : ACCENT};box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>',
          iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
      }
    }
  }

  function fitAll() {
    var b = [];
    if (line) { line.getLatLngs().forEach(function (p) { b.push(p); }); }
    markers.forEach(function (m) { b.push([m.lat, m.lng]); });
    if (b.length > 1) { map.fitBounds(b, {
      paddingTopLeft: [fitPadding.left, fitPadding.top],
      paddingBottomRight: [fitPadding.right, fitPadding.bottom],
      maxZoom: 16
    }); }
    else if (b.length === 1) { map.setView(b[0], 15); }
    else { map.setView([20, 0], 2); }
  }

  drawRoute(route);
  markers.forEach(function (m) {
    var icon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:' + (m.color || '${ACCENT}') +
            ';border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.45)"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9]
    });
    var mk = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
    // render the label as TEXT, never HTML — a buddy's display name is untrusted
    if (m.label) {
      var pop = document.createElement('div');
      pop.textContent = String(m.label);
      mk.bindPopup(pop);
    }
  });
  fitAll();

  function fitRoute() {
    if (!line) { return; }
    var points = line.getLatLngs();
    if (points.length > 1) { try { map.fitBounds(line.getBounds(), {
      paddingTopLeft: [fitPadding.left, fitPadding.top],
      paddingBottomRight: [fitPadding.right, fitPadding.bottom],
      maxZoom: 17
    }); } catch (e) {} }
    else if (points.length === 1) { map.setView(points[0], 16); }
  }

  function clearRoute() {
    // One synchronous privacy boundary: remove every route-derived layer, then
    // discard the former location-centred camera.
    drawRoute([]);
    map.setView([20, 0], 2);
  }

  function applyViewport(viewport) {
    if (!viewport || viewport.mode === 'preserve') { return; }
    if (viewport.mode === 'center' && viewport.center) {
      map.setView(
        [viewport.center.lat, viewport.center.lng],
        map.getZoom() < 14 ? 16 : map.getZoom()
      );
    } else if (viewport.mode === 'overview') {
      fitRoute();
    }
  }

  // Live bridge — route updates preserve a user's pan/zoom unless the caller
  // explicitly requests Center or Overview.
  window.__updateRoute = function (pts, viewport) {
    if (!pts || !pts.length) { clearRoute(); return; }
    drawRoute(pts);
    // Backwards compatibility for callers that used to pass a LatLng directly.
    if (viewport && typeof viewport.lat === 'number' && typeof viewport.lng === 'number') {
      viewport = { mode: 'center', center: viewport };
    }
    applyViewport(viewport || { mode: 'preserve' });
  };

  window.__handleOsmMessage = function (d) {
    if (!d) { return; }
    if (d.type === 'clear-route') { clearRoute(); }
    else if (d.type === 'route') { window.__updateRoute(d.route, d.viewport); }
    else if (d.type === 'viewport') { applyViewport(d.viewport); }
  };
  function onMsg(e) {
    try { window.__handleOsmMessage(JSON.parse(e.data)); } catch (err) {}
  }
  document.addEventListener('message', onMsg);
  window.addEventListener('message', onMsg);
})();
</script>
</body>
</html>`;
}
