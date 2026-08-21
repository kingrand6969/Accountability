import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import type { BodyMeasurement } from './types';

type TrendPeriod = 'week' | 'month';

function chronological(measurements: readonly BodyMeasurement[], period: TrendPeriod) {
  const days = period === 'week' ? 7 : 30;
  const newestTime = measurements.reduce(
    (latest, item) => Math.max(latest, new Date(item.recordedAt).getTime()),
    Number.NEGATIVE_INFINITY,
  );
  if (!Number.isFinite(newestTime)) return [];
  const cutoff = newestTime - days * 24 * 60 * 60 * 1000;
  return [...measurements]
    .filter((item) => new Date(item.recordedAt).getTime() >= cutoff)
    .sort((left, right) => {
      const dateDifference = new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime();
      return dateDifference || left.id.localeCompare(right.id);
    });
}

export function WeightTrendChart({ measurements }: { measurements: readonly BodyMeasurement[] }) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [period, setPeriod] = useState<TrendPeriod>('week');
  const points = useMemo(() => chronological(measurements, period), [measurements, period]);
  const first = points[0];
  const current = points.at(-1);
  const change = first && current ? current.weightKg - first.weightKg : 0;
  const summary = first && current
    ? `Weight trend: started at ${first.weightKg.toFixed(1)} kg, current ${current.weightKg.toFixed(1)} kg, change ${change >= 0 ? '+' : ''}${change.toFixed(1)} kg.`
    : 'Weight trend has no check-ins yet.';

  const chartPoints = useMemo(() => {
    if (points.length < 2) return '';
    const weights = points.map((point) => point.weightKg);
    const low = Math.min(...weights);
    const high = Math.max(...weights);
    const range = high - low || 1;
    return points.map((point, index) => {
      const x = 12 + (index / (points.length - 1)) * 296;
      const y = 92 - ((point.weightKg - low) / range) * 72;
      return `${x},${y}`;
    }).join(' ');
  }, [points]);

  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Weight trend</Text>
        <View style={styles.switcher} accessibilityRole="tablist">
          {(['week', 'month'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setPeriod(value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: value === period }}
              accessibilityLabel={`Show ${value === 'week' ? 'weekly' : 'monthly'} weight trend`}
              style={[styles.periodButton, value === period && styles.periodButtonSelected]}
            >
              <Text style={[styles.periodText, value === period && styles.periodTextSelected]}>
                {value === 'week' ? 'Weekly' : 'Monthly'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text accessibilityLabel={summary} style={styles.summary}>{summary}</Text>
      {points.length === 0 ? (
        <Text style={styles.empty}>Add a body check-in to begin your weight trend.</Text>
      ) : points.length === 1 ? (
        <Text style={styles.empty}>One check-in recorded. Add another to see a trend.</Text>
      ) : (
        <Svg
          width="100%"
          height={108}
          viewBox="0 0 320 108"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Line x1="12" y1="96" x2="308" y2="96" stroke={theme.border.subtle} strokeWidth="1" />
          <Polyline points={chartPoints} fill="none" stroke={theme.ink.action} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {chartPoints.split(' ').map((point, index) => {
            const [cx, cy] = point.split(',');
            return <Circle key={`${cx}-${cy}-${index}`} cx={cx} cy={cy} r="4" fill={theme.surface.card} stroke={theme.ink.action} strokeWidth="2" />;
          })}
        </Svg>
      )}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  card: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: 18, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card },
  headingRow: { gap: spacing.md },
  heading: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 18 },
  switcher: { flexDirection: 'row', alignSelf: 'flex-start', borderRadius: 12, backgroundColor: theme.surface.muted, padding: 2, marginTop: spacing.sm },
  periodButton: { minHeight: 48, minWidth: 88, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  periodButtonSelected: { backgroundColor: theme.surface.raised, borderWidth: 1, borderColor: theme.border.subtle },
  periodText: { color: theme.ink.muted, fontFamily: font.semibold, fontSize: 13 },
  periodTextSelected: { color: theme.ink.action },
  summary: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18, marginTop: spacing.md },
  empty: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingVertical: spacing.xl },
});
