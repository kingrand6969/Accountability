import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, spacing } from './theme';

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

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.focused, error ? styles.invalid : null]}>
        <Ionicons name={icon} size={19} color={focused ? colors.primary : colors.textFaint} />
        <TextInput
          {...inputProps}
          style={[styles.input, style]}
          placeholderTextColor={colors.textFaint}
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
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: {
    color: colors.text,
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
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  focused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  invalid: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 12,
    color: colors.text,
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
    color: colors.primary,
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
    color: colors.danger,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
