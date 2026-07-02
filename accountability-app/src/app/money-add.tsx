import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addTransaction, todayDate } from '../money/api';
import { categoriesFor } from '../money/categories';
import { validateDateString } from '../timeline/datetime';
import type { TxKind } from '../money/types';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

export default function MoneyAdd() {
  const router = useRouter();
  const [kind, setKind] = useState<TxKind>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => todayDate());
  const [saving, setSaving] = useState(false);

  const cats = categoriesFor(kind);

  async function onSave() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Enter an amount', 'How much was it?');
      return;
    }
    if (!category) {
      Alert.alert('Pick a category', 'Choose a category for this.');
      return;
    }
    const dateError = validateDateString(date);
    if (dateError) {
      Alert.alert('Check the date', dateError);
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        kind,
        amount: amt,
        category,
        note: note.trim() || null,
        tx_date: date.trim(),
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.kindRow}>
        {(['expense', 'income'] as const).map((k) => (
          <Pressable
            key={k}
            style={({ pressed }) => [
              styles.kindBtn,
              kind === k && (k === 'income' ? styles.kindIncome : styles.kindExpense),
              pressed && styles.pressed,
            ]}
            onPress={() => {
              setKind(k);
              setCategory(null);
            }}
          >
            <Text style={[styles.kindText, kind === k && styles.kindTextActive]}>
              {k === 'expense' ? 'Expense' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Amount</Text>
      <TextInput
        style={styles.amountInput}
        placeholder="0.00"
        placeholderTextColor={colors.textFaint}
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {cats.map((c) => {
          const selected = category === c.value;
          return (
            <Pressable
              key={c.value}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.pressed,
              ]}
              onPress={() => setCategory(c.value)}
            >
              <View style={[styles.chipIconCircle, selected && styles.chipIconCircleSelected]}>
                <Ionicons
                  name={c.icon as any}
                  size={16}
                  color={selected ? colors.onPrimary : colors.primary}
                />
              </View>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Lunch with team"
        placeholderTextColor={colors.textFaint}
        value={note}
        onChangeText={setNote}
      />

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        value={date}
        onChangeText={setDate}
      />

      <Button
        title="Save"
        onPress={onSave}
        loading={saving}
        variant={kind === 'income' ? 'success' : 'primary'}
        style={styles.save}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.xl, gap: spacing.sm, paddingBottom: 40 },
  kindRow: { flexDirection: 'row', gap: 10 },
  kindBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    backgroundColor: colors.surfaceAlt,
  },
  kindExpense: { backgroundColor: colors.danger, borderColor: colors.danger },
  kindIncome: { backgroundColor: colors.success, borderColor: colors.success },
  kindText: { fontFamily: font.bold, color: colors.textSecondary },
  kindTextActive: { color: colors.onPrimary },
  pressed: { opacity: 0.7 },
  label: { fontSize: 14, fontFamily: font.semibold, color: colors.textSecondary, marginTop: spacing.md },
  amountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 14,
    fontSize: 28,
    fontFamily: font.extrabold,
    color: colors.text,
    textAlign: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  chipSelected: { backgroundColor: colors.primary },
  chipIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipIconCircleSelected: { backgroundColor: 'rgba(255, 255, 255, 0.25)' },
  chipText: { color: colors.primary, fontFamily: font.semibold },
  chipTextSelected: { color: colors.onPrimary },
  save: { marginTop: spacing.xxl },
});
