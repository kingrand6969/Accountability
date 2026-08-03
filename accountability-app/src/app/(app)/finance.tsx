import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useIsPro } from '../../pro/ProProvider';
import { listMonth, deleteTransaction, getIncomeTrend, type IncomeMonth } from '../../money/api';
import { IncomeTrend } from '../../money/IncomeTrend';
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
import { buildFinanceInsights } from '../../money/financeInsights';
import {
  billCategoryMeta,
  billStatus,
  dueLabel,
  sortBills,
  unpaidTotal,
  billAttentionTotal,
  type Bill,
} from '../../money/billing';
import { listBills, markBillPaid, unmarkBillPaid } from '../../money/billsApi';
import { AccountsPane, SavingsPane } from '../../money/FinancePanes';
import { listSavings, type SavingsGoal } from '../../money/accountsApi';
import {
  buildFriendlyFinanceSummary,
  FriendlyFinanceHeader,
} from '../../money/FinanceFriendly';
import { BusinessPane } from '../../business/BusinessPane';
import { EmptyState } from '../../ui/EmptyState';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { contentMaxWidth } from '../../ui/responsive';
import { DonutChart } from '../../ui/DonutChart';
import { confirmDestructive } from '../../ui/confirm';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing } from '../../ui/theme';
import { tabBarContentHeight } from '../../ui/floatingTabBar';

