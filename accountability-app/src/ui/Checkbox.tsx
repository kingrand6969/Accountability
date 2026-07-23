import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from './theme';

/** A tappable checkbox with a comfortable (44pt) hit area. The label is passed
 *  as children so it can contain tappable links. */
export function Checkbox({
  checked,
  onChange,
  children,
  accessibilityLabel,
  style,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
      </View>
      <View style={styles.label}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 32 },
  pressed: { opacity: 0.7 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    backgroundColor: colors.surface,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { flex: 1 },
});
