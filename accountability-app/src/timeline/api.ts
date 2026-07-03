import { supabase } from '../lib/supabase';
import type { ChecklistItem, NewTimelineItem, TimelineItem } from './types';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Local-day [start, end) as ISO strings for the given date. */
export function dayRange(day: Date): { startIso: string; endIso: string } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export async function listItemsForDay(day: Date): Promise<TimelineItem[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { startIso, endIso } = dayRange(day);
  const { data, error } = await supabase
    .from('timeline_items')
    .select('*')
    .eq('user_id', uid)
    .gte('starts_at', startIso)
    .lt('starts_at', endIso)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TimelineItem[];
}

export async function createItem(input: NewTimelineItem): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('timeline_items')
    .insert({ ...input, user_id: uid });
  if (error) throw error;
}

export async function getItem(itemId: string): Promise<TimelineItem | null> {
  const { data, error } = await supabase
    .from('timeline_items')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as TimelineItem | null;
}

export async function updateItemChecklist(
  itemId: string,
  checklist: ChecklistItem[],
): Promise<void> {
  const { error } = await supabase
    .from('timeline_items')
    .update({ checklist })
    .eq('id', itemId);
  if (error) throw error;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('timeline_items').delete().eq('id', itemId);
  if (error) throw error;
}
