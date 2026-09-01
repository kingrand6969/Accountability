import type { ImageSourcePropType } from 'react-native';

export const WORKOUT_PHOTO_CATEGORIES = ['push', 'pull', 'legs', 'general'] as const;
export type WorkoutPhotoCategory = (typeof WORKOUT_PHOTO_CATEGORIES)[number];

export type WorkoutPhoto = Readonly<{
  id: string;
  category: WorkoutPhotoCategory;
  source: ImageSourcePropType;
  alt: string;
  licenseSource: string;
  licenseAuthor: string;
}>;

const LICENSE_SOURCE = 'OpenAI generated for Mantle';
const LICENSE_AUTHOR = 'OpenAI';

function photo(
  id: string,
  category: WorkoutPhotoCategory,
  source: ImageSourcePropType,
  alt: string,
): WorkoutPhoto {
  return Object.freeze({ id, category, source, alt, licenseSource: LICENSE_SOURCE, licenseAuthor: LICENSE_AUTHOR });
}

export const PUSH_PHOTOS = Object.freeze([
  photo('push-01', 'push', require('../../assets/journey/workouts/push/push-01.webp'), 'Athlete performing a barbell bench press in a strength gym.'),
  photo('push-02', 'push', require('../../assets/journey/workouts/push/push-02.webp'), 'Woman pressing dumbbells on an incline bench in a bright gym.'),
  photo('push-03', 'push', require('../../assets/journey/workouts/push/push-03.webp'), 'Man training his chest on a seated plate-loaded press machine.'),
  photo('push-04', 'push', require('../../assets/journey/workouts/push/push-04.webp'), 'Woman completing a standing barbell shoulder press with controlled form.'),
  photo('push-05', 'push', require('../../assets/journey/workouts/push/push-05.webp'), 'Man performing a seated dumbbell shoulder press against a brick wall.'),
  photo('push-06', 'push', require('../../assets/journey/workouts/push/push-06.webp'), 'Woman holding a strong push-up position on the gym floor.'),
  photo('push-07', 'push', require('../../assets/journey/workouts/push/push-07.webp'), 'Athlete performing parallel-bar dips at an outdoor training station.'),
  photo('push-08', 'push', require('../../assets/journey/workouts/push/push-08.webp'), 'Woman extending a cable rope downward for focused triceps training.'),
  photo('push-09', 'push', require('../../assets/journey/workouts/push/push-09.webp'), 'Man lowering a barbell during a close-grip bench press.'),
  photo('push-10', 'push', require('../../assets/journey/workouts/push/push-10.webp'), 'Woman rotating through a standing landmine press in a studio gym.'),
  photo('push-11', 'push', require('../../assets/journey/workouts/push/push-11.webp'), 'Woman using a seated pec-deck machine for chest training.'),
  photo('push-12', 'push', require('../../assets/journey/workouts/push/push-12.webp'), 'Man performing a lying EZ-bar triceps extension on a flat bench.'),
  photo('push-13', 'push', require('../../assets/journey/workouts/push/push-13.webp'), 'Athlete performing deep push-ups using low parallettes.'),
  photo('push-14', 'push', require('../../assets/journey/workouts/push/push-14.webp'), 'Woman pressing forward on a seated chest press machine.'),
  photo('push-15', 'push', require('../../assets/journey/workouts/push/push-15.webp'), 'Man pressing two dumbbells overhead on an incline bench.'),
  photo('push-16', 'push', require('../../assets/journey/workouts/push/push-16.webp'), 'Athlete completing controlled bodyweight dips on parallel handles.'),
] as const);

