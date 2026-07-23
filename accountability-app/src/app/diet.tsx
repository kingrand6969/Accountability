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
import { Ionicons } from '@expo/vector-icons';
import { useIsPro } from '../pro/ProProvider';
import {
  listFoodLogs,
  addFoodLog,
  deleteFoodLog,
  getCalorieTarget,
  setCalorieTarget,
  todayString,
  type FoodLog,
} from '../diet/api';
import { scanFood, type FoodItem, type FoodScan } from '../scan/api';
import { FoodScanSheet } from '../scan/FoodScanSheet';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

export default function Diet() {
  const router = useRouter();
  const { isPro, loading: proLoading } = useIsPro();
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [target, setTarget] = useState(2000);
  const [targetText, setTargetText] = useState('2000');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<FoodScan | null>(null);
  const [savingScan, setSavingScan] = useState(false);

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

  /** Photo → estimated items. Nothing is logged until the member confirms. */
  async function onScanMeal() {
    setScanning(true);
    try {
      const out = await scanFood(true);
      if (!out) return; // cancelled the camera
      setScanResult(out.scan);
      if (out.scan.items.length > 0) {
        showToast(`${out.limit - out.used} scan${out.limit - out.used === 1 ? '' : 's'} left this month`);
      }
    } catch (e) {
      const err = e as Error & { upgrade?: boolean };
      if (err.upgrade) {
        Alert.alert('Pro feature', err.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'See Pro', onPress: () => router.push('/paywall') },
        ]);
      } else {
        Alert.alert('Could not scan', err.message);
      }
    } finally {
      setScanning(false);
    }
  }

  async function saveScannedItems(items: FoodItem[]) {
    setSavingScan(true);
    try {
      const day = todayString();
      for (const it of items) {
        await addFoodLog({
          name: it.name,
          calories: Math.round(it.kcal || 0),
          protein: Math.round(it.protein || 0),
          carbs: Math.round(it.carbs || 0),
          fat: Math.round(it.fat || 0),
          quantity_g: Math.round(it.grams || 0),
          log_date: day,
        });
      }
      setScanResult(null);
      showToast(`Added ${items.length} item${items.length === 1 ? '' : 's'}`);
      await load();
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSavingScan(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (proLoading) return; // wait until Pro status is known
      if (!isPro) {
        setLoading(false);
        return;
      }
      setLoading(true);
      load();
    }, [isPro, proLoading, load]),
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
      showToast('Daily target saved');
    } catch (e) {
      Alert.alert('Could not save target', String((e as Error).message ?? e));
    }
  }

  function onDelete(item: FoodLog) {
    Alert.alert('Remove this food?', `${item.name} · ${Math.round(item.calories)} kcal`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFoodLog(item.id);
            setLogs((cur) => cur.filter((l) => l.id !== item.id));
          } catch (e) {
            Alert.alert('Could not delete', String((e as Error).message ?? e));
          }
        },
      },
    ]);
  }

  if (proLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isPro) {
    return (
      <View style={styles.upsell}>
        <View style={styles.upsellIconCircle}>
          <Ionicons name="nutrition-outline" size={48} color={colors.pro} />
        </View>
        <Text style={styles.upsellTitle}>Diet & Calorie Tracker</Text>
        <Text style={styles.upsellText}>
          Track meals, calories and macros against a daily target — a Pro feature.
        </Text>
        <Button
          title="Upgrade to Pro"
          onPress={() => router.push('/paywall')}
          style={styles.upsellBtn}
        />
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
        <ActivityIndicator size="large" color={colors.primary} />
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
                placeholderTextColor={colors.textFaint}
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
          <EmptyState
            icon="nutrition-outline"
            title="No food logged yet"
            subtitle="Search a food or add one manually to start tracking."
            actionTitle="Add food"
            onAction={() => router.push('/food-search')}
          />
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
            <Pressable
              onPress={() => onDelete(item)}
              hitSlop={8}
              accessibilityLabel={`Remove ${item.name}`}
              style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
        )}
      />

      <View style={styles.fabRow}>
        <Pressable
          style={({ pressed }) => [styles.scanFab, scanning && styles.fabBusy, pressed && styles.pressed]}
          onPress={onScanMeal}
          disabled={scanning}
          accessibilityRole="button"
          accessibilityLabel="Scan a meal with the camera"
        >
          {scanning ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <>
              <Ionicons name="camera" size={19} color={colors.primary} />
              <Text style={styles.scanFabText}>Scan meal</Text>
            </>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
          onPress={() => router.push('/food-search')}
          accessibilityRole="button"
          accessibilityLabel="Add food"
        >
          <Ionicons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.fabText}>Add food</Text>
        </Pressable>
      </View>

      <FoodScanSheet
        scan={scanResult}
        saving={savingScan}
        onCancel={() => setScanResult(null)}
        onSave={saveScannedItems}
      />
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
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.7 },
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 90 },
  summary: { alignItems: 'center', paddingVertical: spacing.md },
  consumed: { fontSize: 44, fontFamily: font.extrabold, color: colors.success },
  ofTarget: { color: colors.textMuted, fontFamily: font.regular, marginTop: -2 },
  remaining: { marginTop: spacing.xs, fontFamily: font.bold, color: colors.primary },
  over: { color: colors.danger },
  macros: { flexDirection: 'row', gap: 28, marginTop: 14 },
  macro: { alignItems: 'center' },
  macroValue: { fontSize: 16, fontFamily: font.bold, color: colors.text },
  macroLabel: { color: colors.textFaint, fontFamily: font.medium, fontSize: 12 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginTop: spacing.sm,
  },
  targetLabel: { fontFamily: font.semibold, color: colors.text },
  targetInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    minWidth: 80,
    minHeight: 44,
    textAlign: 'right',
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
  },
  todayHeading: {
    fontSize: 16,
    fontFamily: font.bold,
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
  },
  foodName: { fontSize: 15, fontFamily: font.semibold, color: colors.text },
  foodMeta: { color: colors.textMuted, fontFamily: font.regular, marginTop: 2, fontSize: 13 },
  delete: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabRow: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanFab: {
    backgroundColor: colors.card,
    borderRadius: 28,
    minHeight: 48,
    minWidth: 128,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  scanFabText: { color: colors.primary, fontFamily: font.bold, fontSize: 14.5 },
  fabBusy: { opacity: 0.8 },
  fab: {
    backgroundColor: colors.success,
    borderRadius: 28,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabText: { color: colors.onPrimary, fontSize: 16, fontFamily: font.bold },
  upsell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
    backgroundColor: colors.background,
  },
  upsellIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  upsellTitle: { fontSize: 22, fontFamily: font.extrabold, color: colors.text },
  upsellText: { color: colors.textMuted, fontFamily: font.regular, textAlign: 'center' },
  upsellBtn: { marginTop: spacing.sm, minWidth: 200 },
});
