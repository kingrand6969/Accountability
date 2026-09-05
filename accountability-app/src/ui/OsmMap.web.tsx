import * as Crypto from 'expo-crypto';
import {
  createElement,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  buildOsmHtml,
  type LatLng,
  type MapFitPadding,
  type MapMarker,
  type OsmAuthenticatedBridgeMessage,
  type OsmDocumentIdentity,
  type OsmRouteStyle,
} from './osmHtml';
import { OsmBridgeGate } from './osmBridgeGate';
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

const OSM_IFRAME_PERMISSIONS_POLICY = [
  'accelerometer',
  'ambient-light-sensor',
  'autoplay',
  'camera',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'gamepad',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'picture-in-picture',
  'screen-wake-lock',
  'serial',
  'usb',
  'web-share',
  'xr-spatial-tracking',
].map((feature) => `${feature} 'none'`).join('; ');

/**
 * Web build of OsmMap — the same Leaflet page, hosted in an <iframe srcDoc>.
 * Live updates go through postMessage to the iframe (mirrors the native ref API).
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
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const previousDeclarativeRouteLength = useRef(route.length);
  const loadedGeneration = useRef<string | null>(null);
  const [securityEpoch, setSecurityEpoch] = useState(0);
  const parentOrigin = useMemo(resolveParentOrigin, []);
  const serializedMapData = JSON.stringify({ markers, route, fitPadding, routeStyle });
  const documentKey = JSON.stringify({
    serializedMapData,
    interactive,
    tiles,
    showZoomControl,
    showLatestMarker,
    parentOrigin,
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
    if (!parentOrigin) return;
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(message), parentOrigin);
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
        parentOrigin: parentOrigin ?? undefined,
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
      parentOrigin,
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

  useLayoutEffect(() => {
    if (!parentOrigin) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frameRef.current?.contentWindow ||
        event.origin !== parentOrigin
      ) {
        return;
      }
      try {
        gate.acceptReady(JSON.parse(String(event.data)));
      } catch {
        // Ignore malformed messages from the iframe.
      }
    };
    globalThis.addEventListener('message', onMessage);
    return () => globalThis.removeEventListener('message', onMessage);
  }, [gate, parentOrigin, documentIdentity.generation, documentIdentity.nonce]);

  const onLoad = useCallback(() => {
    if (loadedGeneration.current === documentIdentity.generation) {
      gate.invalidate();
      loadedGeneration.current = null;
      setSecurityEpoch((value) => value + 1);
      return;
    }
    loadedGeneration.current = documentIdentity.generation;
    gate.requestReady();
  }, [documentIdentity.generation, gate]);

  const iframe = createElement('iframe', {
    ref: frameRef,
    srcDoc: html,
    style: { border: 'none', width: '100%', height: '100%', display: 'block' },
    sandbox: 'allow-scripts allow-same-origin',
    allow: OSM_IFRAME_PERMISSIONS_POLICY,
    referrerPolicy: 'no-referrer',
    onLoad,
    title: 'Map',
  });

  return <View style={[styles.wrap, style]}>{iframe}</View>;
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#E7EAE4' },
});
