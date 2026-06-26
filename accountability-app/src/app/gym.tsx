import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createItem } from '../timeline/api';
import {
  listExercises,
  prettyEquipment,
  MUSCLE_GROUPS,
  EQUIPMENT_OPTIONS,
  type LibraryExercise,
  type MuscleGroup,
} from '../gym/library';

export default function Gym() {
  const router = useRouter();
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await listExercises({ muscle, equipment, search });
        if (active) setResults(data);
      } catch (e) {
        if (active) Alert.alert('Could not load exercises', String((e as Error).message ?? e));
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [muscle, equipment, search]);

  function toggleSelect(ex: LibraryExercise) {
    setSelected((s) => {
      const next = { ...s };
      if (next[ex.id]) delete next[ex.id];
      else next[ex.id] = ex.name;
      return next;
    });
  }

  const selectedNames = Object.values(selected);

  async function onLogWorkout() {
    if (selectedNames.length === 0) return;
    try {
      await createItem({
        type: 'workout',
        title: 'Workout',
        note: selectedNames.join(', '),
        starts_at: new Date().toISOString(),
      });
      setSelected({});
      Alert.alert('Logged 💪', 'Your workout is on your timeline.');
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    }
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.filters}>
            <TextInput
              style={styles.search}
              placeholder="Search exercises…"
              autoCapitalize="none"
              value={search}
              onChangeText={setSearch}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <FilterChip label="All" active={muscle === null} onPress={() => setMuscle(null)} />
              {MUSCLE_GROUPS.map((g) => (
                <FilterChip
                  key={g.value}
                  label={g.label}
                  active={muscle === g.value}
                  onPress={() => setMuscle(g.value)}
                />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <FilterChip label="Any gear" active={equipment === null} onPress={() => setEquipment(null)} small />
              {EQUIPMENT_OPTIONS.map((eq) => (
                <FilterChip
                  key={eq.value}
                  label={eq.label}
                  active={equipment === eq.value}
                  onPress={() => setEquipment(eq.value)}
                  small
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>No exercises match those filters.</Text>
          )
        }
        renderItem={({ item }) => {
          const picked = !!selected[item.id];
          return (
            <Pressable
              style={styles.row}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
            >
              <Image source={{ uri: item.images[0] }} style={styles.thumb} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {(item.primary_muscles[0] ?? 'full body')} · {prettyEquipment(item.equipment)}
                </Text>
              </View>
              <Pressable
                style={[styles.addBtn, picked && styles.addBtnOn]}
                onPress={() => toggleSelect(item)}
                hitSlop={8}
              >
                <Text style={[styles.addText, picked && styles.addTextOn]}>
                  {picked ? '✓' : '+'}
                </Text>
              </Pressable>
            </Pressable>
          );
        }}
      />

      {selectedNames.length > 0 ? (
        <Pressable style={styles.logBar} onPress={onLogWorkout}>
          <Text style={styles.logText}>
            Log workout ({selectedNames.length}) 💪
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  small,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      style={[styles.chip, small && styles.chipSmall, active && styles.chipActive]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: 14, gap: 10, paddingBottom: 90 },
  filters: { gap: 10, marginBottom: 4 },
  search: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  chipSmall: { paddingVertical: 6, paddingHorizontal: 12, borderColor: '#999' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { color: '#2563eb', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#fff' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { color: '#666', marginTop: 2, fontSize: 13, textTransform: 'capitalize' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  addText: { color: '#2563eb', fontSize: 20, fontWeight: '700' },
  addTextOn: { color: '#fff' },
  logBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: '#16a34a',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  logText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
