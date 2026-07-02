import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { typeMeta, formatTime } from './format';
import type { TimelineItem } from './types';
import { colors, font, radius, spacing } from '../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

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
      <View style={[styles.iconBadge, { backgroundColor: `${meta.tint}18` }]}>
        <Ionicons name={meta.icon as IoniconName} size={18} color={meta.tint} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          {item.reminder_id ? (
            <Ionicons name="notifications-outline" size={14} color={colors.textMuted} />
          ) : null}
        </View>
        {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
      </View>
      <Pressable
        onPress={() => onDelete(item)}
        hitSlop={8}
        style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        accessibilityLabel={`Delete ${item.title}`}
      >
        <Ionicons name="close" size={18} color={colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  time: { fontSize: 13, fontFamily: font.bold, color: colors.primary, width: 44 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { fontSize: 15.5, fontFamily: font.semibold, color: colors.text, flexShrink: 1 },
  note: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13.5, marginTop: 2 },
  delete: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
