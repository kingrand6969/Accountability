import { useMemo } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { checkInTimeZoneLabel } from './checkInDate';

export type CheckInDateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  maximumDate: Date;
  error?: string;
};

export function CheckInDateField({ value, onChange, error }: CheckInDateFieldProps) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View>
      <Text style={styles.label}>Date</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel="Check-in date"
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.ink.muted}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        style={[styles.input, error && styles.invalid]}
      />
      <Text style={styles.timezone}>{checkInTimeZoneLabel()}</Text>
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  label: { color: theme.ink.secondary, fontFamily: font.semibold, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, color: theme.ink.primary, fontFamily: font.medium, fontSize: 16, paddingHorizontal: spacing.md },
  invalid: { borderColor: theme.border.danger },
  timezone: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12, marginTop: spacing.xs },
});