const INK = '#1e1b4b';
const INK_SOFT = 'rgba(30,27,75,0.72)';
const ACCENT = '#2563eb';
const GOOD = '#047857';
const OVER = '#b45309'; // over-pace is amber — red stays reserved for overdue bills
const COL_MAX = 600;
const FINANCE_MODE_KEY = 'accountability:finance-mode:v1';
type FinanceMode = 'friendly' | 'accounting';

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
  const { width: winW, fontScale } = useWindowDimensions();
  const colMax = contentMaxWidth(winW);
  const bgRef = useRef<View>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [lastTxns, setLastTxns] = useState<Transaction[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [savings, setSavings] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allCats, setAllCats] = useState(false);
  const [trend, setTrend] = useState<IncomeMonth[]>([]);
  const [ccChooser, setCcChooser] = useState<Bill | null>(null);
  const [financeMode, setFinanceMode] = useState<FinanceMode>('friendly');
  const paysInFlight = useRef<Set<string>>(new Set());
  const billAttemptKeys = useRef<Map<string, string>>(new Map());
  const loadGeneration = useRef(0);
  // month backtracker (Pro): first-of-month; defaults to this month
  const [selMonth, setSelMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  // 4-pane swipe: 0 = Banks & wallets, 1 = Overview (default), 2 = Savings, 3 = Business
  const [page, setPage] = useState(1);
  const [paneTabsHeight, setPaneTabsHeight] = useState(44);
  const pagerRef = useRef<ScrollView>(null);
  const pagerReady = useRef(false);
  const monthScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(FINANCE_MODE_KEY)
      .then((value) => {
        if (live && (value === 'friendly' || value === 'accounting')) setFinanceMode(value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function changeFinanceMode(mode: FinanceMode) {
    setFinanceMode(mode);
    AsyncStorage.setItem(FINANCE_MODE_KEY, mode).catch(() => {});
  }

  function goToPage(i: number) {
    pagerRef.current?.scrollTo({ x: i * winW, animated: true });
    setPage(i);
  }

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    const isCurrent = () => loadGeneration.current === generation;
    try {
      const prev = new Date(selMonth.getFullYear(), selMonth.getMonth() - 1, 15);
      const [cur, last, bs, savingGoals] = await Promise.all([
        listMonth(selMonth),
        listMonth(prev),
        listBills(),
        listSavings().catch(() => []),
      ]);
      if (!isCurrent()) return;
      setTxns(cur);
      setLastTxns(last);
      setBills(bs);
      setSavings(savingGoals);
      // Pro-only 12-month income chart — never fetched for free members
      if (isPro) {
        getIncomeTrend(12)
          .then((value) => {
            if (isCurrent()) setTrend(value);
          })
          .catch(() => {
            if (isCurrent()) setTrend([]);
          });
      } else {
        if (!isCurrent()) return;
        setTrend([]);
      }
    } catch (e) {
      if (!isCurrent()) return;
      Alert.alert('Could not load', String((e as Error).message ?? e));
    } finally {
      if (!isCurrent()) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [selMonth, isPro]);

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
      const key = billAttemptKeys.current.get(bill.id) ?? Crypto.randomUUID();
      billAttemptKeys.current.set(bill.id, key);
      await markBillPaid(bill, amount, key);
      billAttemptKeys.current.delete(bill.id);
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
  const isCurrentMonth =
    selMonth.getFullYear() === today.getFullYear() && selMonth.getMonth() === today.getMonth();

  // last 12 months (oldest → newest), for the Pro backtracker strip
  const months: Date[] = [];
  for (let i = 11; i >= 0; i--) {
    months.push(new Date(today.getFullYear(), today.getMonth() - i, 1));
  }
  function onSelectMonth(m: Date) {
    const cur = m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
    if (!cur && !isPro) {
      router.push('/paywall');
      return;
    }
    setSelMonth(m);
  }
  function stepMonth(delta: number) {
    onSelectMonth(new Date(selMonth.getFullYear(), selMonth.getMonth() + delta, 1));
  }
  const selMonthKey = `${selMonth.getFullYear()}-${selMonth.getMonth()}`;
  // keep the selected pill in view (arrows drive it; the strip itself can't be
  // dragged reliably — it's nested in the horizontal pane-swiper)
  useEffect(() => {
    const idx = months.findIndex(
      (m) => m.getFullYear() === selMonth.getFullYear() && m.getMonth() === selMonth.getMonth(),
    );
    if (idx >= 0) {
      requestAnimationFrame(() =>
        monthScrollRef.current?.scrollTo({ x: Math.max(0, (idx - 2) * 74), animated: true }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selMonthKey]);

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

  // private, on-device smart insights (the pacing line lives in the hero)
  const smartInsights = useMemo(
    () => (isCurrentMonth ? buildFinanceInsights({ cur: txns, last: lastTxns, bills, today }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [txns, lastTxns, bills, isCurrentMonth],
  ).slice(0, 2);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const sortedBills = sortBills(bills, today);
  const stillToPay = unpaidTotal(bills, today);
  const needsAttention = billAttentionTotal(bills, today);
  const totalSaved = savings.reduce((sum, goal) => sum + goal.saved, 0);
  const monthLabel = selMonth
    .toLocaleDateString(undefined, {
      month: 'long',
      year: isCurrentMonth ? undefined : 'numeric',
    })
    .toUpperCase();
  const fabRight = Math.max(spacing.xl, (winW - colMax) / 2 + spacing.xl);
  const fabBottom = tabBarContentHeight(fontScale) + insets.bottom + spacing.sm;
  const underPace = insight.direction !== 'up';

  const largeText = fontScale >= 1.75;
  const financeBottomClearance = fabBottom + (largeText ? 112 : 88);
  const compactTabLabels = fontScale >= 1.25;
  const panesTop = insets.top + spacing.xs + paneTabsHeight + spacing.xs;

  const accountingHeader = (
    <View style={[styles.headerWrap, { maxWidth: colMax, paddingTop: panesTop }]}>
      {/* month backtracker (Pro) — arrows step; strip scrolls to follow */}
      <View style={styles.monthNav}>
        <Pressable
          onPress={() => stepMonth(-1)}
          hitSlop={8}
          style={({ pressed }) => [styles.monthArrow, pressed && styles.pressed]}
          accessibilityLabel="Previous month"
        >
          <Ionicons name="chevron-back" size={18} color={INK} />
        </Pressable>
        <ScrollView
          ref={monthScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.monthStrip}
          style={styles.monthStripScroll}
        >
          {months.map((m) => {
          const active =
            m.getFullYear() === selMonth.getFullYear() && m.getMonth() === selMonth.getMonth();
          const cur =
            m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
          const locked = !cur && !isPro;
          return (
            <Pressable
              key={`${m.getFullYear()}-${m.getMonth()}`}
              onPress={() => onSelectMonth(m)}
              style={[styles.monthPill, active && styles.monthPillActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            >
              {locked ? (
                <Ionicons name="lock-closed" size={10} color={INK_SOFT} />
              ) : null}
              <Text style={[styles.monthPillText, active && styles.monthPillTextActive]}>
                {m.toLocaleDateString(undefined, {
                  month: 'short',
                  year: m.getFullYear() === today.getFullYear() ? undefined : '2-digit',
                })}
              </Text>
            </Pressable>
          );
          })}
        </ScrollView>
        <Pressable
          onPress={() => stepMonth(1)}
          disabled={isCurrentMonth}
          hitSlop={8}
          style={({ pressed }) => [
            styles.monthArrow,
            isCurrentMonth && styles.monthArrowDim,
            pressed && styles.pressed,
          ]}
          accessibilityLabel="Next month"
        >
          <Ionicons name="chevron-forward" size={18} color={INK} />
        </Pressable>
      </View>

      {/* HERO — balance, in/out, pacing insight */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <View style={[styles.heroTopRow, largeText && styles.heroTopRowLargeText]}>
            <Text style={styles.kicker}>YOUR MONEY</Text>
            <View style={[styles.heroTopActions, largeText && styles.heroTopActionsLargeText]}>
              <Pressable
                onPress={() =>
                  changeFinanceMode(financeMode === 'friendly' ? 'accounting' : 'friendly')
                }
                style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${financeMode === 'friendly' ? 'Accounting' : 'Friendly'} mode`}
              >
                <Ionicons
                  name={financeMode === 'friendly' ? 'happy-outline' : 'calculator-outline'}
                  size={13}
                  color={INK}
                />
                <Text style={styles.modeButtonText}>
                  {financeMode === 'friendly' ? 'Friendly' : 'Accounting'}
                </Text>
              </Pressable>
              <Text style={styles.monthTag}>{monthLabel}</Text>
            </View>
          </View>
          <View style={styles.heroMainRow}>
            <View style={styles.heroBalanceBlock}>
              <Text style={styles.heroBalance}>{formatAmount(balance)}</Text>
              <Text style={styles.heroSub}>
                {isCurrentMonth ? 'left this month' : 'net that month'}
              </Text>
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
          {isCurrentMonth && insight.direction !== 'none' ? (
            <>
              <View style={styles.divider} />
              <View style={styles.insightRow}>
                {/* trend chip — the circle meter lives on the Track consistency dial only */}
                <View
                  style={[
                    styles.insightIcon,
                    { backgroundColor: underPace ? 'rgba(4,120,87,0.12)' : 'rgba(180,83,9,0.14)' },
                  ]}
                >
                  <Ionicons
                    name={
                      insight.direction === 'flat'
                        ? 'remove-outline'
                        : insight.direction === 'up'
                          ? 'trending-up'
                          : 'trending-down'
                    }
                    size={20}
                    color={insight.direction === 'flat' ? INK : underPace ? GOOD : OVER}
                  />
                </View>
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
          <View style={[styles.heroTopRow, largeText && styles.heroTopRowLargeText]}>
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
              centerSub={isCurrentMonth ? 'this month' : 'spent'}
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

      {/* INCOME TREND — 12 months at a glance (Pro) */}
      <GlassCard blurTarget={bgRef}>
        <View style={styles.cardPad}>
          <View style={[styles.heroTopRow, largeText && styles.heroTopRowLargeText]}>
            <Text style={styles.kicker}>INCOME TREND</Text>
            <Text style={styles.monthTag}>last 12 months</Text>
          </View>
          {isPro ? (
            <IncomeTrend
              data={trend}
              accent={GOOD}
              ink={INK}
              inkSoft={INK_SOFT}
              formatAmount={formatAmount}
            />
          ) : (
            <Pressable
              style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}
              onPress={() => router.push('/paywall')}
            >
              <Ionicons name="star" size={16} color={colors.pro} />
              <Text style={styles.proText}>Pro: see your income trend over 12 months</Text>
            </Pressable>
          )}
        </View>
      </GlassCard>

      {/* SMART INSIGHT — private, computed from your own numbers */}
      {isCurrentMonth && smartInsights.length > 0 ? (
        <GlassCard blurTarget={bgRef}>
          <View style={styles.cardPad}>
            <View style={styles.insightHead}>
              <Ionicons name="sparkles" size={14} color={ACCENT} />
              <Text style={styles.kicker}>SMART INSIGHT</Text>
            </View>
            <View style={styles.insightList}>
              {smartInsights.map((si) => {
                const tone = si.tone === 'good' ? GOOD : si.tone === 'warn' ? OVER : INK;
                return (
                  <View key={si.key} style={styles.smartRow}>
                    <View style={[styles.smartIcon, { backgroundColor: `${tone}1A` }]}>
                      <Ionicons name={si.icon as never} size={15} color={tone} />
                    </View>
                    <Text style={styles.smartText}>{si.text}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.smartNote}>Computed on your device — nothing is sent anywhere.</Text>
          </View>
        </GlassCard>
      ) : null}

      {/* MONTHLY BILLS — current month only (bills are current templates) */}
      {isCurrentMonth ? (
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
      ) : null}

      {/* white sheet top */}
      <View style={styles.sheetTop}>
        <View style={styles.sheetHandle} />
        <Text style={styles.heading}>Transactions</Text>
      </View>
    </View>
  );

  const friendlySummary = buildFriendlyFinanceSummary({
    available: balance,
    spent: expense,
    saved: totalSaved,
    needsAttention,
  });
  const friendlyInsight =
    smartInsights[0]?.text ??
    (txns.length === 0 ? 'Add your first transaction and your monthly picture will appear here.' : null);
  const friendlyHeader = (
    <View style={[styles.friendlyHeaderWrap, { maxWidth: colMax, paddingTop: panesTop }]}>
      <FriendlyFinanceHeader
        summary={friendlySummary}
        monthLabel={monthLabel}
        insight={friendlyInsight}
        onSwitchMode={() => changeFinanceMode('accounting')}
        actions={[
          {
            label: 'Add money activity',
            detail: 'Record income or spending',
            icon: 'add-circle-outline',
            onPress: () => router.push('/money-add'),
          },
          {
            label: 'Review bills',
            detail:
              needsAttention > 0
                ? `${formatAmount(needsAttention)} overdue or due within 3 days`
                : 'Nothing overdue or due in the next 3 days',
            icon: 'calendar-outline',
            onPress: () => changeFinanceMode('accounting'),
          },
          {
            label: 'Grow a savings goal',
            detail:
              savings.length > 0
                ? `${savings.length} active goal${savings.length === 1 ? '' : 's'}`
                : 'Start with any amount',
            icon: 'leaf-outline',
            onPress: () => goToPage(2),
          },
          {
            label: 'See accounts and debts',
            detail: 'Banks, wallets, cards and IOUs',
            icon: 'wallet-outline',
            onPress: () => goToPage(0),
          },
        ]}
      />
    </View>
  );

  const overview = (
      <FlatList
        data={txRows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={[styles.listContent, { paddingBottom: financeBottomClearance }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK} />
        }
        ListHeaderComponent={financeMode === 'friendly' ? friendlyHeader : accountingHeader}
        ListEmptyComponent={
          <View style={[styles.sheetBody, styles.col, { maxWidth: colMax }]}>
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
              <View style={[styles.sheetBody, styles.col, { maxWidth: colMax }]}>
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
            <View style={[styles.sheetBody, styles.col, { maxWidth: colMax }]}>
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
        ListFooterComponentStyle={[styles.sheetFooterWrap, { maxWidth: colMax }]}
      />
  );

  return (
    <View style={[styles.screen, financeMode === 'friendly' && styles.screenFriendly]}>
      {financeMode === 'accounting' ? <GlassBackdrop ref={bgRef} columnWidth={colMax} /> : null}

      {/* swipe: ← Banks & wallets | Overview | Savings | Business → */}
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
          if (p !== page && p >= 0 && p <= 3) setPage(p);
        }}
        scrollEventThrottle={64}
        style={{ flex: 1 }}
      >
        <AccountsPane width={winW} topInset={panesTop} blurTarget={bgRef} />
        <View style={{ width: winW }}>{overview}</View>
        <SavingsPane width={winW} topInset={panesTop} blurTarget={bgRef} />
        <BusinessPane width={winW} topInset={panesTop} />
      </ScrollView>

      {/* floating pane tabs */}
      <View
        onLayout={(event) => setPaneTabsHeight(event.nativeEvent.layout.height)}
        style={[styles.paneTabs, { top: insets.top + spacing.xs }]}
      >
        {(financeMode === 'friendly'
          ? ['Accounts', 'Today', 'Goals', 'Work']
          : ['Accounts', 'Overview', 'Savings', 'Business']
        ).map((label, i) => {
          const visualLabel =
            compactTabLabels && label === 'Accounts' ? 'Banks'
              : compactTabLabels && label === 'Overview' ? 'Summary'
                : compactTabLabels && label === 'Savings' ? 'Save'
                  : compactTabLabels && label === 'Business' ? 'Work'
                    : label;
          return (
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
            <Text
              numberOfLines={2}
              style={[styles.paneTabText, page === i && styles.paneTabTextActive]}
            >
              {visualLabel}
            </Text>
          </Pressable>
          );
        })}
      </View>

      {page === 1 ? (
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            { right: fabRight, bottom: fabBottom },
            pressed && styles.pressed,
          ]}
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
  screenFriendly: { backgroundColor: colors.cream },
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
  friendlyHeaderWrap: {
    width: '100%',
    alignSelf: 'center',
    backgroundColor: colors.cream,
  },
  cardPad: { padding: spacing.lg },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthArrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDim: { opacity: 0.35 },
  monthStripScroll: { flex: 1 },
  monthStrip: { gap: 7, paddingHorizontal: 4, alignItems: 'center' },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 15,
    minHeight: 44,
  },
  monthPillActive: { backgroundColor: '#fff', borderColor: ACCENT },
  monthPillText: { color: INK_SOFT, fontFamily: font.bold, fontSize: 12.5, letterSpacing: 0.3 },
  monthPillTextActive: { color: ACCENT },
  kicker: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  monthTag: { color: INK_SOFT, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8 },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTopRowLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  heroTopActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroTopActionsLargeText: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  modeButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.64)',
    borderWidth: 1,
    borderColor: 'rgba(30,27,75,0.10)',
  },
  modeButtonText: { color: INK, fontFamily: font.bold, fontSize: 11 },
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
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    backgroundColor: 'rgba(37,99,235,0.10)',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  legendMore: {
    minHeight: 44,
    textAlignVertical: 'center',
    color: ACCENT,
    fontFamily: font.bold,
    fontSize: 12.5,
    paddingVertical: 12,
  },
  legendEmpty: { color: INK_SOFT, fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightList: { gap: spacing.sm, marginTop: spacing.md },
  smartRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smartIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartText: { flex: 1, color: INK, fontFamily: font.semibold, fontSize: 13.5, lineHeight: 18 },
  smartNote: { color: INK_SOFT, fontFamily: font.regular, fontSize: 10.5, marginTop: spacing.md },
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
    backgroundColor: 'rgba(37,99,235,0.10)',
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
  payBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.pill,
    padding: 3,
  },
  paneTab: {
    flex: 1,
    paddingHorizontal: 4,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  paneTabActive: { backgroundColor: '#fff' },
  paneTabText: {
    color: INK_SOFT,
    fontFamily: font.semibold,
    fontSize: 12.5,
    textAlign: 'center',
  },
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
