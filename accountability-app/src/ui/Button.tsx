import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, font, radius } from './theme';

type Variant = 'primary' | 'success' | 'outline' | 'danger' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/** Standard app button: 48pt target, press feedback, loading spinner. */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
  accessibilityLabel,
}: Props) {
  const v = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [
        styles.base,
        v.container,
        pressed && !inactive && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: v.textColor }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const VARIANTS: Record<
  Variant,
  { container: ViewStyle; textColor: string; spinner: string }
> = {
  primary: {
    container: { backgroundColor: colors.primary },
    textColor: colors.onPrimary,
    spinner: colors.onPrimary,
  },
  success: {
    container: { backgroundColor: colors.success },
    textColor: colors.onPrimary,
    spinner: colors.onPrimary,
  },
  danger: {
    container: { backgroundColor: colors.danger },
    textColor: colors.onPrimary,
    spinner: colors.onPrimary,
  },
  outline: {
    container: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    textColor: colors.primary,
    spinner: colors.primary,
  },
  ghost: {
    container: { backgroundColor: colors.surface },
    textColor: colors.text,
    spinner: colors.text,
  },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.5 },
  text: { fontFamily: font.bold, fontSize: 16 },
});
