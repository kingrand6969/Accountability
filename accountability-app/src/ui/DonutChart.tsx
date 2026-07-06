import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export type DonutSegment = { value: number; color: string };

/**
 * Donut chart with a center label — segments drawn as stroked arcs with a
 * hairline gap between them, starting at 12 o'clock going clockwise.
 */
export function DonutChart({
  size,
  strokeWidth = 16,
  segments,
  centerTitle,
  centerSub,
  trackColor = 'rgba(255,255,255,0.9)',
  ink = '#1e1b4b',
}: {
  size: number;
  strokeWidth?: number;
  segments: DonutSegment[];
  centerTitle: string;
  centerSub?: string;
  trackColor?: string;
  ink?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const gap = segments.length > 1 ? Math.min(3, c / 100) : 0;

  let offset = 0;
  const arcs = total > 0
    ? segments
        .filter((s) => s.value > 0)
        .map((s, i) => {
          const len = (s.value / total) * c;
          const arc = {
            key: i,
            color: s.color,
            dash: `${Math.max(len - gap, 0.5)} ${c}`,
            offset: -offset,
          };
          offset += len;
          return arc;
        })
    : [];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill as never}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {arcs.map((a) => (
          <Circle
            key={a.key}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={a.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={a.dash}
            strokeDashoffset={a.offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ))}
      </Svg>
      <Text style={[styles.title, { color: ink, maxWidth: size - strokeWidth * 2 - 12 }]} numberOfLines={1} adjustsFontSizeToFit>
        {centerTitle}
      </Text>
      {centerSub ? <Text style={[styles.sub, { color: ink }]}>{centerSub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_800ExtraBold', fontSize: 18, textAlign: 'center' },
  sub: { fontFamily: 'Inter_500Medium', fontSize: 11, opacity: 0.72, marginTop: 1 },
});
