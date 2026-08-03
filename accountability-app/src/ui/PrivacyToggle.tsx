import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, radius } from './theme';

type Privacy = 'public' | 'private';

/** Two-option segmented control: 🌐 Public / 🔒 Private. */
export function PrivacyToggle({
  value,
  onChange,
  publicHint,
  privateHint,
}: {
  value: Privacy;
  onChange: (v: Privacy) => void;
  publicHint: string;
  privateHint: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Segment
          icon="globe-outline"
          label="Public"
          selected={value === 'public'}
          onPress={() => onChange('public')}
        />
        <Segment
          icon="lock-closed-outline"
          label="Private"
          selected={value === 'private'}
          onPress={() => onChange('private')}
        />
      </View>
      <Text style={styles.hint}>{value === 'public' ? publicHint : privateHint}</Text>
    </View>
  );
}

function Segment({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: 'globe-outline' | 'lock-closed-outline';
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.segment, selected && styles.segmentSel, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={16} color={selected ? colors.primary : colors.textMuted} />
      <Text style={[styles.segmentText, selected && styles.segmentTextSel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: radius.sm - 2,
  },
  segmentSel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  segmentText: { fontFamily: font.semibold, fontSize: 14.5, color: colors.textMuted },
  segmentTextSel: { color: colors.primary, fontFamily: font.bold },
  hint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, paddingHorizontal: 2 },
  pressed: { opacity: 0.75 },
});
