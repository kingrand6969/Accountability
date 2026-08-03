import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';
import type { FeedPost, PostAudience, PostComment, PostType } from './types';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { uploadBytesToR2 } from '../lib/r2';

async function currentUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

const POST_SELECT =
  'id,body,image_url,created_at,user_id,audience,post_type,share_data,activity_id,post_likes(count),post_comments(count),post_encouragements(count),post_tags(user_id),event:events(id,title,starts_at,location,group_id)';

function mapPost(
  row: any,
  likedSet: Set<string>,
  profiles: Map<string, { display_name: string | null; avatar_url: string | null }>,
): FeedPost {
  const author = profiles.get(row.user_id);
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
    voice_encouragement_count: row.post_encouragements?.[0]?.count ?? 0,
    liked_by_me: likedSet.has(row.id),
    audience: row.audience ?? 'buddies',
    post_type: row.post_type ?? (row.event ? 'event' : row.image_url ? 'photo' : 'post'),
    share_data: row.share_data ?? {},
    activity_id: row.activity_id ?? null,
    tagged: ((row.post_tags ?? []) as any[]).map((t) => ({
      id: t.user_id,
      name: profiles.get(t.user_id)?.display_name ?? null,
    })),
    event: row.event ?? null,
  };
}

/** Author + tagged-user ids for one profiles lookup covering both. */
function profileIds(rows: any[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    ids.add(r.user_id);
    for (const t of r.post_tags ?? []) ids.add(t.user_id);
  }
  return [...ids];
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

/** Posts this member chose to hide — filtered out of every feed page. */
async function myHiddenPostIds(me: string | null): Promise<string[]> {
  if (!me) return [];
  const { data } = await supabase.from('post_hides').select('post_id').eq('user_id', me);
  return (data ?? []).map((r: any) => r.post_id as string);
}

/** Hide a post from MY feed only (the author keeps it). */
export async function hidePost(postId: string): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('post_hides')
    .upsert({ user_id: me, post_id: postId }, { onConflict: 'user_id,post_id', ignoreDuplicates: true });
  if (error) throw error;
}

