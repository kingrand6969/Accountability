import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BILL_CATEGORIES, type BillCategory } from '../money/billing';
import { addBill, deleteBill, getBill, updateBill } from '../money/billsApi';
import { Button } from '../ui/Button';
import { confirmDestructive } from '../ui/confirm';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default function BillNew() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<BillCategory>('electricity');
  const [amountText, setAmountText] = useState('');
  const [minText, setMinText] = useState('');
  const [dueDay, setDueDay] = useState(15);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  const isCc = category === 'credit_card';

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Edit bill' : 'Add bill' });
    if (!id) return;
    getBill(id)
      .then((b) => {
        if (!b) return;
        setName(b.name);
        setCategory(b.category);
        setAmountText(String(b.amount));
        setMinText(b.min_payment != null ? String(b.min_payment) : '');
        setDueDay(b.due_day);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, navigation]);

  const amount = parseAmount(amountText);
  const minPayment = minText.trim() === '' ? null : parseAmount(minText);
  const nameOk = name.trim().length >= 1 && name.trim().length <= 80;
  const amountOk = Number.isFinite(amount) && amount >= 0;
  const minOk = !isCc || minPayment === null || (Number.isFinite(minPayment) && minPayment >= 0);
  const canSave = nameOk && amountOk && minOk && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        name: name.trim(),
        category,
        amount,
        min_payment: isCc ? minPayment : null,
        due_day: dueDay,
      };
      if (id) await updateBill(id, input);
      else await addBill(input);
      showToast(id ? 'Bill updated' : 'Bill added 🧾');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!id) return;
    confirmDestructive('Delete this bill?', `${name.trim() || 'This bill'} will stop being tracked.`, 'Delete', async () => {
      try {
        await deleteBill(id);
        showToast('Bill deleted');
        router.back();
      } catch (e) {
        Alert.alert('Could not delete', String((e as Error).message ?? e));
      }
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder={isCc ? 'e.g. Chase Sapphire' : 'e.g. Meralco electricity'}
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoFocus={!id}
            accessibilityLabel="Bill name"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.chipGrid}>
            {BILL_CATEGORIES.map((c) => {
              const selected = c.value === category;
              return (
                <Pressable
                  key={c.value}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setCategory(c.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Category ${c.label}`}
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={c.icon as any}
                    size={15}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{isCc ? 'Statement balance' : 'Monthly amount'}</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textFaint}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            accessibilityLabel={isCc ? 'Statement balance' : 'Monthly amount'}
          />
          {isCc ? (
            <Text style={styles.helper}>
              The amount on your latest statement — it stays fixed until the next one.
            </Text>
          ) : null}
        </View>

        {isCc ? (
          <View style={styles.field}>
            <Text style={styles.label}>Required minimum payment</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              placeholderTextColor={colors.textFaint}
              value={minText}
              onChangeText={setMinText}
              keyboardType="decimal-pad"
              accessibilityLabel="Required minimum payment"
            />
            <Text style={styles.helper}>
              From your statement — the smallest payment that keeps the account current.
            </Text>
          </View>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label}>Due day of the month</Text>
          <View style={styles.dayGrid}>
            {DAYS.map((d) => {
              const selected = d === dueDay;
              return (
                <Pressable
                  key={d}
                  style={({ pressed }) => [
                    styles.day,
                    selected && styles.daySelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setDueDay(d)}
                  accessibilityRole="button"
                  accessibilityLabel={`Due on day ${d}`}
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{d}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.helper}>
            In shorter months a day-31 bill is due on the month’s last day.
          </Text>
        </View>

        <Button
          title={id ? 'Save changes' : 'Add bill'}
          onPress={onSave}
          loading={saving}
          disabled={!canSave}
        />
        {id ? (
          <Button title="Delete bill" variant="ghost" onPress={onDelete} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: 48 },
  field: { gap: spacing.sm },
  label: { fontFamily: font.semibold, fontSize: 14, color: colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 48,
    backgroundColor: colors.surfaceAlt,
  },
  helper: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    minHeight: 40,
    backgroundColor: colors.surfaceAlt,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  chipTextSelected: { color: colors.primary },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  day: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  dayTextSelected: { color: colors.onPrimary, fontFamily: font.bold },
  pressed: { opacity: 0.75 },
});
