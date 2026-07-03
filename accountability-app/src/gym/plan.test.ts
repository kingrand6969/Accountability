import { describe, it, expect } from '@jest/globals';
import { bmi, bmiCategory, buildPlan, preferredEquipment, schemeFor } from './plan';
import type { LibraryExercise, MuscleGroup } from './library';

function ex(id: string, equipment: string | null): LibraryExercise {
  return {
    id,
    name: `Ex ${id}`,
    category: 'strength',
    equipment,
    level: 'beginner',
    primary_muscles: ['chest'],
    images: [`${id}.jpg`],
    instructions: [],
  };
}

describe('bmi', () => {
  it('computes and rounds', () => {
    expect(bmi(70, 175)).toBe(22.9);
  });
  it('returns null when missing/invalid', () => {
    expect(bmi(0, 175)).toBeNull();
    expect(bmi(70, 0)).toBeNull();
    expect(bmi(NaN, 175)).toBeNull();
  });
});

describe('bmiCategory', () => {
  it('maps ranges to goals', () => {
    expect(bmiCategory(17).goal).toBe('build');
    expect(bmiCategory(22).goal).toBe('build');
    expect(bmiCategory(27).goal).toBe('tone');
    expect(bmiCategory(32).goal).toBe('easy');
  });
});

describe('preferredEquipment', () => {
  it('build favors barbell first, none for no-goal', () => {
    expect(preferredEquipment('build')[0]).toBe('barbell');
    expect(preferredEquipment('easy')[0]).toBe('body only');
    expect(preferredEquipment(null)).toEqual([]);
  });
});

describe('schemeFor', () => {
  it('build = 4 sets, no-goal = neutral 3 sets', () => {
    expect(schemeFor('build').sets).toBe(4);
    expect(schemeFor(null).sets).toBe(3);
  });
});

describe('buildPlan', () => {
  const pool = [ex('a', 'body only'), ex('b', 'barbell'), ex('c', 'machine')];
  const pools = [{ muscle: 'chest' as MuscleGroup, pool }];

  it('respects perMuscle and applies the scheme', () => {
    const plan = buildPlan(pools, 'build', 2, () => 0);
    expect(plan).toHaveLength(2);
    expect(plan[0].sets).toBe(4);
    expect(plan[0].reps).toBe('8–10');
  });

  it('build biases toward barbell when rng is flat', () => {
    // rng()=0 for all -> ordering driven purely by equipment preference
    const plan = buildPlan(pools, 'build', 1, () => 0);
    expect(plan[0].exercise.equipment).toBe('barbell');
  });

  it('easy biases toward bodyweight', () => {
    const plan = buildPlan(pools, 'easy', 1, () => 0);
    expect(plan[0].exercise.equipment).toBe('body only');
  });

  it('dedupes across muscles', () => {
    const two = [
      { muscle: 'chest' as MuscleGroup, pool },
      { muscle: 'back' as MuscleGroup, pool },
    ];
    const plan = buildPlan(two, null, 2, () => 0.5);
    const ids = plan.map((p) => p.exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
