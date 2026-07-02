import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '../ui/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
};

/**
 * A row of selectable "chips". Tapping the selected chip again clears the
 * selection (back to null), since every field here is optional.
 */
export function ChipSelector<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && styles.pressed,
            ]}
            onPress={() => onChange(selected ? null : opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontFamily: font.semibold },
  chipTextSelected: { color: colors.onPrimary },
  pressed: { opacity: 0.7 },
});
