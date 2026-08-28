export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { label?: string; color?: string };
export type MapFitPadding = { top: number; right: number; bottom: number; left: number };
export type OsmRouteStyle = {
  color?: string;
  weight?: number;
  casingColor?: string;
  casingWeight?: number;
};

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
export type OsmRouteBridgeMessage = Extract<
  OsmBridgeMessage,
  { type: 'route' | 'clear-route' }
>;
export type OsmViewportBridgeMessage = Extract<OsmBridgeMessage, { type: 'viewport' }>;

export type OsmDocumentIdentity = { generation: string; nonce: string };
export type OsmBridgeCommand = OsmBridgeMessage | { type: 'osm-ready-request' };
export type OsmAuthenticatedBridgeMessage = OsmBridgeCommand & OsmDocumentIdentity;
export type OsmBridgeReadyMessage = { type: 'osm-ready' } & OsmDocumentIdentity;

function isLegacyCenter(value: OsmRouteUpdateOptions | LatLng): value is LatLng {
  return 'lat' in value && 'lng' in value;
}

export function createOsmRouteMessage(
  route: LatLng[],
  options?: OsmRouteUpdateOptions | LatLng,
): OsmRouteBridgeMessage {
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
): OsmViewportBridgeMessage {
  return { type: 'viewport', viewport };
}

const ACCENT = '#6F9F00';

function safeRouteColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function safeRouteWeight(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(16, Math.max(1, value))
    : fallback;
}

/**
 * A self-contained Leaflet map page (OpenStreetMap raster tiles — no API key,
 * no billing). Rendered inside a WebView on native and an iframe on web. Exposes
 * a generation- and capability-scoped bridge so the live run tracker can push
 * new points without reloading or accepting commands from an obsolete document.
 */
export function buildOsmHtml(opts: {
  markers?: MapMarker[];
  route?: LatLng[];
  interactive?: boolean;
  tiles?: 'osm' | 'dark';
  showZoomControl?: boolean;
  showLatestMarker?: boolean;
  fitPadding?: MapFitPadding;
  routeStyle?: OsmRouteStyle;
  parentOrigin?: string;
  bridgeGeneration?: string;
  bridgeNonce?: string;
}): string {
  const markers = opts.markers ?? [];
  const route = opts.route ?? [];
  const interactive = opts.interactive !== false;
  const showZoomControl = interactive && opts.showZoomControl !== false;
  const showLatestMarker = opts.showLatestMarker !== false;
  const dark = opts.tiles === 'dark';
  const routeColor = safeRouteColor(opts.routeStyle?.color, dark ? '#c6f24e' : ACCENT);
  const routeWeight = safeRouteWeight(opts.routeStyle?.weight, 5);
  const routeCasingColor = opts.routeStyle?.casingColor
    ? safeRouteColor(opts.routeStyle.casingColor, '') || null
    : null;
  const routeCasingWeight = Math.max(
    routeWeight,
    safeRouteWeight(opts.routeStyle?.casingWeight, routeWeight + 4),
  );
  const fitPadding = opts.fitPadding ?? { top: 28, right: 28, bottom: 28, left: 28 };
  const parentOrigin = opts.parentOrigin ?? null;
  const bridgeGeneration = opts.bridgeGeneration ?? null;
  const bridgeNonce = opts.bridgeNonce ?? null;
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttr = dark ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap';
  const bg = dark ? '#101410' : '#E7EAE4';
  // Embed data inside an inline <script> safely: JSON.stringify does NOT escape
  // the sequence "</script>", so a user-controlled marker label could otherwise
  // break out of the script tag and inject markup. Escaping "<" closes that hole.
  const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const cspNonce = bridgeNonce ?? 'static-map';
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${cspNonce}' https://unpkg.com`,
    `style-src 'nonce-${cspNonce}' https://unpkg.com`,
    "style-src-attr 'unsafe-inline'",
    "img-src data: https://unpkg.com https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "connect-src 'none'",
    "font-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "navigate-to 'none'",
  ].join('; ');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous" />
