import { supabase } from '../lib/supabase';
import type { TimelineItem, TimelineType } from '../timeline/types';
import { toLocalDateString } from '../timeline/datetime';

export type JourneyPillar = 'body' | 'money' | 'focus' | 'people';

export function timelinePillar(type: TimelineType): JourneyPillar {
  if (type === 'workout' || type === 'activity' || type === 'meal') return 'body';
  if (type === 'expense' || type === 'income' || type === 'grocery') return 'money';
  if (type === 'event' || type === 'task') return 'focus';
  return 'people';
}

/**
 * A timeline entry is complete only when the stored data proves it. Activities
 * are recordings by definition; checklist entries require every check to be
 * done. A plain note/title is not treated as completion.
 */
export function hasCompletionProof(item: TimelineItem): boolean {
  // These types are themselves persisted records/logs/transactions. Their
  // existence is proof; they do not need a checklist layered on top.
  if (
    item.type === 'activity' ||
    item.type === 'expense' ||
    item.type === 'income' ||
    item.type === 'meal'
  ) {
    return true;
  }
  // Promises and open-ended entries need explicit completion evidence.
  const checklist = item.checklist ?? [];
  return checklist.length > 0 && checklist.every((entry) => entry.done);
}

async function queryTimelineRange(uid: string, startIso: string): Promise<TimelineItem[]> {
  const pageSize = 1000;
  const rows: TimelineItem[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('timeline_items')
      .select('*')
      .eq('user_id', uid)
      .gte('starts_at', startIso)
      .order('starts_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as TimelineItem[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function listRecentJourneyItems(days = 7): Promise<TimelineItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, days) + 1);
  start.setHours(0, 0, 0, 0);
  return queryTimelineRange(uid, start.toISOString());
}

/** Full five-year history, fetched in stable pages to avoid one giant query. */
export async function listJourneyHistory(days = 1825): Promise<TimelineItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const start = new Date();
  start.setDate(start.getDate() - Math.max(1, days) + 1);
  start.setHours(0, 0, 0, 0);
  return queryTimelineRange(uid, start.toISOString());
}

export function pillarCompletion(items: TimelineItem[], pillar: JourneyPillar) {
  const relevant = items.filter((item) => timelinePillar(item.type) === pillar);
  const complete = relevant.filter(hasCompletionProof).length;
  return {
    total: relevant.length,
    complete,
    score: relevant.length === 0 ? 0 : Math.round((complete / relevant.length) * 100),
  };
}

export function pillarActiveDays(items: TimelineItem[], pillar: JourneyPillar): number {
  return new Set(
    items
      .filter((item) => timelinePillar(item.type) === pillar && hasCompletionProof(item))
      .map((item) => toLocalDateString(new Date(item.starts_at))),
  ).size;
}
