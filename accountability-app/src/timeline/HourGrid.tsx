import { ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { TimelineCard } from './TimelineCard';
import { formatHourLabel } from './format';
import type { TimelineItem } from './types';

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
          <Pressable key={h} style={styles.row} onPress={() => onPressHour(h)}>
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

const styles = StyleSheet.create({
  content: { padding: 12, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: 10, minHeight: 48, paddingVertical: 4 },
  hour: {
    width: 56,
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    paddingTop: 6,
  },
  body: { flex: 1, justifyContent: 'center' },
  emptyLine: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 16,
  },
  items: { gap: 8 },
});
