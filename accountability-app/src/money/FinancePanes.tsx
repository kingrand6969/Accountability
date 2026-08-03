import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import {
  accountKindMeta,
  addCard,
  cardCredit,
  cardMonthsLeft,
  cardPaidThisMonth,
  listAccounts,
  listDebts,
  listSavings,
  payCard,
  setDebtSettled,
  type Account,
  type Debt,
  type SavingsGoal,
} from './accountsApi';
import { formatAmount } from './categories';
import { listSharedGoals, type SharedGoal } from './sharedGoals';
import { Avatar } from '../feed/Avatar';
import { useIsPro } from '../pro/ProProvider';
import { GlassCard } from '../ui/Glass';
import { showToast } from '../ui/Toast';
import { ProgressRing } from '../ui/ProgressRing';
import { contentMaxWidth } from '../ui/responsive';
import { colors, font, radius, spacing } from '../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#2563eb';
const GOOD = '#047857';

function PaneStatus({
  width,
  topInset,
  title,
  message,
  retry,
}: {
  width: number;
  topInset: number;
  title: string;
  message?: string;
  retry?: () => void;
}) {
  return (
    <View style={[styles.paneStatus, { width, paddingTop: topInset }]}>
      {retry ? (
        <>
          <Ionicons name="cloud-offline-outline" size={28} color={INK_SOFT} />
          <Text style={styles.statusTitle}>{title}</Text>
          <Text style={styles.statusMessage}>{message}</Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel={`Retry ${title.toLowerCase()}`}
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="small" color={ACCENT} />
          <Text style={styles.statusTitle}>{title}</Text>
        </>
      )}
    </View>
  );
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, d] = await Promise.all([listAccounts(), listDebts()]);
      setAccounts(a);
      setDebts(d);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const [payFor, setPayFor] = useState<Debt | null>(null);
  const [showAddCard, setShowAddCard] = useState(false);

  async function onSettle(d: Debt) {
    setDebts((cur) => cur.map((x) => (x.id === d.id ? { ...x, settled: true } : x)));
    try {
      await setDebtSettled(d.id, true);
    } catch (e) {
      setDebts((cur) => cur.map((x) => (x.id === d.id ? { ...x, settled: false } : x)));
      Alert.alert('Could not update', String((e as Error).message ?? e));
    }
  }

  const colMax = contentMaxWidth(width);
  const total = accounts.reduce((a, b) => a + b.balance, 0);
  const cards = debts.filter((d) => d.is_card && !d.settled);
  const cardTotal = cards.reduce((a, d) => a + d.amount, 0);
  const oweOpen = debts.filter((d) => d.kind === 'owe' && !d.settled && !d.is_card);
  const owedOpen = debts.filter((d) => d.kind === 'owed' && !d.settled);
  const oweTotal = oweOpen.reduce((a, d) => a + d.amount, 0) + cardTotal;
  const owedTotal = owedOpen.reduce((a, d) => a + d.amount, 0);
  const netWorth = total + owedTotal - oweTotal;

  if (loading) {
    return <PaneStatus width={width} topInset={topInset} title="Loading accounts…" />;
  }
  if (error && accounts.length === 0 && debts.length === 0) {
    return (
      <PaneStatus
        width={width}
        topInset={topInset}
        title="Accounts unavailable"
        message="We could not load your private account records. Nothing was changed."
        retry={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.pane, { maxWidth: colMax, paddingTop: topInset }]}
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
      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>
            Could not refresh. Your last loaded records are still shown.
          </Text>
          <Pressable onPress={load} style={styles.inlineRetry} accessibilityRole="button">
            <Text style={styles.inlineRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
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

      {/* credit cards — one-tap payments that deduct from the balance */}
      <GlassCard blurTarget={blurTarget}>
        <View style={styles.cardPad}>
          <View style={styles.headRow}>
            <Text style={styles.kicker}>CREDIT CARDS</Text>
            <Text style={[styles.total, cardTotal > 0 && { color: '#be123c' }]}>
              {formatAmount(cardTotal)}
            </Text>
          </View>
          <Text style={styles.totalSub}>
            {cards.length === 0
              ? 'total card debt'
              : `total debt across ${cards.length} card${cards.length === 1 ? '' : 's'}`}
          </Text>

          {cards.length === 0 ? (
            <Text style={styles.empty}>
              Add each card&apos;s balance once. Every month, one tap logs the payment and deducts it —
              watch the total fall.
            </Text>
          ) : (
            <View style={styles.list}>
              {cards.map((c) => {
                const paid = cardPaidThisMonth(c);
                const months = cardMonthsLeft(c);
                const credit = cardCredit(c);
                const near = credit != null && credit.usedPct >= 0.7;
                return (
                  <View key={c.id} style={styles.cardCol}>
                   <View style={styles.cardTop}>
                    <View style={styles.icon}>
                      <Ionicons name="card-outline" size={16} color="#be123c" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>{c.counterparty}</Text>
                      <Text style={styles.rowSub}>
                        {c.due_day ? `due the ${c.due_day}${ord(c.due_day)}` : 'no due day set'}
                        {months ? ` · ~${months} month${months === 1 ? '' : 's'} left` : ''}
                      </Text>
                    </View>
                    <View style={styles.cardRight}>
                      <Text style={[styles.rowAmount, { color: '#be123c' }]}>
                        {formatAmount(c.amount)}
                      </Text>
                      {paid ? (
                        <View style={styles.paidChip}>
                          <Ionicons name="checkmark" size={12} color={GOOD} />
                          <Text style={styles.paidChipTxt}>Paid</Text>
                        </View>
                      ) : (
                        <Pressable
                          style={({ pressed }) => [styles.payBtn, pressed && styles.pressed]}
                          onPress={() => setPayFor(c)}
                          accessibilityLabel={`Log a payment on ${c.counterparty}`}
                        >
                          <Text style={styles.payBtnTxt}>I paid</Text>
                        </Pressable>
                      )}
                    </View>
                   </View>
                   {credit ? (
                     <View style={styles.limitWrap}>
                       <View style={styles.limitBar}>
                         <View
                           style={[
                             styles.limitFill,
                             { width: `${Math.round(credit.usedPct * 100)}%`, backgroundColor: near ? '#be123c' : ACCENT },
                           ]}
                         />
                       </View>
                       <Text style={[styles.limitTxt, near && { color: '#be123c' }]}>
                         {formatAmount(credit.available)} available of {formatAmount(c.credit_limit!)} · {Math.round(credit.usedPct * 100)}% used
                       </Text>
                     </View>
                   ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => setShowAddCard(true)}
            accessibilityLabel="Add a credit card"
          >
            <Ionicons name="add" size={16} color={ACCENT} />
            <Text style={styles.addText}>Add credit card</Text>
          </Pressable>
        </View>
      </GlassCard>

      <PayCardSheet
        card={payFor}
        onClose={() => setPayFor(null)}
        onPaid={(left, name) => {
          setPayFor(null);
          showToast(left <= 0 ? `${name} is fully paid off! 🎉` : `Payment logged — ${formatAmount(left)} left on ${name}`);
          load();
        }}
      />
      <AddCardSheet
        visible={showAddCard}
        onClose={() => setShowAddCard(false)}
        onSaved={() => { setShowAddCard(false); load(); }}
      />

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

function ord(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
}

function CardSheetShell({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.dim} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={INK_SOFT} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PayCardSheet({ card, onClose, onPaid }: {
  card: Debt | null; onClose: () => void; onPaid: (left: number, name: string) => void;
}) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const attemptKey = useRef<string | null>(null);
  useEffect(() => {
    if (card) {
      setAmount(card.monthly_payment ? String(card.monthly_payment) : '');
      attemptKey.current = null;
    }
  }, [card]);
  const a = Number(amount) || 0;
  const valid = !!card && Number.isFinite(a) && a > 0 && a <= card.amount;
  return (
    <CardSheetShell visible={!!card} title={card ? `Pay ${card.counterparty}` : ''} onClose={onClose}>
      <Text style={styles.sheetSub}>
        {card ? `${formatAmount(card.amount)} left. Log what you paid — it comes straight off the total.` : ''}
      </Text>
      <TextInput
        style={styles.sheetInput}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder="Amount paid"
        placeholderTextColor="rgba(30,27,75,0.35)"
        autoFocus
      />
      {card && a > card.amount ? (
        <Text style={styles.amountError}>
          Payment cannot be more than the current balance of {formatAmount(card.amount)}.
        </Text>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.sheetBtn, (!valid || saving) && { opacity: 0.5 }, pressed && styles.pressed]}
        disabled={!valid || saving}
        onPress={async () => {
          if (!card) return;
          setSaving(true);
          try {
            attemptKey.current ??= Crypto.randomUUID();
            const left = await payCard(card, a, attemptKey.current);
            attemptKey.current = null;
            onPaid(left, card.counterparty);
          } catch (error) {
            Alert.alert('Could not log payment', String((error as Error).message ?? error));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Text style={styles.sheetBtnTxt}>{saving ? 'Logging…' : 'Log payment'}</Text>
      </Pressable>
    </CardSheetShell>
  );
}

function AddCardSheet({ visible, onClose, onSaved }: {
  visible: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [monthly, setMonthly] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (visible) { setName(''); setAmount(''); setMonthly(''); setDueDay(''); setLimit(''); }
  }, [visible]);
  return (
    <CardSheetShell visible={visible} title="Add credit card" onClose={onClose}>
      <TextInput style={styles.sheetInput} value={name} onChangeText={setName} placeholder="Card name (e.g. Visa …1234)" placeholderTextColor="rgba(30,27,75,0.35)" />
      <TextInput style={styles.sheetInput} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Total amount owed" placeholderTextColor="rgba(30,27,75,0.35)" />
      <View style={styles.sheetRow}>
        <TextInput style={[styles.sheetInput, { flex: 1 }]} value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" placeholder="Monthly payment" placeholderTextColor="rgba(30,27,75,0.35)" />
        <TextInput style={[styles.sheetInput, { width: 96, flexGrow: 0 }]} value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" maxLength={2} placeholder="Due day" placeholderTextColor="rgba(30,27,75,0.35)" />
      </View>
      <TextInput style={styles.sheetInput} value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="Credit limit (optional)" placeholderTextColor="rgba(30,27,75,0.35)" />
      <Pressable
        style={({ pressed }) => [styles.sheetBtn, saving && { opacity: 0.5 }, pressed && styles.pressed]}
        disabled={saving}
        onPress={async () => {
          if (!name.trim() || !(Number(amount) > 0)) { showToast('Card name and amount owed, please.'); return; }
          setSaving(true);
          try {
            await addCard({
              counterparty: name.trim(),
              amount: Number(amount),
              monthly_payment: Number(monthly) > 0 ? Number(monthly) : null,
              due_day: Number(dueDay) >= 1 && Number(dueDay) <= 31 ? Number(dueDay) : null,
              credit_limit: Number(limit) > 0 ? Number(limit) : null,
            });
            onSaved();
          } catch {
            showToast('Could not add the card.');
          } finally {
            setSaving(false);
          }
        }}
      >
        <Text style={styles.sheetBtnTxt}>{saving ? 'Adding…' : 'Add card'}</Text>
      </Pressable>
    </CardSheetShell>
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
  const { isPro } = useIsPro();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [shared, setShared] = useState<SharedGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [personal, sharedGoals] = await Promise.all([listSavings(), listSharedGoals()]);
      setGoals(personal);
      setShared(sharedGoals);
      setError(null);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const colMax = contentMaxWidth(width);
  const total = goals.reduce((a, g) => a + g.saved, 0);

  if (loading) {
    return <PaneStatus width={width} topInset={topInset} title="Loading savings…" />;
  }
  if (error && goals.length === 0 && shared.length === 0) {
    return (
      <PaneStatus
        width={width}
        topInset={topInset}
        title="Savings unavailable"
        message="We could not load your private savings records. Nothing was changed."
        retry={() => {
          setLoading(true);
          load();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={[styles.pane, { maxWidth: colMax, paddingTop: topInset }]}
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
      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>
            Could not refresh. Your last loaded goals are still shown.
          </Text>
          <Pressable onPress={load} style={styles.inlineRetry} accessibilityRole="button">
            <Text style={styles.inlineRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
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
                          trackColor="rgba(30,27,75,0.12)"
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

      {/* Saving Buddies — shared pots with an itemized member ledger (Pro creates) */}
      <GlassCard blurTarget={blurTarget} style={{ marginTop: spacing.md }}>
        <View style={styles.cardPad}>
          <View style={styles.headRow}>
            <Text style={styles.kicker}>SAVING BUDDIES</Text>
            <View style={styles.proTag}>
              <Ionicons name="star" size={10} color="#fff" />
              <Text style={styles.proTagText}>PRO</Text>
            </View>
          </View>
          <Text style={styles.totalSub}>Save toward one goal together — every deposit itemized</Text>

          {shared.length === 0 ? (
            <Text style={styles.empty}>
              Travel to Vietnam? Team gym gear? Start a shared pot with your buddies and watch it
              grow together.
            </Text>
          ) : (
            <View style={styles.list}>
              {shared.map((g) => {
                const progress = g.target > 0 ? Math.min(1, g.saved / g.target) : 0;
                return (
                  <Pressable
                    key={g.id}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                    onPress={() =>
                      router.push({ pathname: '/shared-goal/[id]', params: { id: g.id } } as never)
                    }
                    accessibilityLabel={`Open ${g.name}`}
                  >
                    <View style={styles.ringWrap}>
                      <ProgressRing
                        size={36}
                        strokeWidth={4}
                        progress={progress}
                        trackColor="rgba(30,27,75,0.12)"
                        startColor="#60a5fa"
                        endColor="#2563eb"
                      />
                      <Text style={styles.ringPct}>{Math.round(progress * 100)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={styles.rowSub}>
                        {formatAmount(g.saved)} of {formatAmount(g.target)} · {g.members.length}{' '}
                        saving
                      </Text>
                    </View>
                    <View style={styles.memberStack}>
                      {g.members.slice(0, 3).map((m, i) => (
                        <View key={m.id} style={[styles.memberAvatar, i > 0 && { marginLeft: -10 }]}>
                          <Avatar url={m.avatar} name={m.name} size={24} />
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
            onPress={() => router.push((isPro ? '/shared-goal-new' : '/paywall') as never)}
            accessibilityLabel="Start a shared savings goal"
          >
            <Ionicons name={isPro ? 'add' : 'lock-closed'} size={16} color={ACCENT} />
            <Text style={styles.addText}>
              {isPro ? 'Start a shared goal' : 'Start a shared goal — Pro'}
            </Text>
          </Pressable>
        </View>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  paneStatus: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  statusTitle: { color: INK, fontFamily: font.bold, fontSize: 16, textAlign: 'center' },
  statusMessage: {
    color: INK_SOFT,
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryBtn: {
    minHeight: 44,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: ACCENT,
    marginTop: spacing.xs,
  },
  retryText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  inlineError: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    backgroundColor: colors.dangerSoft,
    marginBottom: spacing.md,
  },
  inlineErrorText: {
    flex: 1,
    color: colors.danger,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  inlineRetry: { minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  inlineRetryText: { color: colors.danger, fontFamily: font.bold, fontSize: 13 },
  cardRight: { alignItems: 'flex-end', gap: 4 },
  cardCol: { gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  limitWrap: { gap: 3, paddingLeft: 40 },
  limitBar: { height: 5, borderRadius: 3, backgroundColor: 'rgba(30,27,75,0.1)', overflow: 'hidden' },
  limitFill: { height: 5, borderRadius: 3 },
  limitTxt: { fontFamily: font.medium, fontSize: 11.5, color: INK_SOFT },
  payBtn: {
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 44,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payBtnTxt: { fontFamily: font.bold, fontSize: 12, color: '#fff' },
  paidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(4,120,87,0.1)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paidChipTxt: { fontFamily: font.semibold, fontSize: 11.5, color: GOOD },
  dim: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheetWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    width: 420,
    maxWidth: '92%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 22,
    padding: spacing.lg,
    gap: 10,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 17, color: INK },
  sheetSub: { fontFamily: font.medium, fontSize: 13, color: INK_SOFT, lineHeight: 18 },
  amountError: { color: colors.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 17 },
  sheetInput: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(30,27,75,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: font.medium,
    fontSize: 14.5,
    color: INK,
  },
  sheetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetBtn: {
    backgroundColor: ACCENT,
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
    minHeight: 44,
  },
  sheetBtnTxt: { fontFamily: font.bold, fontSize: 15, color: '#fff' },
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
    minHeight: 44,
  },
  debtBtnText: { fontFamily: font.bold, fontSize: 13.5 },
  settleBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: 'rgba(37,99,235,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringWrap: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  proTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.pro,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  proTagText: { color: '#fff', fontFamily: font.extrabold, fontSize: 10, letterSpacing: 0.6 },
  memberStack: { flexDirection: 'row', alignItems: 'center' },
  memberAvatar: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
  },
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
