import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '../ui/AppThemeProvider';
import { font, spacing, type AppThemeColors } from '../ui/theme';
import { calculateBmi } from './bmi';
import type { AddMeasurementInput } from './types';

type Props = {
  visible: boolean;
  latestHeightCm?: number;
  onCancel: () => void;
  onSave: (input: AddMeasurementInput) => Promise<void>;
};

export function BodyCheckInSheet({ visible, latestHeightCm, onCancel, onSave }: Props) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState(latestHeightCm?.toString() ?? '');
  const [editHeight, setEditHeight] = useState(latestHeightCm == null);
  const [recordedAt, setRecordedAt] = useState(() => new Date().toISOString());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const save = async () => {
    if (savingRef.current) return;
    const weightKg = Number(weight);
    const heightCm = Number(height);
    const date = new Date(recordedAt);
    try {
      calculateBmi(weightKg, heightCm);
      if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid date and time.');
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : 'Enter valid weight and height values.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave({ weightKg, heightCm, recordedAt: date.toISOString() });
    } catch {
      if (mountedRef.current) setError('Your body check-in couldn’t save. Try again.');
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text accessibilityRole="header" style={styles.title}>Body check-in</Text>
            <Text style={styles.copy}>Record weight and height for your private progress.</Text>
            <Text style={styles.label}>Weight</Text>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" accessibilityLabel="Weight in kilograms" placeholder="kg" placeholderTextColor={theme.ink.muted} style={styles.input} />
            {latestHeightCm != null && !editHeight ? (
              <View style={styles.savedHeight}>
                <Text style={styles.savedHeightText}>Height {latestHeightCm.toFixed(1)} cm</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Edit height" onPress={() => setEditHeight(true)} style={styles.editButton}><Text style={styles.editText}>Edit height</Text></Pressable>
              </View>
            ) : (
              <>
                <Text style={styles.label}>Height</Text>
                <TextInput value={height} onChangeText={setHeight} keyboardType="decimal-pad" accessibilityLabel="Height in centimetres" placeholder="cm" placeholderTextColor={theme.ink.muted} style={styles.input} />
              </>
            )}
            <Text style={styles.label}>Date and time</Text>
            <TextInput value={recordedAt} onChangeText={setRecordedAt} autoCapitalize="none" accessibilityLabel="Check-in date and time" style={styles.input} />
            {error ? <Text accessibilityRole="alert" accessibilityLabel="Body check-in error" style={styles.error}>{error}</Text> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Cancel body check-in" disabled={saving} onPress={onCancel} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Save body check-in" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.surface.canvas },
  content: { padding: spacing.xl, paddingBottom: spacing.section },
  title: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 24 },
  copy: { color: theme.ink.muted, fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginTop: spacing.xs, marginBottom: spacing.lg },
  label: { color: theme.ink.secondary, fontFamily: font.semibold, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border.subtle, backgroundColor: theme.surface.card, color: theme.ink.primary, fontFamily: font.medium, fontSize: 16, paddingHorizontal: spacing.md },
  savedHeight: { minHeight: 56, marginTop: spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center', justifyContent: 'space-between' },
  savedHeightText: { color: theme.ink.secondary, fontFamily: font.medium, fontSize: 14 },
  editButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  editText: { color: theme.ink.action, fontFamily: font.bold, fontSize: 13 },
  error: { color: theme.status.danger, fontFamily: font.medium, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xl },
  secondary: { flex: 1, minWidth: 112, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border.subtle, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 14 },
  primary: { flex: 1, minWidth: 112, minHeight: 48, borderRadius: 12, backgroundColor: theme.ink.action, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 14 },
});
