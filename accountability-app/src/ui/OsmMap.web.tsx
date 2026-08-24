import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  buildOsmHtml,
  createOsmRouteMessage,
  createOsmViewportMessage,
  type LatLng,
  type MapFitPadding,
  type MapMarker,
  type OsmBridgeMessage,
} from './osmHtml';
import type { OsmMapHandle, OsmMapProps } from './OsmMap';

/**
 * Web build of OsmMap — the same Leaflet page, hosted in an <iframe srcDoc>.
 * Live updates go through postMessage to the iframe (mirrors the native ref API).
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const sendMessage = useCallback((message: OsmBridgeMessage) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
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

  const iframe = createElement('iframe', {
    ref: frameRef,
    srcDoc: html,
    style: { border: 'none', width: '100%', height: '100%', display: 'block' },
    sandbox: 'allow-scripts allow-same-origin',
    title: 'Map',
  });

  return <View style={[styles.wrap, style]}>{iframe}</View>;
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E7EAE4' },
});
