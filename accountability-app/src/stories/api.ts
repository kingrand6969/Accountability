import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';
import { uploadPostImage } from '../feed/uploadPostImage';
import { resolveMediaUrls } from '../media/privateMedia';

export type Story = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
};

export type StoryGroup = {
  user_id: string;
  name: string | null;
  avatar: string | null;
  isMe: boolean;
  stories: Story[];
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Active (unexpired) stories, grouped per user — my ring first. */
export async function listStoryGroups(): Promise<StoryGroup[]> {
  const uid = await me();
  const { data, error } = await supabase
    .from('stories')
    .select('id,user_id,image_url,caption,created_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  const rawRows = (data ?? []) as Story[];
  const urls = await resolveMediaUrls(rawRows.map((story) => story.image_url));
  const rows = rawRows.map((story) => ({
    ...story,
    image_url: urls.get(story.image_url) ?? story.image_url,
  }));
  const byUser = new Map<string, Story[]>();
  for (const s of rows) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }
  const authors = await getPublicProfiles([...byUser.keys()]);
  const groups: StoryGroup[] = [...byUser.entries()].map(([user_id, stories]) => ({
    user_id,
    name: authors.get(user_id)?.display_name ?? null,
    avatar: authors.get(user_id)?.avatar_url ?? null,
    isMe: user_id === uid,
    stories,
  }));
  groups.sort((a, b) => Number(b.isMe) - Number(a.isMe));
  return groups;
}

/** Post a 24-hour story (image required — that's what a story is). */
export async function addStory(
  base64: string,
  ext: string,
  caption?: string,
): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const imageUrl = await uploadPostImage(base64, ext);
  const { error } = await supabase
    .from('stories')
    .insert({ user_id: uid, image_url: imageUrl, caption: caption?.trim() || null });
  if (error) throw error;
}

export async function deleteStory(id: string): Promise<void> {
  const { error } = await supabase.from('stories').delete().eq('id', id);
  if (error) throw error;
}

export async function reportStory(storyId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('report_content', {
    p_source_table: 'stories',
    p_source_id: storyId,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
}
