import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useIsPro } from '../pro/ProProvider';
import {
  listFoodLogs,
  deleteFoodLog,
  getCalorieTarget,
  setCalorieTarget,
  todayString,
  type FoodLog,
} from '../diet/api';

export default function Diet() {
  const router = useRouter();
  const { isPro } = useIsPro();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [target, setTarget] = useState(2000);
  const [targetText, setTargetText] = useState('2000');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([getCalorieTarget(), listFoodLogs(todayString())]);
      setTarget(t);
      setTargetText(String(t));
      setLogs(l);
    } catch (e) {
      Alert.alert('Could not load', String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!isPro) {
        setLoading(false);
        return;
      }
      setLoading(true);
      load();
    }, [isPro, load]),
  );

  async function onSaveTarget() {
    const n = parseInt(targetText, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setTargetText(String(target));
      return;
    }
    setTarget(n);
    try {
      await setCalorieTarget(n);
    } catch (e) {
      Alert.alert('Could not save target', String((e as Error).message ?? e));
    }
  }

  async function onDelete(item: FoodLog) {
    try {
      await deleteFoodLog(item.id);
      setLogs((cur) => cur.filter((l) => l.id !== item.id));
    } catch (e) {
      Alert.alert('Could not delete', String((e as Error).message ?? e));
    }
  }

  if (!isPro) {
    return (
      <View style={styles.upsell}>
        <Text style={styles.upsellEmoji}>🥗</Text>
        <Text style={styles.upsellTitle}>Diet & Calorie Tracker</Text>
        <Text style={styles.upsellText}>
          Track meals, calories and macros against a daily target — a Pro feature.
        </Text>
        <Pressable style={styles.upsellBtn} onPress={() => router.push('/paywall')}>
          <Text style={styles.upsellBtnText}>Upgrade to Pro</Text>
        </Pressable>
      </View>
    );
  }

  const consumed = logs.reduce((s, l) => s + (l.calories || 0), 0);
  const protein = logs.reduce((s, l) => s + (l.protein || 0), 0);
  const carbs = logs.reduce((s, l) => s + (l.carbs || 0), 0);
  const fat = logs.reduce((s, l) => s + (l.fat || 0), 0);
  const remaining = target - consumed;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.summary}>
              <Text style={styles.consumed}>{Math.round(consumed)}</Text>
              <Text style={styles.ofTarget}>of {target} kcal</Text>
              <Text style={[styles.remaining, remaining < 0 && styles.over]}>
                {remaining >= 0 ? `${remaining} left` : `${-remaining} over`}
              </Text>
              <View style={styles.macros}>
                <Macro label="Protein" value={protein} />
                <Macro label="Carbs" value={carbs} />
                <Macro label="Fat" value={fat} />
              </View>
            </View>

            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Daily target (kcal)</Text>
              <TextInput
                style={styles.targetInput}
                keyboardType="number-pad"
                value={targetText}
                onChangeText={setTargetText}
                onEndEditing={onSaveTarget}
                onSubmitEditing={onSaveTarget}
              />
            </View>

            <Text style={styles.todayHeading}>Today</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>No food logged yet. Tap ＋ Add food.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.foodRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.foodName}>{item.name}</Text>
              <Text style={styles.foodMeta}>
                {item.quantity_g ? `${item.quantity_g} g · ` : ''}
                {Math.round(item.calories)} kcal
              </Text>
            </View>
            <Pressable onPress={() => onDelete(item)} hitSlop={8}>
              <Text style={styles.delete}>✕</Text>
            </Pressable>
          </View>
        )}
      />

      <Pressable style={styles.fab} onPress={() => router.push('/food-search')}>
        <Text style={styles.fabText}>＋ Add food</Text>
      </Pressable>
    </View>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{Math.round(value)}g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, gap: 8, paddingBottom: 90 },
  summary: { alignItems: 'center', paddingVertical: 12 },
  consumed: { fontSize: 44, fontWeight: '800', color: '#16a34a' },
  ofTarget: { color: '#666', marginTop: -2 },
  remaining: { marginTop: 4, fontWeight: '700', color: '#2563eb' },
  over: { color: '#ef4444' },
  macros: { flexDirection: 'row', gap: 28, marginTop: 14 },
  macro: { alignItems: 'center' },
  macroValue: { fontSize: 16, fontWeight: '700' },
  macroLabel: { color: '#888', fontSize: 12 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  targetLabel: { fontWeight: '600' },
  targetInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 80,
    textAlign: 'right',
    fontSize: 16,
  },
  todayHeading: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 4 },
  empty: { color: '#888', textAlign: 'center', marginTop: 16 },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 14,
  },
  foodName: { fontSize: 15, fontWeight: '600' },
  foodMeta: { color: '#666', marginTop: 2, fontSize: 13 },
  delete: { color: '#999', fontSize: 18, paddingHorizontal: 4 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    backgroundColor: '#16a34a',
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
  upsell: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  upsellEmoji: { fontSize: 48 },
  upsellTitle: { fontSize: 22, fontWeight: '800' },
  upsellText: { color: '#666', textAlign: 'center' },
  upsellBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  upsellBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
