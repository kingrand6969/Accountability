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
import { LinearGradient } from 'expo-linear-gradient';
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
import { WorkoutTitleModal } from '../gym/WorkoutTitleModal';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing } from '../ui/theme';

const MUSCLE_TINT: Record<MuscleGroup, string> = {
  chest: '#ef4444',
  back: '#2563eb',
  shoulders: '#f59e0b',
  arms: '#7c3aed',
  legs: '#0d9488',
  core: '#db2777',
};

/** Colour for a raw primary-muscle name via its muscle group. */
function tintForMuscle(raw: string | undefined): string {
  if (!raw) return '#64748b';
  const g = MUSCLE_GROUPS.find((m) => m.muscles.includes(raw));
  return g ? MUSCLE_TINT[g.value] : '#64748b';
}

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
  const [titling, setTitling] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);

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

  async function onSaveWorkout(title: string) {
    if (selectedNames.length === 0) return;
    setSavingWorkout(true);
    try {
      await createItem({
        type: 'workout',
        title,
        checklist: selectedNames.map((n) => ({ text: n, done: false })),
        starts_at: new Date().toISOString(),
      });
      setSelected({});
      setTitling(false);
      showToast('Workout logged 💪');
      router.navigate('/today' as never);
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    } finally {
      setSavingWorkout(false);
    }
  }

  const activeLabel = showFavorites
    ? 'Favorites'
    : muscle
      ? MUSCLE_GROUPS.find((g) => g.value === muscle)?.label
      : 'All exercises';

  return (
    <View style={styles.screen}>
      {/* pinned controls — always reachable while browsing */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.planWrap, pressed && styles.pressed]}
          onPress={() => router.push('/gym-plan' as never)}
          accessibilityRole="button"
          accessibilityLabel="Create a plan for me"
        >
          <LinearGradient
            colors={['#3b82f6', '#2563eb']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.planCta}
          >
            <View style={styles.planIcon}>
              <Ionicons name="sparkles" size={17} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitle}>Create a plan for me</Text>
              <Text style={styles.planSub}>Pick your focus — we build the workout</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#dbeafe" />
          </LinearGradient>
        </Pressable>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search 800+ exercises…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <FilterChip
            label="Favorites"
            active={showFavorites}
            onPress={() => setShowFavorites((v) => !v)}
            star
          />
          <FilterChip
            label="All"
            active={!showFavorites && muscle === null}
            onPress={() => {
              setShowFavorites(false);
              setMuscle(null);
            }}
          />
          {MUSCLE_GROUPS.map((g) => (
            <FilterChip
              key={g.value}
              label={g.label}
              tint={MUSCLE_TINT[g.value]}
              active={!showFavorites && muscle === g.value}
              onPress={() => {
                setShowFavorites(false);
                setMuscle(g.value);
              }}
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
              onPress={() => setEquipment(equipment === eq.value ? null : eq.value)}
              small
            />
          ))}
        </ScrollView>

        {!loading ? (
          <Text style={styles.count}>
            <Text style={styles.countStrong}>{activeLabel}</Text> · {results.length}
            {hasMore ? '+' : ''} exercise{results.length === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
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
              subtitle="Try a different muscle group or gear."
            />
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null
        }
        renderItem={({ item }) => {
          const picked = !!selected[item.id];
          const fav = favIds.has(item.id);
          const tint = tintForMuscle(item.primary_muscles[0]);
          return (
            <Pressable
              style={({ pressed }) => [styles.row, picked && styles.rowPicked, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
            >
              <View style={styles.thumbWrap}>
                <Image source={{ uri: item.images[0] }} style={styles.thumb} resizeMode="cover" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.muscleDot, { backgroundColor: tint }]} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.primary_muscles[0] ?? 'full body'} · {prettyEquipment(item.equipment)}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => toggleFav(item.id)}
                hitSlop={8}
                style={styles.starBtn}
                accessibilityRole="button"
                accessibilityLabel={fav ? 'Remove from favorites' : 'Add to favorites'}
              >
                <Ionicons
                  name={fav ? 'star' : 'star-outline'}
                  size={21}
                  color={fav ? colors.accent : colors.textFaint}
                />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.addBtn, picked && styles.addBtnOn, pressed && styles.pressed]}
                onPress={() => toggleSelect(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={picked ? `Remove ${item.name} from workout` : `Add ${item.name} to workout`}
              >
                <Ionicons name={picked ? 'checkmark' : 'add'} size={21} color={picked ? '#fff' : colors.primary} />
              </Pressable>
            </Pressable>
          );
        }}
      />

      {selectedNames.length > 0 ? (
        <Pressable
          style={({ pressed }) => [styles.logBar, pressed && styles.pressed]}
          onPress={() => setTitling(true)}
          accessibilityRole="button"
        >
          <Ionicons name="barbell" size={18} color="#fff" />
          <Text style={styles.logText}>Save workout · {selectedNames.length}</Text>
        </Pressable>
      ) : null}

      <WorkoutTitleModal
        visible={titling}
        exercises={selectedNames}
        saving={savingWorkout}
        onCancel={() => setTitling(false)}
        onSave={onSaveWorkout}
      />
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  small,
  star,
  tint,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
  star?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        active && (star ? styles.chipStarActive : styles.chipActive),
        active && tint ? { backgroundColor: tint } : null,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {star ? (
        <Ionicons name={active ? 'star' : 'star-outline'} size={14} color={active ? '#fff' : colors.accent} />
      ) : tint && !active ? (
        <View style={[styles.chipDot, { backgroundColor: tint }]} />
      ) : null}
      <Text style={[styles.chipText, small && styles.chipTextSmall, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  planWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  planCta: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 58 },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { fontFamily: font.bold, fontSize: 15, color: '#fff' },
  planSub: { fontFamily: font.regular, fontSize: 12.5, color: '#dbeafe', marginTop: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  searchInput: { flex: 1, fontSize: 15.5, fontFamily: font.regular, color: colors.text, paddingVertical: 10 },
  chipRow: { gap: 7, paddingRight: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
    minHeight: 40,
  },
  chipSmall: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 13, backgroundColor: colors.surfaceAlt },
  chipActive: { backgroundColor: colors.primary },
  chipStarActive: { backgroundColor: colors.accent },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 13.5 },
  chipTextSmall: { fontSize: 12.5 },
  chipTextActive: { color: '#fff', fontFamily: font.bold },
  count: { color: colors.textMuted, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  countStrong: { color: colors.text, fontFamily: font.bold },
  listContent: { padding: 14, gap: 9, paddingBottom: 96 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 76,
  },
  rowPicked: { borderColor: colors.success, backgroundColor: '#f0fdf4' },
  thumbWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  thumb: { width: '100%', height: '100%' },
  name: { fontSize: 15.5, fontFamily: font.bold, color: colors.text, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  muscleDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flex: 1, color: colors.textMuted, fontFamily: font.medium, fontSize: 12.5, textTransform: 'capitalize' },
  starBtn: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 16,
    minHeight: 52,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  logText: { color: '#fff', fontSize: 16, fontFamily: font.extrabold },
});
