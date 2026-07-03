import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

/**
 * Name-your-workout sheet. A workout must have a title; the chosen exercises
 * go inside it as checklist items (never a lone exercise on the timeline).
 */
export function WorkoutTitleModal({
  visible,
  exercises,
  saving = false,
  onCancel,
  onSave,
}: {
  visible: boolean;
  exercises: string[];
  saving?: boolean;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const [title, setTitle] = useState('');
  const canSave = title.trim().length > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Text style={styles.title}>Name your workout</Text>
            <Pressable onPress={onCancel} hitSlop={8} accessibilityLabel="Cancel">
              <Ionicons name="close" size={22} color={colors.textFaint} />
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            placeholder="e.g. Push day, Leg burner, Quick session"
            placeholderTextColor={colors.textFaint}
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => canSave && onSave(title.trim())}
          />

          <Text style={styles.label}>
            {exercises.length} exercise{exercises.length === 1 ? '' : 's'} inside
          </Text>
          <View style={styles.list}>
            {exercises.map((name, i) => (
              <View key={i} style={styles.line}>
                <Ionicons name="ellipse-outline" size={14} color={colors.textFaint} />
                <Text style={styles.lineText} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            ))}
          </View>

          <Button
            title="Save workout"
            onPress={() => onSave(title.trim())}
            loading={saving}
            disabled={!canSave}
            style={styles.save}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 12.5,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  list: { gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.textSecondary },
  save: { marginTop: spacing.md },
});
