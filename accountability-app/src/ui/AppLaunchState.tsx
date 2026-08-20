import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from './theme';

const LOGO_MARK = require('../../assets/images/logo-mark.png');
const WORDMARK = require('../../assets/images/wordmark.png');

type AppLaunchStateProps = Readonly<{
  message: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}>;

export function AppLaunchState({ message, error = false, actionLabel, onAction }: AppLaunchStateProps) {
  return (
    <View
      style={styles.screen}
      accessibilityRole={error ? 'alert' : 'progressbar'}
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.brand} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={LOGO_MARK} style={styles.mark} resizeMode="contain" />
        <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" />
      </View>
      <View style={[styles.status, error && styles.errorStatus]}>
        {!error ? <ActivityIndicator color={colors.primary} size="small" /> : null}
        <Text style={[styles.message, error && styles.errorMessage]}>{message}</Text>
        {error && actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: colors.cream,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.md,
  },
  mark: {
    width: 72,
    height: 72,
  },
  wordmark: {
    width: 176,
    height: 42,
  },
  status: {
    minHeight: 48,
    marginTop: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  errorStatus: {
    flexDirection: 'column',
    maxWidth: 320,
  },
  message: {
    color: colors.textSecondary,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  errorMessage: {
    color: colors.text,
    textAlign: 'center',
  },
  action: {
    minWidth: 120,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  actionPressed: {
    opacity: 0.82,
  },
  actionText: {
    color: colors.onPrimary,
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 20,
  },
});
