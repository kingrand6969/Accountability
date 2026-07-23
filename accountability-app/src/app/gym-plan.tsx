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
import { useIsPro } from '../pro/ProProvider';
import { Button } from '../ui/Button';
import { showToast } from '../ui/Toast';
import { colors, font, radius, spacing, contentMax } from '../ui/theme';

export default function GymPlan() {
  const router = useRouter();
  const { isPro, loading: proLoading } = useIsPro();
  const [focus, setFocus] = useState<Set<MuscleGroup>>(new Set());
  const [equip, setEquip] = useState<'any' | 'gym' | 'body'>('any');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set()); // exercises to lock on regenerate
  const [generating, setGenerating] = useState(false);

  function toggleKeep(id: string) {
    setKeep((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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
      const matchesEquip = (e: { equipment: string | null }) => {
        if (equip === 'body') return e.equipment === 'body only';
        if (equip === 'gym') return !!e.equipment && e.equipment !== 'body only';
        return true;
      };
      const pools = await Promise.all(
        chosen.map(async (muscle) => {
          const list = (await listExercises({ muscle, offset: 0 })).filter(matchesEquip);
          // prefer entries with a demo image for nicer cards
          const withImg = list.filter((e) => e.images.length > 0);
          return { muscle, pool: withImg.length >= 3 ? withImg : list };
        }),
      );
      const perMuscle = focus.size >= 4 ? 1 : focus.size >= 2 ? 2 : 3;
      // over-provision so we have fresh spares to fill the unchecked slots
      const built = buildPlan(pools, goal, perMuscle + 2);
      if (built.length === 0) {
        Alert.alert(
          'No exercises found',
          equip === 'body'
            ? 'No bodyweight moves for those areas — try “Any” equipment.'
            : 'Try different body parts or equipment.',
        );
        return;
      }

      if (plan) {
        // Regenerate: keep the checked exercises in place, swap the rest for
        // fresh ones (no dupes vs. what's kept).
        const usedIds = new Set(
          plan.filter((p) => keep.has(p.exercise.id)).map((p) => p.exercise.id),
        );
        let fi = 0;
        const next = plan.map((item) => {
          if (keep.has(item.exercise.id)) return item; // locked — retain
          while (fi < built.length && usedIds.has(built[fi].exercise.id)) fi++;
          if (fi < built.length) {
            const pick = built[fi++];
            usedIds.add(pick.exercise.id);
            return pick;
          }
          return item; // ran out of spares — keep as-is
        });
        setPlan(next);
      } else {
        setPlan(built.slice(0, perMuscle * focus.size));
        setKeep(new Set());
      }
    } catch (e) {
      Alert.alert('Could not build a plan', String((e as Error).message ?? e));
    } finally {
      setGenerating(false);
    }
  }

  async function logPlan() {
    if (!plan) return;
    // Log only the checked exercises; if none are checked, take the whole plan.
    const chosen = plan.filter((p) => keep.has(p.exercise.id));
    const toLog = chosen.length > 0 ? chosen : plan;
    try {
      await createItem({
        type: 'workout',
        title: 'My plan',
        // a fresh checklist to tick off while training
        checklist: toLog.map((p) => ({
          text: `${p.exercise.name} — ${p.sets}×${p.reps}`,
          done: false,
        })),
        starts_at: new Date().toISOString(),
      });
      showToast('Plan logged as a workout 💪');
      router.navigate('/today' as never);
    } catch (e) {
      Alert.alert('Could not log', String((e as Error).message ?? e));
    }
  }

  if (proLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // browsing the library is free — the plan BUILDER is the Pro tool
  if (!isPro) {
    return (
      <View style={styles.upsell}>
        <View style={styles.upsellIconCircle}>
          <Ionicons name="barbell-outline" size={48} color={colors.pro} />
        </View>
        <Text style={styles.upsellTitle}>Build My Plan</Text>
        <Text style={styles.upsellText}>
          A personalised workout plan from your goals, equipment and BMI — a Pro feature.
        </Text>
        <Button
          title="Upgrade to Pro"
          onPress={() => router.push('/paywall')}
          style={styles.upsellBtn}
        />
      </View>
    );
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

      <Text style={styles.sectionTitle}>Equipment</Text>
      <View style={styles.toggle}>
        {(
          [
            { value: 'any', label: 'Any', icon: 'apps-outline' },
            { value: 'gym', label: 'With gear', icon: 'barbell-outline' },
            { value: 'body', label: 'Bodyweight', icon: 'body-outline' },
          ] as const
        ).map((o) => {
          const on = equip === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => setEquip(o.value)}
              style={({ pressed }) => [
                styles.toggleBtn,
                on && styles.toggleActive,
                pressed && styles.pressed,
              ]}
              accessibilityState={{ selected: on }}
            >
              <Ionicons
                name={o.icon}
                size={15}
                color={on ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.toggleText, on && styles.toggleTextActive]}>{o.label}</Text>
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
          <Text style={styles.keepHint}>
            ✓ Check the exercises you want. Regenerate re-rolls the unchecked; Log saves the checked.
          </Text>
          {plan.map((item) => {
            const isKept = keep.has(item.exercise.id);
            return (
              <View key={item.exercise.id} style={[styles.exRow, isKept && styles.exRowKept]}>
                {/* check = keep this one; Regenerate re-rolls the unchecked */}
                <Pressable
                  onPress={() => toggleKeep(item.exercise.id)}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.checkBox,
                    isKept && styles.checkBoxOn,
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isKept }}
                  accessibilityLabel={`Keep ${item.exercise.name} when regenerating`}
                >
                  {isKept ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.exBody, pressed && styles.pressed]}
                  onPress={() =>
                    router.push({ pathname: '/exercise/[id]', params: { id: item.exercise.id } })
                  }
                  accessibilityLabel={`How to do ${item.exercise.name}`}
                >
                  {item.exercise.images[0] ? (
                    <Image source={{ uri: item.exercise.images[0] }} style={styles.thumb} resizeMode="contain" />
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
                  <Ionicons name="information-circle-outline" size={20} color={colors.textFaint} />
                </Pressable>
              </View>
            );
          })}
          <Button
            title={
              keep.size > 0
                ? `Log workout (${keep.size} checked)`
                : 'Log all as a workout'
            }
            onPress={logPlan}
            style={styles.logBtn}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  upsell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  upsellIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsellTitle: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  upsellText: {
    fontFamily: font.regular,
    fontSize: 14.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  upsellBtn: { alignSelf: 'stretch', maxWidth: 320, marginTop: spacing.sm },
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
  toggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 8,
    minHeight: 40,
  },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 13 },
  toggleTextActive: { color: colors.primary },
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
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: 10,
    paddingVertical: 10,
  },
  checkBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxOn: { backgroundColor: colors.success, borderColor: colors.success },
  exRowKept: { borderColor: colors.success, backgroundColor: colors.successSoft },
  keepHint: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: -2 },
  exBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
