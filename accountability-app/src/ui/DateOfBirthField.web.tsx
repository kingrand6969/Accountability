import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius } from './theme';

type Props = {
  value: string;
  onChange: (value: string) => void;
  minimumAge: number;
  error?: string;
};

export function DateOfBirthField({ value, onChange, minimumAge, error }: Props) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>Date of birth</Text>
      <View style={[styles.field, error ? styles.invalid : null]}>
        <Ionicons name="calendar-outline" size={19} color={colors.textFaint} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textFaint}
          keyboardType="numbers-and-punctuation"
          autoComplete="birthdate-full"
          accessibilityLabel="Date of birth"
          style={styles.input}
        />
      </View>
      <Text style={styles.hint}>
        Use YYYY-MM-DD. You must be {minimumAge}+ to use AccountAbility.
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
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
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: font.regular,
    fontSize: 16,
  },
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
});
