import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { colors, font, spacing } from './theme';

const LOGO_MARK = require('../../assets/images/logo-mark.png');
const WORDMARK = require('../../assets/images/wordmark.png');

export function AppLaunchState({ message }: { message: string }) {
  return (
    <View
      style={styles.screen}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.brand} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={LOGO_MARK} style={styles.mark} resizeMode="contain" />
        <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" />
      </View>
      <View style={styles.status}>
        <ActivityIndicator color={colors.primary} size="small" />
        <Text style={styles.message}>{message}</Text>
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
  message: {
    color: colors.textSecondary,
    fontFamily: font.medium,
    fontSize: 14,
    lineHeight: 20,
  },
});
