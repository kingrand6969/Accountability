import * as Crypto from 'expo-crypto';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildOsmHtml,
  type LatLng,
  type MapFitPadding,
  type MapMarker,
  type OsmAuthenticatedBridgeMessage,
  type OsmDocumentIdentity,
  type OsmRouteUpdateOptions,
  type OsmRouteStyle,
} from './osmHtml';
import { OsmBridgeGate } from './osmBridgeGate';

type OsmNavigationRequest = { url: string; isTopFrame?: boolean };

const APPROVED_OSM_RESOURCE_HOSTS = [
  'unpkg.com',
  'tile.openstreetmap.org',
  'basemaps.cartocdn.com',
];

function isInternalOsmDocument(url: string) {
  return url === 'about:blank' ||
    url === 'about:srcdoc' ||
    url.startsWith('data:text/html');
}

function isApprovedOsmResource(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return APPROVED_OSM_RESOURCE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

export function shouldAllowOsmNavigation(request: OsmNavigationRequest) {
  if (isInternalOsmDocument(request.url)) return true;
  return request.isTopFrame === false && isApprovedOsmResource(request.url);
}

export type OsmMapHandle = {
  setRoute: (route: LatLng[], options?: OsmRouteUpdateOptions | LatLng) => void;
  clearRoute: () => void;
  centerOn: (point: LatLng) => void;
  fitRoute: () => void;
};

export type { MapFitPadding, OsmRouteStyle } from './osmHtml';

export type OsmMapProps = {
  markers?: MapMarker[];
  route?: LatLng[];
  routeStyle?: OsmRouteStyle;
  interactive?: boolean;
  tiles?: 'osm' | 'dark';
  showZoomControl?: boolean;
  showLatestMarker?: boolean;
  fitPadding?: MapFitPadding;
  style?: StyleProp<ViewStyle>;
};

/**
 * A real street map (OpenStreetMap via Leaflet in a WebView). Renders the given
 * markers and route once; for a live run, hold a ref and call `setRoute` to push
 * new points without reloading. Markers/route prop changes rebuild the page, so
 * pass high-frequency updates through the ref, not props.
 */
export const OsmMap = forwardRef<OsmMapHandle, OsmMapProps>(function OsmMap(
  {
    markers = [],
    route = [],
    routeStyle,
    interactive = true,
    tiles = 'osm',
    showZoomControl = true,
    showLatestMarker = true,
    fitPadding,
    style,
  },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const previousDeclarativeRouteLength = useRef(route.length);
  const loadedGeneration = useRef<string | null>(null);
  const [securityEpoch, setSecurityEpoch] = useState(0);
  const serializedMapData = JSON.stringify({ markers, route, fitPadding, routeStyle });
  const documentKey = JSON.stringify({
    serializedMapData,
    interactive,
    tiles,
    showZoomControl,
    showLatestMarker,
    securityEpoch,
  });
  const documentRef = useRef<({ key: string } & OsmDocumentIdentity) | null>(null);
  if (!documentRef.current || documentRef.current.key !== documentKey) {
    documentRef.current = {
      key: documentKey,
      generation: Crypto.randomUUID(),
      nonce: Crypto.randomUUID(),
    };
  }
  const documentIdentity: OsmDocumentIdentity = {
    generation: documentRef.current.generation,
    nonce: documentRef.current.nonce,
  };
  const transportRef = useRef<(message: OsmAuthenticatedBridgeMessage) => void>(() => undefined);
  transportRef.current = (message) => {
    webRef.current?.injectJavaScript(
      `window.__handleOsmMessage && window.__handleOsmMessage(${JSON.stringify(message)}); true;`,
    );
  };
  const gateRef = useRef<OsmBridgeGate | null>(null);
  if (!gateRef.current) {
    gateRef.current = new OsmBridgeGate((message) => transportRef.current(message));
  }
  const gate = gateRef.current;
  gate.setDocument(documentIdentity);
  const previousRouteLength = previousDeclarativeRouteLength.current;
  previousDeclarativeRouteLength.current = route.length;
  if (previousRouteLength > 0 && route.length === 0) {
    gate.prepareDeclarativeClear();
  } else if (route.length > 0) {
    gate.cancelPreparedDeclarativeClear();
  }
  const html = useMemo(
    () => {
      const stableMapData = JSON.parse(serializedMapData) as {
        markers: MapMarker[];
        route: LatLng[];
        fitPadding?: MapFitPadding;
        routeStyle?: OsmRouteStyle;
      };
      return buildOsmHtml({
        ...stableMapData,
        interactive,
        tiles,
        showZoomControl,
        showLatestMarker,
        bridgeGeneration: documentIdentity.generation,
        bridgeNonce: documentIdentity.nonce,
      });
    },
    [
      serializedMapData,
      interactive,
      tiles,
      showZoomControl,
      showLatestMarker,
      documentIdentity.generation,
      documentIdentity.nonce,
    ],
  );

  useImperativeHandle(ref, () => ({
    setRoute(r, options) {
      gate.setRoute(r, options);
    },
    clearRoute() {
      gate.clearRoute();
    },
    centerOn(point) {
      gate.centerOn(point);
    },
    fitRoute() {
      gate.fitRoute();
    },
  }), [gate]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      gate.acceptReady(JSON.parse(event.nativeEvent.data));
    } catch {
      // Ignore malformed messages from the document.
    }
  }, [gate]);

  const onShouldStartLoadWithRequest = useCallback((request: OsmNavigationRequest) => {
    const allowed = shouldAllowOsmNavigation(request);
    const isTopFrame = request.isTopFrame !== false;
    const repeatedInternalNavigation =
      isTopFrame && allowed && loadedGeneration.current === documentIdentity.generation;
    if (isTopFrame && (!allowed || repeatedInternalNavigation)) {
      gate.invalidate();
      loadedGeneration.current = null;
      setSecurityEpoch((value) => value + 1);
      return false;
    }
    return allowed;
  }, [documentIdentity.generation, gate]);

  const onLoadEnd = useCallback(() => {
    loadedGeneration.current = documentIdentity.generation;
    gate.requestReady();
  }, [documentIdentity.generation, gate]);

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={['about:*', 'data:*']}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        mediaCapturePermissionGrantType="deny"
        geolocationEnabled={false}
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        javaScriptCanOpenWindowsAutomatically={false}
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E7EAE4' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
