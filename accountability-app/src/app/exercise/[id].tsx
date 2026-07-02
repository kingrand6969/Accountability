import { useEffect, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import {
  getExercise,
  listFavoriteIds,
  setFavorite,
  prettyEquipment,
  type LibraryExercise,
} from '../../gym/library';
import { createItem } from '../../timeline/api';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing } from '../../ui/theme';

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [ex, setEx] = useState<LibraryExercise | null>(null);
  const [fav, setFav] = useState(false);
  const [loading, setLoading] = useState(true);

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

  async function onLog() {
    if (!ex) return;
    try {
      await createItem({
        type: 'workout',
        title: ex.name,
        note: null,
        starts_at: new Date().toISOString(),
      });
      showToast(`${ex.name} logged 💪`);
      router.navigate('/');
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
            color={fav ? colors.accent : colors.textFaint}
          />
        </Pressable>
      </View>
      <Text style={styles.meta}>
        {ex.primary_muscles.join(', ') || 'full body'} · {prettyEquipment(ex.equipment)}
        {ex.level ? ` · ${ex.level}` : ''}
      </Text>

      <View style={styles.images}>
        {ex.images.map((u, i) => (
          <View key={i} style={styles.imageWrap}>
            <Image source={{ uri: u }} style={styles.image} resizeMode="cover" />
            <Text style={styles.imageLabel}>{i === 0 ? 'Start' : 'Finish'}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.heading}>How to do it</Text>
      {ex.instructions.map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}

      <Button title="Log this exercise 💪" onPress={onLog} style={styles.log} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  pressed: { opacity: 0.7 },
  container: { padding: spacing.xl, gap: 10, paddingBottom: 48 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { fontSize: 22, fontFamily: font.extrabold, color: colors.text, flex: 1 },
  starBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { color: colors.textMuted, fontFamily: font.regular, textTransform: 'capitalize' },
  images: { flexDirection: 'row', gap: 10, marginTop: 6 },
  imageWrap: { flex: 1, gap: spacing.xs },
  image: { width: '100%', height: 160, borderRadius: radius.md, backgroundColor: colors.surface },
  imageLabel: { textAlign: 'center', color: colors.textFaint, fontSize: 12, fontFamily: font.semibold },
  heading: { fontSize: 16, fontFamily: font.bold, color: colors.text, marginTop: 14 },
  step: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    color: colors.onPrimary,
    textAlign: 'center',
    fontFamily: font.bold,
    fontSize: 12,
    lineHeight: 22,
    overflow: 'hidden',
  },
  stepText: { flex: 1, lineHeight: 21, fontFamily: font.regular, color: colors.text },
  log: { marginTop: spacing.xl },
});
