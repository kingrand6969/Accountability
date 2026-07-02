import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createGroup } from '../groups/api';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

const NAME_MIN = 3;
const NAME_MAX = 80;

export default function GroupNew() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const trimmed = name.trim();
  const nameError =
    trimmed.length === 0
      ? null // don't nag before they type
      : trimmed.length < NAME_MIN
        ? `Name must be at least ${NAME_MIN} characters.`
        : trimmed.length > NAME_MAX
          ? `Name must be ${NAME_MAX} characters or fewer.`
          : null;
  const canCreate = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX && !creating;

  async function onCreate() {
    if (!canCreate) return;
    setCreating(true);
    try {
      const newId = await createGroup(trimmed, description.trim());
      showToast('Group created 🎉');
      router.replace(`/group/${newId}` as never);
    } catch (e) {
      Alert.alert('Could not create group', String((e as Error).message ?? e));
    } finally {
      setCreating(false);
    }
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
            placeholder="e.g. 5am Run Club"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX + 20}
            autoFocus
            accessibilityLabel="Group name"
          />
          {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What is this group about? (optional)"
            placeholderTextColor={colors.textFaint}
            value={description}
            onChangeText={setDescription}
            multiline
            accessibilityLabel="Group description"
          />
        </View>

        <Button
          title="Create group"
          onPress={onCreate}
          loading={creating}
          disabled={!canCreate}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.xl },
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
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger },
});
