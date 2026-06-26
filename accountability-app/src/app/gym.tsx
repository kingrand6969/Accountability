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
  listFavoriteIds,
  setFavorite,
  prettyEquipment,
  PAGE_SIZE,
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
  const [showFavorites, setShowFavorites] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const favKey = Array.from(favIds).sort().join(',');
  const favDep = showFavorites ? favKey : '';

  useEffect(() => {
    (async () => {
      try {
        setFavIds(new Set(await listFavoriteIds()));
      } catch {
        // ignore — favorites are non-critical
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const onlyIds = showFavorites ? Array.from(favIds) : null;
        const data = await listExercises({ muscle, equipment, search, offset: 0, onlyIds });
        if (active) {
          setResults(data);
          setOffset(0);
          setHasMore(data.length === PAGE_SIZE);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muscle, equipment, search, showFavorites, favDep]);

  async function loadMore() {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    const next = offset + PAGE_SIZE;
    try {
      const onlyIds = showFavorites ? Array.from(favIds) : null;
      const data = await listExercises({ muscle, equipment, search, offset: next, onlyIds });
      setResults((cur) => [...cur, ...data]);
      setOffset(next);
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      Alert.alert('Could not load more', String((e as Error).message ?? e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleFav(id: string) {
    const isFav = favIds.has(id);
    setFavIds((prev) => {
      const n = new Set(prev);
      if (isFav) n.delete(id);
      else n.add(id);
      return n;
    });
    try {
      await setFavorite(id, !isFav);
    } catch (e) {
      setFavIds((prev) => {
        const n = new Set(prev);
        if (isFav) n.add(id);
        else n.delete(id);
        return n;
      });
      Alert.alert('Could not update favorite', String((e as Error).message ?? e));
    }
  }

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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
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
              <FilterChip
                label="★ Favorites"
                active={showFavorites}
                onPress={() => setShowFavorites((v) => !v)}
                star
              />
              <FilterChip label="All" active={!showFavorites && muscle === null} onPress={() => { setShowFavorites(false); setMuscle(null); }} />
              {MUSCLE_GROUPS.map((g) => (
                <FilterChip
                  key={g.value}
                  label={g.label}
                  active={!showFavorites && muscle === g.value}
                  onPress={() => { setShowFavorites(false); setMuscle(g.value); }}
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
            {!loading ? (
              <Text style={styles.count}>
                {results.length}
                {hasMore ? '+' : ''} exercise{results.length === 1 ? '' : 's'}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.empty}>
              {showFavorites ? 'No favorites yet — tap ☆ on an exercise.' : 'No exercises match those filters.'}
            </Text>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null
        }
        renderItem={({ item }) => {
          const picked = !!selected[item.id];
          const fav = favIds.has(item.id);
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
              <Pressable onPress={() => toggleFav(item.id)} hitSlop={8} style={styles.starBtn}>
                <Text style={[styles.star, fav && styles.starOn]}>{fav ? '★' : '☆'}</Text>
              </Pressable>
              <Pressable
                style={[styles.addBtn, picked && styles.addBtnOn]}
                onPress={() => toggleSelect(item)}
                hitSlop={8}
              >
                <Text style={[styles.addText, picked && styles.addTextOn]}>{picked ? '✓' : '+'}</Text>
              </Pressable>
            </Pressable>
          );
        }}
      />

      {selectedNames.length > 0 ? (
        <Pressable style={styles.logBar} onPress={onLogWorkout}>
          <Text style={styles.logText}>Log workout ({selectedNames.length}) 💪</Text>
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
  star,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
  star?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.chip,
        small && styles.chipSmall,
        star && styles.chipStar,
        active && (star ? styles.chipStarActive : styles.chipActive),
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive, star && !active && styles.chipStarText]}>
        {label}
      </Text>
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
  chipStar: { borderColor: '#f0b000' },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipStarActive: { backgroundColor: '#f0b000', borderColor: '#f0b000' },
  chipText: { color: '#2563eb', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  chipStarText: { color: '#b58900' },
  count: { color: '#888', fontSize: 13, marginTop: 2 },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f7f7f9',
    borderRadius: 12,
    padding: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#fff' },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { color: '#666', marginTop: 2, fontSize: 13, textTransform: 'capitalize' },
  starBtn: { padding: 4 },
  star: { fontSize: 22, color: '#bbb' },
  starOn: { color: '#f0b000' },
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
