import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { RouteTrace } from '../activity/RouteTrace';
import { formatDuration, formatKm, formatPace, type Pt } from '../activity/geo';
import { font, spacing, type } from '../ui/theme';

export const RUN_ROUTE_LARGE_OVERLAY_HEIGHT = 286;

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
  const { width, fontScale } = useWindowDimensions();
  if (data.verified !== true || distance == null || duration == null) return null;
  const isLargeText = fontScale >= 1.75;
  const traceWidth = Math.min(126, Math.max(92, width * 0.27));
  return (
    <View
      testID="run-route-metric-overlay"
      style={[styles.overlay, isLargeText && styles.overlayLarge]}
      pointerEvents="none"
    >
      <LinearGradient colors={['transparent', 'rgba(11,13,11,.92)']} style={StyleSheet.absoluteFill} />
      {points.length > 1 ? (
        <RouteTrace
          points={points}
          width={traceWidth}
          height={76}
          stroke={3}
          accent="#B9FF3D"
          pad={8}
          style={StyleSheet.flatten([styles.route, isLargeText && styles.routeLarge])}
        />
      ) : null}
      <View testID="run-route-metrics" style={[styles.stats, isLargeText && styles.statsLarge]}>
        <Metric value={formatKm(distance)} label="km" primary largeText={isLargeText} />
        <Metric value={formatDuration(duration)} label="time" largeText={isLargeText} />
        <Metric value={formatPace(distance, duration)} label="pace /km" largeText={isLargeText} />
      </View>
    </View>
  );
}

function Metric({
  value,
  label,
  primary = false,
  largeText,
}: {
  value: string;
  label: string;
  primary?: boolean;
  largeText: boolean;
}) {
  return (
    <View
      testID={`run-route-metric-${label}`}
      style={[styles.metric, primary && styles.primaryMetric, largeText && styles.metricLarge]}
    >
      <Text
        testID={`run-route-metric-value-${label}`}
        style={[styles.value, primary && styles.primaryValue]}
      >
        {value}
      </Text>
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
  overlayLarge: {
    height: RUN_ROUTE_LARGE_OVERLAY_HEIGHT,
  },
  route: { position: 'absolute', right: spacing.sm, top: 5 },
  routeLarge: {
    position: 'relative',
    right: undefined,
    top: undefined,
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
  },
  statsLarge: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.xs,
    width: '100%',
  },
  metric: {
    minWidth: 68,
  },
  primaryMetric: {
    minWidth: 96,
  },
  metricLarge: {
    minWidth: 0,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  value: {
    ...type.metric,
    color: '#FFFFFF',
    fontFamily: font.extrabold,
    fontSize: 18,
    lineHeight: 22,
  },
  primaryValue: {
    ...type.heroMetric,
    color: '#FFFFFF',
    fontFamily: font.display,
    fontSize: 42,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  label: {
    marginTop: 2,
    color: 'rgba(255,255,255,.72)',
    fontFamily: font.medium,
    fontSize: 9,
  },
});
