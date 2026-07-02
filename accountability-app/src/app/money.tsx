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
import { useIsPro } from '../pro/ProProvider';
import { listMonth, deleteTransaction } from '../money/api';
import { sumByKind, groupByCategory } from '../money/compute';
import { categoryMeta, formatAmount } from '../money/categories';
import type { Transaction } from '../money/types';
import { EmptyState } from '../ui/EmptyState';
import { colors, font, radius, spacing, shadow } from '../ui/theme';

export default function Money() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setTxns(await listMonth(new Date()));
    } catch (e) {
      Alert.alert('Could not load', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
  }

  function onDelete(item: Transaction) {
    Alert.alert(
      'Delete this transaction?',
      `${categoryMeta(item.category).label} · ${formatAmount(item.amount)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTransaction(item.id);
              setTxns((cur) => cur.filter((t) => t.id !== item.id));
            } catch (e) {
              Alert.alert('Could not delete', String((e as Error).message ?? e));
            }
          },
        },
      ],
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

  return (
    <View style={styles.screen}>
      <FlatList
        data={txns}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.summary}>
              <View style={styles.sumCol}>
                <Text style={styles.sumLabel}>Income</Text>
                <Text style={[styles.sumValue, styles.income]}>{formatAmount(income)}</Text>
              </View>
              <View style={styles.sumCol}>
                <Text style={styles.sumLabel}>Expenses</Text>
                <Text style={[styles.sumValue, styles.expense]}>{formatAmount(expense)}</Text>
              </View>
              <View style={styles.sumCol}>
                <Text style={styles.sumLabel}>Balance</Text>
                <Text style={[styles.sumValue, balance < 0 && styles.expense]}>
                  {formatAmount(balance)}
                </Text>
              </View>
            </View>
            <Text style={styles.monthNote}>This month</Text>

            <Text style={styles.heading}>Where it goes</Text>
            {isPro ? (
              byCat.length === 0 ? (
                <Text style={styles.empty}>No expenses yet this month.</Text>
              ) : (
                <View style={styles.bars}>
                  {byCat.map((c) => {
                    const meta = categoryMeta(c.category);
                    return (
                      <View key={c.category} style={styles.barRow}>
                        <View style={styles.barLabelWrap}>
                          <View style={styles.barIconCircle}>
                            <Ionicons
                              name={meta.icon as any}
                              size={13}
                              color={colors.primary}
                            />
                          </View>
                          <Text style={styles.barLabel} numberOfLines={1}>
                            {meta.label}
                          </Text>
                        </View>
                        <View style={styles.barTrack}>
                          <View
                            style={[styles.barFill, { width: `${maxCat ? (c.total / maxCat) * 100 : 0}%` }]}
                          />
                        </View>
                        <Text style={styles.barValue}>{formatAmount(c.total)}</Text>
                      </View>
                    );
                  })}
                </View>
              )
            ) : (
              <Pressable
                style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}
                onPress={() => router.push('/paywall')}
              >
                <Ionicons name="star" size={16} color={colors.pro} />
                <Text style={styles.proText}>
                  Pro: see a breakdown of where your money goes
                </Text>
              </Pressable>
            )}

            <Text style={styles.heading}>Transactions</Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="wallet-outline"
            title="Nothing logged this month"
            subtitle="Track income and expenses to see where your money goes."
            actionTitle="Add a transaction"
            onAction={() => router.push('/money-add')}
          />
        }
        renderItem={({ item }) => {
          const meta = categoryMeta(item.category);
          return (
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
              <Text style={[styles.txAmount, item.kind === 'income' ? styles.income : styles.expense]}>
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
          );
        }}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 90 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  sumCol: { alignItems: 'center', flex: 1 },
  sumLabel: { color: colors.textFaint, fontSize: 12, fontFamily: font.medium },
  sumValue: { fontSize: 17, fontFamily: font.extrabold, color: colors.text, marginTop: 2 },
  income: { color: colors.success },
  expense: { color: colors.danger },
  monthNote: {
    color: colors.textFaint,
    fontSize: 12,
    fontFamily: font.medium,
    textAlign: 'center',
    marginTop: 6,
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
  },
  proText: { flex: 1, color: colors.pro, fontFamily: font.semibold },
  empty: {
    color: colors.textFaint,
    fontFamily: font.regular,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
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
