import { Pressable, StyleSheet, Text, View } from 'react-native';
import { typeMeta, formatTime } from './format';
import type { TimelineItem } from './types';

export function TimelineCard({
  item,
  onDelete,
}: {
  item: TimelineItem;
  onDelete: (item: TimelineItem) => void;
}) {
  const meta = typeMeta(item.type);
  return (
    <View style={styles.card}>
      <Text style={styles.time}>{formatTime(item.starts_at)}</Text>
      <Text style={styles.emoji}>{meta.emoji}</Text>
      <View style={styles.body}>
        <Text style={styles.title}>
          {item.title}
          {item.reminder_id ? <Text style={styles.bell}> 🔔</Text> : null}
        </Text>
        {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
      </View>
      <Pressable onPress={() => onDelete(item)} hitSlop={8}>
        <Text style={styles.delete}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
  },
  time: { fontSize: 14, fontWeight: '700', color: '#2563eb', width: 46 },
  emoji: { fontSize: 22 },
  body: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  bell: { fontSize: 13 },
  note: { color: '#666', marginTop: 2 },
  delete: { color: '#999', fontSize: 18, paddingHorizontal: 4 },
});
