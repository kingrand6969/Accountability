import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { typeMeta, formatTime } from './format';
import type { TimelineItem } from './types';
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function TimelineCard({
  item,
  onDelete,
}: {
  item: TimelineItem;
  onDelete: (item: TimelineItem) => void;
}) {
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => timelinePalette(theme, mode), [mode, theme]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const meta = typeMeta(item.type);
  const checklist = item.checklist ?? [];
  const hasList = checklist.length > 0;
  const doneCount = checklist.filter((c) => c.done).length;

  // The card shows only the title + an indicator. The body (tap = open) and
  // the delete X are SEPARATE pressables so tapping X never opens the detail.
  return (
    <View style={styles.card}>
      <Pressable
        style={({ pressed }) => [styles.body, pressed && styles.cardPressed]}
        onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.title}`}
      >
        <Text style={styles.time}>{formatTime(item.starts_at)}</Text>
        <View style={[styles.iconBadge, { backgroundColor: `${meta.tint}${palette.iconBadgeAlpha}` }]}>
          <Ionicons name={meta.icon as IoniconName} size={18} color={meta.tint} />
        </View>
        <View style={styles.bodyText}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.indicators}>
            {hasList ? (
              <View style={styles.badge}>
                <Ionicons name="checkbox-outline" size={12} color={palette.action} />
                <Text style={styles.badgeText}>
                  {doneCount}/{checklist.length}
                </Text>
              </View>
            ) : item.note ? (
              <View style={styles.badge}>
                <Ionicons name="document-text-outline" size={12} color={palette.mutedInk} />
                <Text style={styles.badgeMuted}>Note</Text>
              </View>
            ) : null}
            {item.reminder_id ? (
              <Ionicons name="notifications-outline" size={13} color={palette.mutedInk} />
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.quietInk} />
      </Pressable>
      <Pressable
        onPress={() => onDelete(item)}
        hitSlop={8}
        style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.title}`}
      >
        <Ionicons name="close" size={18} color={palette.quietInk} />
      </Pressable>
    </View>
  );
}

function timelinePalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    surface: mode === 'light' ? legacyColors.surfaceAlt : theme.surface.card,
    border: mode === 'light' ? legacyColors.border : theme.border.subtle,
    action: mode === 'light' ? legacyColors.primary : theme.ink.action,
    ink: mode === 'light' ? legacyColors.text : theme.ink.primary,
    mutedInk: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    quietInk: mode === 'light' ? legacyColors.textFaint : theme.ink.muted,
    badgeSurface: mode === 'light' ? legacyColors.surface : theme.surface.raised,
    iconBadgeAlpha: mode === 'light' ? '18' : '2E',
  } as const;
}

const createStyles = (palette: ReturnType<typeof timelinePalette>) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    paddingRight: spacing.xs,
  },
  cardPressed: { opacity: 0.7 },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  time: { fontSize: 13, fontFamily: font.bold, color: palette.action, width: 44 },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyText: { flex: 1, gap: 3 },
  title: { fontSize: 15.5, fontFamily: font.semibold, color: palette.ink },
  indicators: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: palette.badgeSurface,
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  badgeText: { fontFamily: font.bold, fontSize: 11.5, color: palette.action },
  badgeMuted: { fontFamily: font.semibold, fontSize: 11.5, color: palette.mutedInk },
  delete: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
