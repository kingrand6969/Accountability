import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  accountKindMeta,
  listAccounts,
  listDebts,
  listSavings,
  setDebtSettled,
  type Account,
  type Debt,
  type SavingsGoal,
} from './accountsApi';
import { formatAmount } from './categories';
import { GlassCard } from '../ui/Glass';
import { ProgressRing } from '../ui/ProgressRing';
import { colors, font, radius, spacing } from '../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#6d28d9';
const GOOD = '#047857';

/** Banks & wallets — the pane to the left of the Finance overview. */
export function AccountsPane({
  width,
  topInset,
  blurTarget,
}: {
  width: number;
  topInset: number;
  blurTarget: React.RefObject<View | null>;
}) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    Promise.all([listAccounts(), listDebts()])
      .then(([a, d]) => {
        setAccounts(a);
        setDebts(d);
      })
      .catch((e) => Alert.alert('Could not load accounts', String((e as Error).message ?? e)))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function onSettle(d: Debt) {
    setDebts((cur) => cur.map((x) => (x.id === d.id ? { ...x, settled: true } : x)));
    try {
      await setDebtSettled(d.id, true);
    } catch (e) {
      setDebts((cur) => cur.map((x) => (x.id === d.id ? { ...x, settled: false } : x)));
      Alert.alert('Could not update', String((e as Error).message ?? e));
    }
  }

  const total = accounts.reduce((a, b) => a + b.balance, 0);
  const oweOpen = debts.filter((d) => d.kind === 'owe' && !d.settled);
  const owedOpen = debts.filter((d) => d.kind === 'owed' && !d.settled);
  const oweTotal = oweOpen.reduce((a, d) => a + d.amount, 0);
  const owedTotal = owedOpen.reduce((a, d) => a + d.amount, 0);
  const netWorth = total + owedTotal - oweTotal;

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.pane, { paddingTop: topInset }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={INK}
        />
      }
    >
      {/* NET WORTH hero */}
      <GlassCard blurTarget={blurTarget}>
        <View style={styles.cardPad}>
          <Text style={styles.kicker}>NET WORTH</Text>
          <Text style={styles.netWorth}>{formatAmount(netWorth)}</Text>
          <Text style={styles.totalSub}>
            {formatAmount(total)} in accounts
            {owedTotal > 0 ? ` + ${formatAmount(owedTotal)} owed to you` : ''}
            {oweTotal > 0 ? ` − ${formatAmount(oweTotal)} you owe` : ''}
          </Text>
        </View>
      </GlassCard>

      {/* accounts */}
      <GlassCard blurTarget={blurTarget}>
        <View style={styles.cardPad}>
          <View style={styles.headRow}>
            <Text style={styles.kicker}>BANKS & WALLETS</Text>
            <Text style={styles.total}>{formatAmount(total)}</Text>
          </View>
          <Text style={styles.totalSub}>
            across {accounts.length || 'your'} account{accounts.length === 1 ? '' : 's'}
          </Text>

          {accounts.length === 0 ? (
            <Text style={styles.empty}>
              Add every place your money lives — banks, e-wallets, cash — and see the total at
              a glance.
            </Text>
          ) : (
            <View style={styles.list}>
              {accounts.map((a) => {
                const meta = accountKindMeta(a.kind);
                return (
                  <Pressable
                    key={a.id}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() =>
                      router.push({ pathname: '/account-new', params: { id: a.id } } as never)
                    }
                    accessibilityLabel={`Edit ${a.name}`}
                  >
                    <View style={styles.icon}>
                      <Ionicons name={meta.icon as any} size={16} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={styles.rowSub}>{meta.label}</Text>
                    </View>
                    <Text style={styles.rowAmount}>{formatAmount(a.balance)}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => router.push('/account-new' as never)}
            accessibilityLabel="Add a bank or wallet"
          >
            <Ionicons name="add" size={16} color={ACCENT} />
            <Text style={styles.addText}>Add bank or wallet</Text>
          </Pressable>
        </View>
      </GlassCard>

      {/* debts & IOUs */}
      <GlassCard blurTarget={blurTarget}>
        <View style={styles.cardPad}>
          <Text style={styles.kicker}>DEBTS & IOUs</Text>

          <View style={styles.debtHead}>
            <View style={styles.debtHeadCol}>
              <Text style={styles.debtHeadLabel}>You owe</Text>
              <Text style={[styles.debtHeadAmt, { color: '#be123c' }]}>{formatAmount(oweTotal)}</Text>
            </View>
            <View style={styles.debtDivider} />
            <View style={styles.debtHeadCol}>
              <Text style={styles.debtHeadLabel}>Owed to you</Text>
              <Text style={[styles.debtHeadAmt, { color: GOOD }]}>{formatAmount(owedTotal)}</Text>
            </View>
          </View>

          {oweOpen.length === 0 && owedOpen.length === 0 ? (
            <Text style={styles.empty}>
              Track what you still owe and what others owe you — settle them with a tap.
            </Text>
          ) : (
            <View style={styles.list}>
              {oweOpen.map((d) => (
                <DebtRow key={d.id} debt={d} onSettle={() => onSettle(d)} onOpen={() => router.push({ pathname: '/debt-new', params: { id: d.id } } as never)} />
              ))}
              {owedOpen.map((d) => (
                <DebtRow key={d.id} debt={d} onSettle={() => onSettle(d)} onOpen={() => router.push({ pathname: '/debt-new', params: { id: d.id } } as never)} />
              ))}
            </View>
          )}

          <View style={styles.debtBtnRow}>
            <Pressable
              style={({ pressed }) => [styles.debtBtn, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/debt-new', params: { kind: 'owe' } } as never)}
              accessibilityLabel="Add something you owe"
            >
              <Ionicons name="arrow-up-circle-outline" size={15} color="#be123c" />
              <Text style={[styles.debtBtnText, { color: '#be123c' }]}>I owe</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.debtBtn, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/debt-new', params: { kind: 'owed' } } as never)}
              accessibilityLabel="Add something owed to you"
            >
              <Ionicons name="arrow-down-circle-outline" size={15} color={GOOD} />
              <Text style={[styles.debtBtnText, { color: GOOD }]}>Owed to me</Text>
            </Pressable>
          </View>
          <Text style={styles.note}>
            Balances and debts are entered by you — tap any card to update it.
          </Text>
        </View>
      </GlassCard>
    </ScrollView>
  );
}

function DebtRow({ debt, onSettle, onOpen }: { debt: Debt; onSettle: () => void; onOpen: () => void }) {
  const isOwe = debt.kind === 'owe';
  const due = debt.due_date
    ? new Date(debt.due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null;
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onOpen}
      accessibilityLabel={`Edit debt with ${debt.counterparty}`}
    >
      <View style={[styles.icon, { backgroundColor: isOwe ? 'rgba(190,18,60,0.1)' : 'rgba(4,120,87,0.1)' }]}>
        <Ionicons name={isOwe ? 'arrow-up' : 'arrow-down'} size={15} color={isOwe ? '#be123c' : GOOD} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>
          {debt.counterparty}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {debt.note?.trim() || (isOwe ? 'You owe' : 'Owes you')}
          {due ? ` · due ${due}` : ''}
        </Text>
      </View>
      <Text style={[styles.rowAmount, { color: isOwe ? '#be123c' : GOOD }]}>{formatAmount(debt.amount)}</Text>
      <Pressable
        onPress={onSettle}
        hitSlop={10}
        style={({ pressed }) => [styles.settleBtn, pressed && styles.pressed]}
        accessibilityLabel="Mark settled"
      >
        <Ionicons name="checkmark-circle-outline" size={22} color={INK_SOFT} />
      </Pressable>
    </Pressable>
  );
}

/** Savings goals — the pane to the right of the Finance overview. */
export function SavingsPane({
  width,
  topInset,
  blurTarget,
}: {
  width: number;
  topInset: number;
  blurTarget: React.RefObject<View | null>;
}) {
  const router = useRouter();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listSavings()
      .then(setGoals)
      .catch((e) => Alert.alert('Could not load savings', String((e as Error).message ?? e)))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const total = goals.reduce((a, g) => a + g.saved, 0);

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.pane, { paddingTop: topInset }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
          tintColor={INK}
        />
      }
    >
      <GlassCard blurTarget={blurTarget}>
        <View style={styles.cardPad}>
          <View style={styles.headRow}>
            <Text style={styles.kicker}>SAVINGS GOALS</Text>
            <Text style={[styles.total, { color: GOOD }]}>{formatAmount(total)}</Text>
          </View>
          <Text style={styles.totalSub}>saved across all goals</Text>

          {goals.length === 0 ? (
            <Text style={styles.empty}>
              Saving for a trip, an emergency fund, new gear? Track each goal and watch it fill
              up.
            </Text>
          ) : (
            <View style={styles.list}>
              {goals.map((g) => {
                const progress = g.target && g.target > 0 ? Math.min(1, g.saved / g.target) : 0;
                return (
                  <Pressable
                    key={g.id}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() =>
                      router.push({ pathname: '/saving-new', params: { id: g.id } } as never)
                    }
                    accessibilityLabel={`Edit ${g.name}`}
                  >
                    {g.target ? (
                      <View style={styles.ringWrap}>
                        <ProgressRing
                          size={36}
                          strokeWidth={4}
                          progress={progress}
                          trackColor="rgba(255,255,255,0.9)"
                          startColor="#34d399"
                          endColor="#059669"
                        />
                        <Text style={styles.ringPct}>{Math.round(progress * 100)}</Text>
                      </View>
                    ) : (
                      <View style={styles.icon}>
                        <Ionicons name="flag-outline" size={16} color={GOOD} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={styles.rowSub}>
                        {g.target
                          ? `${formatAmount(g.saved)} of ${formatAmount(g.target)}`
                          : 'no target set'}
                      </Text>
                    </View>
                    <Text style={[styles.rowAmount, { color: GOOD }]}>
                      {formatAmount(g.saved)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => router.push('/saving-new' as never)}
            accessibilityLabel="Add a savings goal"
          >
            <Ionicons name="add" size={16} color={ACCENT} />
            <Text style={styles.addText}>Add savings goal</Text>
          </Pressable>
        </View>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pane: {
    padding: spacing.lg,
    paddingBottom: 120,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  cardPad: { padding: spacing.lg },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  total: { color: INK, fontFamily: font.extrabold, fontSize: 17 },
  totalSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 12, marginTop: 1 },
  netWorth: {
    color: INK,
    fontFamily: font.display,
    fontSize: 38,
    lineHeight: 42,
    includeFontPadding: false,
    marginTop: 2,
  },
  debtHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  debtHeadCol: { flex: 1, alignItems: 'center', gap: 2 },
  debtHeadLabel: { color: INK_SOFT, fontFamily: font.semibold, fontSize: 12 },
  debtHeadAmt: { fontFamily: font.extrabold, fontSize: 18 },
  debtDivider: { width: 1, height: 34, backgroundColor: 'rgba(30,27,75,0.12)' },
  debtBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  debtBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    minHeight: 42,
  },
  debtBtnText: { fontFamily: font.bold, fontSize: 13.5 },
  settleBtn: { minWidth: 30, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: {
    color: INK_SOFT,
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  list: { gap: spacing.sm, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 56,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(109,40,217,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  ringPct: {
    position: 'absolute',
    fontFamily: font.bold,
    fontSize: 10,
    color: INK,
  },
  rowName: { color: INK, fontFamily: font.semibold, fontSize: 15 },
  rowSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 12, marginTop: 1 },
  rowAmount: { color: INK, fontFamily: font.bold, fontSize: 15 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: ACCENT,
    borderRadius: radius.pill,
    minHeight: 44,
    marginTop: spacing.md,
  },
  addText: { color: ACCENT, fontFamily: font.bold, fontSize: 14 },
  note: {
    color: INK_SOFT,
    fontFamily: font.regular,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.75 },
});
