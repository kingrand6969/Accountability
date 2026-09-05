import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

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
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
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

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: theme.border.action,
    backgroundColor: theme.surface.card,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: theme.ink.action },
  chipText: { color: theme.ink.action, fontFamily: font.semibold },
  chipTextSelected: { color: theme.ink.inverse },
  pressed: { opacity: 0.7 },
});
