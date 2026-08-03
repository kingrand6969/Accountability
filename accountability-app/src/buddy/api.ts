import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';

export type Candidate = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  area: string | null;
};
export type DiscoveryCandidates = {
  candidates: Candidate[];
  viewerArea: string | null;
};
export type IncomingRequest = {
  id: string;
  from_user: string;
  name: string | null;
  avatar: string | null;
};
export type Buddy = { id: string; name: string | null; avatar: string | null };
export type Message = { id: string; sender: string; body: string; created_at: string };

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getBuddyOptIn(): Promise<boolean> {
  const uid = await me();
  if (!uid) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('buddy_opt_in')
    .eq('id', uid)
    .maybeSingle();
  if (error) throw error;
  return !!data?.buddy_opt_in;
}

export async function setBuddyOptIn(value: boolean): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('profiles')
    .update({ buddy_opt_in: value })
    .eq('id', uid);
  if (error) throw error;
}

export async function listCandidates(): Promise<Candidate[]> {
  const result = await listDiscoveryCandidates();
  return result.candidates.filter(
    (candidate) =>
      !!result.viewerArea &&
      candidate.area?.trim().toLocaleLowerCase() === result.viewerArea.trim().toLocaleLowerCase(),
  );
}

/** Opted-in discovery candidates plus the viewer's coarse, self-selected area. */
export async function listDiscoveryCandidates(): Promise<DiscoveryCandidates> {
  const uid = await me();
  if (!uid) return { candidates: [], viewerArea: null };
  const { data: meRow } = await supabase
    .from('profiles')
    .select('area')
    .eq('id', uid)
    .maybeSingle();
  const area = meRow?.area ?? null;

  const q = supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url,area')
    .eq('buddy_opt_in', true)
    .neq('id', uid)
    .limit(50);
  const { data, error } = await q;
  if (error) throw error;

  const exclude = await excludedIds(uid);
  return {
    candidates: ((data ?? []) as Candidate[]).filter((c) => !exclude.has(c.id)),
    viewerArea: area,
  };
}

/** People I've blocked, already linked with, or already requested. */
async function excludedIds(uid: string): Promise<Set<string>> {
  const [{ data: blocks }, { data: links }, { data: reqs }] = await Promise.all([
    supabase.from('buddy_blocks').select('blocked').eq('blocker', uid),
    supabase.from('buddy_links').select('user_a,user_b').or(`user_a.eq.${uid},user_b.eq.${uid}`),
    supabase.from('buddy_requests').select('to_user').eq('from_user', uid),
  ]);
  const exclude = new Set<string>();
  (blocks ?? []).forEach((b: any) => exclude.add(b.blocked));
  (links ?? []).forEach((l: any) => exclude.add(l.user_a === uid ? l.user_b : l.user_a));
  (reqs ?? []).forEach((r: any) => exclude.add(r.to_user));
  return exclude;
}

/**
 * Find a specific person by name (any area). ONLY searches people who have
 * buddy matching turned on — opting out keeps you unfindable, as promised.
 */
export async function searchBuddies(query: string): Promise<Candidate[]> {
  const uid = await me();
  const q = query.trim();
  if (!uid || q.length < 2) return [];
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url,area')
    .eq('buddy_opt_in', true)
    .neq('id', uid)
    .ilike('display_name', `%${q.replace(/[%_]/g, '')}%`)
    .limit(20);
  if (error) throw error;
  const exclude = await excludedIds(uid);
  return ((data ?? []) as Candidate[]).filter((c) => !exclude.has(c.id));
}

export async function sendRequest(toUser: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('buddy_requests')
    .insert({ from_user: uid, to_user: toUser });
  if (error && error.code !== '23505') throw error;
}

export async function listIncoming(): Promise<IncomingRequest[]> {
  const uid = await me();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('buddy_requests')
    .select('id,from_user')
    .eq('to_user', uid)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const authors = await getPublicProfiles(rows.map((r: any) => r.from_user));
  return rows.map((r: any) => ({
    id: r.id,
    from_user: r.from_user,
    name: authors.get(r.from_user)?.display_name ?? null,
    avatar: authors.get(r.from_user)?.avatar_url ?? null,
  }));
}

export async function acceptRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_buddy_request', { p_request_id: id });
  if (error) throw error;
}

export async function declineRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('buddy_requests')
    .update({ status: 'declined' })
    .eq('id', id);
  if (error) throw error;
}

export async function listBuddies(): Promise<Buddy[]> {
  const uid = await me();
  if (!uid) return [];
  const { data: links, error } = await supabase
    .from('buddy_links')
    .select('user_a,user_b')
    .or(`user_a.eq.${uid},user_b.eq.${uid}`);
  if (error) throw error;
  const otherIds = (links ?? []).map((l: any) => (l.user_a === uid ? l.user_b : l.user_a));
  if (otherIds.length === 0) return [];
  const { data: profs } = await supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url')
    .in('id', otherIds);
  return (profs ?? []).map((p: any) => ({
    id: p.id,
    name: p.display_name ?? null,
    avatar: p.avatar_url ?? null,
  }));
}

