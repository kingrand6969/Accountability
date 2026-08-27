import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { font, radius, spacing, type AppThemeColors } from './theme';
import { useAppTheme } from './AppThemeProvider';

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

/** Standard app button: 48pt target, springy press, loading spinner. */
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
  const inactive = disabled || loading;
  const { colors: theme } = useAppTheme();
  const v = buttonAppearance(theme, variant, inactive);
  const [scale] = useState(() => new Animated.Value(1));

  // springy press-in/out — motion tied to the touch, interruptible
  function pressTo(value: number) {
    Animated.spring(scale, {
      toValue: value,
      speed: 40,
      bounciness: value === 1 ? 8 : 0,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, styles.wrap, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => !inactive && pressTo(0.96)}
        onPressOut={() => pressTo(1)}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: inactive, busy: loading }}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor: v.backgroundColor,
            borderColor: v.borderColor,
            borderWidth: v.borderWidth,
            borderRadius: variant === 'primary' ? radius.pill : radius.md,
          },
          pressed && !inactive && styles.pressed,
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
    </Animated.View>
  );
}

export function buttonAppearance(
  theme: AppThemeColors,
  variant: Variant,
  inactive: boolean,
): {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  spinner: string;
} {
  if (inactive) {
    return {
      backgroundColor: theme.surface.muted,
      borderColor: theme.border.subtle,
      borderWidth: 0,
      textColor: theme.ink.muted,
      spinner: theme.ink.muted,
    };
  }

  const filled = (backgroundColor: string) => ({
    backgroundColor,
    borderColor: backgroundColor,
    borderWidth: 0,
    textColor: theme.ink.inverse,
    spinner: theme.ink.inverse,
  });

  if (variant === 'success') return filled(theme.status.success);
  if (variant === 'danger') return filled(theme.status.danger);
  if (variant === 'outline') {
    return {
      backgroundColor: 'transparent',
      borderColor: theme.border.strong,
      borderWidth: 1,
      textColor: theme.ink.primary,
      spinner: theme.ink.primary,
    };
  }
  if (variant === 'ghost') {
    return {
      backgroundColor: theme.surface.muted,
      borderColor: theme.surface.muted,
      borderWidth: 0,
      textColor: theme.ink.primary,
      spinner: theme.ink.primary,
    };
  }
  return {
    ...filled(theme.ink.action),
    borderColor: theme.border.action,
  };
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  base: {
    minHeight: spacing.touch,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  pressed: { opacity: 0.92 },
  text: { fontFamily: font.bold, fontSize: 16 },
});
