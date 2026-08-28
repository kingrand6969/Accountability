import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { createGroup } from '../groups/api';
import { showToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { useAppTheme } from '../ui/AppThemeProvider';
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAuth } from '../auth/AuthProvider';

const NAME_MIN = 3;
const NAME_MAX = 80;
const KEY_MIN = 4;

export default function GroupNew() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const faintColor = theme.ink.muted;
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
            placeholderTextColor={faintColor}
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
            placeholderTextColor={faintColor}
            value={description}
            onChangeText={setDescription}
            multiline
            accessibilityLabel="Group description"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Privacy</Text>
          <PrivacySelector
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
              placeholderTextColor={faintColor}
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

type PrivacySelectorProps = {
  value: 'public' | 'private';
  onChange: (value: 'public' | 'private') => void;
  publicHint: string;
  privateHint: string;
};

function PrivacySelector({ value, onChange, publicHint, privateHint }: PrivacySelectorProps) {
  const { colors: theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const options = [
    { value: 'public' as const, icon: 'globe-outline' as const, label: 'Public' },
    { value: 'private' as const, icon: 'lock-closed-outline' as const, label: 'Private' },
  ];

  return (
    <View style={styles.privacyWrap}>
      <View style={styles.privacyRow}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              hitSlop={2}
              style={({ pressed }) => [
                styles.privacySegment,
                selected && styles.privacySegmentSelected,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={option.icon}
                size={16}
                color={selected ? theme.ink.inverse : theme.ink.secondary}
              />
              <Text
                style={[
                  styles.privacySegmentText,
                  selected && styles.privacySegmentTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.privacyHint}>{value === 'public' ? publicHint : privateHint}</Text>
    </View>
  );
}

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.surface.canvas },
    content: { padding: spacing.lg, gap: spacing.xl },
    field: { gap: spacing.sm },
    label: { fontFamily: font.semibold, fontSize: 14, color: theme.ink.secondary },
    input: {
      borderWidth: 1,
      borderColor: theme.border.subtle,
      borderRadius: radius.sm,
      padding: spacing.md,
      fontSize: 16,
      fontFamily: font.regular,
      color: theme.ink.primary,
      minHeight: spacing.touch,
      backgroundColor: theme.surface.raised,
    },
    multiline: { minHeight: 96, textAlignVertical: 'top' },
    error: { fontFamily: font.medium, fontSize: 13, color: theme.status.danger },
    helper: { fontFamily: font.regular, fontSize: 12.5, color: theme.ink.muted },
    privacyWrap: { gap: 6 },
    privacyRow: {
      flexDirection: 'row',
      backgroundColor: theme.surface.muted,
      borderRadius: radius.sm,
      padding: 4,
      gap: 4,
    },
    privacySegment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: radius.sm - 2,
    },
    privacySegmentSelected: {
      backgroundColor: theme.ink.action,
      borderWidth: 1,
      borderColor: theme.border.action,
    },
    privacySegmentText: { fontFamily: font.semibold, fontSize: 14.5, color: theme.ink.muted },
    privacySegmentTextSelected: { color: theme.ink.inverse, fontFamily: font.bold },
    privacyHint: {
      fontFamily: font.regular,
      fontSize: 12.5,
      color: theme.ink.muted,
      paddingHorizontal: 2,
    },
    pressed: { opacity: 0.75 },
});
