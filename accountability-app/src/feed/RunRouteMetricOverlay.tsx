import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { RouteTrace } from '../activity/RouteTrace';
import { formatDuration, formatKm, formatPace, type Pt } from '../activity/geo';
import { font, spacing } from '../ui/theme';

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function routeValue(value: unknown): Pt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const lat = numberValue((point as Record<string, unknown>).lat);
    const lon = numberValue((point as Record<string, unknown>).lon);
    return lat == null || lon == null ? [] : [{ lat, lon }];
  });
}

export function RunRouteMetricOverlay({ data }: { data: Record<string, unknown> }) {
  const distance = numberValue(data.distance_m);
  const duration = numberValue(data.duration_s);
  const points = routeValue(data.route);
  const { width } = useWindowDimensions();
  if (data.verified !== true || distance == null || duration == null) return null;
  const traceWidth = Math.min(126, Math.max(92, width * 0.27));
  return (
    <View style={styles.overlay} pointerEvents="none">
      <LinearGradient colors={['transparent', 'rgba(2,8,20,.88)']} style={StyleSheet.absoluteFill} />
      {points.length > 1 ? (
        <RouteTrace
          points={points}
          width={traceWidth}
          height={76}
          stroke={3}
          accent="#B9FF3D"
          pad={8}
          style={styles.route}
        />
      ) : null}
      <View style={styles.stats}>
        <Metric value={formatKm(distance)} label="km" />
        <Metric value={formatDuration(duration)} label="time" />
        <Metric value={formatPace(distance, duration)} label="pace /km" />
      </View>
    </View>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 138,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  route: { position: 'absolute', right: spacing.sm, top: 5 },
  stats: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
  },
  metric: {
    minWidth: 68,
  },
  value: {
    color: '#FFFFFF',
    fontFamily: font.extrabold,
    fontSize: 20,
    lineHeight: 23,
  },
  label: {
    marginTop: 2,
    color: 'rgba(255,255,255,.72)',
    fontFamily: font.medium,
    fontSize: 9,
  },
});
