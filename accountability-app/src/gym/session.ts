import { EXERCISES, GOALS, type Focus, type Goal } from './exercises';

export type SessionExercise = {
  name: string;
  emoji: string;
  cue: string;
  image: string;
  image2: string | null;
  sets: number;
  reps: string;
  restSec: number;
};

/** Build a workout: the focus's exercises, with sets/reps/rest tuned to the goal. */
export function buildSession(focus: Focus, goal: Goal): SessionExercise[] {
  const g = GOALS.find((x) => x.value === goal) ?? GOALS[1];
  return EXERCISES[focus].map((e) => ({
    name: e.name,
    emoji: e.emoji,
    cue: e.cue,
    image: e.image,
    image2: e.image2,
    sets: g.sets,
    reps: g.reps,
    restSec: g.restSec,
  }));
}

/** Short one-line summary, e.g. "Bench Press 4×8–12, Push-ups 4×8–12". */
export function sessionSummary(exercises: SessionExercise[]): string {
  return exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(', ');
}
