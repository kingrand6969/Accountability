export type Focus = 'arms_chest' | 'back' | 'legs' | 'full_body';
export type Goal = 'strength' | 'muscle' | 'endurance';

export type Exercise = {
  name: string;
  emoji: string;
  cue: string;
  // image?: string  // real demo photo/GIF slots in here during the content pass
};

export const FOCUSES: { value: Focus; label: string }[] = [
  { value: 'arms_chest', label: 'Arms & Chest' },
  { value: 'back', label: 'Back' },
  { value: 'legs', label: 'Legs' },
  { value: 'full_body', label: 'Full Body' },
];

export const GOALS: {
  value: Goal;
  label: string;
  sets: number;
  reps: string;
  restSec: number;
}[] = [
  { value: 'strength', label: 'Strength', sets: 5, reps: '5', restSec: 120 },
  { value: 'muscle', label: 'Muscle', sets: 4, reps: '8–12', restSec: 75 },
  { value: 'endurance', label: 'Endurance', sets: 3, reps: '15–20', restSec: 45 },
];

export const EXERCISES: Record<Focus, Exercise[]> = {
  arms_chest: [
    { name: 'Bench Press', emoji: '🏋️', cue: 'Lower to mid-chest, drive up evenly.' },
    { name: 'Incline Dumbbell Press', emoji: '💪', cue: '45° bench, control the negative.' },
    { name: 'Push-ups', emoji: '🤸', cue: 'Body straight, full range each rep.' },
    { name: 'Bicep Curls', emoji: '💪', cue: 'Elbows pinned, no swinging.' },
    { name: 'Triceps Dips', emoji: '🔻', cue: 'Lower until elbows reach ~90°.' },
  ],
  back: [
    { name: 'Pull-ups', emoji: '🧗', cue: 'Pull chest to bar, slow descent.' },
    { name: 'Bent-over Rows', emoji: '🏋️', cue: 'Flat back, pull to belt line.' },
    { name: 'Lat Pulldown', emoji: '🔽', cue: 'Drive elbows down, squeeze lats.' },
    { name: 'Seated Cable Row', emoji: '🚣', cue: 'Tall chest, no leaning back.' },
    { name: 'Face Pulls', emoji: '🎯', cue: 'Pull to forehead, elbows high.' },
  ],
  legs: [
    { name: 'Back Squats', emoji: '🦵', cue: 'Brace core, hips below knees.' },
    { name: 'Romanian Deadlift', emoji: '🏋️', cue: 'Hinge hips, feel the hamstrings.' },
    { name: 'Walking Lunges', emoji: '🚶', cue: 'Long step, knee tracks over toe.' },
    { name: 'Leg Press', emoji: '🔩', cue: 'Full range, don’t lock knees hard.' },
    { name: 'Calf Raises', emoji: '🦶', cue: 'Pause at the top, full stretch.' },
  ],
  full_body: [
    { name: 'Deadlift', emoji: '🏋️', cue: 'Bar over mid-foot, push the floor.' },
    { name: 'Back Squats', emoji: '🦵', cue: 'Brace core, hips below knees.' },
    { name: 'Bench Press', emoji: '💪', cue: 'Lower to mid-chest, drive up.' },
    { name: 'Pull-ups', emoji: '🧗', cue: 'Pull chest to bar, slow descent.' },
    { name: 'Overhead Press', emoji: '🙌', cue: 'Squeeze glutes, press to lockout.' },
  ],
};

export function focusLabel(focus: Focus): string {
  return FOCUSES.find((f) => f.value === focus)?.label ?? 'Workout';
}
