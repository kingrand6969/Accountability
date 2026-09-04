import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from './AppThemeProvider';
import { BrandMark } from './BrandMark';
import { font } from './theme';

type BrandWordmarkProps = Readonly<{
  compact?: boolean;
}>;

/** Theme-aware lockup used anywhere app chrome displays the Mantle name. */
export function BrandWordmark({ compact = false }: BrandWordmarkProps) {
  const { colors: theme } = useAppTheme();
  const markSize = compact ? 32 : 38;

  return (
    <View
      style={styles.row}
      accessibilityRole="image"
      accessibilityLabel="Mantle"
    >
      <BrandMark
        size={markSize}
        color={theme.border.action}
        accessibilityLabel="Mantle logo"
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
        Mantle
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wordmark: {
    fontFamily: font.brand,
    fontSize: 21,
    letterSpacing: -0.8,
  },
  wordmarkCompact: {
    fontSize: 18,
    letterSpacing: -0.6,
  },
});
