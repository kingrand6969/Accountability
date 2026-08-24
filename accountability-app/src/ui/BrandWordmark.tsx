import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from './AppThemeProvider';
import { BrandMark } from './BrandMark';
import { font } from './theme';

type BrandWordmarkProps = Readonly<{
  compact?: boolean;
}>;

/** Theme-aware lockup used anywhere app chrome displays the AccountAbility name. */
export function BrandWordmark({ compact = false }: BrandWordmarkProps) {
  const { colors: theme } = useAppTheme();
  const markSize = compact ? 24 : 30;

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel="AccountAbility"
    >
      <BrandMark
        size={markSize}
        color={theme.border.action}
        accessibilityLabel="AccountAbility"
      />
      <Text
        maxFontSizeMultiplier={1.25}
        numberOfLines={1}
        style={[
          styles.wordmark,
          compact && styles.wordmarkCompact,
          { color: theme.ink.primary },
        ]}
      >
        Account<Text style={{ color: theme.ink.action }}>Ability</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  wordmark: {
    fontFamily: font.extrabold,
    fontSize: 21,
    letterSpacing: -0.8,
  },
  wordmarkCompact: {
    fontSize: 18,
    letterSpacing: -0.6,
  },
});
