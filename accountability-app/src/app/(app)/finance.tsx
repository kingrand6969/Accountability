import { useCallback, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsPro } from '../../pro/ProProvider';
import { listMonth, deleteTransaction } from '../../money/api';
import { sumByKind, groupByCategory } from '../../money/compute';
import { categoryMeta, formatAmount } from '../../money/categories';
import type { Transaction } from '../../money/types';
import { EmptyState } from '../../ui/EmptyState';
import { ProgressRing } from '../../ui/ProgressRing';
import { confirmDestructive } from '../../ui/confirm';
import { colors, font, radius, spacing, shadow } from '../../ui/theme';

const INK = '#1e1b4b'; // dark indigo — strong contrast on the lavender gradient

export default function Finance() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isPro } = useIsPro();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [lastSpend, setLastSpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
      const [cur, last] = await Promise.all([listMonth(now), listMonth(prev)]);
      setTxns(cur);
      setLastSpend(sumByKind(last, 'expense'));
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

  function onDelete(item: Transaction) {
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const income = sumByKind(txns, 'income');
  const expense = sumByKind(txns, 'expense');
  const balance = income - expense;
  const byCat = groupByCategory(txns);
  const maxCat = byCat.length ? byCat[0].total : 0;
  const ringMax = Math.max(lastSpend, expense, 1);

  const header = (
    <View>
      {/* glass hero */}
      <View style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.heroLabel}>YOUR MONEY</Text>
        <Text style={styles.heroBalance}>{formatAmount(balance)}</Text>
        <Text style={styles.heroSub}>left this month</Text>

        <Text style={styles.spentLabel}>MONEY SPENT</Text>
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

      {/* white sheet */}
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
      <LinearGradient
        colors={['#c7d2fe', '#a5b4fc', '#a78bfa']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.3, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
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
                    item.kind === 'income' ? styles.income : styles.expense,
                  ]}
                >
                  {item.kind === 'income' ? '+' : '-'}
                  {formatAmount(item.amount)}
                </Text>
                <Pressable
                  onPress={() => onDelete(item)}
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
    </View>
  );
}

const RING = 128;

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
      <View style={styles.ringGlass}>
        <BlurView
          intensity={20}
          tint="light"
          style={[StyleSheet.absoluteFill, { borderRadius: RING / 2 }]}
        />
        <View style={styles.ringSvg} pointerEvents="none">
          <ProgressRing
            size={RING}
            strokeWidth={7}
            progress={progress}
            trackColor="rgba(255,255,255,0.55)"
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
  screen: { flex: 1, backgroundColor: '#a5b4fc' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: { flexGrow: 1 },
  hero: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  heroLabel: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  heroBalance: {
    color: INK,
    fontFamily: font.display,
    fontSize: 44,
    lineHeight: 50,
    includeFontPadding: false,
    marginTop: 2,
  },
  heroSub: { color: '#4338ca', fontFamily: font.medium, fontSize: 13, marginBottom: spacing.lg },
  spentLabel: {
    color: INK,
    fontFamily: font.extrabold,
    fontSize: 13,
    letterSpacing: 1.2,
    marginBottom: spacing.md,
  },
  ringRow: { flexDirection: 'row', gap: spacing.xl, justifyContent: 'center' },
  ringCol: { alignItems: 'center', gap: spacing.sm },
  ringGlass: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSvg: { position: 'absolute', top: 0, left: 0 },
  ringAmount: { color: INK, fontFamily: font.extrabold, fontSize: 17 },
  ringLabel: { color: INK, fontFamily: font.bold, fontSize: 11.5, letterSpacing: 0.8 },
  sheetTop: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
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
  income: { color: colors.success },
  expense: { color: colors.danger },
  deleteBtn: {
    minHeight: 44,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  pressed: { opacity: 0.7 },
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
});