<style nonce="${cspNonce}">
  html, body, #map { height: 100%; margin: 0; padding: 0; }
  #map, .leaflet-container { background: ${bg}; font-family: -apple-system, Roboto, sans-serif; }
  .leaflet-control-attribution { font-size: 9px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script nonce="${cspNonce}">
(function () {
  var route = ${safeJson(route)};
  var markers = ${safeJson(markers)};
  var interactive = ${interactive ? 'true' : 'false'};
  var showZoomControl = ${showZoomControl ? 'true' : 'false'};
  var showLatestMarker = ${showLatestMarker ? 'true' : 'false'};
  var fitPadding = ${safeJson(fitPadding)};
  var routeColor = ${safeJson(routeColor)};
  var routeWeight = ${routeWeight};
  var routeCasingColor = ${safeJson(routeCasingColor)};
  var routeCasingWeight = ${routeCasingWeight};
  var parentOrigin = ${safeJson(parentOrigin)};
  var bridgeGeneration = ${safeJson(bridgeGeneration)};
  var bridgeNonce = ${safeJson(bridgeNonce)};
  var map = L.map('map', {
    zoomControl: showZoomControl, dragging: interactive, scrollWheelZoom: interactive,
    doubleClickZoom: interactive, boxZoom: interactive, keyboard: interactive, tap: interactive,
    attributionControl: true
  });
  L.tileLayer('${tileUrl}', {
    maxZoom: 19, attribution: '${tileAttr}'
  }).addTo(map);
  if (map.attributionControl) { map.attributionControl.setPrefix(false); }

  var lineCasing = null;
  var line = null;
  var posMarker = null;
  function drawRoute(pts) {
    if (line) { map.removeLayer(line); line = null; }
    if (lineCasing) { map.removeLayer(lineCasing); lineCasing = null; }
    if (!pts || !pts.length) {
      if (posMarker) { map.removeLayer(posMarker); posMarker = null; }
      return;
    }
    var ll = pts.map(function (p) { return [p.lat, p.lng]; });
    if (routeCasingColor) {
      lineCasing = L.polyline(ll, { color: routeCasingColor, weight: routeCasingWeight, opacity: 0.9, lineJoin: 'round', interactive: false }).addTo(map);
    }
    line = L.polyline(ll, { color: routeColor, weight: routeWeight, opacity: 0.98, lineJoin: 'round', interactive: false }).addTo(map);
    if (showLatestMarker) {
      // a "you are here" dot at the latest point
      var last = ll[ll.length - 1];
      if (posMarker) { posMarker.setLatLng(last); }
      else {
        posMarker = L.marker(last, { icon: L.divIcon({ className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#fff;border:4px solid ' + routeColor + ';box-shadow:0 1px 6px rgba(0,0,0,0.5)"></div>',
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
  function updateRoute(pts, viewport) {
    if (!pts || !pts.length) { clearRoute(); return; }
    drawRoute(pts);
    // Backwards compatibility for callers that used to pass a LatLng directly.
    if (viewport && typeof viewport.lat === 'number' && typeof viewport.lng === 'number') {
      viewport = { mode: 'center', center: viewport };
    }
    applyViewport(viewport || { mode: 'preserve' });
  }

  function signalReady() {
    if (!bridgeGeneration || !bridgeNonce) { return; }
    var payload = JSON.stringify({
      type: 'osm-ready', generation: bridgeGeneration, nonce: bridgeNonce
    });
    if (parentOrigin && window.parent && window.parent !== window) {
      window.parent.postMessage(payload, parentOrigin);
    } else if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(payload);
    }
  }

  window.__handleOsmMessage = function (d) {
    if (!d || d.generation !== bridgeGeneration || d.nonce !== bridgeNonce) { return; }
    if (d.type === 'osm-ready-request') { signalReady(); }
    else if (d.type === 'clear-route') { clearRoute(); }
    else if (d.type === 'route') {
      var viewport = d.viewport;
      if (!viewport && d.center) { viewport = { mode: 'center', center: d.center }; }
      updateRoute(d.route, viewport);
    }
    else if (d.type === 'viewport') { applyViewport(d.viewport); }
  };
  function onMsg(e) {
    if (!parentOrigin || e.source !== window.parent || e.origin !== parentOrigin) { return; }
    try { window.__handleOsmMessage(JSON.parse(e.data)); } catch (err) {}
  }
  if (parentOrigin) { window.addEventListener('message', onMsg); }
  function blockNavigation(e) {
    var node = e.target;
    while (node && node !== document) {
      if (node.tagName === 'A') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      node = node.parentNode;
    }
  }
  document.addEventListener('click', blockNavigation, true);
  signalReady();
})();
</script>
</body>
</html>`;
}
