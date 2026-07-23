export type LatLng = { lat: number; lng: number };
export type MapMarker = LatLng & { label?: string; color?: string };

const ACCENT = '#2563eb';

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
}): string {
  const markers = opts.markers ?? [];
  const route = opts.route ?? [];
  const interactive = opts.interactive !== false;
  const dark = opts.tiles === 'dark';
  const tileUrl = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttr = dark ? '&copy; OpenStreetMap &copy; CARTO' : '&copy; OpenStreetMap';
  const bg = dark ? '#101319' : '#e8eef3';
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
    if (pts && pts.length) {
      var ll = pts.map(function (p) { return [p.lat, p.lng]; });
      line = L.polyline(ll, { color: '${dark ? '#c6f24e' : ACCENT}', weight: 5, opacity: 0.95, lineJoin: 'round' }).addTo(map);
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
    if (b.length > 1) { map.fitBounds(b, { padding: [28, 28], maxZoom: 16 }); }
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

  // live bridge — the run tracker pushes points here without reloading the page
  window.__updateRoute = function (pts, center) {
    drawRoute(pts);
    if (center) { map.setView([center.lat, center.lng], map.getZoom() < 14 ? 16 : map.getZoom()); }
    else if (line) { try { map.fitBounds(line.getBounds(), { padding: [28, 28], maxZoom: 17 }); } catch (e) {} }
  };
  function onMsg(e) {
    try { var d = JSON.parse(e.data); if (d && d.type === 'route') { window.__updateRoute(d.route, d.center); } } catch (err) {}
  }
  document.addEventListener('message', onMsg);
  window.addEventListener('message', onMsg);
})();
</script>
</body>
</html>`;
}
