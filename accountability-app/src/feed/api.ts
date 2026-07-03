import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';
import type { FeedPost, PostComment } from './types';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

const POST_SELECT =
  'id,body,image_url,created_at,user_id,post_likes(count),post_comments(count),event:events(id,title,starts_at,location,group_id)';

function mapPost(
  row: any,
  likedSet: Set<string>,
  authors: Map<string, { display_name: string | null; avatar_url: string | null }>,
): FeedPost {
  const author = authors.get(row.user_id);
  return {
    id: row.id,
    body: row.body,
    image_url: row.image_url ?? null,
    created_at: row.created_at,
    user_id: row.user_id,
    author_name: author?.display_name ?? null,
    author_avatar: author?.avatar_url ?? null,
    like_count: row.post_likes?.[0]?.count ?? 0,
    comment_count: row.post_comments?.[0]?.count ?? 0,
    liked_by_me: likedSet.has(row.id),
    event: row.event ?? null,
  };
}

async function myLikedSet(me: string | null, postIds: string[]): Promise<Set<string>> {
  if (!me || postIds.length === 0) return new Set();
  // Scoped to the visible posts — an all-time like history is unbounded and
  // gets truncated at PostgREST's 1000-row cap.
  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', me)
    .in('post_id', postIds);
  return new Set((data ?? []).map((l: any) => l.post_id as string));
}

export const FEED_PAGE_SIZE = 20;

/**
 * Newest-first page; pass the oldest loaded created_at to fetch the next page.
 * groupId scopes to one group's feed, pageId to one business page's feed;
 * otherwise the main feed shows only personal posts (no group/page posts).
 */
export async function listFeed(
  beforeCreatedAt?: string,
  groupId?: string,
  pageId?: string,
): Promise<FeedPost[]> {
  const me = await currentUserId();
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (groupId) {
    query = query.eq('group_id', groupId);
  } else if (pageId) {
    query = query.eq('page_id', pageId);
  } else {
    query = query.is('group_id', null).is('page_id', null);
  }
  if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const [likedSet, authors] = await Promise.all([
    myLikedSet(me, rows.map((r: any) => r.id)),
    getPublicProfiles(rows.map((r: any) => r.user_id)),
  ]);
  return rows.map((r: any) => mapPost(r, likedSet, authors));
}

export async function getPost(id: string): Promise<FeedPost | null> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [likedSet, authors] = await Promise.all([
    myLikedSet(me, [(data as any).id]),
    getPublicProfiles([(data as any).user_id]),
  ]);
  return mapPost(data, likedSet, authors);
}

export async function createPost(
  body: string,
  imageUrl: string | null = null,
  groupId: string | null = null,
  pageId: string | null = null,
  eventId: string | null = null,
): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const { error } = await supabase.from('posts').insert({
    user_id: me,
    body,
    image_url: imageUrl,
    group_id: groupId,
    page_id: pageId,
    event_id: eventId,
  });
  if (error) throw error;
}

export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  if (liked) {
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: me });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', me);
    if (error) throw error;
  }
}

export async function listComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id,body,created_at,user_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const authors = await getPublicProfiles(rows.map((r: any) => r.user_id));
  return rows.map((r: any) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    user_id: r.user_id,
    author_name: authors.get(r.user_id)?.display_name ?? null,
    author_avatar: authors.get(r.user_id)?.avatar_url ?? null,
  }));
}

export async function addComment(postId: string, body: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('post_comments')
    .insert({ post_id: postId, user_id: me, body });
  if (error) throw error;
}
