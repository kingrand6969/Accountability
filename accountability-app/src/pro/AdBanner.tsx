import { StyleSheet, Text, View } from 'react-native';
import { useIsPro } from './ProProvider';
import { colors, font } from '../ui/theme';

/**
 * Placeholder ad banner. Free users see it; Pro users don't. Swap the inner
 * view for a real AdMob banner (react-native-google-mobile-ads) once the app
 * has store accounts — the free/Pro logic stays the same.
 */
export function AdBanner() {
  const { isPro } = useIsPro();
  if (isPro) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Ad · Go Pro to remove ads</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    height: 50,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  text: { color: colors.textFaint, fontFamily: font.medium, fontSize: 13 },
});
