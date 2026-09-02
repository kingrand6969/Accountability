import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, spacing, type AppThemeColors } from './theme';
import { useAppTheme } from './AppThemeProvider';

const MANTLE_LOCKUP = require('../../assets/images/logo.png');

type AppLaunchStateProps = Readonly<{
  message: string;
  error?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}>;

export function AppLaunchState({ message, error = false, actionLabel, onAction }: AppLaunchStateProps) {
  const { colors: theme } = useAppTheme();
  const styles = createStyles(theme);
  return (
    <View
      style={styles.screen}
      accessibilityRole={error ? 'alert' : 'progressbar'}
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <Image
        source={MANTLE_LOCKUP}
        style={styles.lockup}
        resizeMode="contain"
        accessible
        accessibilityRole="image"
        accessibilityLabel="Mantle"
      />
      <View style={[styles.status, error && styles.errorStatus]}>
        {!error ? <ActivityIndicator color={theme.ink.action} size="small" /> : null}
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

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: theme.surface.canvas,
  },
  lockup: {
    width: 196,
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
    color: theme.ink.secondary,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
  errorMessage: {
    color: theme.ink.primary,
    textAlign: 'center',
  },
  action: {
    minWidth: 120,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: theme.ink.action,
  },
  actionPressed: {
    opacity: 0.82,
  },
  actionText: {
    color: theme.ink.inverse,
    fontFamily: font.bold,
    fontSize: 15,
    lineHeight: 20,
  },
});
