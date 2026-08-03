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
import Ionicons from '@expo/vector-icons/Ionicons';
import { addTransaction, todayDate } from '../money/api';
import { categoriesFor } from '../money/categories';
import { scanReceipt } from '../scan/api';
import { validateDateString } from '../timeline/datetime';
import type { TxKind } from '../money/types';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

export default function MoneyAdd() {
  const router = useRouter();
  const [kind, setKind] = useState<TxKind>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => todayDate());
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  const cats = categoriesFor(kind);

  /**
   * Photograph a receipt and PRE-FILL this form — it never saves by itself.
   * The member sees exactly what was read and confirms or corrects it, which
   * matters because OCR misreads totals on creased or faded paper.
   */
  async function onScanReceipt() {
    setScanning(true);
    try {
      const out = await scanReceipt(true);
      if (!out) return; // cancelled the camera
      const r = out.scan;
      if (r.total == null && !r.merchant) {
        Alert.alert('Nothing found', r.note || "That didn't look like a receipt. Try a flatter, brighter shot.");
        return;
      }
      setKind('expense');
      if (r.total != null) setAmount(String(r.total));
      if (r.date && !validateDateString(r.date)) setDate(r.date);
      if (r.merchant) setNote(r.merchant);
      if (r.category && cats.some((c) => c.value === r.category)) setCategory(r.category);
      showToast(`Check the details · ${out.limit - out.used} scans left this month`);
    } catch (e) {
      const err = e as Error & { upgrade?: boolean };
      if (err.upgrade) {
        Alert.alert('Pro feature', err.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Pro', onPress: () => router.push('/paywall') },
        ]);
      } else {
        Alert.alert('Could not scan', err.message);
      }
    } finally {
      setScanning(false);
    }
  }

  async function onSave() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setAmountError('Enter an amount greater than zero.');
      return;
    }
    setAmountError(null);
    if (!category) {
      setCategoryError('Choose a category before saving.');
      return;
    }
    setCategoryError(null);
    const nextDateError = validateDateString(date);
    if (nextDateError) {
      setDateError(nextDateError);
      return;
    }
    setDateError(null);
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
      <Pressable
        onPress={onScanReceipt}
        disabled={scanning}
        style={({ pressed }) => [styles.scanBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Scan a receipt with the camera"
      >
        {scanning ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <Ionicons name="scan-outline" size={19} color={colors.primary} />
            <Text style={styles.scanBtnText}>Scan a receipt</Text>
            <View style={styles.proPill}>
              <Text style={styles.proPillText}>PRO</Text>
            </View>
          </>
        )}
      </Pressable>

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
              setCategoryError(null);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === k }}
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
        onChangeText={(value) => {
          setAmount(value);
          if (amountError) setAmountError(null);
        }}
        accessibilityLabel="Transaction amount"
      />
      {amountError ? <Text style={styles.error} accessibilityRole="alert">{amountError}</Text> : null}

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
              onPress={() => {
                setCategory(c.value);
                setCategoryError(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
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
      {categoryError ? <Text style={styles.error} accessibilityRole="alert">{categoryError}</Text> : null}

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
        onChangeText={(value) => {
          setDate(value);
          if (dateError) setDateError(null);
        }}
        accessibilityLabel="Transaction date"
      />
      {dateError ? <Text style={styles.error} accessibilityRole="alert">{dateError}</Text> : null}

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
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  scanBtnText: { fontFamily: font.bold, fontSize: 15, color: colors.primary },
  proPill: {
    backgroundColor: colors.proSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  proPillText: { fontFamily: font.extrabold, fontSize: 9.5, color: colors.pro, letterSpacing: 0.4 },
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
  error: { color: colors.danger, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
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
