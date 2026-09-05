import { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, radius, spacing, type AppThemeColors } from './theme';
import { useAppTheme } from './AppThemeProvider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = TextInputProps & {
  label: string;
  icon: IconName;
  error?: string;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function AuthField({
  label,
  icon,
  error,
  actionLabel,
  onActionPress,
  onFocus,
  onBlur,
  style,
  ...inputProps
}: Props) {
  const [focused, setFocused] = useState(false);
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.focused, error ? styles.invalid : null]}>
        <Ionicons name={icon} size={19} color={focused ? theme.ink.action : theme.ink.muted} />
        <TextInput
          {...inputProps}
          style={[styles.input, style]}
          placeholderTextColor={theme.ink.muted}
          accessibilityLabel={label}
          accessibilityHint={error}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {actionLabel && onActionPress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} ${label.toLowerCase()}`}
            onPress={onActionPress}
            hitSlop={6}
            style={styles.action}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={14} color={theme.status.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  group: { gap: 7 },
  label: {
    color: theme.ink.primary,
    fontFamily: font.semibold,
    fontSize: 13.5,
    marginLeft: 2,
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: theme.border.subtle,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: theme.surface.raised,
  },
  focused: {
    borderColor: theme.border.action,
    borderWidth: 1.5,
  },
  invalid: {
    borderColor: theme.border.danger,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 12,
    color: theme.ink.primary,
    fontFamily: font.regular,
    fontSize: 16,
  },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  actionText: {
    color: theme.ink.action,
    fontFamily: font.semibold,
    fontSize: 13,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginLeft: 2,
  },
  error: {
    flex: 1,
    color: theme.status.danger,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
