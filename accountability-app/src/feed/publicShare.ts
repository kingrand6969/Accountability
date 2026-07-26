import { supabase } from '../lib/supabase';
import { publicShareUrl } from './publicShareFormat';

export { publicShareMessage, publicShareUrl } from './publicShareFormat';

export async function createPublicPostShare(postId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_public_post_share', {
    p_post: postId,
  });
  if (error) throw error;
  if (!data) throw new Error('Could not create a share link.');
  return publicShareUrl(String(data));
}
