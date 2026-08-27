import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import Ionicons from '@expo/vector-icons/Ionicons';
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
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { useLayout } from '../ui/responsive';

const MUSCLE_TINT: Record<MuscleGroup, string> = {
  chest: '#ef4444',
  back: '#6F9F00',
  shoulders: '#f59e0b',
  arms: '#53634E',
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
  const { width, cols, gridMaxWidth: gridMax } = useLayout();
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => gymPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  // On wide/stretched screens, wrap the filter chips so every option is visible
  // (no more cut-off scroller); phones keep the compact horizontal scroll.
  const wide = width >= 520;
  // keep the floating "Save workout" bar in the same centered column
  const barInset = Math.max(16, (width - 560) / 2);
  // tablet/desktop show 2–3 exercise cards per row; phones stay single column
  const H_GAP = 10;
  const gridInner = Math.min(width, gridMax) - 28; // 14px padding each side
  const itemWidth = cols > 1 ? (gridInner - (cols - 1) * H_GAP) / cols : undefined;
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showFavorites, setShowFavorites] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<LibraryExercise[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [titling, setTitling] = useState(false);
  const [savingWorkout, setSavingWorkout] = useState(false);

  const favKey = Array.from(favIds).sort().join(',');
  const favDep = showFavorites ? favKey : '';
  const queryKey = JSON.stringify([muscle, equipment, search, showFavorites, favDep]);
  const loading = loadedQueryKey !== queryKey;

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
        if (active) setLoadedQueryKey(queryKey);
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
        <View style={[styles.headerInner, { maxWidth: gridMax }]}>
        <Pressable
          style={({ pressed }) => [styles.planWrap, pressed && styles.pressed]}
          onPress={() => router.push('/gym-plan' as never)}
          accessibilityRole="button"
          accessibilityLabel="Create a plan for me"
        >
          <LinearGradient
            colors={[palette.action, palette.action]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.planCta}
          >
            <View style={styles.planIcon}>
              <Ionicons name="sparkles" size={17} color={palette.action} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitle}>Create a plan for me</Text>
              <Text style={styles.planSub}>Pick your focus — we build the workout</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.onAction} />
          </LinearGradient>
        </Pressable>

        <View style={styles.safetyNote}>
          <Ionicons name="medkit-outline" size={14} color={palette.safetyIcon} />
          <Text style={styles.safetyText}>
            Safety first — check with a doctor (and ideally a coach) before starting new workouts,
            train within your limits, and stop if something hurts.
          </Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={17} color={palette.placeholder} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search 800+ exercises…"
            placeholderTextColor={palette.placeholder}
            autoCapitalize="none"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={palette.placeholder} />
            </Pressable>
          ) : null}
        </View>

        <ChipBar wide={wide} styles={styles}>
          <FilterChip
            label="Favorites"
            active={showFavorites}
            onPress={() => setShowFavorites((v) => !v)}
            star
            styles={styles}
            palette={palette}
          />
          <FilterChip
            label="All"
            active={!showFavorites && muscle === null}
            onPress={() => {
              setShowFavorites(false);
              setMuscle(null);
            }}
            styles={styles}
            palette={palette}
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
              styles={styles}
              palette={palette}
            />
          ))}
        </ChipBar>

        <ChipBar wide={wide} styles={styles}>
          <FilterChip
            label="Any gear"
            active={equipment === null}
            onPress={() => setEquipment(null)}
            small
            styles={styles}
            palette={palette}
          />
          {EQUIPMENT_OPTIONS.map((eq) => (
            <FilterChip
              key={eq.value}
              label={eq.label}
              active={equipment === eq.value}
              onPress={() => setEquipment(equipment === eq.value ? null : eq.value)}
              small
              styles={styles}
              palette={palette}
            />
          ))}
        </ChipBar>

        {!loading ? (
          <Text style={styles.count}>
            <Text style={styles.countStrong}>{activeLabel}</Text> · {results.length}
            {hasMore ? '+' : ''} exercise{results.length === 1 ? '' : 's'}
          </Text>
        ) : null}
        </View>
      </View>

      <FlatList
        // remount when column count changes (FlatList requires a new key)
        key={`grid-${cols}`}
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        numColumns={cols}
        columnWrapperStyle={cols > 1 ? styles.gridRow : undefined}
        contentContainerStyle={[styles.listContent, { maxWidth: gridMax }]}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={palette.action} style={{ marginTop: 40 }} />
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
          loadingMore ? <ActivityIndicator color={palette.action} style={{ marginVertical: 16 }} /> : null
        }
        renderItem={({ item }) => {
          const picked = !!selected[item.id];
          const fav = favIds.has(item.id);
          const tint = tintForMuscle(item.primary_muscles[0]);
          return (
            <Pressable
              style={({ pressed }) => [
                styles.row,
                { marginBottom: 10 },
                itemWidth != null && { width: itemWidth },
                picked && styles.rowPicked,
                pressed && styles.pressed,
              ]}
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
                  color={fav ? palette.accent : palette.placeholder}
                />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.addBtn, picked && styles.addBtnOn, pressed && styles.pressed]}
                onPress={() => toggleSelect(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={picked ? `Remove ${item.name} from workout` : `Add ${item.name} to workout`}
              >
                <Ionicons name={picked ? 'checkmark' : 'add'} size={21} color={picked ? palette.onAction : palette.action} />
              </Pressable>
            </Pressable>
          );
        }}
      />

      {selectedNames.length > 0 ? (
        <Pressable
          style={({ pressed }) => [
            styles.logBar,
            { left: barInset, right: barInset },
            pressed && styles.pressed,
          ]}
          onPress={() => setTitling(true)}
          accessibilityRole="button"
        >
          <Ionicons name="barbell" size={18} color={palette.onAction} />
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

/** Filter chips: wrap to fit every option on wide screens, scroll on phones. */
function ChipBar({
  wide,
  children,
  styles,
}: {
  wide: boolean;
  children: ReactNode;
  styles: GymStyles;
}) {
  if (wide) return <View style={styles.chipWrap}>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {children}
    </ScrollView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  small,
  star,
  tint,
  styles,
  palette,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  small?: boolean;
  star?: boolean;
  tint?: string;
  styles: GymStyles;
  palette: GymPalette;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        active && (star ? styles.chipStarActive : styles.chipActive),
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {star ? (
        <Ionicons name={active ? 'star' : 'star-outline'} size={14} color={active ? palette.onAction : palette.accent} />
      ) : tint && !active ? (
        <View style={[styles.chipDot, { backgroundColor: tint }]} />
      ) : null}
      <Text
        style={[
          styles.chipText,
          small && styles.chipTextSmall,
          active && styles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function gymPalette(theme: AppThemeColors) {
  return {
    background: theme.surface.canvas,
    card: theme.surface.card,
    field: theme.surface.raised,
    quietField: theme.surface.muted,
    ink: theme.ink.primary,
    secondary: theme.ink.secondary,
    muted: theme.ink.muted,
    placeholder: theme.ink.muted,
    border: theme.border.subtle,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
    success: theme.status.success,
    successSoft: theme.status.successSoft,
    accent: theme.status.attention,
    safetyBackground: theme.surface.muted,
    safetyBorder: theme.border.strong,
    safetyInk: theme.ink.secondary,
    safetyIcon: theme.status.attention,
  };
}

type GymPalette = ReturnType<typeof gymPalette>;

function createStyles(theme: AppThemeColors) {
  const palette = gymPalette(theme);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  pressed: { opacity: 0.7 },
  header: {
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: palette.background,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  // full-width bar, but keep the controls in a centered column on wide screens
  headerInner: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 14, gap: 10 },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: palette.safetyBackground,
    borderWidth: 1,
    borderColor: palette.safetyBorder,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  safetyText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontFamily: font.medium, color: palette.safetyInk },
  planWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: palette.action,
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
    backgroundColor: palette.onAction,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: { fontFamily: font.bold, fontSize: 15, color: palette.onAction },
  planSub: { fontFamily: font.regular, fontSize: 12.5, color: palette.onAction, marginTop: 1 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.field,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: spacing.touch,
  },
  searchInput: { flex: 1, fontSize: 15.5, fontFamily: font.regular, color: palette.ink, paddingVertical: 10 },
  chipRow: { gap: 7, paddingRight: spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: palette.field,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
    minHeight: spacing.touch,
  },
  chipSmall: { minHeight: spacing.touch, paddingVertical: 6, paddingHorizontal: 13, backgroundColor: palette.quietField },
  chipActive: { backgroundColor: palette.action },
  chipStarActive: { backgroundColor: palette.accent },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: { color: palette.secondary, fontFamily: font.semibold, fontSize: 13.5 },
  chipTextSmall: { fontSize: 12.5 },
  chipTextActive: { color: palette.onAction, fontFamily: font.bold },
  count: { color: palette.muted, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  countStrong: { color: palette.ink, fontFamily: font.bold },
  listContent: { padding: 14, paddingBottom: 96, width: '100%', alignSelf: 'center' },
  gridRow: { gap: 10, alignItems: 'stretch' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: 10,
    minHeight: 76,
  },
  rowPicked: { borderColor: palette.success, backgroundColor: palette.successSoft },
  thumbWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: palette.field,
  },
  thumb: { width: '100%', height: '100%' },
  name: { fontSize: 15.5, fontFamily: font.bold, color: palette.ink, lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  muscleDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { flex: 1, color: palette.muted, fontFamily: font.medium, fontSize: 12.5, textTransform: 'capitalize' },
  starBtn: { minWidth: spacing.touch, minHeight: spacing.touch, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    width: spacing.touch,
    height: spacing.touch,
    borderRadius: spacing.touch / 2,
    borderWidth: 1.5,
    borderColor: palette.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOn: { backgroundColor: palette.success, borderColor: palette.success },
  logBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: palette.action,
    borderRadius: radius.pill,
    paddingVertical: 16,
    minHeight: 52,
    shadowColor: palette.background,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  logText: { color: palette.onAction, fontSize: 16, fontFamily: font.extrabold },
  });
}

type GymStyles = ReturnType<typeof createStyles>;
