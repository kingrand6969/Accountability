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
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  addDebt,
  deleteDebt,
  getDebt,
  updateDebt,
  type DebtKind,
} from '../money/accountsApi';
import { Button } from '../ui/Button';
import { confirmDestructive } from '../ui/confirm';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default function DebtNew() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id, kind: kindParam } = useLocalSearchParams<{ id?: string; kind?: string }>();
  const [kind, setKind] = useState<DebtKind>(kindParam === 'owed' ? 'owed' : 'owe');
  const [counterparty, setCounterparty] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Edit debt' : 'Add debt' });
    if (!id) return;
    getDebt(id)
      .then((d) => {
        if (!d) return;
        setKind(d.kind);
        setCounterparty(d.counterparty);
        setAmountText(String(d.amount));
        setNote(d.note ?? '');
        setDueDate(d.due_date ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, navigation]);

  const amount = parseAmount(amountText);
  const dueOk = dueDate.trim() === '' || /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim());
  const canSave =
    counterparty.trim().length >= 1 && Number.isFinite(amount) && amount >= 0 && dueOk && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = {
        kind,
        counterparty: counterparty.trim(),
        amount,
        note: note.trim() || null,
        due_date: dueDate.trim() || null,
      };
      if (id) await updateDebt(id, input);
      else await addDebt(input);
      showToast(id ? 'Debt updated' : 'Debt added');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!id) return;
    confirmDestructive('Delete this debt?', `${counterparty.trim() || 'This entry'} will be removed.`, 'Delete', async () => {
      try {
        await deleteDebt(id);
        showToast('Debt deleted');
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
          <Text style={styles.label}>Direction</Text>
          <View style={styles.toggle}>
            <Pressable
              style={[styles.toggleBtn, kind === 'owe' && styles.toggleOwe]}
              onPress={() => setKind('owe')}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'owe' }}
            >
              <Ionicons name="arrow-up-circle" size={16} color={kind === 'owe' ? '#fff' : '#be123c'} />
              <Text style={[styles.toggleText, kind === 'owe' && styles.toggleTextOn]}>I owe them</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, kind === 'owed' && styles.toggleOwed]}
              onPress={() => setKind('owed')}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === 'owed' }}
            >
              <Ionicons name="arrow-down-circle" size={16} color={kind === 'owed' ? '#fff' : '#047857'} />
              <Text style={[styles.toggleText, kind === 'owed' && styles.toggleTextOn]}>They owe me</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{kind === 'owe' ? 'Who do you owe?' : 'Who owes you?'}</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. a friend, a shop"
            placeholderTextColor={colors.textFaint}
            value={counterparty}
            onChangeText={setCounterparty}
            maxLength={80}
            autoFocus={!id}
            accessibilityLabel="Counterparty name"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textFaint}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="What is it for?"
            placeholderTextColor={colors.textFaint}
            value={note}
            onChangeText={setNote}
            maxLength={200}
            accessibilityLabel="Note"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Due date (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textFaint}
            value={dueDate}
            onChangeText={setDueDate}
            autoCapitalize="none"
            accessibilityLabel="Due date"
          />
          {!dueOk ? <Text style={styles.error}>Use the format YYYY-MM-DD.</Text> : null}
        </View>

        <Button title={id ? 'Save changes' : 'Add debt'} onPress={onSave} loading={saving} disabled={!canSave} />
        {id ? <Button title="Delete" variant="ghost" onPress={onDelete} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
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
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger },
  toggle: { flexDirection: 'row', gap: spacing.sm },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 48,
    backgroundColor: colors.surfaceAlt,
  },
  toggleOwe: { backgroundColor: '#be123c', borderColor: '#be123c' },
  toggleOwed: { backgroundColor: '#047857', borderColor: '#047857' },
  toggleText: { fontFamily: font.bold, fontSize: 14, color: colors.textSecondary },
  toggleTextOn: { color: '#fff' },
});
