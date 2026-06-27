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
import { searchFoods, type FoodHit } from '../diet/openfoodfacts';
import { scaleNutrient, scaleMacro } from '../diet/compute';
import { addFoodLog, todayString } from '../diet/api';

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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search a food (e.g. banana)"
          autoCapitalize="none"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.searchBtn} onPress={onSearch} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchBtnText}>Search</Text>}
        </Pressable>
      </View>

      {results.map((hit, i) => {
        const isSel = selected === hit;
        return (
          <Pressable
            key={`${hit.name}-${i}`}
            style={[styles.result, isSel && styles.resultSel]}
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
            {isSel ? <Text style={styles.check}>✓</Text> : null}
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
              value={grams}
              onChangeText={setGrams}
            />
          </View>
          <Text style={styles.preview}>= {previewKcal} kcal</Text>
          <Pressable style={styles.addBtn} onPress={onAddSelected} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addText}>Add to today</Text>}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.manual}>
        <Text style={styles.manualHeading}>Can’t find it? Add manually</Text>
        <TextInput
          style={styles.input}
          placeholder="Food name"
          value={manualName}
          onChangeText={setManualName}
        />
        <TextInput
          style={styles.input}
          placeholder="Calories"
          keyboardType="number-pad"
          value={manualKcal}
          onChangeText={setManualKcal}
        />
        <Pressable style={[styles.addBtn, styles.manualBtn]} onPress={onAddManual} disabled={saving}>
          <Text style={styles.addText}>Add manually</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10, paddingBottom: 48 },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    flex: 1,
  },
  searchBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '700' },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7f7f9',
    borderRadius: 10,
    padding: 12,
  },
  resultSel: { borderWidth: 2, borderColor: '#16a34a' },
  resultName: { fontWeight: '600' },
  resultMeta: { color: '#666', fontSize: 13, marginTop: 2 },
  check: { color: '#16a34a', fontSize: 18, fontWeight: '800' },
  panel: {
    backgroundColor: '#eefcef',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  panelTitle: { fontWeight: '700', fontSize: 16 },
  panelLabel: { fontWeight: '600' },
  gramsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gramsInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    minWidth: 90,
    textAlign: 'right',
    fontSize: 16,
    backgroundColor: '#fff',
  },
  preview: { fontSize: 18, fontWeight: '800', color: '#16a34a' },
  addBtn: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  addText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  manual: {
    gap: 8,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    paddingTop: 14,
  },
  manualHeading: { fontWeight: '700', color: '#666' },
  manualBtn: { backgroundColor: '#2563eb' },
});
