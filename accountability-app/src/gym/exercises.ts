// AUTO-GENERATED from the public-domain free-exercise-db
// (https://github.com/yuhonas/free-exercise-db, Unlicense). Images are hotlinked
// demo photos (start/finish positions). Regenerate via scripts if needed.

export type Focus =
  | 'push'
  | 'pull'
  | 'legs'
  | 'core'
  | 'upper_body'
  | 'full_body';
export type Goal = 'strength' | 'muscle' | 'endurance';

export type Exercise = {
  name: string;
  emoji: string;
  cue: string;
  image: string;
  image2: string | null;
};

export const FOCUSES: { value: Focus; label: string }[] = [
  { value: 'push', label: "Push (Chest/Shoulders/Triceps)" },
  { value: 'pull', label: "Pull (Back/Biceps)" },
  { value: 'legs', label: "Legs" },
  { value: 'core', label: "Core" },
  { value: 'upper_body', label: "Upper Body" },
  { value: 'full_body', label: "Full Body" },
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
  "push": [
    {
      "name": "Barbell Bench Press - Medium Grip",
      "emoji": "💪",
      "cue": "Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movem…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg"
    },
    {
      "name": "Incline Dumbbell Press",
      "emoji": "💪",
      "cue": "Lie back on an incline bench with a dumbbell in each hand atop your thighs. The palms of your hands will be facing ea…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Incline_Dumbbell_Press/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Incline_Dumbbell_Press/1.jpg"
    },
    {
      "name": "Seated Barbell Military Press",
      "emoji": "🙌",
      "cue": "Sit on a Military Press Bench with a bar behind your head and either have a spotter give you the bar (better on the r…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Barbell_Military_Press/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Barbell_Military_Press/1.jpg"
    },
    {
      "name": "Side Lateral Raise",
      "emoji": "🙌",
      "cue": "Pick a couple of dumbbells and stand with a straight torso and the dumbbells by your side at arms length with the pal…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Side_Lateral_Raise/1.jpg"
    },
    {
      "name": "Triceps Pushdown",
      "emoji": "🔻",
      "cue": "Attach a straight or angled bar to a high pulley and grab with an overhand grip (palms facing down) at shoulder width.",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Triceps_Pushdown/1.jpg"
    },
    {
      "name": "Pushups",
      "emoji": "💪",
      "cue": "Lie on the floor face down and place your hands about 36 inches apart while holding your torso up at arms length.",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pushups/1.jpg"
    }
  ],
  "pull": [
    {
      "name": "Pullups",
      "emoji": "🧗",
      "cue": "Grab the pull-up bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your ha…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/1.jpg"
    },
    {
      "name": "Bent Over Barbell Row",
      "emoji": "🚣",
      "cue": "Holding a barbell with a pronated grip (palms facing down), bend your knees slightly and bring your torso forward, by…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/1.jpg"
    },
    {
      "name": "Wide-Grip Lat Pulldown",
      "emoji": "🧗",
      "cue": "Sit down on a pull-down machine with a wide bar attached to the top pulley. Make sure that you adjust the knee pad of…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Wide-Grip_Lat_Pulldown/1.jpg"
    },
    {
      "name": "Seated Cable Rows",
      "emoji": "🚣",
      "cue": "For this exercise you will need access to a low pulley row machine with a V-bar. Note: The V-bar will enable you to h…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Cable_Rows/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Cable_Rows/1.jpg"
    },
    {
      "name": "Face Pull",
      "emoji": "🙌",
      "cue": "Facing a high pulley with a rope or dual handles attached, pull the weight directly towards your face, separating you…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Face_Pull/1.jpg"
    },
    {
      "name": "Barbell Curl",
      "emoji": "💪",
      "cue": "Stand up with your torso upright while holding a barbell at a shoulder-width grip. The palm of your hands should be f…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/1.jpg"
    }
  ],
  "legs": [
    {
      "name": "Barbell Full Squat",
      "emoji": "🦵",
      "cue": "This exercise is best performed inside a squat rack for safety purposes. To begin, first set the bar on a rack just a…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Full_Squat/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Full_Squat/1.jpg"
    },
    {
      "name": "Romanian Deadlift",
      "emoji": "🦵",
      "cue": "Put a barbell in front of you on the ground and grab it using a pronated (palms facing down) grip that a little wider…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Romanian_Deadlift/1.jpg"
    },
    {
      "name": "Leg Press",
      "emoji": "🦵",
      "cue": "Using a leg press machine, sit down on the machine and place your legs on the platform directly in front of you at a…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/1.jpg"
    },
    {
      "name": "Barbell Walking Lunge",
      "emoji": "🦵",
      "cue": "Begin standing with your feet shoulder width apart and a barbell across your upper back.",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Walking_Lunge/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Walking_Lunge/1.jpg"
    },
    {
      "name": "Lying Leg Curls",
      "emoji": "🦵",
      "cue": "Adjust the machine lever to fit your height and lie face down on the leg curl machine with the pad of the lever on th…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Lying_Leg_Curls/1.jpg"
    },
    {
      "name": "Standing Calf Raises",
      "emoji": "🦶",
      "cue": "Adjust the padded lever of the calf raise machine to fit your height.",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Standing_Calf_Raises/1.jpg"
    }
  ],
  "core": [
    {
      "name": "Plank",
      "emoji": "🧱",
      "cue": "Get into a prone position on the floor, supporting your weight on your toes and your forearms. Your arms are bent and…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Plank/1.jpg"
    },
    {
      "name": "Crunches",
      "emoji": "🧱",
      "cue": "Lie flat on your back with your feet flat on the ground, or resting on a bench with your knees bent at a 90 degree an…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Crunches/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Crunches/1.jpg"
    },
    {
      "name": "Hanging Leg Raise",
      "emoji": "🧱",
      "cue": "Hang from a chin-up bar with both arms extended at arms length in top of you using either a wide grip or a medium gri…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Leg_Raise/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Hanging_Leg_Raise/1.jpg"
    },
    {
      "name": "Air Bike",
      "emoji": "🧱",
      "cue": "Lie flat on the floor with your lower back pressed to the ground. For this exercise, you will need to put your hands…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Air_Bike/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Air_Bike/1.jpg"
    },
    {
      "name": "Russian Twist",
      "emoji": "🧱",
      "cue": "Lie down on the floor placing your feet either under something that will not move or by having a partner hold them. Y…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Russian_Twist/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Russian_Twist/1.jpg"
    }
  ],
  "upper_body": [
    {
      "name": "Barbell Bench Press - Medium Grip",
      "emoji": "💪",
      "cue": "Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movem…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg"
    },
    {
      "name": "Bent Over Barbell Row",
      "emoji": "🚣",
      "cue": "Holding a barbell with a pronated grip (palms facing down), bend your knees slightly and bring your torso forward, by…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Bent_Over_Barbell_Row/1.jpg"
    },
    {
      "name": "Seated Barbell Military Press",
      "emoji": "🙌",
      "cue": "Sit on a Military Press Bench with a bar behind your head and either have a spotter give you the bar (better on the r…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Barbell_Military_Press/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Barbell_Military_Press/1.jpg"
    },
    {
      "name": "Pullups",
      "emoji": "🧗",
      "cue": "Grab the pull-up bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your ha…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/1.jpg"
    },
    {
      "name": "Barbell Curl",
      "emoji": "💪",
      "cue": "Stand up with your torso upright while holding a barbell at a shoulder-width grip. The palm of your hands should be f…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Curl/1.jpg"
    }
  ],
  "full_body": [
    {
      "name": "Barbell Deadlift",
      "emoji": "🏋️",
      "cue": "Stand in front of a loaded barbell.",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Deadlift/1.jpg"
    },
    {
      "name": "Barbell Full Squat",
      "emoji": "🦵",
      "cue": "This exercise is best performed inside a squat rack for safety purposes. To begin, first set the bar on a rack just a…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Full_Squat/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Full_Squat/1.jpg"
    },
    {
      "name": "Barbell Bench Press - Medium Grip",
      "emoji": "💪",
      "cue": "Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movem…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Barbell_Bench_Press_-_Medium_Grip/1.jpg"
    },
    {
      "name": "Pullups",
      "emoji": "🧗",
      "cue": "Grab the pull-up bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your ha…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/1.jpg"
    },
    {
      "name": "Seated Barbell Military Press",
      "emoji": "🙌",
      "cue": "Sit on a Military Press Bench with a bar behind your head and either have a spotter give you the bar (better on the r…",
      "image": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Barbell_Military_Press/0.jpg",
      "image2": "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Seated_Barbell_Military_Press/1.jpg"
    }
  ]
};

export function focusLabel(focus: Focus): string {
  return FOCUSES.find((f) => f.value === focus)?.label ?? 'Workout';
}
