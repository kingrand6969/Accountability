import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';

export type NotificationType = 'like' | 'comment' | 'tag' | 'buddy_request' | 'buddy_accept';

export type AppNotification = {
  id: string;
  type: NotificationType;
  post_id: string | null;
  created_at: string;
  read: boolean;
  actor_id: string | null;
  actor_name: string | null;
  actor_avatar: string | null;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id,type,post_id,created_at,read_at,actor_id')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  const profs = await getPublicProfiles(rows.map((r: any) => r.actor_id).filter(Boolean));
  return rows.map((r: any) => {
    const p = r.actor_id ? profs.get(r.actor_id) : null;
    return {
      id: r.id,
      type: r.type,
      post_id: r.post_id,
      created_at: r.created_at,
      read: !!r.read_at,
      actor_id: r.actor_id,
      actor_name: p?.display_name ?? null,
      actor_avatar: p?.avatar_url ?? null,
    };
  });
}

export async function unreadCount(): Promise<number> {
  const uid = await me();
  if (!uid) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .is('read_at', null);
  return count ?? 0;
}

export async function markAllRead(expectedOwnerId: string): Promise<void> {
  if (!expectedOwnerId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', expectedOwnerId)
    .is('read_at', null);
  if (error) throw error;
}

/** Human line for a notification row. */
export function notificationLine(n: AppNotification): string {
  const who = n.actor_name ?? 'Someone';
  switch (n.type) {
    case 'like':
      return `${who} encouraged your post`;
    case 'comment':
      return `${who} commented on your post`;
    case 'tag':
      return `${who} tagged you in a post`;
    case 'buddy_request':
      return `${who} sent you a buddy request`;
    case 'buddy_accept':
      return `${who} accepted your buddy request`;
  }
}
