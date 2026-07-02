import { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { searchFoods, type FoodHit } from '../diet/openfoodfacts';
import { scaleNutrient, scaleMacro } from '../diet/compute';
import { addFoodLog, todayString } from '../diet/api';
import { Button } from '../ui/Button';
import { colors, font, radius, spacing } from '../ui/theme';

export default function FoodSearch() {
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
      router.back();
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
      router.back();
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
          placeholderTextColor={colors.textFaint}
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
            <ActivityIndicator color={colors.onPrimary} />
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
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
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
              placeholderTextColor={colors.textFaint}
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
          placeholderTextColor={colors.textFaint}
          value={manualName}
          onChangeText={setManualName}
        />
        <TextInput
          style={styles.input}
          placeholder="Calories"
          placeholderTextColor={colors.textFaint}
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: 10, paddingBottom: 48 },
  attribution: {
    color: colors.textFaint,
    fontFamily: font.regular,
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  pressed: { opacity: 0.7 },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    flex: 1,
    minHeight: 48,
  },
  searchBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { color: colors.onPrimary, fontFamily: font.bold },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    minHeight: 44,
  },
  resultSel: { borderWidth: 2, borderColor: colors.success },
  resultName: { fontFamily: font.semibold, color: colors.text },
  resultMeta: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  panel: {
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    gap: spacing.sm,
  },
  panelTitle: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  panelLabel: { fontFamily: font.semibold, color: colors.text },
  gramsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gramsInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    minWidth: 90,
    minHeight: 44,
    textAlign: 'right',
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
  },
  preview: { fontSize: 18, fontFamily: font.extrabold, color: colors.success },
  manual: {
    gap: spacing.sm,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 14,
  },
  manualHeading: { fontFamily: font.bold, color: colors.textMuted },
});
