import { useMemo } from 'react';
import { View, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from 'react-native-svg';
import type { Pt } from './geo';

/**
 * Draws a recorded GPS route as a glowing trace — the "map" visual that works
 * everywhere (web + native), with no map-tile SDK. Real street tiles underneath
 * are a separate native-maps feature; this is the path itself.
 */
export function RouteTrace({
  points,
  width,
  height,
  style,
  stroke = 3,
  showHead = false,
  faint = false,
}: {
  points: Pt[];
  width: number;
  height: number;
  style?: ViewStyle;
  stroke?: number;
  showHead?: boolean; // pulse dot at the current position (while tracking)
  faint?: boolean; // grid-only placeholder when there's no route yet
}) {
  const geom = useMemo(() => project(points, width, height, stroke * 2 + 6), [
    points,
    width,
    height,
    stroke,
  ]);

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="routeStroke" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#60a5fa" />
            <Stop offset="1" stopColor="#a855f7" />
          </SvgGradient>
        </Defs>

        {/* subtle grid so an empty/short route still reads as a map */}
        <GridLines width={width} height={height} />

        {geom && geom.d ? (
          <>
            {/* soft glow underlay */}
            <Path
              d={geom.d}
              stroke="url(#routeStroke)"
              strokeWidth={stroke * 3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.18}
            />
            <Path
              d={geom.d}
              stroke="url(#routeStroke)"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={faint ? 0.5 : 1}
            />
            {/* start marker */}
            <Circle cx={geom.start.x} cy={geom.start.y} r={stroke * 1.6} fill="#22c55e" />
            <Circle cx={geom.start.x} cy={geom.start.y} r={stroke * 0.7} fill="#fff" />
            {/* current position */}
            {showHead ? (
              <>
                <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 3} fill="#60a5fa" opacity={0.28} />
                <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 1.5} fill="#fff" />
                <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 0.9} fill="#2563eb" />
              </>
            ) : (
              <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 1.4} fill="#a855f7" />
            )}
          </>
        ) : null}
      </Svg>
    </View>
  );
}

function GridLines({ width, height }: { width: number; height: number }) {
  const step = 44;
  const lines: React.ReactNode[] = [];
  for (let x = step; x < width; x += step) {
    lines.push(
      <Path key={`v${x}`} d={`M${x} 0 L${x} ${height}`} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />,
    );
  }
  for (let y = step; y < height; y += step) {
    lines.push(
      <Path key={`h${y}`} d={`M0 ${y} L${width} ${y}`} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />,
    );
  }
  return <>{lines}</>;
}

/** Normalise lat/lon into an aspect-correct, padded SVG path. */
function project(points: Pt[], w: number, h: number, pad: number) {
  if (points.length < 2) return null;
  // longitude compresses with latitude — scale lon by cos(meanLat) so the
  // trace keeps its true shape instead of stretching east-west
  const meanLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const cos = Math.cos((meanLat * Math.PI) / 180) || 1;
  const xs = points.map((p) => p.lon * cos);
  const ys = points.map((p) => -p.lat); // north is up
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const scale = Math.min(iw / spanX, ih / spanY);
  // centre the trace in the box
  const offX = pad + (iw - spanX * scale) / 2;
  const offY = pad + (ih - spanY * scale) / 2;
  const sx = (x: number) => offX + (x - minX) * scale;
  const sy = (y: number) => offY + (y - minY) * scale;

  const pts = points.map((p) => ({ x: sx(p.lon * cos), y: sy(-p.lat) }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return { d, start: pts[0], end: pts[pts.length - 1] };
}
