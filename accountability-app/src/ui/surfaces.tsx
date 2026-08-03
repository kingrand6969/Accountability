import type { ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';

import {
  colors,
  elevation,
  radius,
  semanticColors,
  spacing,
  type,
} from './theme';

type EditorialHeadingProps = TextProps & {
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
};

export function EditorialHeading({
  children,
  style,
  ...props
}: EditorialHeadingProps) {
  return (
    <Text
      accessibilityRole="header"
      style={[styles.editorialHeading, style]}
      {...props}
    >
      {children}
    </Text>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

function ActionButton({
  label,
  onPress,
  disabled = false,
  icon,
  accessibilityLabel,
  style,
  variant,
}: ButtonProps & { variant: 'primary' | 'outlined' }) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primaryButton : styles.outlinedButton,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
        styles.touchTarget,
      ]}
    >
      {icon}
      <Text
        style={[
          styles.buttonLabel,
          isPrimary ? styles.primaryButtonLabel : styles.outlinedButtonLabel,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps) {
  return <ActionButton {...props} variant="primary" />;
}

export function OutlinedButton(props: ButtonProps) {
  return <ActionButton {...props} variant="outlined" />;
}

type IconButtonProps = {
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  accessibilityLabel,
  icon,
  onPress,
  disabled = false,
  selected = false,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        disabled ? { disabled: true, selected } : { selected }
      }
      disabled={disabled}
      hitSlop={0}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && styles.iconButtonSelected,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
        styles.touchTarget,
      ]}
    >
      {icon}
    </Pressable>
  );
}

type SurfaceProps = ViewProps & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function CreamCard({ children, style, ...props }: SurfaceProps) {
  return (
    <View
      accessibilityRole={props.accessibilityRole ?? 'summary'}
      style={[styles.creamCard, style]}
      {...props}
    >
      {children}
    </View>
  );
}

type HeroImageCardProps = SurfaceProps & {
  image: ImageSourcePropType;
  imageAccessibilityLabel: string;
  imageStyle?: StyleProp<ImageStyle>;
};

export function HeroImageCard({
  image,
  imageAccessibilityLabel,
  imageStyle,
  children,
  style,
  ...props
}: HeroImageCardProps) {
  return (
    <View style={[styles.heroCard, style, styles.touchTarget]} {...props}>
      <Image
        testID="hero-image-card-image"
        accessibilityRole="image"
        accessibilityLabel={imageAccessibilityLabel}
        source={image}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, styles.heroImage, imageStyle]}
      />
      <View
        testID="hero-image-card-scrim"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.heroScrim]}
      />
      <View testID="hero-image-card-content" style={styles.heroContent}>
        {children}
      </View>
    </View>
  );
}

export function RoundedBottomSheetSurface({
  children,
  style,
  ...props
}: SurfaceProps) {
  return (
    <View
      accessibilityRole={props.accessibilityRole ?? 'summary'}
      accessibilityViewIsModal={props.accessibilityViewIsModal ?? true}
      style={[styles.bottomSheet, style]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  editorialHeading: {
    ...type.editorialHeading,
    flexShrink: 1,
  },
  button: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  outlinedButton: {
    backgroundColor: semanticColors.surface.card,
    borderColor: semanticColors.border.action,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.86,
  },
  disabled: {
    opacity: 0.48,
  },
  buttonLabel: {
    ...type.label,
    fontSize: 16,
    lineHeight: 22,
    flexShrink: 1,
    textAlign: 'center',
  },
  primaryButtonLabel: {
    color: colors.onPrimary,
  },
  outlinedButtonLabel: {
    color: colors.primary,
  },
  iconButton: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonSelected: {
    backgroundColor: colors.primarySoft,
  },
  creamCard: {
    backgroundColor: semanticColors.surface.canvas,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...elevation.card,
  },
  heroCard: {
    borderRadius: radius.card,
    overflow: 'hidden',
    backgroundColor: semanticColors.surface.inverse,
  },
  heroImage: {
    width: undefined,
    height: undefined,
  },
  heroScrim: {
    backgroundColor: 'rgba(8,26,58,0.66)',
  },
  heroContent: {
    flex: 1,
    padding: spacing.lg,
  },
  touchTarget: {
    minHeight: spacing.touch,
    minWidth: spacing.touch,
  },
  bottomSheet: {
    backgroundColor: semanticColors.surface.canvas,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    ...elevation.floating,
  },
});

/** Apply to foreground text placed over a HeroImageCard's semantic dark scrim. */
export const heroForegroundTextStyle = {
  color: semanticColors.ink.inverse,
} as const;
