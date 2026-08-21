import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export type ComposerMediaActionItem = {
  id: 'selfie' | 'photo' | 'video' | 'event';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'action' | 'danger' | 'success';
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ComposerMediaActions({
  availableWidth,
  fontScale,
  bottomInset,
  actions,
}: {
  availableWidth: number;
  fontScale: number;
  bottomInset: number;
  actions: readonly ComposerMediaActionItem[];
}) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cellWidth = Math.max(
    48,
    Math.floor((availableWidth - (spacing.lg * 2) - spacing.sm) / 2),
  );
  const largeText = fontScale >= 1.3;

  return (
    <View
      testID="composer-media-actions"
      style={[styles.bar, { paddingBottom: Math.max(bottomInset, 10) }]}
    >
      {actions.map((action) => (
        <Pressable
          key={action.id}
          testID={`composer-action-${action.id}`}
          style={({ pressed }) => [
            styles.action,
            { width: cellWidth },
            largeText && styles.actionLargeText,
            action.active && styles.actionActive,
            action.disabled && styles.actionDisabled,
            pressed && !action.disabled && styles.pressed,
          ]}
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          accessibilityState={{ disabled: action.disabled, selected: action.active }}
        >
          <Ionicons name={action.icon} size={20} color={toneColor(theme, action.tone)} />
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function toneColor(theme: AppThemeColors, tone: ComposerMediaActionItem['tone']) {
  if (tone === 'danger') return theme.status.danger;
  if (tone === 'success') return theme.status.success;
  return theme.ink.action;
}

function createStyles(theme: AppThemeColors) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border.subtle,
    },
    action: {
      minWidth: 48,
      minHeight: 56,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      backgroundColor: theme.surface.muted,
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    actionLargeText: { minHeight: 68 },
    actionActive: { backgroundColor: theme.status.successSoft, borderColor: theme.status.success },
    actionDisabled: { opacity: theme.interaction.disabledOpacity },
    actionLabel: {
      fontFamily: font.bold,
      fontSize: 14,
      lineHeight: 19,
      color: theme.ink.primary,
      textAlign: 'center',
      flexShrink: 1,
    },
    pressed: { opacity: 0.65 },
  });
}
