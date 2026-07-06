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
import {
  ACCOUNT_KINDS,
  addAccount,
  deleteAccount,
  getAccount,
  updateAccount,
  type AccountKind,
} from '../money/accountsApi';
import { Button } from '../ui/Button';
import { confirmDestructive } from '../ui/confirm';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default function AccountNew() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [balanceText, setBalanceText] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Edit account' : 'Add bank or wallet' });
    if (!id) return;
    getAccount(id)
      .then((a) => {
        if (!a) return;
        setName(a.name);
        setKind(a.kind);
        setBalanceText(String(a.balance));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, navigation]);

  const balance = balanceText.trim() === '' ? 0 : parseAmount(balanceText);
  const canSave = name.trim().length >= 1 && Number.isFinite(balance) && !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), kind, balance };
      if (id) await updateAccount(id, input);
      else await addAccount(input);
      showToast(id ? 'Account updated' : 'Account added 🏦');
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!id) return;
    confirmDestructive(
      'Remove this account?',
      `${name.trim() || 'This account'} will stop being tracked.`,
      'Remove',
      async () => {
        try {
          await deleteAccount(id);
          showToast('Account removed');
          router.back();
        } catch (e) {
          Alert.alert('Could not remove', String((e as Error).message ?? e));
        }
      },
    );
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
            placeholder="e.g. My savings bank"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoFocus={!id}
            accessibilityLabel="Account name"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {ACCOUNT_KINDS.map((k) => {
              const selected = k.value === kind;
              return (
                <Pressable
                  key={k.value}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setKind(k.value)}
                  accessibilityRole="button"
                  accessibilityLabel={`Type ${k.label}`}
                  accessibilityState={{ selected }}
                >
                  <Ionicons
                    name={k.icon as any}
                    size={15}
                    color={selected ? colors.primary : colors.textMuted}
                  />
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {k.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Current balance</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textFaint}
            value={balanceText}
            onChangeText={setBalanceText}
            keyboardType="decimal-pad"
            accessibilityLabel="Current balance"
          />
          <Text style={styles.helper}>Update it any time — this is your own record.</Text>
        </View>

        <Button
          title={id ? 'Save changes' : 'Add account'}
          onPress={onSave}
          loading={saving}
          disabled={!canSave}
        />
        {id ? <Button title="Remove account" variant="ghost" onPress={onDelete} /> : null}
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  pressed: { opacity: 0.75 },
});
