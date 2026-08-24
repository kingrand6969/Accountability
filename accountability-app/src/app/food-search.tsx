import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { searchFoods, type FoodHit } from '../diet/openfoodfacts';
import { scaleNutrient, scaleMacro } from '../diet/compute';
import { addFoodLog, todayString } from '../diet/api';
import { Button } from '../ui/Button';
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

export default function FoodSearch() {
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => foodSearchPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<FoodHit | null>(null);
  const [grams, setGrams] = useState('100');
  const [manualName, setManualName] = useState('');
  const [manualKcal, setManualKcal] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSelected(null);
    try {
      setResults(await searchFoods(query.trim()));
    } catch (e) {
      Alert.alert('Search unavailable', String((e as Error).message ?? e));
    } finally {
      setSearching(false);
    }
  }

  const g = parseFloat(grams) || 0;
  const previewKcal = selected ? scaleNutrient(selected.per100.kcal, g) : 0;

  function exitFoodSearch() {
    if (router.canGoBack()) router.back();
    else router.replace('/diet' as never);
  }

  async function onAddSelected() {
    if (!selected) return;
    setSaving(true);
    try {
      await addFoodLog({
        name: selected.name,
        brand: selected.brand,
        calories: scaleNutrient(selected.per100.kcal, g),
        protein: scaleMacro(selected.per100.protein, g),
        carbs: scaleMacro(selected.per100.carbs, g),
        fat: scaleMacro(selected.per100.fat, g),
        quantity_g: g,
        log_date: todayString(),
      });
      exitFoodSearch();
    } catch (e) {
      Alert.alert('Could not add', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  async function onAddManual() {
    const kcal = parseInt(manualKcal, 10);
    if (!manualName.trim()) {
      Alert.alert('Add a name', 'What did you eat?');
      return;
    }
    if (!Number.isFinite(kcal) || kcal <= 0) {
      Alert.alert('Add calories', 'Enter the calories for this food.');
      return;
    }
    setSaving(true);
    try {
      await addFoodLog({
        name: manualName.trim(),
        calories: kcal,
        log_date: todayString(),
      });
      exitFoodSearch();
    } catch (e) {
      Alert.alert('Could not add', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search a food (e.g. banana)"
          placeholderTextColor={palette.placeholder}
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <Pressable
          style={({ pressed }) => [styles.searchBtn, pressed && !searching && styles.pressed]}
          onPress={onSearch}
          disabled={searching}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          {searching ? (
            <ActivityIndicator color={palette.onAction} />
          ) : (
            <Text style={styles.searchBtnText}>Search</Text>
          )}
        </Pressable>
      </View>

      {results.map((hit, i) => {
        const isSel = selected === hit;
        return (
          <Pressable
            key={`${hit.name}-${i}`}
            style={({ pressed }) => [
              styles.result,
              isSel && styles.resultSel,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              setSelected(hit);
              setGrams('100');
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{hit.name}</Text>
              <Text style={styles.resultMeta}>
                {hit.brand ? `${hit.brand} · ` : ''}
                {hit.per100.kcal} kcal / 100g
              </Text>
            </View>
            {isSel ? (
              <Ionicons name="checkmark-circle" size={22} color={palette.success} />
            ) : null}
          </Pressable>
        );
      })}

      {selected ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{selected.name}</Text>
          <View style={styles.gramsRow}>
            <Text style={styles.panelLabel}>Amount (g)</Text>
            <TextInput
              style={styles.gramsInput}
              keyboardType="number-pad"
              placeholderTextColor={palette.placeholder}
              value={grams}
              onChangeText={setGrams}
            />
          </View>
          <Text style={styles.preview}>= {previewKcal} kcal</Text>
          <Button
            title="Add to today"
            variant="success"
            onPress={onAddSelected}
            loading={saving}
          />
        </View>
      ) : null}

      <View style={styles.manual}>
        <Text style={styles.manualHeading}>Can’t find it? Add manually</Text>
        <TextInput
          style={styles.input}
          placeholder="Food name"
          placeholderTextColor={palette.placeholder}
          value={manualName}
          onChangeText={setManualName}
        />
        <TextInput
          style={styles.input}
          placeholder="Calories"
          placeholderTextColor={palette.placeholder}
          keyboardType="number-pad"
          value={manualKcal}
          onChangeText={setManualKcal}
        />
        <Button title="Add manually" onPress={onAddManual} disabled={saving} />
      </View>

      {/* ODbL license requires attribution for the food database */}
      <Text style={styles.attribution}>
        Food data © Open Food Facts contributors (ODbL)
      </Text>
    </ScrollView>
  );
}

function foodSearchPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    background: mode === 'light' ? legacyColors.background : theme.surface.canvas,
    card: mode === 'light' ? legacyColors.card : theme.surface.card,
    field: mode === 'light' ? legacyColors.surfaceAlt : theme.surface.raised,
    selected: mode === 'light' ? legacyColors.successSoft : theme.status.successSoft,
    ink: mode === 'light' ? legacyColors.text : theme.ink.primary,
    muted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    placeholder: mode === 'light' ? legacyColors.textFaint : theme.ink.muted,
    border: mode === 'light' ? legacyColors.border : theme.border.subtle,
    action: mode === 'light' ? legacyColors.primaryDark : theme.ink.action,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    success: mode === 'light' ? legacyColors.success : theme.status.success,
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = foodSearchPalette(theme, mode);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  container: { padding: spacing.lg, gap: 10, paddingBottom: 48 },
  attribution: {
    color: palette.placeholder,
    fontFamily: font.regular,
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.7 },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.field,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: palette.ink,
    flex: 1,
    minHeight: spacing.touch,
  },
  searchBtn: {
    backgroundColor: palette.action,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    minHeight: spacing.touch,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { color: palette.onAction, fontFamily: font.bold },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.field,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: spacing.touch,
  },
  resultSel: { borderWidth: 2, borderColor: palette.success },
  resultName: { fontFamily: font.semibold, color: palette.ink },
  resultMeta: { color: palette.muted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  panel: {
    backgroundColor: palette.selected,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: 14,
    gap: spacing.sm,
  },
  panelTitle: { fontFamily: font.bold, fontSize: 16, color: palette.ink },
  panelLabel: { fontFamily: font.semibold, color: palette.ink },
  gramsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gramsInput: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.card,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    minWidth: 90,
    minHeight: spacing.touch,
    textAlign: 'right',
    fontSize: 16,
    fontFamily: font.regular,
    color: palette.ink,
  },
  preview: { fontSize: 18, fontFamily: font.extrabold, color: palette.success },
  manual: {
    gap: spacing.sm,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    paddingTop: 14,
  },
  manualHeading: { fontFamily: font.bold, color: palette.muted },
  });
}
