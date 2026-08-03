import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';
import type { PostEncourager } from '../feed/api';

export type JourneyEncouragement = {
  postId: string;
  count: number;
  people: PostEncourager[];
  hasVoice: boolean;
};

/** Bounded, batched support summary for the signed-in member's recent proofs. */
export async function getJourneyEncouragement(
  from: Date,
  to: Date = new Date(),
): Promise<JourneyEncouragement | null> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const me = auth.user?.id;
  if (!me) return null;
  const { data: posts, error: postError } = await supabase
    .from('posts')
    .select('id')
    .eq('user_id', me)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  if (postError) throw postError;
  const postIds = (posts ?? []).map((post: any) => post.id as string);
  if (postIds.length === 0) return null;

  const [likes, comments, voices] = await Promise.all([
    supabase.from('post_likes').select('post_id,user_id').in('post_id', postIds).limit(500),
    supabase.from('post_comments').select('post_id,user_id').in('post_id', postIds).limit(500),
    supabase.from('post_encouragements').select('post_id,user_id,voice_ref').in('post_id', postIds).limit(500),
  ]);
  if (likes.error) throw likes.error;
  if (comments.error) throw comments.error;
  if (voices.error) throw voices.error;
  const byPost = new Map<string, Set<string>>();
  const voicePosts = new Set<string>();
  for (const row of [...(likes.data ?? []), ...(comments.data ?? []), ...(voices.data ?? [])] as any[]) {
    if (row.user_id === me) continue;
    const supporters = byPost.get(row.post_id) ?? new Set<string>();
    supporters.add(row.user_id);
    byPost.set(row.post_id, supporters);
    if (row.voice_ref) voicePosts.add(row.post_id);
  }
  const postId = postIds.find((id) => (byPost.get(id)?.size ?? 0) > 0);
  if (!postId) return null;
  const supporterIds = [...(byPost.get(postId) ?? [])];
  const profiles = await getPublicProfiles(supporterIds);
  return {
    postId,
    count: supporterIds.length,
    hasVoice: voicePosts.has(postId),
    people: supporterIds.slice(0, 3).map((id) => ({
      id,
      name: profiles.get(id)?.display_name ?? null,
      avatar_url: profiles.get(id)?.avatar_url ?? null,
    })),
  };
}
