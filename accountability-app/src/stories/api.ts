import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';
import { uploadPostImage } from '../feed/uploadPostImage';
import { resolveMediaUrls } from '../media/privateMedia';
import { orderStoryGroups } from './storyOrdering';

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
  viewed: boolean;
  latestCreatedAt: string;
  stories: Story[];
};

type PublicProfile = { display_name?: string | null; avatar_url?: string | null };

export function buildStoryGroups(
  rows: Story[],
  uid: string | null,
  viewedStoryIds: ReadonlySet<string>,
  authors: ReadonlyMap<string, PublicProfile>,
): StoryGroup[] {
  const byUser = new Map<string, Story[]>();
  for (const story of rows) {
    const list = byUser.get(story.user_id) ?? [];
    list.push(story);
    byUser.set(story.user_id, list);
  }
  return orderStoryGroups(
    [...byUser.entries()].map(([user_id, stories]) => {
      const isMe = user_id === uid;
      const latestCreatedAt = stories[stories.length - 1]?.created_at ?? '';
      return {
        user_id,
        name: authors.get(user_id)?.display_name ?? null,
        avatar: authors.get(user_id)?.avatar_url ?? null,
        isMe,
        viewed: isMe || stories.every((story) => viewedStoryIds.has(story.id)),
        latestCreatedAt,
        stories,
      };
    }),
  );
}

type ReceiptError = { code?: string } | null;
type InsertReceipt = (
  values: { story_id: string; user_id: string },
) => PromiseLike<{ error: ReceiptError }>;

export async function insertStoryViewReceipt(
  storyId: string,
  userId: string,
  insert: InsertReceipt,
): Promise<void> {
  const { error } = await insert({ story_id: storyId, user_id: userId });
  if (error && error.code !== '23505') throw error;
}

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
  const viewedStoryIds = new Set<string>();
  if (uid && rawRows.length > 0) {
    const { data: receipts, error: receiptError } = await supabase
      .from('story_views')
      .select('story_id')
      .eq('user_id', uid)
      .in('story_id', rawRows.map((story) => story.id));
    if (receiptError) throw receiptError;
    for (const receipt of receipts ?? []) viewedStoryIds.add(receipt.story_id as string);
  }
  const authors = await getPublicProfiles([...new Set(rows.map((story) => story.user_id))]);
  return buildStoryGroups(rows, uid, viewedStoryIds, authors);
}

export async function markStoryViewed(storyId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  await insertStoryViewReceipt(storyId, uid, (values) =>
    supabase.from('story_views').insert(values),
  );
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
