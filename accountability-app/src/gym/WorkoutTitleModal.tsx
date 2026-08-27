import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '../ui/Button';
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

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
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => modalPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [title, setTitle] = useState('');
  const canSave = title.trim().length > 0 && !saving;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Text style={styles.title}>Name your workout</Text>
            <Pressable onPress={onCancel} style={styles.closeButton} accessibilityLabel="Cancel">
              <Ionicons name="close" size={22} color={palette.placeholder} />
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            placeholder="e.g. Push day, Leg burner, Quick session"
            placeholderTextColor={palette.placeholder}
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
                <Ionicons name="ellipse-outline" size={14} color={palette.placeholder} />
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

function modalPalette(theme: AppThemeColors) {
  return {
    background: theme.surface.canvas,
    card: theme.surface.card,
    field: theme.surface.raised,
    ink: theme.ink.primary,
    secondary: theme.ink.secondary,
    muted: theme.ink.muted,
    placeholder: theme.ink.muted,
    border: theme.border.subtle,
    scrim: theme.interaction.scrim,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = modalPalette(theme);
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: palette.scrim,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    maxWidth: 460,
    width: '100%',
    alignSelf: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeButton: {
    width: spacing.touch,
    height: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    margin: -13,
  },
  title: { fontFamily: font.extrabold, fontSize: 18, color: palette.ink },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: palette.ink,
    backgroundColor: palette.field,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  label: {
    fontSize: 12.5,
    fontFamily: font.bold,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
  },
  list: { gap: 4 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { flex: 1, fontFamily: font.regular, fontSize: 14, color: palette.secondary },
  save: { marginTop: spacing.md },
  });
}
