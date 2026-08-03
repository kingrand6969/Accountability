import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { createGroup } from '../groups/api';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { PrivacyToggle } from '../ui/PrivacyToggle';
import { colors, font, radius, spacing } from '../ui/theme';
import { useAuth } from '../auth/AuthProvider';

const NAME_MIN = 3;
const NAME_MAX = 80;
const KEY_MIN = 4;

export default function GroupNew() {
  const router = useRouter();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const createGeneration = useRef(0);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [gatekey, setGatekey] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    currentOwnerRef.current = ownerId;
    const generation = ++createGeneration.current;
    queueMicrotask(() => {
      if (
        generation !== createGeneration.current ||
        currentOwnerRef.current !== ownerId
      )
        return;
      setName('');
      setDescription('');
      setPrivacy('public');
      setGatekey('');
      setCreating(false);
    });
  }, [ownerId]);

  useFocusEffect(
    useCallback(
      () => () => {
        createGeneration.current += 1;
        setCreating(false);
      },
      [],
    ),
  );

  const trimmed = name.trim();
  const nameError =
    trimmed.length === 0
      ? null // don't nag before they type
      : trimmed.length < NAME_MIN
        ? `Name must be at least ${NAME_MIN} characters.`
        : trimmed.length > NAME_MAX
          ? `Name must be ${NAME_MAX} characters or fewer.`
          : null;
  const keyTrimmed = gatekey.trim();
  const keyError =
    privacy === 'private' && keyTrimmed.length > 0 && keyTrimmed.length < KEY_MIN
      ? `Gatekey must be at least ${KEY_MIN} characters.`
      : null;
  const canCreate =
    trimmed.length >= NAME_MIN &&
    trimmed.length <= NAME_MAX &&
    (privacy === 'public' || keyTrimmed.length >= KEY_MIN) &&
    !creating;

  async function onCreate() {
    if (!canCreate) return;
    const requestOwner = ownerId;
    const generation = createGeneration.current;
    if (!requestOwner) return;
    setCreating(true);
    try {
      const newId = await createGroup(trimmed, description.trim(), {
        privacy,
        gatekey: privacy === 'private' ? keyTrimmed : undefined,
      });
      if (
        requestOwner !== currentOwnerRef.current ||
        generation !== createGeneration.current
      )
        return;
      showToast('Group created 🎉');
      router.replace(`/group/${newId}` as never);
    } catch (e) {
      if (
        requestOwner !== currentOwnerRef.current ||
        generation !== createGeneration.current
      )
        return;
      Alert.alert('Could not create group', String((e as Error).message ?? e));
    } finally {
      if (
        requestOwner === currentOwnerRef.current &&
        generation === createGeneration.current
      )
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

        <View style={styles.field}>
          <Text style={styles.label}>Privacy</Text>
          <PrivacyToggle
            value={privacy}
            onChange={setPrivacy}
            publicHint="Anyone can find and join this group."
            privateHint="Only people with your gatekey (or invite link) can join."
          />
        </View>

        {privacy === 'private' ? (
          <View style={styles.field}>
            <Text style={styles.label}>Gatekey</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. sunrise-crew"
              placeholderTextColor={colors.textFaint}
              value={gatekey}
              onChangeText={setGatekey}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Group gatekey"
            />
            {keyError ? (
              <Text style={styles.error}>{keyError}</Text>
            ) : (
              <Text style={styles.helper}>
                Share this key with buddies you want in. You can share it later from the group.
              </Text>
            )}
          </View>
        ) : null}

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
  helper: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
});
