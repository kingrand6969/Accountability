import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { createSharedGoal } from '../money/sharedGoals';
import { listBuddies, type Buddy } from '../buddy/api';
import { Avatar } from '../feed/Avatar';
import { authorLabel } from '../feed/format';
import { Button } from '../ui/Button';
import { hapticSuccess } from '../ui/haptics';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing, contentMax } from '../ui/theme';

export default function SharedGoalNew() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [buddies, setBuddies] = useState<Buddy[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listBuddies()
      .then(setBuddies)
      .catch(() => {});
  }, []);

  function toggle(id: string) {
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const targetNum = parseFloat(target);
  const canSave = name.trim().length > 0 && targetNum > 0 && !saving;

  async function onCreate() {
    setSaving(true);
    try {
      const id = await createSharedGoal(name, targetNum, [...picked]);
      hapticSuccess();
      showToast('Shared goal started 🎉');
      router.replace({ pathname: '/shared-goal/[id]', params: { id } } as never);
    } catch (e) {
      Alert.alert('Could not create', String((e as Error).message ?? e));
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.label}>What are you saving for?</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Travel to Vietnam"
        placeholderTextColor={colors.textFaint}
        value={name}
        onChangeText={setName}
        maxLength={60}
      />

      <Text style={styles.label}>Target amount</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. 2000"
        placeholderTextColor={colors.textFaint}
        value={target}
        onChangeText={setTarget}
        keyboardType="numeric"
      />

      <Text style={styles.label}>Save together with</Text>
      {buddies.length === 0 ? (
        <Text style={styles.hint}>
          No buddies yet — you can start solo and they&apos;ll join once you&apos;re linked.
        </Text>
      ) : (
        <View style={styles.buddyList}>
          {buddies.map((b) => {
            const on = picked.has(b.id);
            return (
              <Pressable
                key={b.id}
                onPress={() => toggle(b.id)}
                style={({ pressed }) => [styles.buddyRow, pressed && styles.pressed]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`Save with ${authorLabel(b.name)}`}
              >
                <Avatar url={b.avatar} name={b.name} size={36} />
                <Text style={styles.buddyName}>{authorLabel(b.name)}</Text>
                <Ionicons
                  name={on ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={on ? colors.primary : colors.textMuted}
                />
              </Pressable>
            );
          })}
        </View>
      )}

      <Button title="Start shared goal" onPress={onCreate} loading={saving} disabled={!canSave} style={styles.save} />
      <Text style={styles.hint}>
        Everyone adds deposits to the same pot — each deposit shows who saved what.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.background,
    paddingBottom: 40,
    ...contentMax,
  },
  pressed: { opacity: 0.75 },
  label: {
    fontSize: 13.5,
    fontFamily: font.semibold,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  hint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: spacing.sm },
  buddyList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 4,
  },
  buddyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  buddyName: { flex: 1, fontFamily: font.semibold, fontSize: 14.5, color: colors.text },
  save: { marginTop: spacing.lg },
});
