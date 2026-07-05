import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsPro } from '../../pro/ProProvider';
import { listMonth, deleteTransaction } from '../../money/api';
import { sumByKind, groupByCategory } from '../../money/compute';
import { categoryMeta, formatAmount } from '../../money/categories';
import type { Transaction } from '../../money/types';
import {
  billCategoryMeta,
  billStatus,
  dueLabel,
  sortBills,
  unpaidTotal,
  type Bill,
} from '../../money/billing';
import { listBills, markBillPaid, unmarkBillPaid } from '../../money/billsApi';
import { EmptyState } from '../../ui/EmptyState';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { ProgressRing } from '../../ui/ProgressRing';
import { confirmDestructive } from '../../ui/confirm';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing, shadow } from '../../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#6d28d9';

export default function Finance() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro } = useIsPro();
  const bgRef = useRef<View>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [lastSpend, setLastSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // credit-card "which amount?" chooser (in-tree overlay — not a Modal, so
  // Android blur behind it keeps working)
  const [ccChooser, setCcChooser] = useState<Bill | null>(null);
  const paysInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const [cur, last, bs] = await Promise.all([listMonth(now), listMonth(prev), listBills()]);
      setTxns(cur);
      setLastSpend(sumByKind(last, 'expense'));
      setBills(bs);
    } catch (e) {
      Alert.alert('Could not load', String((e as Error).message ?? e));
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

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  function onDeleteTx(item: Transaction) {
    confirmDestructive(
      'Delete this transaction?',
      `${categoryMeta(item.category).label} · ${formatAmount(item.amount)}`,
      'Delete',
      async () => {
        try {
          await deleteTransaction(item.id);
          setTxns((cur) => cur.filter((t) => t.id !== item.id));
        } catch (e) {
          Alert.alert('Could not delete', String((e as Error).message ?? e));
        }
      },
    );
  }

  async function payBill(bill: Bill, amount: number) {
    if (paysInFlight.current.has(bill.id)) return;
    paysInFlight.current.add(bill.id);
    setCcChooser(null);
    try {
      await markBillPaid(bill, amount);
      showToast(`${bill.name} marked paid ✓`);
      await load();
    } catch (e) {
      Alert.alert('Could not mark paid', String((e as Error).message ?? e));
    } finally {
      paysInFlight.current.delete(bill.id);
    }
  }

  function onTogglePaid(bill: Bill) {
    const s = billStatus(bill, new Date());
    if (s.paid) {
      confirmDestructive(
        'Mark as unpaid?',
        'The logged transaction stays in your list — delete it there if it was a mistake.',
        'Mark unpaid',
        async () => {
          try {
            await unmarkBillPaid(bill);
            await load();
          } catch (e) {
            Alert.alert('Could not update', String((e as Error).message ?? e));
          }
        },
      );
      return;
    }
    if (bill.category === 'credit_card' && bill.min_payment != null) {
      setCcChooser(bill); // ask which amount was paid
      return;
    }
    payBill(bill, bill.amount);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const today = new Date();
  const income = sumByKind(txns, 'income');
  const expense = sumByKind(txns, 'expense');
  const balance = income - expense;
  const byCat = groupByCategory(txns);
  const maxCat = byCat.length ? byCat[0].total : 0;
  const ringMax = Math.max(lastSpend, expense, 1);
  const sortedBills = sortBills(bills, today);
  const stillToPay = unpaidTotal(bills, today);

  const header = (
    <View style={[styles.headerWrap, { paddingTop: insets.top + spacing.lg }]}>
      {/* YOUR MONEY — glass hero */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <Text style={styles.kicker}>YOUR MONEY</Text>
          <Text style={styles.heroBalance}>{formatAmount(balance)}</Text>
          <Text style={styles.heroSub}>left this month</Text>
        </View>
      </GlassCard>

      {/* MONEY SPENT — glass rings */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <Text style={styles.kicker}>MONEY SPENT</Text>
          <View style={styles.ringRow}>
            <SpendRing
              amount={lastSpend}
              progress={lastSpend / ringMax}
              label="LAST MONTH"
              startColor="#f472b6"
              endColor="#ef4444"
            />
            <SpendRing
              amount={expense}
              progress={expense / ringMax}
              label="THIS MONTH"
              startColor="#8b5cf6"
              endColor="#ec4899"
            />
          </View>
        </View>
      </GlassCard>

      {/* MONTHLY BILLS — glass ledger */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <View style={styles.billsHeader}>
            <Text style={styles.kicker}>MONTHLY BILLS</Text>
            {bills.length > 0 ? (
              <Text style={styles.billsRollup}>
                {stillToPay > 0 ? `${formatAmount(stillToPay)} to pay` : 'All paid 🎉'}
              </Text>
            ) : null}
          </View>

          {sortedBills.length === 0 ? (
            <Text style={styles.billsEmpty}>
              Track electricity, water, internet, cable and credit cards — with due dates.
            </Text>
          ) : (
            <View style={styles.billsList}>
              {sortedBills.map((b) => (
                <BillRow key={b.id} bill={b} onTogglePaid={() => onTogglePaid(b)} onOpen={() => router.push({ pathname: '/bill-new', params: { id: b.id } } as never)} />
              ))}
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.addBillBtn, pressed && styles.pressed]}
            onPress={() => router.push('/bill-new' as never)}
            accessibilityLabel="Add a monthly bill"
          >
            <Ionicons name="add" size={16} color={ACCENT} />
            <Text style={styles.addBillText}>Add bill</Text>
          </Pressable>
          <Text style={styles.disclaimer}>
            Amounts and dates are entered by you for tracking. Refer to your provider’s
            statement for official amounts. Not financial advice.
          </Text>
        </View>
      </GlassCard>

      {/* white sheet top */}
      <View style={styles.sheetTop}>
        <View style={styles.sheetHandle} />
        {isPro ? (
          byCat.length > 0 ? (
            <>
              <Text style={styles.heading}>Where it goes</Text>
              <View style={styles.bars}>
                {byCat.map((c) => {
                  const meta = categoryMeta(c.category);
                  return (
                    <View key={c.category} style={styles.barRow}>
                      <View style={styles.barLabelWrap}>
                        <View style={styles.barIconCircle}>
                          <Ionicons name={meta.icon as any} size={13} color={colors.primary} />
                        </View>
                        <Text style={styles.barLabel} numberOfLines={1}>
                          {meta.label}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.barValue}>{formatAmount(c.total)}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null
        ) : (
          <Pressable
            style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}
            onPress={() => router.push('/paywall')}
          >
            <Ionicons name="star" size={16} color={colors.pro} />
            <Text style={styles.proText}>Pro: see a breakdown of where your money goes</Text>
          </Pressable>
        )}
        <Text style={styles.heading}>Transactions</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} />
      <FlatList
        data={txns}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.sheetBody}>
            <EmptyState
              icon="wallet-outline"
              title="Nothing logged this month"
              subtitle="Track income and expenses to see where your money goes."
              actionTitle="Add a transaction"
              onAction={() => router.push('/money-add')}
            />
          </View>
        }
        renderItem={({ item }) => {
          const meta = categoryMeta(item.category);
          return (
            <View style={styles.sheetBody}>
              <View style={styles.txRow}>
                <View style={styles.txIconCircle}>
                  <Ionicons name={meta.icon as any} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle}>{item.note?.trim() || meta.label}</Text>
                  <Text style={styles.txMeta}>
                    {meta.label} · {item.tx_date}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    item.kind === 'income' ? styles.incomeText : styles.expenseText,
                  ]}
                >
                  {item.kind === 'income' ? '+' : '-'}
                  {formatAmount(item.amount)}
                </Text>
                <Pressable
                  onPress={() => onDeleteTx(item)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                  accessibilityLabel="Delete transaction"
                >
                  <Ionicons name="close" size={18} color={colors.textFaint} />
                </Pressable>
              </View>
            </View>
          );
        }}
        ListFooterComponent={<View style={styles.sheetFooter} />}
        ListFooterComponentStyle={styles.sheetFooterWrap}
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        onPress={() => router.push('/money-add')}
        accessibilityLabel="Add a transaction"
      >
        <Ionicons name="add" size={20} color={colors.onPrimary} />
        <Text style={styles.fabText}>Add</Text>
      </Pressable>

      {/* credit card: which amount did you pay? (in-tree frosted overlay) */}
      {ccChooser ? (
        <Pressable style={styles.ccBackdrop} onPress={() => setCcChooser(null)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.ccSheetWrap}>
            <GlassCard blurTarget={bgRef} plateOpacity={0.75}>
              <View style={styles.cardPad}>
                <Text style={styles.ccTitle}>{ccChooser.name}</Text>
                <Text style={styles.ccSub}>How much did you pay?</Text>
                <Pressable
                  style={({ pressed }) => [styles.ccOption, pressed && styles.pressed]}
                  onPress={() => payBill(ccChooser, ccChooser.min_payment ?? 0)}
                >
                  <Text style={styles.ccOptionLabel}>Minimum due</Text>
                  <Text style={styles.ccOptionAmount}>
                    {formatAmount(ccChooser.min_payment ?? 0)}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.ccOption, pressed && styles.pressed]}
                  onPress={() => payBill(ccChooser, ccChooser.amount)}
                >
                  <Text style={styles.ccOptionLabel}>Statement balance</Text>
                  <Text style={styles.ccOptionAmount}>{formatAmount(ccChooser.amount)}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.ccCancel, pressed && styles.pressed]}
                  onPress={() => setCcChooser(null)}
                >
                  <Text style={styles.ccCancelText}>Cancel</Text>
                </Pressable>
              </View>
            </GlassCard>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

function BillRow({
  bill,
  onTogglePaid,
  onOpen,
}: {
  bill: Bill;
  onTogglePaid: () => void;
  onOpen: () => void;
}) {
  const s = billStatus(bill, new Date());
  const meta = billCategoryMeta(bill.category);
  const isCc = bill.category === 'credit_card';
  const badge = s.paid
    ? { bg: 'rgba(4,120,87,0.12)', fg: '#047857' }
    : s.overdue
      ? { bg: 'rgba(190,18,60,0.14)', fg: '#be123c' }
      : s.dueSoon
        ? { bg: 'rgba(217,119,6,0.16)', fg: '#b45309' }
        : { bg: 'rgba(30,27,75,0.08)', fg: INK_SOFT };

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.billRow,
        s.overdue && styles.billRowOverdue,
        s.paid && styles.billRowPaid,
        pressed && styles.pressed,
      ]}
      accessibilityLabel={`Edit ${bill.name}`}
    >
      <View style={styles.billIcon}>
        <Ionicons name={meta.icon as any} size={16} color={ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.billName} numberOfLines={1}>
          {bill.name}
        </Text>
        <Text style={[styles.billDue, s.overdue && !s.paid && styles.billDueOverdue]}>
          {isCc && bill.min_payment != null && !s.paid
            ? `Min due ${formatAmount(bill.min_payment)} · ${dueLabel(s)}`
            : dueLabel(s)}
        </Text>
      </View>
      <View style={styles.billRight}>
        <Text style={styles.billAmount}>{formatAmount(bill.amount)}</Text>
        {isCc ? <Text style={styles.billAmountSub}>statement</Text> : null}
      </View>
      <View style={[styles.dueBadge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.dueBadgeText, { color: badge.fg }]}>{bill.due_day}</Text>
      </View>
      <Pressable
        onPress={onTogglePaid}
        hitSlop={10}
        style={({ pressed }) => [styles.payBtn, pressed && styles.pressed]}
        accessibilityLabel={s.paid ? `Mark ${bill.name} unpaid` : `Mark ${bill.name} paid`}
      >
        <Ionicons
          name={s.paid ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={s.paid ? '#047857' : INK_SOFT}
        />
      </Pressable>
    </Pressable>
  );
}

