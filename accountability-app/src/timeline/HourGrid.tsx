import { useMemo } from 'react';
import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { TimelineCard } from './TimelineCard';
import { formatHourLabel } from './format';
import type { TimelineItem } from './types';
import {
  colors as legacyColors,
  font,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function HourGrid({
  items,
  onPressHour,
  onDelete,
}: {
  items: TimelineItem[];
  onPressHour: (hour: number) => void;
  onDelete: (item: TimelineItem) => void;
}) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [mode, theme]);
  const byHour: Record<number, TimelineItem[]> = {};
  for (const item of items) {
    const h = new Date(item.starts_at).getHours();
    (byHour[h] ||= []).push(item);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {HOURS.map((h) => {
        const hourItems = byHour[h] ?? [];
        return (
          <Pressable
            key={h}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => onPressHour(h)}
            accessibilityRole="button"
            accessibilityLabel={`Add at ${formatHourLabel(h)}`}
          >
            <Text style={styles.hour}>{formatHourLabel(h)}</Text>
            <View style={styles.body}>
              {hourItems.length === 0 ? (
                <View style={styles.emptyLine} />
              ) : (
                <View style={styles.items}>
                  {hourItems.map((item) => (
                    <TimelineCard key={item.id} item={item} onDelete={onDelete} />
                  ))}
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (theme: AppThemeColors, mode: AppThemeMode) => StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 4 },
  pressed: { opacity: 0.7 },
  hour: {
    width: 56,
    color: mode === 'light' ? legacyColors.textFaint : theme.ink.muted,
    fontSize: 13,
    fontFamily: font.semibold,
    paddingTop: 6,
  },
  body: { flex: 1, justifyContent: 'center' },
  emptyLine: {
    height: 1,
    backgroundColor: mode === 'light' ? legacyColors.surface : theme.border.subtle,
    marginVertical: 16,
  },
  items: { gap: spacing.sm },
});