/** Delete my own post for everyone (RLS only allows the author). */
export async function deletePost(postId: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

/** File a structured report; the server derives the author and queues a recheck. */
export async function reportPost(post: { id: string; user_id: string; body: string | null }): Promise<void> {
  const { error } = await supabase.rpc('report_content', {
    p_source_table: 'posts',
    p_source_id: post.id,
    p_reason: null,
  });
  if (error) throw error;
}

export async function reportComment(commentId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('report_content', {
    p_source_table: 'post_comments',
    p_source_id: commentId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}

export const FEED_PAGE_SIZE = 20;
export type FeedMode = 'buddies' | 'discover';

async function myBuddyIds(me: string | null): Promise<string[]> {
  if (!me) return [];
  const { data, error } = await supabase
    .from('buddy_links')
    .select('user_a,user_b')
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (error) throw error;
  return (data ?? []).map((link: any) => (link.user_a === me ? link.user_b : link.user_a));
}

/**
 * Newest-first page; pass the oldest loaded created_at to fetch the next page.
 * groupId scopes to one group's feed, pageId to one business page's feed;
 * otherwise the main feed shows only personal posts (no group/page posts).
 */
export async function listFeed(
  beforeCreatedAt?: string,
  groupId?: string,
  pageId?: string,
  mode: FeedMode = 'buddies',
): Promise<FeedPost[]> {
  const me = await currentUserId();
  const [hidden, buddyIds] = await Promise.all([myHiddenPostIds(me), myBuddyIds(me)]);
  let query = supabase
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (hidden.length > 0) query = query.not('id', 'in', `(${hidden.join(',')})`);
  if (groupId) {
    query = query.eq('group_id', groupId);
  } else if (pageId) {
    query = query.eq('page_id', pageId);
  } else {
    query = query.is('group_id', null).is('page_id', null);
    const known = me ? [me, ...buddyIds] : buddyIds;
    if (mode === 'discover') {
      query = query.eq('audience', 'public');
      if (known.length > 0) query = query.not('user_id', 'in', `(${known.join(',')})`);
    } else if (known.length > 0) {
      query = query.in('user_id', known);
    } else {
      return [];
    }
  }
  if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  const [likedSet, profiles] = await Promise.all([
    myLikedSet(me, rows.map((r: any) => r.id)),
    getPublicProfiles(profileIds(rows)),
  ]);
  return rows.map((r: any) => mapPost(r, likedSet, profiles));
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
  const [likedSet, profiles] = await Promise.all([
    myLikedSet(me, [(data as any).id]),
    getPublicProfiles(profileIds([data])),
  ]);
  return mapPost(data, likedSet, profiles);
}

export type IdempotentPostResult = {
  postId: string;
  created: boolean;
};

export async function executeIdempotentPost(deps: {
  findExisting(): Promise<string | null>;
  insert(): Promise<string>;
}): Promise<IdempotentPostResult> {
  const existingPostId = await deps.findExisting();
  if (existingPostId) return { postId: existingPostId, created: false };

  try {
    return { postId: await deps.insert(), created: true };
  } catch (insertError) {
    try {
      const confirmedPostId = await deps.findExisting();
      if (confirmedPostId) return { postId: confirmedPostId, created: false };
    } catch (confirmationError) {
      throw new AggregateError(
        [insertError, confirmationError],
        'The post may have been created, but its operation could not be confirmed.',
      );
    }
    throw insertError;
  }
}

async function postIdForOperation(
  userId: string,
  operationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', userId)
    .eq('client_operation_id', operationId)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

export async function findMyPostByOperationId(operationId: string): Promise<string | null> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  return postIdForOperation(me, operationId);
}

export async function createRunPostIdempotent(input: {
  body: string;
  imageUrl: string | null;
  operationId: string;
  audience: Exclude<PostAudience, 'group'>;
  activityId: string;
  shareData: Record<string, unknown>;
}): Promise<IdempotentPostResult> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');

  return executeIdempotentPost({
    findExisting: () => postIdForOperation(me, input.operationId),
    insert: async () => {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          user_id: me,
          body: input.body,
          image_url: input.imageUrl,
          group_id: null,
          page_id: null,
          event_id: null,
          show_on_card: false,
          audience: input.audience,
          post_type: 'run',
          share_data: input.shareData,
          activity_id: input.activityId,
          client_operation_id: input.operationId,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
  });
}

export async function createPost(
  body: string,
  imageUrl: string | null = null,
  groupId: string | null = null,
  pageId: string | null = null,
  eventId: string | null = null,
  showOnCard = false,
  options: {
    audience?: PostAudience;
    postType?: PostType;
    shareData?: Record<string, unknown>;
    activityId?: string | null;
  } = {},
): Promise<string> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: me,
      body,
      image_url: imageUrl,
      group_id: groupId,
      page_id: pageId,
      event_id: eventId,
      show_on_card: showOnCard,
      audience: groupId ? 'group' : pageId ? 'public' : (options.audience ?? 'buddies'),
      post_type: options.postType ?? (eventId ? 'event' : imageUrl ? 'photo' : 'post'),
      share_data: options.shareData ?? {},
      activity_id: options.activityId ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updatePost(postId: string, body: string): Promise<void> {
  const { error } = await supabase.from('posts').update({ body }).eq('id', postId);
  if (error) throw error;
}

export async function updatePostAudience(postId: string, audience: Exclude<PostAudience, 'group'>): Promise<void> {
  const { error } = await supabase.from('posts').update({ audience }).eq('id', postId);
  if (error) throw error;
}

/** Tag buddies on a post (author-only; RLS also requires they're your buddies). */
export async function addPostTags(postId: string, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const { error } = await supabase
    .from('post_tags')
    .insert(userIds.map((user_id) => ({ post_id: postId, user_id })));
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

export type PostEncourager = {
  id: string;
  name: string | null;
  avatar_url: string | null;
};
export type EncouragementPreview = {
  count: number;
  people: PostEncourager[];
  voices: number;
};

/** One batched preview load for a whole feed page; never downloads voice media. */
export async function listEncouragementPreviews(
  postIds: string[],
): Promise<Map<string, EncouragementPreview>> {
  const result = new Map<string, EncouragementPreview>();
  if (postIds.length === 0) return result;
  const [likes, comments, voices] = await Promise.all([
    supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds),
    supabase.from('post_comments').select('post_id,user_id').in('post_id', postIds),
    supabase.from('post_encouragements').select('post_id,user_id').in('post_id', postIds),
  ]);
  if (likes.error) throw likes.error;
  if (comments.error) throw comments.error;
  if (voices.error) throw voices.error;
  const supporters = new Map<string, Set<string>>();
  const voiceCounts = new Map<string, number>();
  for (const row of [...(likes.data ?? []), ...(comments.data ?? []), ...(voices.data ?? [])] as any[]) {
    const set = supporters.get(row.post_id) ?? new Set<string>();
    set.add(row.user_id);
    supporters.set(row.post_id, set);
  }
  for (const row of (voices.data ?? []) as any[]) {
    voiceCounts.set(row.post_id, (voiceCounts.get(row.post_id) ?? 0) + 1);
  }
  const allIds = [...new Set([...supporters.values()].flatMap((set) => [...set]))];
  const profiles = await getPublicProfiles(allIds);
  for (const postId of postIds) {
    const ids = [...(supporters.get(postId) ?? [])];
    result.set(postId, {
      count: ids.length,
      voices: voiceCounts.get(postId) ?? 0,
      people: ids.slice(0, 3).map((id) => ({
        id,
        name: profiles.get(id)?.display_name ?? null,
        avatar_url: profiles.get(id)?.avatar_url ?? null,
      })),
    });
  }
  return result;
}

/** People who encouraged a visible post. Post RLS remains the privacy gate. */
export async function listEncouragers(postId: string): Promise<PostEncourager[]> {
  const { data, error } = await supabase
    .from('post_likes')
    .select('user_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((row: any) => row.user_id as string))];
  const profiles = await getPublicProfiles(ids);
  return ids.map((id) => ({
    id,
    name: profiles.get(id)?.display_name ?? null,
    avatar_url: profiles.get(id)?.avatar_url ?? null,
  }));
}

export type VoiceEncouragement = {
  id: string;
  user_id: string;
  voice_ref: string;
  duration_ms: number;
  created_at: string;
  name: string | null;
  avatar_url: string | null;
};

export async function listVoiceEncouragements(postId: string): Promise<VoiceEncouragement[]> {
  const { data, error } = await supabase
    .from('post_encouragements')
    .select('id,user_id,voice_ref,duration_ms,created_at')
    .eq('post_id', postId)
    .not('voice_ref', 'is', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];
  const profiles = await getPublicProfiles(rows.map((row: any) => row.user_id));
  return rows.map((row: any) => ({
    ...row,
    name: profiles.get(row.user_id)?.display_name ?? null,
    avatar_url: profiles.get(row.user_id)?.avatar_url ?? null,
  })) as VoiceEncouragement[];
}

export async function sendVoiceEncouragement(
  postId: string,
  uri: string,
  durationMs: number,
): Promise<void> {
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  if (durationMs < 250 || durationMs > 10_000) {
    throw new Error('Voice encouragement must be between 1 and 10 seconds.');
  }
  const file = new File(uri);
  const bytes = await file.bytes();
  const operationId = Crypto.randomUUID();
  const isWebm = uri.toLowerCase().includes('.webm');
  const voiceRef = await uploadBytesToR2(
    bytes,
    'voice',
    isWebm ? 'audio/webm' : 'audio/mp4',
    isWebm ? 'webm' : 'm4a',
    { operationId },
  );
  const { error } = await supabase.from('post_encouragements').insert({
    post_id: postId,
    user_id: me,
    voice_ref: voiceRef,
    duration_ms: Math.min(10_000, Math.round(durationMs)),
  });
  if (error) throw error;
}

type VoiceSafetyTarget = {
  senderId: string;
  postOwnerId: string;
};

function assertOpaqueVoiceId(voiceId: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(voiceId)) {
    throw new Error('Voice encouragement is invalid.');
  }
}

async function voiceSafetyTarget(voiceId: string): Promise<VoiceSafetyTarget> {
  assertOpaqueVoiceId(voiceId);
  const { data, error } = await supabase
    .from('post_encouragements')
    .select('user_id,post:posts!inner(user_id)')
    .eq('id', voiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Voice encouragement is unavailable.');
  const post = Array.isArray((data as any).post) ? (data as any).post[0] : (data as any).post;
  if (!post?.user_id) throw new Error('Voice encouragement is unavailable.');
  return {
    senderId: (data as any).user_id as string,
    postOwnerId: post.user_id as string,
  };
}

/** Delete one voice row sent by the current account. RLS is the final gate. */
export async function deleteMyVoiceEncouragement(voiceId: string): Promise<void> {
  assertOpaqueVoiceId(voiceId);
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('post_encouragements')
    .delete()
    .eq('id', voiceId)
    .eq('user_id', me);
  if (error) throw error;
}

/** The post recipient reports a voice sender through the canonical safety queue. */
export async function reportVoiceEncouragement(voiceId: string): Promise<void> {
  assertOpaqueVoiceId(voiceId);
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const target = await voiceSafetyTarget(voiceId);
  if (target.senderId === me) throw new Error('You cannot report your own encouragement.');
  if (target.postOwnerId !== me) throw new Error('Only the recipient can report this encouragement.');
  const { error } = await supabase.from('buddy_reports').insert({
    reporter: me,
    reported: target.senderId,
    reason: `Reported voice encouragement ${voiceId}`,
  });
  if (error) throw error;
}

/** The post recipient blocks a voice sender through the canonical buddy block table. */
export async function blockVoiceEncouragementSender(voiceId: string): Promise<void> {
  assertOpaqueVoiceId(voiceId);
  const me = await currentUserId();
  if (!me) throw new Error('Not signed in.');
  const target = await voiceSafetyTarget(voiceId);
  if (target.senderId === me) throw new Error('You cannot block yourself.');
  if (target.postOwnerId !== me) throw new Error('Only the recipient can block this sender.');
  const { error } = await supabase
    .from('buddy_blocks')
    .insert({ blocker: me, blocked: target.senderId });
  if (error && error.code !== '23505') throw error;
}

export async function listComments(postId: string): Promise<PostComment[]> {
  // newest 100, then flipped back to reading order — bounds a viral post's
  // thread instead of downloading every comment ever written on it
  const { data, error } = await supabase
    .from('post_comments')
    .select('id,body,created_at,user_id')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const rows = (data ?? []).reverse();
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
