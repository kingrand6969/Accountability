import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { toLocalDateString } from '../timeline/datetime';
import { colors, font, radius, spacing } from './theme';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Tap-a-day month calendar. `value` is a 'YYYY-MM-DD' string. */
export function MonthCalendar({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const selected = value ? new Date(`${value}T12:00:00`) : new Date();
  const [view, setView] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const todayStr = toLocalDateString(new Date());

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setView(new Date(year, month - 1, 1))}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
        </Pressable>
        <Text style={styles.month}>{monthLabel}</Text>
        <Pressable
          onPress={() => setView(new Date(year, month + 1, 1))}
          hitSlop={8}
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEK.map((w, i) => (
          <Text key={i} style={styles.weekLabel}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const dateStr = toLocalDateString(new Date(year, month, d));
          const isSel = dateStr === value;
          const isToday = dateStr === todayStr;
          return (
            <Pressable
              key={i}
              style={styles.cell}
              onPress={() => onChange(dateStr)}
              accessibilityRole="button"
              accessibilityLabel={dateStr}
              accessibilityState={{ selected: isSel }}
            >
              <View
                style={[
                  styles.day,
                  isSel && styles.daySel,
                  !isSel && isToday && styles.dayToday,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    isSel && styles.dayTextSel,
                    !isSel && isToday && styles.dayTextToday,
                  ]}
                >
                  {d}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  month: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  weekRow: { flexDirection: 'row' },
  weekLabel: {
    flexBasis: '14.28%',
    textAlign: 'center',
    fontFamily: font.bold,
    fontSize: 11.5,
    color: colors.textFaint,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    flexBasis: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySel: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: colors.primary },
  dayText: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  dayTextSel: { color: '#fff' },
  dayTextToday: { color: colors.primary },
});
