import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../ui/BrandMark';
import { BRAND_WORDMARK } from '../ui/brandGeometry';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

type Props = {
  unread: number;
  onMenu: () => void;
  onSearch: () => void;
  onCreate: () => void;
  onNotifications: () => void;
};

export function SocialBrandHeader({
  unread,
  onMenu,
  onSearch,
  onCreate,
  onNotifications,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { fontScale } = useWindowDimensions();
  const isLargeText = fontScale >= 1.25;
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <IconButton icon="menu-outline" accessibilityLabel="Menu" onPress={onMenu} styles={styles} color={theme.ink.action} />
      <View style={styles.wordmark} accessible accessibilityLabel={BRAND_WORDMARK}>
        <BrandMark size={32} accessibilityLabel={`${BRAND_WORDMARK} logo`} />
        {isLargeText ? null : (
          <Text style={styles.account}>{BRAND_WORDMARK}</Text>
        )}
      </View>
      <View style={styles.actions}>
        <IconButton icon="search-outline" accessibilityLabel="Search" onPress={onSearch} styles={styles} color={theme.ink.action} />
        <IconButton icon="add-circle-outline" accessibilityLabel="Create" onPress={onCreate} styles={styles} color={theme.ink.action} />
        <View>
          <IconButton
            icon="notifications-outline"
            accessibilityLabel="Notifications"
            onPress={onNotifications}
            styles={styles}
            color={theme.ink.action}
          />
          {unread > 0 ? <View style={styles.dot} accessibilityElementsHidden /> : null}
        </View>
      </View>
    </View>
  );
}

function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  styles,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  styles: BrandHeaderStyles;
  color: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={23} color={color} />
    </Pressable>
  );
}

type BrandHeaderStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    backgroundColor: theme.surface.canvas,
  },
  wordmark: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  account: { color: theme.ink.primary, fontFamily: font.extrabold, fontSize: 14, letterSpacing: 0.25 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  dot: {
    position: 'absolute',
    right: 7,
    top: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.status.danger,
    borderWidth: 1,
    borderColor: theme.surface.card,
  },
  pressed: { opacity: 0.62 },
});
