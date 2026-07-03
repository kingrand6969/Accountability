import type { LibraryExercise, MuscleGroup } from './library';

/** BMI-derived training goal — steers exercise selection and rep scheme. */
export type PlanGoal = 'build' | 'tone' | 'easy';

export type PlanItem = { exercise: LibraryExercise; sets: number; reps: string };

/** kg + cm -> BMI, or null if either is missing/invalid (BMI is optional). */
export function bmi(weightKg: number, heightCm: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(b: number): { label: string; goal: PlanGoal } {
  if (b < 18.5) return { label: 'Underweight', goal: 'build' };
  if (b < 25) return { label: 'Healthy range', goal: 'build' };
  if (b < 30) return { label: 'Overweight', goal: 'tone' };
  return { label: 'Higher range', goal: 'easy' };
}

const SCHEME: Record<PlanGoal, { sets: number; reps: string; note: string }> = {
  build: { sets: 4, reps: '8–10', note: 'Heavier loads to build strength & muscle.' },
  tone: { sets: 3, reps: '12–15', note: 'Higher reps to tone up and burn.' },
  easy: { sets: 3, reps: '12–15', note: 'Lower-impact, steady pace to ease in.' },
};

const NEUTRAL = { sets: 3, reps: '10–12', note: 'A balanced full-range plan.' };

export function schemeFor(goal: PlanGoal | null) {
  return goal ? SCHEME[goal] : NEUTRAL;
}

/** Equipment we bias toward per goal (earlier = stronger preference). */
export function preferredEquipment(goal: PlanGoal | null): string[] {
  if (goal === 'build') return ['barbell', 'dumbbell', 'cable', 'machine'];
  if (goal === 'easy') return ['body only', 'machine', 'dumbbell'];
  if (goal === 'tone') return ['dumbbell', 'body only', 'cable', 'machine'];
  return []; // no BMI -> no bias, pure random
}

function prefScore(equipment: string | null, pref: string[]): number {
  const i = equipment ? pref.indexOf(equipment) : -1;
  return i === -1 ? 0 : pref.length - i;
}

/**
 * Build a plan: from each muscle's pool, pick `perMuscle` exercises.
 * Preferred-equipment (by goal) ranks higher, then randomness within — so the
 * plan fits the BMI goal but still varies. No goal -> pure random. Dedupes.
 * `rng` is injectable for deterministic tests.
 */
export function buildPlan(
  poolsByMuscle: { muscle: MuscleGroup; pool: LibraryExercise[] }[],
  goal: PlanGoal | null,
  perMuscle = 2,
  rng: () => number = Math.random,
): PlanItem[] {
  const pref = preferredEquipment(goal);
  const scheme = schemeFor(goal);
  const used = new Set<string>();
  const out: PlanItem[] = [];
  for (const { pool } of poolsByMuscle) {
    const ranked = pool
      .filter((e) => !used.has(e.id))
      .map((e) => ({ e, score: prefScore(e.equipment, pref) + rng() }))
      .sort((a, b) => b.score - a.score);
    for (const { e } of ranked.slice(0, perMuscle)) {
      used.add(e.id);
      out.push({ exercise: e, sets: scheme.sets, reps: scheme.reps });
    }
  }
  return out;
}