export type ActiveBuddy = {
  id: string;
  name: string | null;
  avatar: string | null;
  online: boolean;
  lastActive: string | null;
};

/** A buddy counts as "online" if they were active in the last 5 minutes
 *  (and haven't hidden their activity — the view NULLs last_active_at then). */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

/** Buddies for the Active row — online first, then most-recently-seen. */
export async function listActiveBuddies(): Promise<ActiveBuddy[]> {
  const uid = await me();
  if (!uid) return [];
  const { data: links } = await supabase
    .from('buddy_links')
    .select('user_a,user_b')
    .or(`user_a.eq.${uid},user_b.eq.${uid}`);
  const otherIds = (links ?? []).map((l: any) => (l.user_a === uid ? l.user_b : l.user_a));
  if (otherIds.length === 0) return [];
  const { data: profs } = await supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url,last_active_at')
    .in('id', otherIds);
  const now = Date.now();
  return (profs ?? [])
    .map((p: any) => {
      const la = p.last_active_at ? new Date(p.last_active_at).getTime() : 0;
      return {
        id: p.id,
        name: p.display_name ?? null,
        avatar: p.avatar_url ?? null,
        lastActive: p.last_active_at ?? null,
        online: la > 0 && now - la < ONLINE_WINDOW_MS,
      };
    })
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        new Date(b.lastActive ?? 0).getTime() - new Date(a.lastActive ?? 0).getTime(),
    );
}

export async function getProfileBrief(
  id: string,
): Promise<{ name: string | null; avatar: string | null }> {
  const { data } = await supabase
    .from('public_profiles')
    .select('display_name,avatar_url')
    .eq('id', id)
    .maybeSingle();
  return { name: data?.display_name ?? null, avatar: data?.avatar_url ?? null };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** IDs reach us via deep-link route params — never trust them inside a
 *  PostgREST filter string. */
function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) throw new Error('Invalid user id.');
}

/** Page size for chat windows — a screenful and change, not the whole thread. */
export const CHAT_PAGE = 50;

const pairFilter = (uid: string, otherId: string) =>
  `and(sender.eq.${uid},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${uid})`;

/**
 * A NEWEST-FIRST window of the conversation (pairs with the chat's inverted
 * list). Pass `before` (the oldest loaded created_at) to page further back.
 * Replaces loading the entire thread on every open/poll/send.
 */
export async function listMessages(otherId: string, before?: string): Promise<Message[]> {
  assertUuid(otherId);
  const uid = await me();
  if (!uid) return [];
  let q = supabase
    .from('buddy_messages')
    .select('id,sender,body,created_at')
    .or(pairFilter(uid, otherId))
    .order('created_at', { ascending: false })
    .limit(CHAT_PAGE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Message[];
}

/** Only messages newer than `after` — the cheap incremental safety-net poll. */
export async function listMessagesAfter(otherId: string, after: string): Promise<Message[]> {
  assertUuid(otherId);
  const uid = await me();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('buddy_messages')
    .select('id,sender,body,created_at')
    .or(pairFilter(uid, otherId))
    .gt('created_at', after)
    .order('created_at', { ascending: false })
    .limit(CHAT_PAGE);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(otherId: string, body: string): Promise<Message> {
  assertUuid(otherId);
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('buddy_messages')
    .insert({ sender: uid, recipient: otherId, body })
    .select('id,sender,body,created_at')
    .single();
  if (error) throw error;
  return data as Message;
}

// ─── Messages inbox ──────────────────────────────────────────────────────────

export type Conversation = {
  otherId: string;
  name: string | null;
  avatar: string | null;
  lastBody: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
};

/** Every conversation, newest first, with a per-thread unread count. */
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase.rpc('list_conversations');
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    otherId: r.other_id,
    name: r.display_name ?? null,
    avatar: r.avatar_url ?? null,
    lastBody: r.last_body ?? '',
    lastAt: r.last_at,
    lastFromMe: !!r.last_from_me,
    unread: Number(r.unread ?? 0),
  }));
}

/** Total unread messages across all conversations (drives the tab badge). */
export async function unreadMessageCount(): Promise<number> {
  const uid = await me();
  if (!uid) return 0;
  const { count } = await supabase
    .from('buddy_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient', uid)
    .is('read_at', null);
  return count ?? 0;
}

/** Mark everything the other person sent me in this thread as read. */
export async function markConversationRead(otherId: string): Promise<void> {
  assertUuid(otherId);
  const uid = await me();
  if (!uid) return;
  await supabase
    .from('buddy_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient', uid)
    .eq('sender', otherId)
    .is('read_at', null);
}

export async function blockUser(id: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('buddy_blocks')
    .insert({ blocker: uid, blocked: id });
  if (error && error.code !== '23505') throw error;
}

export async function reportUser(id: string, reason: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('buddy_reports')
    .insert({ reporter: uid, reported: id, reason });
  if (error) throw error;
}
