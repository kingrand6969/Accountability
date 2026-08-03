import { supabase } from '../lib/supabase';

/** Search history: free keeps 30 days (older rows are actually deleted),
 *  Pro keeps everything. */

export type SearchEntry = { id: string; query: string; created_at: string };

const FREE_WINDOW_DAYS = 30;

function windowStartIso(): string {
  return new Date(Date.now() - FREE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listSearchHistory(
  isPro: boolean,
  expectedOwnerId: string,
): Promise<SearchEntry[]> {
  if (!expectedOwnerId) return [];
  if (!isPro) {
    // free tier: purge past-window rows for real — the promise is 30 days, not "hidden"
    await supabase
      .from('search_history')
      .delete()
      .eq('user_id', expectedOwnerId)
      .lt('created_at', windowStartIso())
      .then(() => {}, () => {});
  }
  const { data, error } = await supabase
    .from('search_history')
    .select('id,query,created_at')
    .eq('user_id', expectedOwnerId)
    .order('created_at', { ascending: false })
    .limit(isPro ? 100 : 20);
  if (error) throw error;
  return (data ?? []) as SearchEntry[];
}

/** Record a committed search (submit or result tap). Re-searching the same
 *  thing moves it to the top instead of duplicating. */
export async function recordSearch(query: string, expectedOwnerId: string): Promise<void> {
  const q = query.trim();
  if (!expectedOwnerId || q.length < 2 || q.length > 120) return;
  await supabase
    .from('search_history')
    .delete()
    .eq('user_id', expectedOwnerId)
    .ilike('query', q)
    .then(() => {}, () => {});
  const { error } = await supabase
    .from('search_history')
    .insert({ user_id: expectedOwnerId, query: q });
  if (error) throw error;
}

export async function deleteSearchEntry(id: string, expectedOwnerId: string): Promise<void> {
  if (!expectedOwnerId) return;
  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('user_id', expectedOwnerId)
    .eq('id', id);
  if (error) throw error;
}

export async function clearSearchHistory(expectedOwnerId: string): Promise<void> {
  if (!expectedOwnerId) return;
  const { error } = await supabase
    .from('search_history')
    .delete()
    .eq('user_id', expectedOwnerId)
    .gte('created_at', '1970-01-01');
  if (error) throw error;
}
