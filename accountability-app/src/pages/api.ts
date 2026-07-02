import { supabase } from '../lib/supabase';

export const PAGE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'gym', label: 'Gym / Studio' },
  { value: 'coach', label: 'Coach / Trainer' },
  { value: 'nutrition', label: 'Nutritionist' },
  { value: 'brand', label: 'Brand / Shop' },
  { value: 'creator', label: 'Creator' },
  { value: 'community', label: 'Community' },
  { value: 'business', label: 'Other business' },
];

export type Page = {
  id: string;
  name: string;
  handle: string;
  category: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  owner: string;
  created_at: string;
  follower_count: number;
  is_following: boolean;
  is_owner: boolean;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const PAGE_SELECT =
  'id,name,handle,category,bio,avatar_url,cover_url,owner,created_at,page_follows(count)';

function mapPage(row: any, uid: string | null, followed: Set<string>): Page {
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    category: row.category,
    bio: row.bio ?? null,
    avatar_url: row.avatar_url ?? null,
    cover_url: row.cover_url ?? null,
    owner: row.owner,
    created_at: row.created_at,
    follower_count: row.page_follows?.[0]?.count ?? 0,
    is_following: followed.has(row.id),
    is_owner: row.owner === uid,
  };
}

async function myFollowedSet(uid: string | null): Promise<Set<string>> {
  if (!uid) return new Set();
  const { data } = await supabase
    .from('page_follows')
    .select('page_id')
    .eq('user_id', uid);
  return new Set((data ?? []).map((r: any) => r.page_id as string));
}

/** All pages, newest first — following + mine flagged. */
export async function listPages(): Promise<Page[]> {
  const uid = await me();
  const [{ data, error }, followed] = await Promise.all([
    supabase
      .from('pages')
      .select(PAGE_SELECT)
      .order('created_at', { ascending: false })
      .limit(100),
    myFollowedSet(uid),
  ]);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapPage(r, uid, followed));
}

export async function getPage(id: string): Promise<Page | null> {
  const uid = await me();
  const [{ data, error }, followed] = await Promise.all([
    supabase.from('pages').select(PAGE_SELECT).eq('id', id).maybeSingle(),
    myFollowedSet(uid),
  ]);
  if (error) throw error;
  if (!data) return null;
  return mapPage(data, uid, followed);
}

export async function createPage(input: {
  name: string;
  handle: string;
  category: string;
  bio: string;
}): Promise<string> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('pages')
    .insert({
      name: input.name.trim(),
      handle: input.handle.trim().toLowerCase(),
      category: input.category,
      bio: input.bio.trim() || null,
      owner: uid,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') throw new Error('That handle is already taken.');
    if (error.code === '23514')
      throw new Error('Handle must be 3–30 characters: lowercase letters, numbers, underscores.');
    throw error;
  }
  return data.id as string;
}

export async function followPage(pageId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('page_follows')
    .insert({ page_id: pageId, user_id: uid });
  if (error && error.code !== '23505') throw error;
}

export async function unfollowPage(pageId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('page_follows')
    .delete()
    .eq('page_id', pageId)
    .eq('user_id', uid);
  if (error) throw error;
}
