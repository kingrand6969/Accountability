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
import { Ionicons } from '@expo/vector-icons';
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
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

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
      showToast('Workout logged 💪');
      router.navigate('/today' as never);
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
            <Pressable
              style={({ pressed }) => [styles.planCta, pressed && styles.pressed]}
              onPress={() => router.push('/gym-plan' as never)}
              accessibilityRole="button"
              accessibilityLabel="Create a plan for me"
            >
              <View style={styles.planIcon}>
                <Ionicons name="sparkles" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.planCtaTitle}>Create a plan for me</Text>
                <Text style={styles.planCtaSub}>Pick your focus — we build the workout</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </Pressable>
            <TextInput
              style={styles.search}
              placeholder="Search exercises…"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              value={search}
              onChangeText={setSearch}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <FilterChip
                label="Favorites"
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
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : showFavorites ? (
            <EmptyState
              icon="star-outline"
              title="No favorites yet"
              subtitle="Tap the star on an exercise to save it here."
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No exercises found"
              subtitle="No exercises match those filters."
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
          ) : null
        }
        renderItem={({ item }) => {
          const picked = !!selected[item.id];
          const fav = favIds.has(item.id);
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
            >
              <Image source={{ uri: item.images[0] }} style={styles.thumb} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {(item.primary_muscles[0] ?? 'full body')} · {prettyEquipment(item.equipment)}
                </Text>
              </View>
              <Pressable
                onPress={() => toggleFav(item.id)}
                hitSlop={8}
                style={({ pressed }) => [styles.starBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={fav ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Ionicons
                  name={fav ? 'star' : 'star-outline'}
                  size={22}
                  color={fav ? colors.accent : colors.textFaint}
                />
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.addBtn,
                  picked && styles.addBtnOn,
                  pressed && styles.pressed,
                ]}
                onPress={() => toggleSelect(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={picked ? `Remove ${item.name} from workout` : `Add ${item.name} to workout`}
              >
                <Ionicons
                  name={picked ? 'checkmark' : 'add'}
                  size={22}
                  color={picked ? colors.onPrimary : colors.primary}
                />
              </Pressable>
            </Pressable>
          );
        }}
      />

      {selectedNames.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.logBar, pressed && styles.pressed]}
          onPress={onLogWorkout}
          accessibilityRole="button"
        >
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
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        star && styles.chipStar,
        active && (star ? styles.chipStarActive : styles.chipActive),
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {star ? (
        <Ionicons
          name={active ? 'star' : 'star-outline'}
          size={14}
          color={active ? colors.text : colors.accent}
        />
      ) : null}
      <Text
        style={[
          styles.chipText,
          active && styles.chipTextActive,
          star && (active ? styles.chipStarTextActive : styles.chipStarText),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  listContent: { padding: 14, gap: 10, paddingBottom: 90 },
  filters: { gap: 10, marginBottom: spacing.xs },
  planCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
  },
  planIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCtaTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  planCtaSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    padding: spacing.md,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    minHeight: 48,
  },
  chipRow: { gap: spacing.sm, paddingRight: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  chipSmall: { paddingVertical: 6, paddingHorizontal: spacing.md, borderColor: colors.textFaint },
  chipStar: { borderColor: colors.accent },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipStarActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.primary, fontFamily: font.semibold },
  chipTextActive: { color: colors.onPrimary },
  chipStarText: { color: colors.textSecondary },
  chipStarTextActive: { color: colors.text },
  count: { color: colors.textFaint, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 44,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.sm - 2, backgroundColor: colors.card },
  name: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  meta: {
    color: colors.textMuted,
    fontFamily: font.regular,
    marginTop: 2,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  starBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOn: { backgroundColor: colors.success, borderColor: colors.success },
  logBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  logText: { color: colors.onPrimary, fontSize: 16, fontFamily: font.bold },
});
