import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../ui/BrandMark';
import { colors, font, spacing } from '../ui/theme';

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
  const { fontScale } = useWindowDimensions();
  const isLargeText = fontScale >= 1.25;
  return (
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <IconButton icon="menu-outline" accessibilityLabel="Menu" onPress={onMenu} />
      <View style={styles.wordmark} accessible accessibilityLabel="AccountAbility">
        <BrandMark size={32} accessibilityLabel="AccountAbility logo" />
        {isLargeText ? null : (
          <Text style={styles.account}>Account<Text style={styles.ability}>Ability</Text></Text>
        )}
      </View>
      <View style={styles.actions}>
        <IconButton icon="search-outline" accessibilityLabel="Search" onPress={onSearch} />
        <IconButton icon="add-circle-outline" accessibilityLabel="Create" onPress={onCreate} />
        <View>
          <IconButton
            icon="notifications-outline"
            accessibilityLabel="Notifications"
            onPress={onNotifications}
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
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={23} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  wordmark: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  account: { color: colors.navy, fontFamily: font.bold, fontSize: 16 },
  ability: { color: colors.primary },
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
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: colors.card,
  },
  pressed: { opacity: 0.62 },
});
