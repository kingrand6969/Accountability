import { supabase } from '../lib/supabase';
import { createGroup, joinGroup } from '../groups/api';
import { createPost } from '../feed/api';

export type PostEvent = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  group_id: string;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * Announce an event: creates a group named after it (creator = admin),
 * the event row, and the feed post. Attendees join the group via attendEvent.
 */
export async function createEvent(input: {
  title: string;
  startsAtIso: string;
  location: string;
  message: string;
}): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const groupId = await createGroup(
    input.title.trim(),
    `Event group · ${input.location.trim() || 'meet-up'} — auto-created when the event was announced.`,
  );
  const { data, error } = await supabase
    .from('events')
    .insert({
      title: input.title.trim(),
      starts_at: input.startsAtIso,
      location: input.location.trim() || null,
      group_id: groupId,
      created_by: uid,
    })
    .select('id')
    .single();
  if (error) throw error;
  await createPost(
    input.message.trim() || `📅 ${input.title.trim()} — who's in?`,
    null,
    null,
    null,
    data.id as string,
  );
}

/** "Yes, I'll attend" — joins the event's group automatically. */
export async function attendEvent(groupId: string): Promise<void> {
  await joinGroup(groupId);
}
