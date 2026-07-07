import { useCallback, useRef, useState, type ComponentProps } from 'react';
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
import { useIsPro } from '../pro/ProProvider';
import { GlassBackdrop, GlassCard } from '../ui/Glass';
import { ProgressRing } from '../ui/ProgressRing';
import { colors, font, radius, spacing } from '../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export default function InsightsScreen() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const bgRef = useRef<View>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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

  const consistency =
    data && data.daysInPeriod > 0 ? Math.min(1, data.daysActive / data.daysInPeriod) : 0;
  const maxItems = data ? Math.max(...data.chart.map((c) => c.items), 1) : 1;

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} />
      <ScrollView contentContainerStyle={styles.container}>
        {/* period toggle */}
        <View style={styles.toggle}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.value}
              style={[styles.toggleBtn, period === p.value && styles.toggleActive]}
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
          <GlassCard blurTarget={bgRef}>
            <View style={styles.proGate}>
              <View style={styles.proIcon}>
                <Ionicons name="stats-chart" size={34} color={colors.pro} />
              </View>
              <Text style={styles.proTitle}>Monthly insights are Pro</Text>
              <Text style={styles.proText}>
                See your full month — every km, workout and habit trend.
              </Text>
              <Pressable style={styles.proBtn} onPress={() => router.push('/paywall')}>
                <Text style={styles.proBtnText}>Upgrade to Pro</Text>
              </Pressable>
            </View>
          </GlassCard>
        ) : loading || !data ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* hero: consistency */}
            <GlassCard blurTarget={bgRef}>
              <View style={styles.cardPad}>
                {period === 'day' ? (
                  <View style={styles.dayHero}>
                    <View
                      style={[
                        styles.dayBadge,
                        { backgroundColor: data.daysActive > 0 ? 'rgba(4,120,87,0.12)' : 'rgba(30,27,75,0.08)' },
                      ]}
                    >
                      <Ionicons
                        name={data.daysActive > 0 ? 'checkmark-circle' : 'flame-outline'}
                        size={30}
                        color={data.daysActive > 0 ? '#047857' : INK_SOFT}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayHeroTitle}>
                        {data.daysActive > 0 ? 'You showed up today 💪' : 'Nothing logged yet'}
                      </Text>
                      <Text style={styles.dayHeroSub}>
                        {data.km.toFixed(1)} km · {formatHours(data.activeSeconds)} active ·{' '}
                        {data.workouts} workout{data.workouts === 1 ? '' : 's'}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.heroHead}>
                      <Text style={styles.kicker}>CONSISTENCY</Text>
                      <Text style={styles.kickerSoft}>{period === 'week' ? 'THIS WEEK' : 'THIS MONTH'}</Text>
                    </View>
                    <View style={styles.ringWrap}>
                      <View style={styles.ringSvg} pointerEvents="none">
                        <ProgressRing
                          size={150}
                          strokeWidth={9}
                          progress={consistency}
                          trackColor="rgba(255,255,255,0.9)"
                          startColor="#f59e0b"
                          endColor="#fbbf24"
                        />
                      </View>
                      <Text style={styles.ringDays}>{data.daysActive}</Text>
                      <Text style={styles.ringOf}>of {data.daysInPeriod} days</Text>
                    </View>
                    <Text style={styles.heroLine}>
                      {consistency >= 0.8
                        ? 'Crushing it — keep the streak alive'
                        : consistency >= 0.4
                          ? 'Solid momentum — keep showing up'
                          : 'Every day counts — log something today'}
                    </Text>
                  </>
                )}
              </View>
            </GlassCard>

            {/* stat tiles */}
            <View style={styles.grid}>
              <StatTile
                icon="walk-outline"
                tint="#ea580c"
                value={`${data.km.toFixed(1)} km`}
                label={`Distance · ${data.activitiesCount} run${data.activitiesCount === 1 ? '' : 's'}`}
              />
              <StatTile
                icon="time-outline"
                tint="#2563eb"
                value={formatHours(data.activeSeconds)}
                label="Active time"
              />
              <StatTile
                icon="barbell-outline"
                tint="#7c3aed"
                value={String(data.workouts)}
                label="Workouts"
              />
              <StatTile
                icon="checkmark-circle-outline"
                tint="#0d9488"
                value={String(data.tasksDone)}
                label="Tasks & events"
              />
            </View>

            {/* one chart: how much you logged each day */}
            {data.chart.length > 0 ? (
              <GlassCard blurTarget={bgRef}>
                <View style={styles.cardPad}>
                  <Text style={styles.kicker}>YOUR {period === 'week' ? 'WEEK' : 'MONTH'}</Text>
                  <View style={styles.chart}>
                    {data.chart.map((c, i) => {
                      const h = Math.max(c.items / maxItems, c.items > 0 ? 0.08 : 0.02);
                      return (
                        <View key={i} style={styles.barCol}>
                          <Text style={styles.barValue}>{c.items > 0 ? c.items : ''}</Text>
                          <View style={styles.barTrack}>
                            <View
                              style={[
                                styles.barFill,
                                { height: `${h * 100}%`, backgroundColor: c.items > 0 ? '#6d28d9' : 'rgba(30,27,75,0.12)' },
                              ]}
                            />
                          </View>
                          <Text style={styles.barLabel}>{c.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={styles.chartNote}>Things logged each day</Text>
                </View>
              </GlassCard>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatTile({
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
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E4DCF7' },
  container: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  center: { paddingVertical: 80, alignItems: 'center' },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    padding: 3,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
    minHeight: 38,
  },
  toggleActive: { backgroundColor: '#fff' },
  toggleText: { color: INK_SOFT, fontFamily: font.semibold, fontSize: 14 },
  toggleTextActive: { color: INK, fontFamily: font.bold },
  cardPad: { padding: spacing.lg },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  kickerSoft: { color: INK_SOFT, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8 },
  ringWrap: {
    alignSelf: 'center',
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  ringSvg: { position: 'absolute', top: 0, left: 0 },
  ringDays: {
    color: INK,
    fontFamily: font.display,
    fontSize: 52,
    lineHeight: 56,
    includeFontPadding: false,
  },
  ringOf: { color: INK_SOFT, fontFamily: font.medium, fontSize: 12.5 },
  heroLine: {
    color: INK,
    fontFamily: font.bold,
    fontSize: 14.5,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  dayHero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeroTitle: { color: INK, fontFamily: font.extrabold, fontSize: 17 },
  dayHeroSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 13, marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: '48.2%',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 18,
    padding: spacing.lg,
    gap: 4,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tileValue: { fontSize: 20, fontFamily: font.extrabold, color: INK },
  tileLabel: { fontSize: 12, fontFamily: font.medium, color: INK_SOFT },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
    height: 140,
    marginTop: spacing.md,
  },
  barCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, fontFamily: font.bold, color: INK_SOFT },
  barTrack: {
    flex: 1,
    width: '58%',
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10.5, fontFamily: font.semibold, color: INK_SOFT },
  chartNote: { color: INK_SOFT, fontFamily: font.regular, fontSize: 11.5, marginTop: spacing.sm },
  proGate: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  proIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proTitle: { fontSize: 18, fontFamily: font.extrabold, color: INK },
  proText: {
    color: INK_SOFT,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  proBtn: {
    backgroundColor: colors.pro,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minHeight: 48,
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  proBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
});
