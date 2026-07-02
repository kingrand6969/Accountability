import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';

export type Candidate = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  area: string | null;
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
  const uid = await me();
  if (!uid) return [];
  const { data: meRow } = await supabase
    .from('profiles')
    .select('area')
    .eq('id', uid)
    .maybeSingle();
  const area = meRow?.area ?? null;

  let q = supabase
    .from('public_profiles')
    .select('id,display_name,avatar_url,area')
    .eq('buddy_opt_in', true)
    .neq('id', uid)
    .limit(50);
  if (area) q = q.eq('area', area);
  const { data, error } = await q;
  if (error) throw error;

  const [{ data: blocks }, { data: links }, { data: reqs }] = await Promise.all([
    supabase.from('buddy_blocks').select('blocked').eq('blocker', uid),
    supabase.from('buddy_links').select('user_a,user_b').or(`user_a.eq.${uid},user_b.eq.${uid}`),
    supabase.from('buddy_requests').select('to_user').eq('from_user', uid),
  ]);
  const exclude = new Set<string>();
  (blocks ?? []).forEach((b: any) => exclude.add(b.blocked));
  (links ?? []).forEach((l: any) => exclude.add(l.user_a === uid ? l.user_b : l.user_a));
  (reqs ?? []).forEach((r: any) => exclude.add(r.to_user));

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

export async function listMessages(otherId: string): Promise<Message[]> {
  assertUuid(otherId);
  const uid = await me();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('buddy_messages')
    .select('id,sender,body,created_at')
    .or(
      `and(sender.eq.${uid},recipient.eq.${otherId}),and(sender.eq.${otherId},recipient.eq.${uid})`,
    )
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(otherId: string, body: string): Promise<void> {
  assertUuid(otherId);
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('buddy_messages')
    .insert({ sender: uid, recipient: otherId, body });
  if (error) throw error;
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
