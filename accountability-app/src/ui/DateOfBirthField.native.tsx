import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, font, radius, spacing } from './theme';

type Props = {
  value: string;
  onChange: (value: string) => void;
  minimumAge: number;
  error?: string;
};

function toStoredDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromStoredDate(value: string, fallback: Date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return fallback;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function displayDate(value: string) {
  const parsed = fromStoredDate(value, new Date(Number.NaN));
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed);
}

export function DateOfBirthField({ value, onChange, minimumAge, error }: Props) {
  const [open, setOpen] = useState(false);
  const maximumDate = useMemo(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - minimumAge);
    return date;
  }, [minimumAge]);
  const selectedDate = fromStoredDate(value, maximumDate);

  function handleChange(event: DateTimePickerEvent, nextDate?: Date) {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type !== 'dismissed' && nextDate) onChange(toStoredDate(nextDate));
  }

  return (
    <View style={styles.group}>
      <Text style={styles.label}>Date of birth</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose date of birth"
        accessibilityHint={error}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          error ? styles.invalid : null,
          pressed ? styles.pressed : null,
        ]}
      >
        <Ionicons name="calendar-outline" size={19} color={colors.textFaint} />
        <Text style={[styles.value, !value && styles.placeholder]}>
          {value ? displayDate(value) : 'Choose your date of birth'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
      </Pressable>
      <Text style={styles.hint}>You must be {minimumAge}+ to use AccountAbility.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {open ? (
        <View>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={maximumDate}
            minimumDate={new Date(1900, 0, 1)}
            onChange={handleChange}
          />
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.done} onPress={() => setOpen(false)}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: {
    color: colors.text,
    fontFamily: font.semibold,
    fontSize: 13.5,
    marginLeft: 2,
  },
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  invalid: { borderColor: colors.danger },
  pressed: { opacity: 0.82 },
  value: {
    flex: 1,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 16,
  },
  placeholder: { color: colors.textFaint },
  hint: {
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 12,
    marginLeft: 2,
  },
  error: {
    color: colors.danger,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
    marginLeft: 2,
  },
  done: {
    alignSelf: 'flex-end',
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: colors.primary, fontFamily: font.bold, fontSize: 15 },
});
