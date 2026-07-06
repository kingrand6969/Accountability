import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  addSavingsGoal,
  deleteSavingsGoal,
  getSavingsGoal,
  updateSavingsGoal,
} from '../money/accountsApi';
import { Button } from '../ui/Button';
import { confirmDestructive } from '../ui/confirm';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

function parseAmount(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

export default function SavingNew() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState('');
  const [savedText, setSavedText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: id ? 'Edit savings goal' : 'Add savings goal' });
    if (!id) return;
    getSavingsGoal(id)
      .then((g) => {
        if (!g) return;
        setName(g.name);
        setSavedText(String(g.saved));
        setTargetText(g.target != null ? String(g.target) : '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, navigation]);

  const saved = savedText.trim() === '' ? 0 : parseAmount(savedText);
  const target = targetText.trim() === '' ? null : parseAmount(targetText);
  const canSave =
    name.trim().length >= 1 &&
    Number.isFinite(saved) &&
    saved >= 0 &&
    (target === null || (Number.isFinite(target) && target > 0)) &&
    !saving;

  async function onSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), saved, target };
      if (id) await updateSavingsGoal(id, input);
      else await addSavingsGoal(input);
      showToast(id ? 'Goal updated' : 'Goal added 🎯');
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
      'Delete this goal?',
      `${name.trim() || 'This goal'} will stop being tracked.`,
      'Delete',
      async () => {
        try {
          await deleteSavingsGoal(id);
          showToast('Goal deleted');
          router.back();
        } catch (e) {
          Alert.alert('Could not delete', String((e as Error).message ?? e));
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
          <Text style={styles.label}>What are you saving for?</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Travel fund"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={80}
            autoFocus={!id}
            accessibilityLabel="Goal name"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Saved so far</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textFaint}
            value={savedText}
            onChangeText={setSavedText}
            keyboardType="decimal-pad"
            accessibilityLabel="Amount saved so far"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Target (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 5000"
            placeholderTextColor={colors.textFaint}
            value={targetText}
            onChangeText={setTargetText}
            keyboardType="decimal-pad"
            accessibilityLabel="Target amount"
          />
          <Text style={styles.helper}>
            With a target you get a progress ring that fills as you save.
          </Text>
        </View>

        <Button
          title={id ? 'Save changes' : 'Add goal'}
          onPress={onSave}
          loading={saving}
          disabled={!canSave}
        />
        {id ? <Button title="Delete goal" variant="ghost" onPress={onDelete} /> : null}
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
});
