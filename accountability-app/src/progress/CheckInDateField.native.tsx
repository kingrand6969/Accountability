import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { checkInTimeZoneLabel, displayLocalDate, localDateKey, parseLocalDateKey } from './checkInDate';
import type { CheckInDateFieldProps } from './CheckInDateField.web';

export function CheckInDateField({ value, onChange, maximumDate, error }: CheckInDateFieldProps) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);
  let selectedDate = maximumDate;
  try { selectedDate = parseLocalDateKey(value); } catch { /* Keep the bounded fallback. */ }

  const handleChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'dismissed' && nextDate && nextDate <= maximumDate) onChange(localDateKey(nextDate));
  };

  return (
    <View>
      <Text style={styles.label}>Date</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Check-in date"
        accessibilityHint={`${displayLocalDate(value)}. ${checkInTimeZoneLabel()}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.field, error && styles.invalid, pressed && styles.pressed]}
      >
        <Text style={styles.value}>{displayLocalDate(value)}</Text>
      </Pressable>
      <Text style={styles.timezone}>{checkInTimeZoneLabel()}</Text>
      {open ? (
        <View>
          <DateTimePicker value={selectedDate} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} maximumDate={maximumDate} onChange={handleChange} />
          {Platform.OS === 'ios' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Done choosing check-in date" onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  label: { color: theme.ink.secondary, fontFamily: font.semibold, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  field: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, justifyContent: 'center', paddingHorizontal: spacing.md },
  invalid: { borderColor: theme.border.danger },
  pressed: { opacity: 0.68 },
  value: { color: theme.ink.primary, fontFamily: font.medium, fontSize: 16 },
  timezone: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 12, marginTop: spacing.xs },
  done: { minHeight: 48, alignSelf: 'flex-end', justifyContent: 'center', paddingHorizontal: spacing.lg },
  doneText: { color: theme.ink.action, fontFamily: font.bold, fontSize: 14 },
});
