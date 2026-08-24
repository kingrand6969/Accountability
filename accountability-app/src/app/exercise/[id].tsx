import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getExercise,
  listFavoriteIds,
  setFavorite,
  prettyEquipment,
  type LibraryExercise,
} from '../../gym/library';
import { createItem } from '../../timeline/api';
import { WorkoutTitleModal } from '../../gym/WorkoutTitleModal';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { showToast } from '../../ui/Toast';
import {
  colors as legacyColors,
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../../ui/theme';
import { useAppTheme } from '../../ui/AppThemeProvider';

/** Frame matches the image's real aspect ratio, so it fills the width with no
 *  white bars and no cropping — same on phone and tablet. */
function DemoImage({ uri, label }: { uri: string; label: string }) {
  const { colors: theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const [ratio, setRatio] = useState(4 / 3);
  useEffect(() => {
    let ok = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (ok && w > 0 && h > 0) setRatio(w / h);
      },
      () => {},
    );
    return () => {
      ok = false;
    };
  }, [uri]);
  return (
    <View style={styles.imageWrap}>
      <Image source={{ uri }} style={[styles.image, { aspectRatio: ratio }]} resizeMode="cover" />
      <Text style={styles.imageLabel}>{label}</Text>
    </View>
  );
}

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => detailPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
  const [ex, setEx] = useState<LibraryExercise | null>(null);
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(true);
  const [titling, setTitling] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!id) return;
        const [exercise, favIds] = await Promise.all([getExercise(id), listFavoriteIds()]);
        if (!active) return;
        setEx(exercise);
        setFav(favIds.includes(id));
      } catch (e) {
        Alert.alert('Could not load', String((e as Error).message ?? e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  async function toggleFav() {
    if (!id) return;
    const next = !fav;
    setFav(next);
    try {
      await setFavorite(id, next);
    } catch (e) {
      setFav(!next);
      Alert.alert('Could not update favorite', String((e as Error).message ?? e));
    }
  }

  async function onSaveWorkout(title: string) {
    if (!ex) return;
    setSaving(true);
    try {
      // A workout must have a title; the exercise lives inside it as a
      // checklist item — never a lone exercise on the timeline.
      await createItem({
        type: 'workout',
        title,
        checklist: [{ text: ex.name, done: false }],
        starts_at: new Date().toISOString(),
      });
      setTitling(false);
      showToast('Workout saved 💪');
      router.navigate('/today' as never);
    } catch (e) {
      Alert.alert('Could not save', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.action} />
      </View>
    );
  }
  if (!ex) {
    return (
      <View style={styles.center}>
        <EmptyState icon="barbell-outline" title="Exercise not found" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.name}>{ex.name}</Text>
        <Pressable
          onPress={toggleFav}
          hitSlop={8}
          style={({ pressed }) => [styles.starBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={fav ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Ionicons
            name={fav ? 'star' : 'star-outline'}
            size={26}
            color={fav ? palette.accent : palette.placeholder}
          />
        </Pressable>
      </View>
      <Text style={styles.meta}>
        {ex.primary_muscles.join(', ') || 'full body'} · {prettyEquipment(ex.equipment)}
        {ex.level ? ` · ${ex.level}` : ''}
      </Text>

      <View style={styles.images}>
        {ex.images.map((u, i) => (
          <DemoImage
            key={i}
            uri={u}
            label={ex.images.length === 1 ? 'Demo' : i === 0 ? 'Start' : 'Finish'}
          />
        ))}
      </View>

      <Text style={styles.heading}>How to do it</Text>
      {ex.instructions.map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <Button
        title="Add to a workout 💪"
        onPress={() => setTitling(true)}
        style={styles.log}
      />

      <WorkoutTitleModal
        visible={titling}
        exercises={[ex.name]}
        saving={saving}
        onCancel={() => setTitling(false)}
        onSave={onSaveWorkout}
      />
    </ScrollView>
  );
}

function detailPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    background: mode === 'light' ? legacyColors.background : theme.surface.canvas,
    card: mode === 'light' ? legacyColors.card : theme.surface.card,
    field: mode === 'light'
      ? legacyColors.surface
      : theme.surface.raised,
    ink: mode === 'light' ? legacyColors.text : theme.ink.primary,
    muted: mode === 'light' ? legacyColors.textMuted : theme.ink.muted,
    placeholder: mode === 'light' ? legacyColors.textFaint : theme.ink.muted,
    border: mode === 'light' ? legacyColors.border : theme.border.subtle,
    action: mode === 'light' ? legacyColors.primaryDark : theme.ink.action,
    onAction: mode === 'light' ? '#FFFFFF' : theme.ink.inverse,
    accent: mode === 'light' ? legacyColors.accent : theme.status.attention,
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = detailPalette(theme, mode);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  pressed: { opacity: 0.7 },
  container: { padding: spacing.xl, gap: 10, paddingBottom: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 22, fontFamily: font.extrabold, color: palette.ink, flex: 1 },
  starBtn: {
    minWidth: spacing.touch,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { color: palette.muted, fontFamily: font.regular, textTransform: 'capitalize' },
  images: { flexDirection: 'row', gap: spacing.md, marginTop: 6 },
  imageWrap: { flex: 1, gap: spacing.xs },
  image: {
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: palette.field,
  },
  imageLabel: { textAlign: 'center', color: palette.placeholder, fontSize: 12, fontFamily: font.semibold },
  heading: { fontSize: 16, fontFamily: font.bold, color: palette.ink, marginTop: 14 },
  step: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.action,
    color: palette.onAction,
    textAlign: 'center',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 22,
    overflow: 'hidden',
  },
  stepText: { flex: 1, lineHeight: 21, fontFamily: font.regular, color: palette.ink },
  log: { marginTop: spacing.xl },
  });
}
