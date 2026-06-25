import { supabase } from '../lib/supabase';
import type { FeedPost, PostComment } from './types';

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Disambiguate the author join: posts links to profiles both directly
// (author) and indirectly (via likes), so name the exact foreign key.
const POST_SELECT =
  'id,body,created_at,user_id,profiles!posts_user_id_fkey(display_name,avatar_url),post_likes(count),post_comments(count)';

function mapPost(row: any, likedSet: Set<string>): FeedPost {
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    user_id: row.user_id,
    author_name: row.profiles?.display_name ?? null,
    author_avatar: row.profiles?.avatar_url ?? null,
    like_count: row.post_likes?.[0]?.count ?? 0,
    comment_count: row.post_comments?.[0]?.count ?? 0,
    liked_by_me: likedSet.has(row.id),
  };
}

async function myLikedSet(me: string | null): Promise<Set<string>> {
  if (!me) return new Set();
  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', me);
  return new Set((data ?? []).map((l: any) => l.post_id as string));
}

export async function listFeed(): Promise<FeedPost[]> {
  const me = await currentUserId();
  const { data, error } = await supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const likedSet = await myLikedSet(me);
  return (data ?? []).map((r: any) => mapPost(r, likedSet));
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
  const likedSet = await myLikedSet(me);
  return mapPost(data, likedSet);
}

export async function createPost(body: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const { error } = await supabase.from('posts').insert({ user_id: me, body });
  if (error) throw error;
}

export async function setLiked(postId: string, liked: boolean): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  if (liked) {
    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: me });
    // Ignore "already liked" (unique violation) for idempotency.
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
    .select('id,body,created_at,user_id,profiles!post_comments_user_id_fkey(display_name,avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    user_id: r.user_id,
    author_name: r.profiles?.display_name ?? null,
    author_avatar: r.profiles?.avatar_url ?? null,
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
