import { supabase } from '../lib/supabase';

export type Group = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  privacy: 'public' | 'private';
  member_count: number;
  is_member: boolean;
  is_admin: boolean;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function mapGroup(row: any, myIds: Set<string>, adminIds: Set<string>): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    privacy: row.privacy === 'private' ? 'private' : 'public',
    member_count: row.group_members?.[0]?.count ?? 0,
    is_member: myIds.has(row.id),
    is_admin: adminIds.has(row.id),
  };
}

async function myMemberships(): Promise<{ ids: Set<string>; admin: Set<string> }> {
  const uid = await me();
  if (!uid) return { ids: new Set(), admin: new Set() };
  const { data } = await supabase
    .from('group_members')
    .select('group_id,role')
    .eq('user_id', uid);
  const rows = data ?? [];
  return {
    ids: new Set(rows.map((r: any) => r.group_id as string)),
    admin: new Set(
      rows.filter((r: any) => r.role === 'admin').map((r: any) => r.group_id as string),
    ),
  };
}

/** All groups (newest first) with member counts + my membership flags. */
export async function listGroups(): Promise<Group[]> {
  const [{ data, error }, mine] = await Promise.all([
    supabase
      .from('groups')
      .select('id,name,description,created_by,created_at,privacy,group_members(count)')
      .order('created_at', { ascending: false })
      .limit(100),
    myMemberships(),
  ]);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapGroup(r, mine.ids, mine.admin));
}

export async function getGroup(id: string): Promise<Group | null> {
  const [{ data, error }, mine] = await Promise.all([
    supabase
      .from('groups')
      .select('id,name,description,created_by,created_at,privacy,group_members(count)')
      .eq('id', id)
      .maybeSingle(),
    myMemberships(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return mapGroup(data, mine.ids, mine.admin);
}

export async function createGroup(
  name: string,
  description: string,
  opts?: { privacy?: 'public' | 'private'; gatekey?: string },
): Promise<string> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const privacy = opts?.privacy ?? 'public';
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name: name.trim(),
      description: description.trim() || null,
      created_by: uid,
      privacy,
      gatekey: privacy === 'private' ? (opts?.gatekey?.trim() ?? null) : null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Join a private group with its gatekey. Resolves false if the key is wrong. */
export async function joinGroupWithKey(groupId: string, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('join_group_with_key', {
    p_group: groupId,
    p_key: key,
  });
  if (error) throw error;
  return data === true;
}

/** Admins only: read back the group's gatekey to share an invite. Null otherwise. */
export async function getGroupGatekey(groupId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_group_gatekey', { p_group: groupId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function joinGroup(groupId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: uid });
  if (error && error.code !== '23505') throw error;
}

export async function leaveGroup(groupId: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', uid);
  if (error) throw error;
}
