import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import {
  addContribution,
  deleteSharedGoal,
  getSharedGoal,
  leaveSharedGoal,
  type GoalContribution,
  type SharedGoal,
} from '../../money/sharedGoals';
import { formatAmount } from '../../money/categories';
import { Avatar } from '../../feed/Avatar';
import { authorLabel, timeAgo } from '../../feed/format';
import { confirmDestructive } from '../../ui/confirm';
import { hapticSuccess } from '../../ui/haptics';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, shadow, spacing, contentMax } from '../../ui/theme';

export default function SharedGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [goal, setGoal] = useState<SharedGoal | null>(null);
  const [ledger, setLedger] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    supabase.auth.getUser().then((r) => setUid(r.data.user?.id ?? null));
    getSharedGoal(id)
      .then((res) => {
        setGoal(res?.goal ?? null);
        setLedger(res?.contributions ?? []);
      })
      .catch(() => setGoal(null))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(load);

  const amountNum = parseFloat(amount);
  const canAdd = amountNum > 0 && !adding;

  async function onAdd() {
    if (!id || !canAdd) return;
    setAdding(true);
    try {
      await addContribution(id, amountNum, note);
      hapticSuccess();
      showToast('Added to the pot 💰');
      setAmount('');
      setNote('');
      load();
    } catch (e) {
      Alert.alert('Could not add', String((e as Error).message ?? e));
    } finally {
      setAdding(false);
    }
  }

  function onLeaveOrDelete() {
    if (!goal) return;
    const mine = goal.creator_id === uid;
    confirmDestructive(
      mine ? 'Delete this shared goal?' : 'Leave this shared goal?',
      mine
        ? 'The pot and its history disappear for everyone.'
        : 'You can be re-added by the creator later.',
      mine ? 'Delete' : 'Leave',
      async () => {
        try {
          if (mine) await deleteSharedGoal(goal.id);
          else await leaveSharedGoal(goal.id);
          router.back();
        } catch (e) {
          Alert.alert('Could not do that', String((e as Error).message ?? e));
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
  if (!goal) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>This shared goal isn&apos;t available.</Text>
      </View>
    );
  }

  const progress = goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0;
  // itemized per member: who has saved how much
  const perMember = goal.members.map((m) => ({
    ...m,
    total: ledger.filter((c) => c.user_id === m.id).reduce((s, c) => s + c.amount, 0),
  }));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* pot summary */}
      <View style={styles.hero}>
        <Text style={styles.goalName}>{goal.name}</Text>
        <Text style={styles.potLine}>
          <Text style={styles.pot}>{formatAmount(goal.saved)}</Text>
          <Text style={styles.potOf}> of {formatAmount(goal.target)}</Text>
        </Text>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.potSub}>
          {Math.round(progress * 100)}% there · {goal.members.length} saving together
        </Text>
      </View>

      {/* itemized per member */}
      <Text style={styles.sectionTitle}>Who saved what</Text>
      <View style={styles.card}>
        {perMember.map((m) => (
          <View key={m.id} style={styles.memberRow}>
            <Avatar url={m.avatar} name={m.name} size={34} />
            <Text style={styles.memberName}>
              {m.id === uid ? 'You' : authorLabel(m.name)}
            </Text>
            <Text style={styles.memberTotal}>{formatAmount(m.total)}</Text>
          </View>
        ))}
      </View>

      {/* add a deposit */}
      <Text style={styles.sectionTitle}>Add to the pot</Text>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="Amount"
          placeholderTextColor={colors.textFaint}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />
        <Pressable
          onPress={onAdd}
          disabled={!canAdd}
          style={({ pressed }) => [styles.addBtn, !canAdd && { opacity: 0.5 }, pressed && canAdd && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Add deposit"
        >
          {adding ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="add" size={22} color="#fff" />
          )}
        </Pressable>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Note (optional) — e.g. July salary"
        placeholderTextColor={colors.textFaint}
        value={note}
        onChangeText={setNote}
        maxLength={120}
      />

      {/* the itemized ledger */}
      <Text style={styles.sectionTitle}>Ledger</Text>
      <View style={styles.card}>
        {ledger.length === 0 ? (
          <Text style={styles.empty}>No deposits yet — be the first to add to the pot.</Text>
        ) : (
          ledger.map((c) => (
            <View key={c.id} style={styles.ledgerRow}>
              <Avatar url={c.avatar} name={c.name} size={34} />
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerName}>
                  {c.user_id === uid ? 'You' : authorLabel(c.name)}
                  {c.note ? <Text style={styles.ledgerNote}> · {c.note}</Text> : null}
                </Text>
                <Text style={styles.ledgerTime}>{timeAgo(c.created_at)}</Text>
              </View>
              <Text style={styles.ledgerAmount}>+{formatAmount(c.amount)}</Text>
            </View>
          ))
        )}
      </View>

      <Pressable
        onPress={onLeaveOrDelete}
        style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.dangerText}>
          {goal.creator_id === uid ? 'Delete shared goal' : 'Leave shared goal'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: 40, gap: spacing.xs, ...contentMax },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { fontFamily: font.regular, color: colors.textMuted },
  pressed: { opacity: 0.75 },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
    ...shadow.card,
  },
  goalName: { fontFamily: font.extrabold, fontSize: 20, color: colors.text, textAlign: 'center' },
  potLine: { flexDirection: 'row' },
  pot: { fontFamily: font.display, fontSize: 34, color: colors.primary },
  potOf: { fontFamily: font.semibold, fontSize: 15, color: colors.textMuted },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    alignSelf: 'stretch',
    overflow: 'hidden',
    marginTop: 4,
  },
  trackFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  potSub: { fontFamily: font.medium, fontSize: 12.5, color: colors.textMuted },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    ...shadow.card,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  memberName: { flex: 1, fontFamily: font.semibold, fontSize: 14.5, color: colors.text },
  memberTotal: { fontFamily: font.bold, fontSize: 14.5, color: colors.primary },
  addRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    marginTop: 4,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  empty: { fontFamily: font.regular, fontSize: 13.5, color: colors.textMuted, paddingVertical: 12 },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  ledgerName: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  ledgerNote: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  ledgerTime: { fontFamily: font.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  ledgerAmount: { fontFamily: font.bold, fontSize: 14.5, color: '#047857' },
  dangerBtn: { alignItems: 'center', paddingVertical: 14, marginTop: spacing.md },
  dangerText: { fontFamily: font.bold, fontSize: 14, color: colors.danger },
});