export const PULL_PHOTOS = Object.freeze([
  photo('pull-01', 'pull', require('../../assets/journey/workouts/pull/pull-01.webp'), 'Man performing a wide-grip pull-up in a modern strength gym.'),
  photo('pull-02', 'pull', require('../../assets/journey/workouts/pull/pull-02.webp'), 'Woman pulling down on an assisted lat pulldown machine.'),
  photo('pull-03', 'pull', require('../../assets/journey/workouts/pull/pull-03.webp'), 'Woman training her back with a wide-grip cable pulldown.'),
  photo('pull-04', 'pull', require('../../assets/journey/workouts/pull/pull-04.webp'), 'Man completing a seated cable row with a neutral grip.'),
  photo('pull-05', 'pull', require('../../assets/journey/workouts/pull/pull-05.webp'), 'Man bracing on a bench for a single-arm dumbbell row.'),
  photo('pull-06', 'pull', require('../../assets/journey/workouts/pull/pull-06.webp'), 'Woman performing a supported single-arm dumbbell row.'),
  photo('pull-07', 'pull', require('../../assets/journey/workouts/pull/pull-07.webp'), 'Man pulling a loaded barbell toward his torso in a bent-over row.'),
  photo('pull-08', 'pull', require('../../assets/journey/workouts/pull/pull-08.webp'), 'Woman lifting a barbell from the floor during a deadlift.'),
  photo('pull-09', 'pull', require('../../assets/journey/workouts/pull/pull-09.webp'), 'Man holding two dumbbells at the bottom of a Romanian deadlift.'),
  photo('pull-10', 'pull', require('../../assets/journey/workouts/pull/pull-10.webp'), 'Woman pulling a cable rope toward her face for upper-back work.'),
  photo('pull-11', 'pull', require('../../assets/journey/workouts/pull/pull-11.webp'), 'Woman using a reverse-fly machine to train her upper back.'),
  photo('pull-12', 'pull', require('../../assets/journey/workouts/pull/pull-12.webp'), 'Older man performing a controlled standing EZ-bar curl.'),
  photo('pull-13', 'pull', require('../../assets/journey/workouts/pull/pull-13.webp'), 'Woman performing a standing double-dumbbell biceps curl.'),
  photo('pull-14', 'pull', require('../../assets/journey/workouts/pull/pull-14.webp'), 'Man holding dumbbells for alternating standing biceps curls.'),
  photo('pull-15', 'pull', require('../../assets/journey/workouts/pull/pull-15.webp'), 'Woman performing a focused single-arm cable curl.'),
  photo('pull-16', 'pull', require('../../assets/journey/workouts/pull/pull-16.webp'), 'Man curling a short cable bar beside a gym window.'),
] as const);

export const LEGS_PHOTOS = Object.freeze([
  photo('legs-01', 'legs', require('../../assets/journey/workouts/legs/legs-01.webp'), 'Man performing a deep back squat with a loaded barbell.'),
  photo('legs-02', 'legs', require('../../assets/journey/workouts/legs/legs-02.webp'), 'Woman holding a stable front squat with a barbell.'),
  photo('legs-03', 'legs', require('../../assets/journey/workouts/legs/legs-03.webp'), 'Man performing a goblet squat with a kettlebell.'),
  photo('legs-04', 'legs', require('../../assets/journey/workouts/legs/legs-04.webp'), 'Woman completing a rear-foot-elevated split squat with dumbbells.'),
  photo('legs-05', 'legs', require('../../assets/journey/workouts/legs/legs-05.webp'), 'Man stepping forward into a weighted dumbbell lunge.'),
  photo('legs-06', 'legs', require('../../assets/journey/workouts/legs/legs-06.webp'), 'Older woman holding a balanced bodyweight lunge at home.'),
  photo('legs-07', 'legs', require('../../assets/journey/workouts/legs/legs-07.webp'), 'Woman driving a sled-style leg press through a controlled range.'),
  photo('legs-08', 'legs', require('../../assets/journey/workouts/legs/legs-08.webp'), 'Man training his legs on a hack squat machine.'),
  photo('legs-09', 'legs', require('../../assets/journey/workouts/legs/legs-09.webp'), 'Woman hinging at the hips during a barbell Romanian deadlift.'),
  photo('legs-10', 'legs', require('../../assets/journey/workouts/legs/legs-10.webp'), 'Woman completing a weighted barbell hip thrust on a bench.'),
  photo('legs-11', 'legs', require('../../assets/journey/workouts/legs/legs-11.webp'), 'Woman using a lying leg curl machine for hamstring training.'),
  photo('legs-12', 'legs', require('../../assets/journey/workouts/legs/legs-12.webp'), 'Man extending both knees on a seated leg extension machine.'),
  photo('legs-13', 'legs', require('../../assets/journey/workouts/legs/legs-13.webp'), 'Athlete performing standing calf raises on a raised platform.'),
  photo('legs-14', 'legs', require('../../assets/journey/workouts/legs/legs-14.webp'), 'Woman training her calves on a seated calf raise machine.'),
  photo('legs-15', 'legs', require('../../assets/journey/workouts/legs/legs-15.webp'), 'Man stepping onto a high box while holding dumbbells.'),
  photo('legs-16', 'legs', require('../../assets/journey/workouts/legs/legs-16.webp'), 'Woman swinging a kettlebell outdoors with an athletic hip hinge.'),
] as const);

