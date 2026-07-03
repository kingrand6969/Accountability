import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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
  const router = useRouter();
  const meta = typeMeta(item.type);
  const checklist = item.checklist ?? [];
  const hasList = checklist.length > 0;
  const doneCount = checklist.filter((c) => c.done).length;

  // The card shows only the title + an indicator; tap opens note/checklist.
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
      accessibilityLabel={`Open ${item.title}`}
    >
      <Text style={styles.time}>{formatTime(item.starts_at)}</Text>
      <View style={[styles.iconBadge, { backgroundColor: `${meta.tint}18` }]}>
        <Ionicons name={meta.icon as IoniconName} size={18} color={meta.tint} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.indicators}>
          {hasList ? (
            <View style={styles.badge}>
              <Ionicons name="checkbox-outline" size={12} color={colors.primary} />
              <Text style={styles.badgeText}>
                {doneCount}/{checklist.length}
              </Text>
            </View>
          ) : item.note ? (
            <View style={styles.badge}>
              <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
              <Text style={styles.badgeMuted}>Note</Text>
            </View>
          ) : null}
          {item.reminder_id ? (
            <Ionicons name="notifications-outline" size={13} color={colors.textMuted} />
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      <Pressable
        onPress={() => onDelete(item)}
        hitSlop={8}
        style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        accessibilityLabel={`Delete ${item.title}`}
      >
        <Ionicons name="close" size={18} color={colors.textFaint} />
      </Pressable>
    </Pressable>
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
  cardPressed: { opacity: 0.7 },
  time: { fontSize: 13, fontFamily: font.bold, color: colors.primary, width: 44 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 15.5, fontFamily: font.semibold, color: colors.text },
  indicators: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  badgeText: { fontFamily: font.bold, fontSize: 11.5, color: colors.primary },
  badgeMuted: { fontFamily: font.semibold, fontSize: 11.5, color: colors.textMuted },
  delete: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
