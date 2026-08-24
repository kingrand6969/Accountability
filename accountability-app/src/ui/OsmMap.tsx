import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildOsmHtml,
  createOsmRouteMessage,
  createOsmViewportMessage,
  type LatLng,
  type MapFitPadding,
  type MapMarker,
  type OsmBridgeMessage,
  type OsmRouteUpdateOptions,
} from './osmHtml';

export type OsmMapHandle = {
  setRoute: (route: LatLng[], options?: OsmRouteUpdateOptions | LatLng) => void;
  clearRoute: () => void;
  centerOn: (point: LatLng) => void;
  fitRoute: () => void;
};

export type { MapFitPadding } from './osmHtml';

export type OsmMapProps = {
  markers?: MapMarker[];
  route?: LatLng[];
  interactive?: boolean;
  tiles?: 'osm' | 'dark';
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
    interactive = true,
    tiles = 'osm',
    showLatestMarker = true,
    fitPadding,
    style,
  },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const sendMessage = useCallback((message: OsmBridgeMessage) => {
    webRef.current?.injectJavaScript(
      `window.__handleOsmMessage && window.__handleOsmMessage(${JSON.stringify(message)}); true;`,
    );
  }, []);
  const serializedMapData = JSON.stringify({ markers, route, fitPadding });
  const html = useMemo(
    () => {
      const stableMapData = JSON.parse(serializedMapData) as {
        markers: MapMarker[];
        route: LatLng[];
        fitPadding?: MapFitPadding;
      };
      return buildOsmHtml({ ...stableMapData, interactive, tiles, showLatestMarker });
    },
    [serializedMapData, interactive, tiles, showLatestMarker],
  );

  useImperativeHandle(ref, () => ({
    setRoute(r, options) {
      sendMessage(createOsmRouteMessage(r, options));
    },
    clearRoute() {
      sendMessage({ type: 'clear-route' });
    },
    centerOn(point) {
      sendMessage(createOsmViewportMessage({ mode: 'center', center: point }));
    },
    fitRoute() {
      sendMessage(createOsmViewportMessage({ mode: 'overview' }));
    },
  }), [sendMessage]);

  useEffect(() => {
    if (route.length === 0) sendMessage({ type: 'clear-route' });
  }, [route.length, serializedMapData, sendMessage]);

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.web}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E7EAE4' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
