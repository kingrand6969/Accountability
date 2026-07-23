import { createElement, forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildOsmHtml } from './osmHtml';
import type { OsmMapHandle, OsmMapProps } from './OsmMap';

/**
 * Web build of OsmMap — the same Leaflet page, hosted in an <iframe srcDoc>.
 * Live updates go through postMessage to the iframe (mirrors the native ref API).
 */
export const OsmMap = forwardRef<OsmMapHandle, OsmMapProps>(function OsmMap(
  { markers = [], route = [], interactive = true, tiles = 'osm', style },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(
    () => buildOsmHtml({ markers, route, interactive, tiles }),
    [JSON.stringify(markers), JSON.stringify(route), interactive, tiles],
  );

  useImperativeHandle(ref, () => ({
    setRoute(r, center) {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ type: 'route', route: r, center }), '*');
    },
  }));

  const iframe = createElement('iframe', {
    ref: frameRef,
    srcDoc: html,
    style: { border: 'none', width: '100%', height: '100%', display: 'block' },
    // eslint-disable-next-line
    sandbox: 'allow-scripts allow-same-origin',
    title: 'Map',
  });

  return <View style={[styles.wrap, style]}>{iframe}</View>;
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: '#e8eef3' },
});
