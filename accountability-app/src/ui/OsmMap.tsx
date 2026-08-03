import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildOsmHtml, type LatLng, type MapMarker } from './osmHtml';

export type OsmMapHandle = { setRoute: (route: LatLng[], center?: LatLng) => void };

export type OsmMapProps = {
  markers?: MapMarker[];
  route?: LatLng[];
  interactive?: boolean;
  tiles?: 'osm' | 'dark';
  style?: StyleProp<ViewStyle>;
};

/**
 * A real street map (OpenStreetMap via Leaflet in a WebView). Renders the given
 * markers and route once; for a live run, hold a ref and call `setRoute` to push
 * new points without reloading. Markers/route prop changes rebuild the page, so
 * pass high-frequency updates through the ref, not props.
 */
export const OsmMap = forwardRef<OsmMapHandle, OsmMapProps>(function OsmMap(
  { markers = [], route = [], interactive = true, tiles = 'osm', style },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const serializedMapData = JSON.stringify({ markers, route });
  const html = useMemo(
    () => {
      const stableMapData = JSON.parse(serializedMapData) as {
        markers: MapMarker[];
        route: LatLng[];
      };
      return buildOsmHtml({ ...stableMapData, interactive, tiles });
    },
    [serializedMapData, interactive, tiles],
  );

  useImperativeHandle(ref, () => ({
    setRoute(r, center) {
      webRef.current?.injectJavaScript(
        `window.__updateRoute && window.__updateRoute(${JSON.stringify(r)}, ${
          center ? JSON.stringify(center) : 'null'
        }); true;`,
      );
    },
  }));

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
  wrap: { overflow: 'hidden', backgroundColor: '#e8eef3' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
