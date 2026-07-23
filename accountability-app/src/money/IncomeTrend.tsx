import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { IncomeMonth } from './api';
import { font } from '../ui/theme';

/**
 * A compact 12-month income bar chart for the Finance tab (Pro).
 *
 * Pure View/LinearGradient — no chart library, no canvas — so it stays cheap on
 * a phone. The current month is drawn dimmer because it is still filling up;
 * months with no income keep a faint baseline so the timeline reads continuously
 * instead of looking broken.
 */
export function IncomeTrend({
  data,
  accent,
  ink,
  inkSoft,
  formatAmount,
}: {
  data: IncomeMonth[];
  accent: string;
  ink: string;
  inkSoft: string;
  formatAmount: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.total), 0);
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const best = data.reduce<IncomeMonth | null>(
    (b, d) => (d.total > 0 && (!b || d.total > b.total) ? d : b),
    null,
  );
  const monthLabel = (key: string) =>
    new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });

  if (max <= 0) {
    return (
      <Text style={[styles.empty, { color: inkSoft }]}>
        Log income and your 12-month trend appears here.
      </Text>
    );
  }

  return (
    <View>
      <View style={styles.bars}>
        {data.map((d) => {
          const pct = max > 0 ? d.total / max : 0;
          const current = d.month === thisMonth;
          return (
            <View key={d.month} style={styles.col}>
              <View style={styles.barSlot}>
                {d.total > 0 ? (
                  <LinearGradient
                    colors={
                      current
                        ? [`${accent}99`, `${accent}55`]
                        : [accent, `${accent}C0`]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.bar, { height: `${Math.max(6, pct * 100)}%` }]}
                  />
                ) : (
                  <View style={[styles.barEmpty, { backgroundColor: `${ink}14` }]} />
                )}
              </View>
              <Text style={[styles.monthLabel, { color: inkSoft }]} numberOfLines={1}>
                {monthLabel(d.month)}
              </Text>
            </View>
          );
        })}
      </View>
      {best ? (
        <Text style={[styles.footnote, { color: inkSoft }]}>
          Best month{' '}
          <Text style={[styles.footnoteStrong, { color: ink }]}>
            {monthLabel(best.month)} · {formatAmount(best.total)}
          </Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 118 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  barSlot: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 5, minHeight: 4 },
  barEmpty: { width: '100%', height: 3, borderRadius: 2 },
  monthLabel: { fontFamily: font.medium, fontSize: 10.5 },
  empty: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, paddingVertical: 18 },
  footnote: { fontFamily: font.regular, fontSize: 12, marginTop: 10 },
  footnoteStrong: { fontFamily: font.bold },
});
