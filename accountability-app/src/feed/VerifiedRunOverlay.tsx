import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RouteTrace } from '../activity/RouteTrace';
import { formatDurationLong, formatKm, formatPace, type Pt } from '../activity/geo';
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

export function VerifiedRunOverlay({ data }: { data: Record<string, unknown> }) {
  const distance = numberValue(data.distance_m);
  const duration = numberValue(data.duration_s);
  const points = routeValue(data.route);
  const { width } = useWindowDimensions();
  if (data.verified !== true || distance == null || duration == null) return null;

  const traceWidth = Math.min(132, Math.max(96, width * 0.27));
  return (
    <View style={styles.overlay} pointerEvents="none">
      <LinearGradient
        colors={['transparent', 'rgba(2,8,20,.9)']}
        style={StyleSheet.absoluteFill}
      />
      {points.length > 1 ? (
        <RouteTrace
          points={points}
          width={traceWidth}
          height={78}
          stroke={3}
          accent="#4f8cff"
          pad={8}
          style={styles.route}
        />
      ) : null}
      <View style={styles.stats}>
        <Stat value={formatKm(distance)} label="km" />
        <View style={styles.rule} />
        <Stat value={formatDurationLong(duration)} label="time" />
        <View style={styles.rule} />
        <Stat value={formatPace(distance, duration)} label="pace /km" />
      </View>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 142, justifyContent: 'flex-end', padding: spacing.md },
  route: { position: 'absolute', right: spacing.sm, top: 7 },
  stats: { flexDirection: 'row', alignItems: 'center', paddingRight: 6 },
  stat: { flex: 1 },
  value: { color: '#fff', fontFamily: font.extrabold, fontSize: 22, lineHeight: 25 },
  label: { color: 'rgba(255,255,255,.82)', fontFamily: font.medium, fontSize: 9.5, marginTop: 2 },
  rule: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: 'rgba(255,255,255,.44)', marginHorizontal: 7 },
});
