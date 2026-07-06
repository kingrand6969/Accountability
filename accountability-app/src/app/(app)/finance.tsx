import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsPro } from '../../pro/ProProvider';
import { listMonth, deleteTransaction } from '../../money/api';
import { sumByKind } from '../../money/compute';
import { categoryMeta, formatAmount } from '../../money/categories';
import type { Transaction } from '../../money/types';
import {
  categorySlices,
  categoryTint,
  groupTxnsByDay,
  spendingInsight,
  txTime,
  type CategorySlice,
} from '../../money/insights';
import {
  billCategoryMeta,
  billStatus,
  dueLabel,
  sortBills,
  unpaidTotal,
  type Bill,
} from '../../money/billing';
import { listBills, markBillPaid, unmarkBillPaid } from '../../money/billsApi';
import { AccountsPane, SavingsPane } from '../../money/FinancePanes';
import { EmptyState } from '../../ui/EmptyState';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { DonutChart } from '../../ui/DonutChart';
import { ProgressRing } from '../../ui/ProgressRing';
import { confirmDestructive } from '../../ui/confirm';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing } from '../../ui/theme';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#6d28d9';
const GOOD = '#047857';
const OVER = '#b45309'; // over-pace is amber — red stays reserved for overdue bills
const COL_MAX = 600;

type Row =
  | { type: 'day'; key: string; label: string; net: number }
  | { type: 'tx'; key: string; tx: Transaction };

/** day-of-month from 'YYYY-MM-DD' */
function txDay(t: Transaction): number {
  return parseInt(t.tx_date.slice(8, 10), 10);
}

