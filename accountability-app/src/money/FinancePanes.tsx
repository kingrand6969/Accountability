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
  listSavings,
  type Account,
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
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    listAccounts()
      .then(setAccounts)
      .catch((e) => Alert.alert('Could not load accounts', String((e as Error).message ?? e)))
      .finally(() => setRefreshing(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const total = accounts.reduce((a, b) => a + b.balance, 0);

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
            <Text style={styles.kicker}>BANKS & WALLETS</Text>
            <Text style={styles.total}>{formatAmount(total)}</Text>
          </View>
          <Text style={styles.totalSub}>total across {accounts.length || 'your'} account{accounts.length === 1 ? '' : 's'}</Text>

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
          <Text style={styles.note}>
            Balances are entered by you — update them any time by tapping an account.
          </Text>
        </View>
      </GlassCard>
    </ScrollView>
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
