import { supabase } from '../lib/supabase';

export type LibraryExercise = {
  id: string;
  name: string;
  category: string | null;
  equipment: string | null;
  level: string | null;
  primary_muscles: string[];
  images: string[];
  instructions: string[];
};

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'core';

export const MUSCLE_GROUPS: {
  value: MuscleGroup;
  label: string;
  muscles: string[];
}[] = [
  { value: 'chest', label: 'Chest', muscles: ['chest'] },
  { value: 'back', label: 'Back', muscles: ['lats', 'middle back', 'lower back', 'traps'] },
  { value: 'shoulders', label: 'Shoulders', muscles: ['shoulders'] },
  { value: 'arms', label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  {
    value: 'legs',
    label: 'Legs',
    muscles: ['quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors'],
  },
  { value: 'core', label: 'Core', muscles: ['abdominals'] },
];

export const EQUIPMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'barbell', label: 'Barbell' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'machine', label: 'Machine' },
  { value: 'cable', label: 'Cable' },
  { value: 'body only', label: 'Bodyweight' },
  { value: 'kettlebells', label: 'Kettlebell' },
  { value: 'bands', label: 'Bands' },
];

export type LibraryFilter = {
  muscle?: MuscleGroup | null;
  equipment?: string | null;
  search?: string;
};

const LIST_COLUMNS = 'id,name,category,equipment,level,primary_muscles,images';

export async function listExercises(filter: LibraryFilter): Promise<LibraryExercise[]> {
  let q = supabase.from('exercises').select(LIST_COLUMNS).order('name').limit(80);

  if (filter.muscle) {
    const group = MUSCLE_GROUPS.find((g) => g.value === filter.muscle);
    if (group) q = q.overlaps('primary_muscles', group.muscles);
  }
  if (filter.equipment) q = q.eq('equipment', filter.equipment);
  const search = filter.search?.trim();
  if (search) q = q.ilike('name', `%${search}%`);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as LibraryExercise[];
}

export async function getExercise(id: string): Promise<LibraryExercise | null> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as LibraryExercise | null;
}

export function prettyEquipment(equipment: string | null): string {
  if (!equipment) return 'Other';
  if (equipment === 'body only') return 'Bodyweight';
  return equipment.charAt(0).toUpperCase() + equipment.slice(1);
}
