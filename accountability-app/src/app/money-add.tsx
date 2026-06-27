import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { addTransaction, todayDate } from '../money/api';
import { categoriesFor } from '../money/categories';
import { validateDateString } from '../timeline/datetime';
import type { TxKind } from '../money/types';

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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.kindRow}>
        {(['expense', 'income'] as const).map((k) => (
          <Pressable
            key={k}
            style={[styles.kindBtn, kind === k && (k === 'income' ? styles.kindIncome : styles.kindExpense)]}
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
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => setCategory(c.value)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {c.emoji} {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Lunch with team"
        value={note}
        onChangeText={setNote}
      />

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        placeholder="YYYY-MM-DD"
        autoCapitalize="none"
        value={date}
        onChangeText={setDate}
      />

      <Pressable style={styles.save} onPress={onSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 8, paddingBottom: 40 },
  kindRow: { flexDirection: 'row', gap: 10 },
  kindBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  kindExpense: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  kindIncome: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  kindText: { fontWeight: '700', color: '#444' },
  kindTextActive: { color: '#fff' },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  amountInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipSelected: { backgroundColor: '#2563eb' },
  chipText: { color: '#2563eb', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  save: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
