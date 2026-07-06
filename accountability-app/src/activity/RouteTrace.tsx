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

type Pad = { top: number; right: number; bottom: number; left: number };

function normPad(pad: number | Partial<Pad>, fallback: number): Pad {
  if (typeof pad === 'number') return { top: pad, right: pad, bottom: pad, left: pad };
  return {
    top: pad.top ?? fallback,
    right: pad.right ?? fallback,
    bottom: pad.bottom ?? fallback,
    left: pad.left ?? fallback,
  };
}

/** Normalise lat/lon into an aspect-correct SVG path inside a padded box. */
export function projectRoute(points: Pt[], w: number, h: number, pad: Pad) {
  if (points.length < 2) return null;
  const meanLat = points.reduce((a, p) => a + p.lat, 0) / points.length;
  const cos = Math.cos((meanLat * Math.PI) / 180) || 1;
  const xs = points.map((p) => p.lon * cos);
  const ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-6;
  const spanY = maxY - minY || 1e-6;
  const iw = w - pad.left - pad.right;
  const ih = h - pad.top - pad.bottom;
  const scale = Math.min(iw / spanX, ih / spanY);
  const offX = pad.left + (iw - spanX * scale) / 2;
  const offY = pad.top + (ih - spanY * scale) / 2;
  const sx = (x: number) => offX + (x - minX) * scale;
  const sy = (y: number) => offY + (y - minY) * scale;
  const pts = points.map((p) => ({ x: sx(p.lon * cos), y: sy(-p.lat) }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return { d, start: pts[0], end: pts[pts.length - 1] };
}

/** Where the current-position marker sits, in the trace's pixel space. */
export function traceHead(
  points: Pt[],
  w: number,
  h: number,
  stroke: number,
  pad?: number | Partial<Pad>,
): { x: number; y: number } | null {
  const p = normPad(pad ?? stroke * 2 + 6, stroke * 2 + 6);
  return projectRoute(points, w, h, p)?.end ?? null;
}

export function RouteTrace({
  points,
  width,
  height,
  style,
  stroke = 3,
  accent,
  showHead = false,
  endStyle = 'dot',
  faint = false,
  pad,
}: {
  points: Pt[];
  width: number;
  height: number;
  style?: ViewStyle;
  stroke?: number;
  accent?: string; // solid line color (e.g. lime) instead of the blue→violet gradient
  showHead?: boolean;
  endStyle?: 'dot' | 'none'; // 'none' when the parent draws its own head badge
  faint?: boolean;
  pad?: number | Partial<Pad>;
}) {
  const box = normPad(pad ?? stroke * 2 + 6, stroke * 2 + 6);
  const geom = useMemo(() => projectRoute(points, width, height, box), [points, width, height, box]);
  const line = accent ? accent : 'url(#routeStroke)';

  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id="routeStroke" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#60a5fa" />
            <Stop offset="1" stopColor="#a855f7" />
          </SvgGradient>
        </Defs>

        <GridLines width={width} height={height} />

        {geom && geom.d ? (
          <>
            <Path d={geom.d} stroke={line} strokeWidth={stroke * 3} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.16} />
            <Path d={geom.d} stroke={line} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={faint ? 0.5 : 1} />
            {/* start marker */}
            <Circle cx={geom.start.x} cy={geom.start.y} r={stroke * 1.6} fill="#22c55e" />
            <Circle cx={geom.start.x} cy={geom.start.y} r={stroke * 0.7} fill="#fff" />
            {endStyle === 'dot' ? (
              showHead ? (
                <>
                  <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 3} fill={accent ?? '#60a5fa'} opacity={0.28} />
                  <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 1.5} fill="#fff" />
                  <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 0.9} fill={accent ?? '#2563eb'} />
                </>
              ) : (
                <Circle cx={geom.end.x} cy={geom.end.y} r={stroke * 1.4} fill={accent ?? '#a855f7'} />
              )
            ) : null}
          </>
        ) : null}
      </Svg>
    </View>
  );
}

function GridLines({ width, height }: { width: number; height: number }) {
  const step = 46;
  const lines: React.ReactNode[] = [];
  for (let x = step; x < width; x += step) {
    lines.push(<Path key={`v${x}`} d={`M${x} 0 L${x} ${height}`} stroke="rgba(255,255,255,0.045)" strokeWidth={1} />);
  }
  for (let y = step; y < height; y += step) {
    lines.push(<Path key={`h${y}`} d={`M0 ${y} L${width} ${y}`} stroke="rgba(255,255,255,0.045)" strokeWidth={1} />);
  }
  return <>{lines}</>;
}
