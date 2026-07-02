import { useCallback, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getInsights, type Insights } from '../insights/api';
import { formatHours, type Period } from '../insights/compute';
import { formatAmount } from '../money/categories';
import { useIsPro } from '../pro/ProProvider';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

function StatCard({
  icon,
  tint,
  value,
  label,
}: {
  icon: IoniconName;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: `${tint}15` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function InsightsScreen() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // Month view = Pro (matches "unlimited history + insights" in the plan)
    if (period === 'month' && !isPro) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setData(await getInsights(period));
    } catch (e) {
      Alert.alert('Could not load insights', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, [period, isPro]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const maxKm = data ? Math.max(...data.chart.map((c) => c.km), 0.001) : 1;
  const maxItems = data ? Math.max(...data.chart.map((c) => c.items), 1) : 1;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.toggle}>
        {PERIODS.map((p) => (
          <Pressable
            key={p.value}
            style={({ pressed }) => [
              styles.toggleBtn,
              period === p.value && styles.toggleActive,
              pressed && styles.pressed,
            ]}
            onPress={() => setPeriod(p.value)}
          >
            <Text style={[styles.toggleText, period === p.value && styles.toggleTextActive]}>
              {p.label}
            </Text>
            {p.value === 'month' && !isPro ? (
              <Ionicons name="star" size={11} color={colors.pro} />
            ) : null}
          </Pressable>
        ))}
      </View>

      {period === 'month' && !isPro ? (
        <View style={styles.proGate}>
          <View style={styles.proIcon}>
            <Ionicons name="stats-chart" size={40} color={colors.pro} />
          </View>
          <Text style={styles.proTitle}>Monthly insights are Pro</Text>
          <Text style={styles.proText}>
            See your full month — every km, workout and habit trend — with
            AccountAbility Pro.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.proBtn, pressed && styles.pressed]}
            onPress={() => router.push('/paywall')}
          >
            <Text style={styles.proBtnText}>Upgrade to Pro</Text>
          </Pressable>
        </View>
      ) : loading || !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {/* showing-up banner */}
          <View style={styles.showedUp}>
            <Ionicons name="flame" size={22} color={colors.accent} />
            <Text style={styles.showedUpText}>
              {period === 'day'
                ? data.daysActive > 0
                  ? 'You showed up today 💪'
                  : 'Nothing logged yet today'
                : `Showed up ${data.daysActive} of ${data.daysInPeriod} days`}
            </Text>
          </View>

          {/* stat grid */}
          <View style={styles.grid}>
            <StatCard
              icon="walk-outline"
              tint="#ea580c"
              value={`${data.km.toFixed(1)} km`}
              label="Distance"
            />
            <StatCard
              icon="time-outline"
              tint={colors.primary}
              value={formatHours(data.activeSeconds)}
              label="Active time"
            />
            <StatCard
              icon="barbell-outline"
              tint={colors.pro}
              value={String(data.workouts)}
              label="Workouts"
            />
            <StatCard
              icon="footsteps-outline"
              tint="#0891b2"
              value={String(data.activitiesCount)}
              label="Activities"
            />
            <StatCard
              icon="nutrition-outline"
              tint={colors.success}
              value={data.meals > 0 ? `${Math.round(data.kcal)} kcal` : '—'}
              label={`Meals (${data.meals})`}
            />
            <StatCard
              icon="checkmark-circle-outline"
              tint={colors.success}
              value={String(data.tasksDone)}
              label="Tasks & events"
            />
            <StatCard
              icon="cash-outline"
              tint={colors.danger}
              value={formatAmount(data.spend)}
              label="Spent"
            />
            <StatCard
              icon="wallet-outline"
              tint={colors.success}
              value={formatAmount(data.income)}
              label="Income"
            />
          </View>

          {/* charts (week/month) */}
          {data.chart.length > 0 ? (
            <>
              <Text style={styles.chartTitle}>Distance (km)</Text>
              <View style={styles.chart}>
                {data.chart.map((c, i) => (
                  <View key={`km-${i}`} style={styles.barCol}>
                    <Text style={styles.barValue}>{c.km > 0 ? c.km.toFixed(1) : ''}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(c.km / maxKm, 0.02) * 100}%`,
                            backgroundColor: '#ea580c',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{c.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.chartTitle}>Things logged</Text>
              <View style={styles.chart}>
                {data.chart.map((c, i) => (
                  <View key={`it-${i}`} style={styles.barCol}>
                    <Text style={styles.barValue}>{c.items > 0 ? c.items : ''}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(c.items / maxItems, 0.02) * 100}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{c.label}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.background },
  pressed: { opacity: 0.75 },
  center: { paddingVertical: 80, alignItems: 'center' },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    minHeight: 38,
  },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 14 },
  toggleTextActive: { color: colors.primary },
  showedUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  showedUpText: { color: '#fff', fontFamily: font.bold, fontSize: 15, flexShrink: 1 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    width: '48.4%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 4,
    ...shadow.card,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: { fontSize: 20, fontFamily: font.extrabold, color: colors.text },
  statLabel: { fontSize: 12.5, fontFamily: font.medium, color: colors.textMuted },
  chartTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.sm,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    height: 150,
    ...shadow.card,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, fontFamily: font.semibold, color: colors.textMuted },
  barTrack: {
    flex: 1,
    width: '62%',
    borderRadius: 6,
    backgroundColor: colors.surface,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 11, fontFamily: font.medium, color: colors.textFaint },
  proGate: { alignItems: 'center', gap: spacing.md, paddingVertical: 40 },
  proIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proTitle: { fontSize: 19, fontFamily: font.extrabold, color: colors.text },
  proText: {
    color: colors.textMuted,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.xl,
  },
  proBtn: {
    backgroundColor: colors.pro,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
  },
  proBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
});
