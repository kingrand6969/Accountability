import { supabase } from '../lib/supabase';
import { toLocalDateString } from '../timeline/datetime';

export type FoodLog = {
  id: string;
  name: string;
  brand: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  quantity_g: number | null;
  log_date: string;
};

export type NewFoodLog = {
  name: string;
  brand?: string | null;
  calories: number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  quantity_g?: number | null;
  log_date: string;
};

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function todayString(): string {
  return toLocalDateString(new Date());
}

export async function listFoodLogs(date: string): Promise<FoodLog[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('food_logs')
    .select('id,name,brand,calories,protein,carbs,fat,quantity_g,log_date')
    .eq('user_id', uid)
    .eq('log_date', date)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as FoodLog[];
}

export async function addFoodLog(entry: NewFoodLog): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('food_logs').insert({ ...entry, user_id: uid });
  if (error) throw error;
}

export async function deleteFoodLog(id: string): Promise<void> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function getCalorieTarget(): Promise<number> {
  const uid = await currentUserId();
  if (!uid) return 2000;
  const { data, error } = await supabase
    .from('profiles')
    .select('calorie_target')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return data?.calorie_target ?? 2000;
}

export async function setCalorieTarget(target: number): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('profiles')
    .update({ calorie_target: target })
    .eq('id', uid);
  if (error) throw error;
}