const RING = 118;

function SpendRing({
  amount,
  progress,
  label,
  startColor,
  endColor,
}: {
  amount: number;
  progress: number;
  label: string;
  startColor: string;
  endColor: string;
}) {
  return (
    <View style={styles.ringCol}>
      <View style={styles.ringCircle}>
        <View style={styles.ringSvg} pointerEvents="none">
          <ProgressRing
            size={RING}
            strokeWidth={7}
            progress={progress}
            trackColor="rgba(255,255,255,0.9)"
            startColor={startColor}
            endColor={endColor}
          />
        </View>
        <Text style={styles.ringAmount}>{formatAmount(amount)}</Text>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E4DCF7' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: { flexGrow: 1 },
  headerWrap: { paddingHorizontal: spacing.lg, gap: spacing.md },
  cardPad: { padding: spacing.lg },
  kicker: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  heroBalance: {
    color: INK,
    fontFamily: font.display,
    fontSize: 44,
    lineHeight: 50,
    includeFontPadding: false,
    marginTop: 2,
  },
  heroSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 13 },
  ringRow: {
    flexDirection: 'row',
    gap: spacing.xl,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  ringCol: { alignItems: 'center', gap: spacing.sm },
  ringCircle: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: { position: 'absolute', top: 0, left: 0 },
  ringAmount: { color: INK, fontFamily: font.extrabold, fontSize: 16 },
  ringLabel: { color: INK_SOFT, fontFamily: font.bold, fontSize: 11.5, letterSpacing: 0.8 },
  billsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  billsRollup: { color: INK_SOFT, fontFamily: font.bold, fontSize: 12.5 },
  billsEmpty: {
    color: INK_SOFT,
    fontFamily: font.regular,
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  billsList: { gap: spacing.sm, marginTop: spacing.md },
  // faux glass rows — real blur is budgeted to the 3 cards
  billRow: {
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
  billRowOverdue: { borderLeftWidth: 3, borderLeftColor: '#be123c' },
  billRowPaid: { opacity: 0.55 },
  billIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(109,40,217,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  billName: { color: INK, fontFamily: font.semibold, fontSize: 15 },
  billDue: { color: INK_SOFT, fontFamily: font.medium, fontSize: 12, marginTop: 1 },
  billDueOverdue: { color: '#be123c', fontFamily: font.bold },
  billRight: { alignItems: 'flex-end' },
  billAmount: { color: INK, fontFamily: font.bold, fontSize: 15 },
  billAmountSub: { color: INK_SOFT, fontFamily: font.regular, fontSize: 10.5 },
  dueBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueBadgeText: { fontFamily: font.bold, fontSize: 12 },
  payBtn: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addBillBtn: {
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
  addBillText: { color: ACCENT, fontFamily: font.bold, fontSize: 14 },
  disclaimer: {
    color: INK_SOFT,
    fontFamily: font.regular,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.md,
  },
  sheetTop: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
    marginHorizontal: -spacing.lg,
    marginTop: spacing.sm,
  },
  sheetBody: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sheetFooter: { backgroundColor: colors.background, minHeight: 96, flex: 1 },
  sheetFooterWrap: { flexGrow: 1 },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  heading: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.text,
    marginTop: 18,
    marginBottom: 6,
  },
  bars: { gap: spacing.sm },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 110 },
  barIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barLabel: { flex: 1, fontSize: 13, fontFamily: font.regular, color: colors.text },
  barTrack: {
    flex: 1,
    height: 10,
    backgroundColor: colors.surface,
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: { height: 10, backgroundColor: colors.primary, borderRadius: 5 },
  barValue: {
    width: 80,
    textAlign: 'right',
    fontSize: 13,
    fontFamily: font.semibold,
    color: colors.text,
  },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.proSoft,
    borderColor: colors.pro,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: 14,
    minHeight: 44,
    marginTop: spacing.md,
  },
  proText: { flex: 1, color: colors.pro, fontFamily: font.semibold },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  txIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: { fontSize: 15, fontFamily: font.semibold, color: colors.text },
  txMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  txAmount: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  incomeText: { color: colors.success },
  expenseText: { color: colors.danger },
  deleteBtn: {
    minHeight: 44,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  pressed: { opacity: 0.75 },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: colors.onPrimary, fontSize: 16, fontFamily: font.bold },
  ccBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  ccSheetWrap: { width: '100%', maxWidth: 360 },
  ccTitle: { color: INK, fontFamily: font.extrabold, fontSize: 18 },
  ccSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 13.5, marginBottom: spacing.md },
  ccOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 52,
    marginBottom: spacing.sm,
  },
  ccOptionLabel: { color: INK, fontFamily: font.semibold, fontSize: 14.5 },
  ccOptionAmount: { color: ACCENT, fontFamily: font.extrabold, fontSize: 16 },
  ccCancel: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  ccCancelText: { color: INK_SOFT, fontFamily: font.bold, fontSize: 14 },
});
