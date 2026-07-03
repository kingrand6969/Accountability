import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  listExercises,
  MUSCLE_GROUPS,
  prettyEquipment,
  type MuscleGroup,
} from '../gym/library';
import { bmi, bmiCategory, buildPlan, schemeFor, type PlanItem } from '../gym/plan';
import { createItem } from '../timeline/api';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing, contentMax } from '../ui/theme';

export default function GymPlan() {
  const router = useRouter();
  const [focus, setFocus] = useState<Set<MuscleGroup>>(new Set());
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [generating, setGenerating] = useState(false);

  const b = bmi(parseFloat(weightKg), parseFloat(heightCm));
  const cat = b !== null ? bmiCategory(b) : null;
  const goal = cat?.goal ?? null;
  const scheme = schemeFor(goal);

  function toggle(m: MuscleGroup) {
    setFocus((cur) => {
      const n = new Set(cur);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  }

  async function generate() {
    if (focus.size === 0) return;
    setGenerating(true);
    try {
      const chosen = [...focus];
      const pools = await Promise.all(
        chosen.map(async (muscle) => {
          const list = await listExercises({ muscle, offset: 0 });
          // prefer entries with a demo image for nicer cards
          const withImg = list.filter((e) => e.images.length > 0);
          return { muscle, pool: withImg.length >= 3 ? withImg : list };
        }),
      );
      const perMuscle = focus.size >= 4 ? 1 : focus.size >= 2 ? 2 : 3;
      const built = buildPlan(pools, goal, perMuscle);
      if (built.length === 0) {
        Alert.alert('No exercises found', 'Try different body parts.');
        return;
      }
      setPlan(built);
    } catch (e) {
      Alert.alert('Could not build a plan', String((e as Error).message ?? e));
    } finally {
      setGenerating(false);
    }
  }

  async function logPlan() {
    if (!plan) return;
    try {
      await createItem({
        type: 'workout',
        title: 'My plan',
        note: plan.map((p) => p.exercise.name).join(', '),
        starts_at: new Date().toISOString(),
      });
      showToast('Plan logged as a workout 💪');
      router.navigate('/today' as never);
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="sparkles" size={22} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>Build my plan</Text>
        <Text style={styles.heroSub}>
          Pick what you want to train — we&apos;ll pull the exercises for you.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Focus areas</Text>
      <View style={styles.chips}>
        {MUSCLE_GROUPS.map((g) => {
          const on = focus.has(g.value);
          return (
            <Pressable
              key={g.value}
              onPress={() => toggle(g.value)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
              accessibilityState={{ selected: on }}
            >
              {on ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{g.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Your BMI (optional)</Text>
      <Text style={styles.hint}>
        Add height &amp; weight and we&apos;ll tailor the exercises. Skip it for a
        random plan.
      </Text>
      <View style={styles.bmiRow}>
        <View style={styles.bmiField}>
          <TextInput
            style={styles.input}
            placeholder="Height"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            value={heightCm}
            onChangeText={setHeightCm}
          />
          <Text style={styles.unit}>cm</Text>
        </View>
        <View style={styles.bmiField}>
          <TextInput
            style={styles.input}
            placeholder="Weight"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            value={weightKg}
            onChangeText={setWeightKg}
          />
          <Text style={styles.unit}>kg</Text>
        </View>
      </View>
      {b !== null && cat ? (
        <View style={styles.bmiBadge}>
          <Ionicons name="fitness-outline" size={15} color={colors.primary} />
          <Text style={styles.bmiText}>
            BMI {b} · {cat.label} — {scheme.note}
          </Text>
        </View>
      ) : null}

      <Button
        title={plan ? 'Regenerate plan' : 'Create a plan for me'}
        onPress={generate}
        loading={generating}
        disabled={focus.size === 0}
        icon={<Ionicons name="sparkles" size={17} color="#fff" />}
        style={styles.generate}
      />
      {focus.size === 0 ? (
        <Text style={styles.pickHint}>Pick at least one focus area above.</Text>
      ) : null}

      {plan ? (
        <>
          <View style={styles.planHeader}>
            <Text style={styles.sectionTitle}>Your plan</Text>
            <Text style={styles.planScheme}>
              {scheme.sets} sets · {scheme.reps} reps each
            </Text>
          </View>
          {plan.map((item) => (
            <Pressable
              key={item.exercise.id}
              style={({ pressed }) => [styles.exRow, pressed && styles.pressed]}
              onPress={() =>
                router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
              }
            >
              {item.exercise.images[0] ? (
                <Image source={{ uri: item.exercise.images[0] }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]}>
                  <Ionicons name="barbell-outline" size={22} color={colors.textFaint} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.exName}>{item.exercise.name}</Text>
                <Text style={styles.exMeta}>
                  {item.sets} × {item.reps} · {prettyEquipment(item.exercise.equipment)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
          <Button title="Log this as a workout" onPress={logPlan} style={styles.logBtn} />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: 48,
    backgroundColor: colors.background,
    ...contentMax,
  },
  pressed: { opacity: 0.7 },
  hero: { alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heroTitle: { fontSize: 22, fontFamily: font.extrabold, color: colors.text },
  heroSub: {
    color: colors.textMuted,
    fontFamily: font.regular,
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  hint: { color: colors.textMuted, fontFamily: font.regular, fontSize: 12.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 15,
    minHeight: 42,
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontFamily: font.semibold, fontSize: 14 },
  chipTextOn: { color: '#fff' },
  bmiRow: { flexDirection: 'row', gap: spacing.md },
  bmiField: { flex: 1, position: 'relative', justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    paddingRight: 42,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  unit: {
    position: 'absolute',
    right: 14,
    color: colors.textFaint,
    fontFamily: font.semibold,
    fontSize: 13,
  },
  bmiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginTop: 2,
  },
  bmiText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 12.5, flexShrink: 1 },
  generate: { marginTop: spacing.lg },
  pickHint: {
    color: colors.textFaint,
    fontFamily: font.medium,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: 4,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  planScheme: { color: colors.primary, fontFamily: font.bold, fontSize: 12.5 },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
  },
  thumb: { width: 54, height: 54, borderRadius: radius.sm - 2, backgroundColor: colors.surface },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  exName: { fontSize: 15, fontFamily: font.bold, color: colors.text },
  exMeta: {
    color: colors.textMuted,
    fontFamily: font.medium,
    fontSize: 13,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  logBtn: { marginTop: spacing.md },
});
