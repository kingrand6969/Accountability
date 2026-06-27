import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useIsPro } from '../pro/ProProvider';
import { listMonth, deleteTransaction } from '../money/api';
import { sumByKind, groupByCategory } from '../money/compute';
import { categoryMeta, formatAmount } from '../money/categories';
import type { Transaction } from '../money/types';

export default function Money() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setTxns(await listMonth(new Date()));
    } catch (e) {
      Alert.alert('Could not load', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  async function onDelete(item: Transaction) {
    try {
      await deleteTransaction(item.id);
      setTxns((cur) => cur.filter((t) => t.id !== item.id));
    } catch (e) {
      Alert.alert('Could not delete', String((e as Error).message ?? e));
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
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
                        <Text style={styles.barLabel}>
                          {meta.emoji} {meta.label}
                        </Text>
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
              <Pressable style={styles.proCard} onPress={() => router.push('/paywall')}>
                <Text style={styles.proText}>
                  ⭐ Pro: see a breakdown of where your money goes
                </Text>
              </Pressable>
            )}

            <Text style={styles.heading}>Transactions</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Nothing logged this month. Tap ＋ Add.</Text>
        }
        renderItem={({ item }) => {
          const meta = categoryMeta(item.category);
          return (
            <View style={styles.txRow}>
              <Text style={styles.txEmoji}>{meta.emoji}</Text>
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
              <Pressable onPress={() => onDelete(item)} hitSlop={8}>
                <Text style={styles.delete}>✕</Text>
              </Pressable>
            </View>
          );
        }}
      />

      <Pressable style={styles.fab} onPress={() => router.push('/money-add')}>
        <Text style={styles.fabText}>＋ Add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, gap: 8, paddingBottom: 90 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f9',
    borderRadius: 14,
    padding: 16,
    marginTop: 4,
  },
  sumCol: { alignItems: 'center', flex: 1 },
  sumLabel: { color: '#888', fontSize: 12 },
  sumValue: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  income: { color: '#16a34a' },
  expense: { color: '#ef4444' },
  monthNote: { color: '#888', fontSize: 12, textAlign: 'center', marginTop: 6 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  bars: { gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { width: 110, fontSize: 13 },
  barTrack: { flex: 1, height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, backgroundColor: '#2563eb', borderRadius: 5 },
  barValue: { width: 80, textAlign: 'right', fontSize: 13, fontWeight: '600' },
  proCard: {
    backgroundColor: '#fffbe6',
    borderColor: '#f0c000',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  proText: { color: '#b58900', fontWeight: '600' },
  empty: { color: '#888', textAlign: 'center', marginVertical: 12 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 12,
  },
  txEmoji: { fontSize: 22 },
  txTitle: { fontSize: 15, fontWeight: '600' },
  txMeta: { color: '#666', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  txAmount: { fontSize: 15, fontWeight: '700' },
  delete: { color: '#999', fontSize: 18, paddingHorizontal: 4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    backgroundColor: '#2563eb',
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
