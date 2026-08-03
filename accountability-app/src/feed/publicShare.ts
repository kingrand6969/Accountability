import { supabase } from '../lib/supabase';
import { publicShareUrl } from './publicShareFormat';

export { publicShareMessage, publicShareUrl } from './publicShareFormat';

export async function createPublicPostShare(postId: string, previewImageRef: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_public_post_share', {
    p_post: postId,
    p_preview_ref: previewImageRef,
  });
  if (error) throw error;
  if (!data) throw new Error('Could not create a share link.');
  return publicShareUrl(String(data));
}

export async function resolvePublicSharePost(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_public_share_post', { p_share: id });
  if (error) throw error;
  return data ? String(data) : null;
}