export default function Finance() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro } = useIsPro();
  const { width: winW } = useWindowDimensions();
  const bgRef = useRef<View>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [lastTxns, setLastTxns] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const [ccChooser, setCcChooser] = useState<Bill | null>(null);
  const paysInFlight = useRef<Set<string>>(new Set());
  // 3-pane swipe: 0 = Banks & wallets, 1 = Overview (default), 2 = Savings
  const [page, setPage] = useState(1);
  const pagerRef = useRef<ScrollView>(null);
  const pagerReady = useRef(false);

  function goToPage(i: number) {
    pagerRef.current?.scrollTo({ x: i * winW, animated: true });
    setPage(i);
  }

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const [cur, last, bs] = await Promise.all([listMonth(now), listMonth(prev), listBills()]);
      setTxns(cur);
      setLastTxns(last);
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
      setCcChooser(bill);
      return;
    }
    payBill(bill, bill.amount);
  }

  const today = new Date();
  const income = sumByKind(txns, 'income');
  const expense = sumByKind(txns, 'expense');
  const balance = income - expense;

  // fair pacing: this month-to-date vs last month THROUGH THE SAME DAY —
  // never a partial month against a full one
  const lastToDate = useMemo(
    () => lastTxns.filter((t) => txDay(t) <= today.getDate()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lastTxns],
  );
  const lastToDateSpend = sumByKind(lastToDate, 'expense');
  const insight = spendingInsight(expense, lastToDateSpend);

  const slices = useMemo(() => categorySlices(txns, lastToDate), [txns, lastToDate]);
  // donut readability: keep big slices, roll <4% into "Other" (max 6 + other)
  const { donutSlices, legend } = useMemo(() => {
    const major = slices.filter((s, i) => s.share >= 4 && i < 6);
    const rest = slices.filter((s) => !major.includes(s));
    const donut: CategorySlice[] = [...major];
    if (rest.length > 0) {
      donut.push({
        category: 'other',
        total: rest.reduce((a, s) => a + s.total, 0),
        share: rest.reduce((a, s) => a + s.share, 0),
        changePct: null,
        changeDir: 'flat',
      });
    }
    return { donutSlices: donut, legend: slices };
  }, [slices]);

  const txRows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const day of groupTxnsByDay(txns, today)) {
      const net = day.items.reduce(
        (a, t) => a + (t.kind === 'income' ? t.amount : -t.amount),
        0,
      );
      out.push({ type: 'day', key: `d-${day.date}`, label: day.label, net });
      for (const t of day.items) out.push({ type: 'tx', key: t.id, tx: t });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txns]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const sortedBills = sortBills(bills, today);
  const stillToPay = unpaidTotal(bills, today);
  const monthLabel = today.toLocaleDateString(undefined, { month: 'long' }).toUpperCase();
  const fabRight = Math.max(spacing.xl, (winW - COL_MAX) / 2 + spacing.xl);
  const paceProgress =
    lastToDateSpend > 0 ? Math.min(1, expense / lastToDateSpend) : 0;
  const underPace = insight.direction !== 'up';

  const panesTop = insets.top + 44; // room for the floating pane tabs

  const header = (
    <View style={[styles.headerWrap, { paddingTop: panesTop }]}>
      {/* HERO — balance, in/out, pacing insight */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <View style={styles.heroTopRow}>
            <Text style={styles.kicker}>YOUR MONEY</Text>
            <Text style={styles.monthTag}>{monthLabel}</Text>
          </View>
          <View style={styles.heroMainRow}>
            <View style={styles.heroBalanceBlock}>
              <Text style={styles.heroBalance}>{formatAmount(balance)}</Text>
              <Text style={styles.heroSub}>left this month</Text>
            </View>
            <View style={styles.heroChips}>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipLabel}>IN</Text>
                <Text style={[styles.heroChipValue, { color: GOOD }]}>
                  +{formatAmount(income)}
                </Text>
              </View>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipLabel}>OUT</Text>
                <Text style={[styles.heroChipValue, { color: '#be123c' }]}>
                  −{formatAmount(expense)}
                </Text>
              </View>
            </View>
          </View>
          {insight.direction !== 'none' ? (
            <>
              <View style={styles.divider} />
              <View style={styles.insightRow}>
                <ProgressRing
                  size={44}
                  strokeWidth={5}
                  progress={paceProgress}
                  trackColor="rgba(255,255,255,0.9)"
                  startColor={underPace ? '#34d399' : '#f59e0b'}
                  endColor={underPace ? '#059669' : '#d97706'}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.insightTitle,
                      { color: insight.direction === 'flat' ? INK : underPace ? GOOD : OVER },
                    ]}
                  >
                    {insight.direction === 'flat'
                      ? 'About the same as last month'
                      : `Spending ${insight.pct}% ${insight.direction === 'up' ? 'higher' : 'lower'} vs last month`}
                  </Text>
                  {insight.direction !== 'flat' ? (
                    <Text style={styles.insightSub}>
                      {formatAmount(Math.abs(insight.diff))}{' '}
                      {insight.diff > 0 ? 'more' : 'less'} than by day {today.getDate()} last
                      month
                    </Text>
                  ) : null}
                </View>
              </View>
            </>
          ) : null}
        </View>
      </GlassCard>

      {/* WHERE IT GOES — category donut + legend with change arrows */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <View style={styles.heroTopRow}>
            <Text style={styles.kicker}>WHERE IT GOES</Text>
            <Text style={styles.monthTag}>vs last month</Text>
          </View>
          <View style={styles.donutRow}>
            <DonutChart
              size={148}
              strokeWidth={14}
              segments={
                isPro
                  ? donutSlices.map((s) => ({ value: s.total, color: categoryTint(s.category) }))
                  : expense > 0
                    ? [{ value: 1, color: ACCENT }]
                    : []
              }
              centerTitle={expense > 0 ? formatAmount(expense) : '0.00'}
              centerSub="this month"
              ink={INK}
            />
            <View style={styles.legendCol}>
              {!isPro ? (
                <Pressable
                  style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}
                  onPress={() => router.push('/paywall')}
                >
                  <Ionicons name="star" size={16} color={colors.pro} />
                  <Text style={styles.proText}>Pro: see where your money goes</Text>
                </Pressable>
              ) : legend.length === 0 ? (
                <Text style={styles.legendEmpty}>
                  Log expenses and your breakdown appears here.
                </Text>
              ) : (
                <>
                  {(allCats ? legend : legend.slice(0, 4)).map((s) => (
                    <View key={s.category} style={styles.legendRow}>
                      <View
                        style={[styles.legendDot, { backgroundColor: categoryTint(s.category) }]}
                      />
                      <Text style={styles.legendLabel} numberOfLines={1}>
                        {categoryMeta(s.category).label}
                      </Text>
                      <Text style={styles.legendAmount}>{formatAmount(s.total)}</Text>
                      {s.changePct === null ? (
                        <Text style={styles.legendNew}>new</Text>
                      ) : s.changeDir === 'flat' ? (
                        <Text style={styles.legendDelta}>—</Text>
                      ) : (
                        <Text
                          style={[
                            styles.legendDelta,
                            { color: s.changeDir === 'down' ? GOOD : OVER },
                          ]}
                        >
                          {s.changeDir === 'down' ? '▼' : '▲'}
                          {s.changePct}%
                        </Text>
                      )}
                    </View>
                  ))}
                  {legend.length > 4 ? (
                    <Pressable
                      onPress={() => setAllCats((v) => !v)}
                      hitSlop={8}
                      accessibilityLabel={allCats ? 'Show fewer categories' : 'Show all categories'}
                    >
                      <Text style={styles.legendMore}>
                        {allCats ? 'Show less' : `+${legend.length - 4} more`}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </View>
      </GlassCard>

      {/* MONTHLY BILLS — unchanged (density benchmark) */}
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
                <BillRow
                  key={b.id}
                  bill={b}
                  onTogglePaid={() => onTogglePaid(b)}
                  onOpen={() =>
                    router.push({ pathname: '/bill-new', params: { id: b.id } } as never)
                  }
                />
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
        <Text style={styles.heading}>Transactions</Text>
      </View>
    </View>
  );

  const overview = (
      <FlatList
        data={txRows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK} />
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={[styles.sheetBody, styles.col]}>
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
          if (item.type === 'day') {
            return (
              <View style={[styles.sheetBody, styles.col]}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayLabel}>{item.label.toUpperCase()}</Text>
                  <Text
                    style={[
                      styles.dayNet,
                      { color: item.net >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    {item.net >= 0 ? '+' : '−'}
                    {formatAmount(Math.abs(item.net))}
                  </Text>
                </View>
              </View>
            );
          }
          const t = item.tx;
          const meta = categoryMeta(t.category);
          const tint = categoryTint(t.category);
          const created = t.created_at ? new Date(t.created_at) : null;
          const sameDay =
            created &&
            `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}` === t.tx_date;
          return (
            <View style={[styles.sheetBody, styles.col]}>
              <View style={styles.txRow}>
                <View style={[styles.txIconCircle, { backgroundColor: `${tint}1F` }]}>
                  <Ionicons name={meta.icon as any} size={15} color={tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle} numberOfLines={1}>
                    {t.note?.trim() || meta.label}
                  </Text>
                  <Text style={styles.txMeta}>
                    {meta.label}
                    {sameDay ? ` · ${txTime(t)}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    t.kind === 'income' ? styles.incomeText : styles.expenseText,
                  ]}
                >
                  {t.kind === 'income' ? '+' : '−'}
                  {formatAmount(t.amount)}
                </Text>
                <Pressable
                  onPress={() => onDeleteTx(t)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.pressed]}
                  accessibilityLabel="Delete transaction"
                >
                  <Ionicons name="close" size={17} color={colors.textFaint} />
                </Pressable>
              </View>
              <View style={styles.txSeparator} />
            </View>
          );
        }}
        ListFooterComponent={<View style={styles.sheetFooter} />}
        ListFooterComponentStyle={styles.sheetFooterWrap}
      />
  );

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} />

      {/* swipe: ← Banks & wallets | Overview | Savings → */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onLayout={() => {
          if (!pagerReady.current) {
            pagerReady.current = true;
            pagerRef.current?.scrollTo({ x: winW, animated: false });
          }
        }}
        onScroll={(e) => {
          const p = Math.round(e.nativeEvent.contentOffset.x / winW);
          if (p !== page && p >= 0 && p <= 2) setPage(p);
        }}
        scrollEventThrottle={64}
        style={{ flex: 1 }}
      >
        <AccountsPane width={winW} topInset={panesTop} blurTarget={bgRef} />
        <View style={{ width: winW }}>{overview}</View>
        <SavingsPane width={winW} topInset={panesTop} blurTarget={bgRef} />
      </ScrollView>

      {/* floating pane tabs */}
      <View style={[styles.paneTabs, { top: insets.top + spacing.xs }]}>
        {['Accounts', 'Overview', 'Savings'].map((label, i) => (
          <Pressable
            key={label}
            onPress={() => goToPage(i)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Show ${label}`}
            accessibilityState={{ selected: page === i }}
            style={({ pressed }) => [
              styles.paneTab,
              page === i && styles.paneTabActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.paneTabText, page === i && styles.paneTabTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {page === 1 ? (
        <Pressable
          style={({ pressed }) => [styles.fab, { right: fabRight }, pressed && styles.pressed]}
          onPress={() => router.push('/money-add')}
          accessibilityLabel="Add a transaction"
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.fabText}>Add</Text>
        </Pressable>
      ) : null}

      {/* credit card: which amount did you pay? */}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E4DCF7' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: { flexGrow: 1 },
  col: { width: '100%', maxWidth: COL_MAX, alignSelf: 'center' },
  headerWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: COL_MAX,
    alignSelf: 'center',
  },
  cardPad: { padding: spacing.lg },
  kicker: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  monthTag: { color: INK_SOFT, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8 },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: 2,
  },
  heroBalanceBlock: { flex: 1, minWidth: 150 },
  heroBalance: {
    color: INK,
    fontFamily: font.display,
    fontSize: 40,
    lineHeight: 46,
    includeFontPadding: false,
  },
  heroSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 12.5 },
  heroChips: { gap: 6, alignItems: 'flex-end', paddingBottom: 2 },
  heroChip: { alignItems: 'flex-end' },
  heroChipLabel: {
    color: INK_SOFT,
    fontFamily: font.bold,
    fontSize: 10.5,
    letterSpacing: 0.8,
  },
  heroChipValue: { fontFamily: font.extrabold, fontSize: 15 },
  divider: { height: 1, backgroundColor: 'rgba(30,27,75,0.08)', marginVertical: spacing.md },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  insightTitle: { fontFamily: font.bold, fontSize: 14 },
  insightSub: { color: INK_SOFT, fontFamily: font.regular, fontSize: 12, marginTop: 1 },
  donutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap', // narrow phones: legend drops below the donut, labels stay whole
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  legendCol: { flex: 1, gap: spacing.sm, minWidth: 190 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 26 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { flex: 1, color: INK, fontFamily: font.medium, fontSize: 13 },
  legendAmount: { color: INK, fontFamily: font.bold, fontSize: 13.5 },
  legendDelta: { fontFamily: font.bold, fontSize: 11, color: INK_SOFT, width: 44, textAlign: 'right' },
  legendNew: {
    fontFamily: font.bold,
    fontSize: 10,
    color: ACCENT,
    backgroundColor: 'rgba(109,40,217,0.10)',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  legendMore: { color: ACCENT, fontFamily: font.bold, fontSize: 12.5, paddingVertical: 4 },
  legendEmpty: { color: INK_SOFT, fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
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
    fontSize: 10.5,
    lineHeight: 14,
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
  sheetBody: { backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  sheetFooter: { backgroundColor: colors.background, minHeight: 130, flex: 1 },
  // footer must share the 600px column, or the white slab spills full-width
  sheetFooterWrap: { flexGrow: 1, width: '100%', maxWidth: COL_MAX, alignSelf: 'center' },
  paneTabs: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    padding: 3,
  },
  paneTab: {
    paddingHorizontal: 14,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  paneTabActive: { backgroundColor: '#fff' },
  paneTabText: { color: INK_SOFT, fontFamily: font.semibold, fontSize: 12.5 },
  paneTabTextActive: { color: INK, fontFamily: font.bold },
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
    marginTop: spacing.sm,
    marginBottom: 2,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 4,
  },
  dayLabel: {
    fontFamily: font.extrabold,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.8,
  },
  dayNet: { fontFamily: font.bold, fontSize: 12 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
  },
  txIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: { fontSize: 15, fontFamily: font.semibold, color: colors.text },
  txMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: font.regular,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  txAmount: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  txSeparator: { height: 1, backgroundColor: colors.surface, marginLeft: 42 },
  incomeText: { color: colors.success },
  expenseText: { color: colors.danger },
  deleteBtn: {
    minHeight: 44,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
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
  },
  proText: { flex: 1, color: colors.pro, fontFamily: font.semibold, fontSize: 13 },
  pressed: { opacity: 0.75 },
  fab: {
    position: 'absolute',
    bottom: 104,
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
