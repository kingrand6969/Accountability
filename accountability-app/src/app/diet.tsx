import { useCallback, useMemo, useState } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
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
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export default function Diet() {
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => dietPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
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
        <ActivityIndicator size="large" color={palette.action} />
      </View>
    );
  }

  if (!isPro) {
    return (
      <View style={styles.upsell}>
        <View style={styles.upsellIconCircle}>
          <Ionicons name="nutrition-outline" size={48} color={palette.pro} />
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
        <ActivityIndicator size="large" color={palette.action} />
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
                <Macro label="Protein" value={protein} styles={styles} />
                <Macro label="Carbs" value={carbs} styles={styles} />
                <Macro label="Fat" value={fat} styles={styles} />
              </View>
            </View>

            <View style={styles.targetRow}>
              <Text style={styles.targetLabel}>Daily target (kcal)</Text>
              <TextInput
                style={styles.targetInput}
                keyboardType="number-pad"
                placeholderTextColor={palette.placeholder}
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
              <Ionicons name="close" size={20} color={palette.placeholder} />
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
            <ActivityIndicator color={palette.action} />
          ) : (
            <>
              <Ionicons name="camera" size={19} color={palette.action} />
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
          <Ionicons name="add" size={20} color={palette.onAction} />
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

function Macro({
  label,
  value,
  styles,
}: {
  label: string;
  value: number;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{Math.round(value)}g</Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function dietPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    background: mode === 'light' ? legacyColors.background : theme.surface.canvas,
    card: mode === 'light' ? legacyColors.card : theme.surface.card,
    field: mode === 'light' ? legacyColors.surfaceAlt : theme.surface.raised,
    ink: mode === 'light' ? legacyColors.text : theme.ink.primary,
    muted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    placeholder: mode === 'light' ? legacyColors.textFaint : theme.ink.muted,
    border: mode === 'light' ? legacyColors.border : theme.border.subtle,
    action: mode === 'light' ? legacyColors.primaryDark : theme.ink.action,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    success: mode === 'light' ? legacyColors.success : theme.status.success,
    danger: mode === 'light' ? legacyColors.danger : theme.status.danger,
    pro: mode === 'light' ? legacyColors.pro : theme.ink.action,
    proSoft: mode === 'light' ? legacyColors.proSoft : theme.surface.muted,
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = dietPalette(theme, mode);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  pressed: { opacity: 0.7 },
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 90 },
  summary: { alignItems: 'center', paddingVertical: spacing.md },
  consumed: { fontSize: 44, fontFamily: font.extrabold, color: palette.success },
  ofTarget: { color: palette.muted, fontFamily: font.regular, marginTop: -2 },
  remaining: { marginTop: spacing.xs, fontFamily: font.bold, color: palette.action },
  over: { color: palette.danger },
  macros: { flexDirection: 'row', gap: 28, marginTop: 14 },
  macro: { alignItems: 'center' },
  macroValue: { fontSize: 16, fontFamily: font.bold, color: palette.ink },
  macroLabel: { color: palette.placeholder, fontFamily: font.medium, fontSize: 12 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: 14,
    marginTop: spacing.sm,
  },
  targetLabel: { fontFamily: font.semibold, color: palette.ink },
  targetInput: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    minWidth: 80,
    minHeight: spacing.touch,
    textAlign: 'right',
    fontSize: 16,
    fontFamily: font.regular,
    color: palette.ink,
  },
  todayHeading: {
    fontSize: 16,
    fontFamily: font.bold,
    color: palette.ink,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: 14,
  },
  foodName: { fontSize: 15, fontFamily: font.semibold, color: palette.ink },
  foodMeta: { color: palette.muted, fontFamily: font.regular, marginTop: 2, fontSize: 13 },
  delete: {
    minWidth: spacing.touch,
    minHeight: spacing.touch,
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
    backgroundColor: palette.card,
    borderRadius: 28,
    minHeight: spacing.touch,
    minWidth: 128,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  scanFabText: { color: palette.action, fontFamily: font.bold, fontSize: 14.5 },
  fabBusy: { opacity: 0.8 },
  fab: {
    backgroundColor: palette.success,
    borderRadius: 28,
    minHeight: spacing.touch,
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
  fabText: { color: palette.onAction, fontSize: 16, fontFamily: font.bold },
  upsell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
    backgroundColor: palette.background,
  },
  upsellIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: palette.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  upsellTitle: { fontSize: 22, fontFamily: font.extrabold, color: palette.ink },
  upsellText: { color: palette.muted, fontFamily: font.regular, textAlign: 'center' },
  upsellBtn: { marginTop: spacing.sm, minWidth: 200 },
  });
}
