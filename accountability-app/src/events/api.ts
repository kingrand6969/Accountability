import { supabase } from '../lib/supabase';
import { joinGroup } from '../groups/api';

export type PostEvent = {
  id: string;
  title: string;
  starts_at: string;
  location: string | null;
  group_id: string;
};

export type EventAnnouncement = {
  groupId: string;
  eventId: string;
  postId: string;
};

type EventAnnouncementRow = {
  result_group_id: string;
  result_event_id: string;
  result_post_id: string;
};

function isAnnouncementRow(value: unknown): value is EventAnnouncementRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.result_group_id === 'string'
    && typeof row.result_event_id === 'string'
    && typeof row.result_post_id === 'string';
}

/**
 * Creates the event group, event and feed announcement in one database
 * transaction. The draft operation id makes a lost-response retry return the
 * original committed ids instead of creating a second event.
 */
export async function createEvent(input: {
  expectedOwnerId: string;
  operationId: string;
  title: string;
  startsAtIso: string;
  location: string;
  message: string;
  audience: 'buddies' | 'public';
  showOnCard: boolean;
}): Promise<EventAnnouncement> {
  const { data, error } = await supabase.rpc('create_event_announcement', {
    p_expected_owner: input.expectedOwnerId,
    p_operation_id: input.operationId,
    p_title: input.title,
    p_starts_at: input.startsAtIso,
    p_location: input.location,
    p_message: input.message,
    p_audience: input.audience,
    p_show_on_card: input.audience === 'public' && input.showOnCard,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!isAnnouncementRow(row)) throw new Error('Event announcement returned an invalid result.');
  return {
    groupId: row.result_group_id,
    eventId: row.result_event_id,
    postId: row.result_post_id,
  };
}

/** "Yes, I'll attend" — joins the event's group automatically. */
export async function attendEvent(groupId: string): Promise<void> {
  await joinGroup(groupId);
}