export const GENERAL_PHOTOS = Object.freeze([
  photo('general-01', 'general', require('../../assets/journey/workouts/general/general-01.webp'), 'Man building cardio consistency during a treadmill run.'),
  photo('general-02', 'general', require('../../assets/journey/workouts/general/general-02.webp'), 'Woman enjoying a steady outdoor run beside the water.'),
  photo('general-03', 'general', require('../../assets/journey/workouts/general/general-03.webp'), 'Man training his endurance on an indoor rowing machine.'),
  photo('general-04', 'general', require('../../assets/journey/workouts/general/general-04.webp'), 'Woman completing a focused indoor cycling workout.'),
  photo('general-05', 'general', require('../../assets/journey/workouts/general/general-05.webp'), 'Woman using battle ropes during a full-body conditioning session.'),
  photo('general-06', 'general', require('../../assets/journey/workouts/general/general-06.webp'), 'Man pushing a weighted sled across indoor turf.'),
  photo('general-07', 'general', require('../../assets/journey/workouts/general/general-07.webp'), 'Older woman rotating with a medicine ball during functional training.'),
  photo('general-08', 'general', require('../../assets/journey/workouts/general/general-08.webp'), 'Man preparing for a kettlebell conditioning movement.'),
  photo('general-09', 'general', require('../../assets/journey/workouts/general/general-09.webp'), 'Woman skipping rope during a light conditioning workout.'),
  photo('general-10', 'general', require('../../assets/journey/workouts/general/general-10.webp'), 'Man moving through a controlled mobility flow in a home studio.'),
  photo('general-11', 'general', require('../../assets/journey/workouts/general/general-11.webp'), 'Woman resting in a gentle recovery stretch on a yoga mat.'),
  photo('general-12', 'general', require('../../assets/journey/workouts/general/general-12.webp'), 'Man holding a steady forearm plank during core training.'),
  photo('general-13', 'general', require('../../assets/journey/workouts/general/general-13.webp'), 'Woman carrying two kettlebells during a strength-conditioning session.'),
  photo('general-14', 'general', require('../../assets/journey/workouts/general/general-14.webp'), 'Man practicing boxing combinations on a heavy bag.'),
  photo('general-15', 'general', require('../../assets/journey/workouts/general/general-15.webp'), 'Small group training together with medicine balls and dumbbells.'),
  photo('general-16', 'general', require('../../assets/journey/workouts/general/general-16.webp'), 'Woman pausing beside a foam roller and water bottle after training.'),
] as const);

export const WORKOUT_PHOTO_POOLS: Readonly<Record<WorkoutPhotoCategory, readonly WorkoutPhoto[]>> = Object.freeze({
  push: PUSH_PHOTOS,
  pull: PULL_PHOTOS,
  legs: LEGS_PHOTOS,
  general: GENERAL_PHOTOS,
});

const TOKENS: Readonly<Record<Exclude<WorkoutPhotoCategory, 'general'>, ReadonlySet<string>>> = {
  push: new Set(['bench', 'chest', 'shoulder', 'shoulders', 'triceps', 'dip', 'dips']),
  pull: new Set(['row', 'rows', 'pull', 'deadlift', 'deadlifts', 'back', 'biceps', 'curl', 'curls']),
  legs: new Set(['squat', 'squats', 'lunge', 'lunges', 'leg', 'legs', 'hamstring', 'hamstrings', 'calf', 'calves']),
};

export function classifyWorkoutTitle(title: string): WorkoutPhotoCategory {
  const words = new Set(title.toLocaleLowerCase('en').split(/[^a-z0-9]+/).filter(Boolean));
  for (const category of ['push', 'pull', 'legs'] as const) {
    if ([...TOKENS[category]].some((token) => words.has(token))) return category;
  }
  return 'general';
}

export function selectWorkoutPhoto(
  pool: readonly WorkoutPhoto[],
  recentIds: readonly string[],
  random: () => number,
  excludedIds: readonly string[] = [],
): WorkoutPhoto {
  if (pool.length === 0) throw new Error('Workout photo pool cannot be empty.');
  const recent = new Set(recentIds.slice(-4));
  const excluded = new Set(excludedIds);
  const eligible = pool.filter((item) => !recent.has(item.id) && !excluded.has(item.id));
  const withoutExplicitExclusions = pool.filter((item) => !excluded.has(item.id));
  const candidates = eligible.length > 0 ? eligible : withoutExplicitExclusions.length > 0 ? withoutExplicitExclusions : pool;
  const sample = random();
  const normalized = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999, sample)) : 0.999999999;
  return candidates[Math.floor(normalized * candidates.length)];
}
