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

function resolveParentOrigin() {
  const origin = globalThis.location?.origin;
  if (!origin || origin === 'null') return null;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.origin === origin
      ? origin
      : null;
  } catch {
    return null;
  }
}

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
  const previousDeclarativeRouteLength = useRef(route.length);
  const parentOrigin = useMemo(resolveParentOrigin, []);
  const sendMessage = useCallback((message: OsmBridgeMessage) => {
    if (!parentOrigin) return;
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(message), parentOrigin);
  }, [parentOrigin]);
  const serializedMapData = JSON.stringify({ markers, route, fitPadding });
  const html = useMemo(
    () => {
      const stableMapData = JSON.parse(serializedMapData) as {
        markers: MapMarker[];
        route: LatLng[];
        fitPadding?: MapFitPadding;
      };
      return buildOsmHtml({
        ...stableMapData,
        interactive,
        tiles,
        showLatestMarker,
        parentOrigin: parentOrigin ?? undefined,
      });
    },
    [serializedMapData, interactive, tiles, showLatestMarker, parentOrigin],
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
    const previousLength = previousDeclarativeRouteLength.current;
    previousDeclarativeRouteLength.current = route.length;
    if (previousLength > 0 && route.length === 0) {
      sendMessage({ type: 'clear-route' });
    }
  }, [route.length, sendMessage]);

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
