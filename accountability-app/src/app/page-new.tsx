import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { useFocusEffect, useRouter } from 'expo-router';
import { createPage, PAGE_CATEGORIES } from '../pages/api';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { PrivacyToggle } from '../ui/PrivacyToggle';
import { colors, font, radius, spacing } from '../ui/theme';
import { useAuth } from '../auth/AuthProvider';

const NAME_MIN = 3;
const NAME_MAX = 80;
const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export default function PageNew() {
  const router = useRouter();
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const currentOwnerRef = useRef(ownerId);
  const createGeneration = useRef(0);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [category, setCategory] = useState('gym');
  const [bio, setBio] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
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
      setHandle('');
      setHandleTouched(false);
      setCategory('gym');
      setBio('');
      setPrivacy('public');
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

  const trimmedName = name.trim();
  const nameError =
    trimmedName.length === 0
      ? null // don't nag before they type
      : trimmedName.length < NAME_MIN
        ? `Name must be at least ${NAME_MIN} characters.`
        : trimmedName.length > NAME_MAX
          ? `Name must be ${NAME_MAX} characters or fewer.`
          : null;
  const handleValid = HANDLE_RE.test(handle);
  const handleError =
    handleTouched && handle.length > 0 && !handleValid
      ? 'Handle must be 3–30 characters: lowercase letters, numbers, underscores.'
      : null;
  const canCreate =
    trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX && handleValid && !creating;

  function onHandleChange(value: string) {
    setHandleTouched(true);
    setHandle(value.toLowerCase());
  }

  async function onCreate() {
    if (!canCreate) return;
    const requestOwner = ownerId;
    const generation = createGeneration.current;
    if (!requestOwner) return;
    setCreating(true);
    try {
      const newId = await createPage({
        name: trimmedName,
        handle,
        category,
        bio: bio.trim(),
        privacy,
      });
      if (
        requestOwner !== currentOwnerRef.current ||
        generation !== createGeneration.current
      )
        return;
      showToast('Page created 🎉');
      router.replace(`/page/${newId}` as never);
    } catch (e) {
      if (
        requestOwner !== currentOwnerRef.current ||
        generation !== createGeneration.current
      )
        return;
      Alert.alert('Could not create page', String((e as Error).message ?? e));
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
            placeholder="e.g. Iron Temple Gym"
            placeholderTextColor={colors.textFaint}
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX + 20}
            autoFocus
            accessibilityLabel="Page name"
          />
          {nameError ? <Text style={styles.error}>{nameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Handle</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. iron_temple"
            placeholderTextColor={colors.textFaint}
            value={handle}
            onChangeText={onHandleChange}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            accessibilityLabel="Page handle"
          />
          {handleError ? (
            <Text style={styles.error}>{handleError}</Text>
          ) : (
            <Text style={styles.helper}>
              lowercase letters, numbers, underscores — like a username
            </Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {PAGE_CATEGORIES.map((c) => {
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
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="What is this page about? (optional)"
            placeholderTextColor={colors.textFaint}
            value={bio}
            onChangeText={setBio}
            multiline
            accessibilityLabel="Page bio"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Privacy</Text>
          <PrivacyToggle
            value={privacy}
            onChange={setPrivacy}
            publicHint="Anyone can find and follow this page."
            privateHint="Marked private — share the page link with people you want following."
          />
        </View>

        <Button
          title="Create page"
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
  helper: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: colors.textSecondary },
  chipTextSelected: { color: colors.onPrimary },
  pressed: { opacity: 0.8 },
});
