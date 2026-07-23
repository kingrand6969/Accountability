import { supabase } from '../lib/supabase';
import { getPublicProfiles } from '../profiles/publicProfiles';

/**
 * Saving Buddies (Pro): shared savings goals with an itemized, per-member
 * contribution ledger. Creation is Pro-gated server-side; members must be
 * the creator's accepted buddies (RLS-enforced).
 */

export type GoalMember = { id: string; name: string | null; avatar: string | null };

export type SharedGoal = {
  id: string;
  creator_id: string;
  name: string;
  target: number;
  saved: number;
  members: GoalMember[];
};

export type GoalContribution = {
  id: string;
  user_id: string;
  name: string | null;
  avatar: string | null;
  amount: number;
  note: string | null;
  created_at: string;
};

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function listSharedGoals(): Promise<SharedGoal[]> {
  const { data: goals, error } = await supabase
    .from('shared_goals')
    .select('id,creator_id,name,target')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!goals || goals.length === 0) return [];
  const ids = goals.map((g: any) => g.id);
  const [{ data: members }, { data: contribs }] = await Promise.all([
    supabase.from('shared_goal_members').select('goal_id,user_id').in('goal_id', ids),
    supabase.from('shared_goal_contributions').select('goal_id,amount').in('goal_id', ids),
  ]);
  const profs = await getPublicProfiles((members ?? []).map((m: any) => m.user_id));
  return goals.map((g: any) => ({
    id: g.id,
    creator_id: g.creator_id,
    name: g.name,
    target: Number(g.target),
    saved: (contribs ?? [])
      .filter((c: any) => c.goal_id === g.id)
      .reduce((s: number, c: any) => s + Number(c.amount), 0),
    members: (members ?? [])
      .filter((m: any) => m.goal_id === g.id)
      .map((m: any) => {
        const p = profs.get(m.user_id);
        return { id: m.user_id, name: p?.display_name ?? null, avatar: p?.avatar_url ?? null };
      }),
  }));
}

export async function getSharedGoal(
  id: string,
): Promise<{ goal: SharedGoal; contributions: GoalContribution[] } | null> {
  const { data: g, error } = await supabase
    .from('shared_goals')
    .select('id,creator_id,name,target')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!g) return null;
  const [{ data: members }, { data: contribs }] = await Promise.all([
    supabase.from('shared_goal_members').select('user_id').eq('goal_id', id),
    supabase
      .from('shared_goal_contributions')
      .select('id,user_id,amount,note,created_at')
      .eq('goal_id', id)
      .order('created_at', { ascending: false }),
  ]);
  const everyone = [
    ...(members ?? []).map((m: any) => m.user_id),
    ...(contribs ?? []).map((c: any) => c.user_id),
  ];
  const profs = await getPublicProfiles(everyone);
  const contributions: GoalContribution[] = (contribs ?? []).map((c: any) => {
    const p = profs.get(c.user_id);
    return {
      id: c.id,
      user_id: c.user_id,
      name: p?.display_name ?? null,
      avatar: p?.avatar_url ?? null,
      amount: Number(c.amount),
      note: c.note ?? null,
      created_at: c.created_at,
    };
  });
  return {
    goal: {
      id: g.id,
      creator_id: g.creator_id,
      name: g.name,
      target: Number(g.target),
      saved: contributions.reduce((s, c) => s + c.amount, 0),
      members: (members ?? []).map((m: any) => {
        const p = profs.get(m.user_id);
        return { id: m.user_id, name: p?.display_name ?? null, avatar: p?.avatar_url ?? null };
      }),
    },
    contributions,
  };
}

/** Create a shared goal (server RLS enforces Pro) and invite buddies. */
export async function createSharedGoal(
  name: string,
  target: number,
  buddyIds: string[],
): Promise<string> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('shared_goals')
    .insert({ creator_id: uid, name: name.trim(), target })
    .select('id')
    .single();
  if (error) {
    if (String(error.message).toLowerCase().includes('row-level security')) {
      throw new Error('Shared savings goals are a Pro feature.');
    }
    throw error;
  }
  // creator joins via trigger; add the chosen buddies (RLS: buddies only)
  if (buddyIds.length > 0) {
    const { error: mErr } = await supabase
      .from('shared_goal_members')
      .insert(buddyIds.map((user_id) => ({ goal_id: data.id, user_id })));
    if (mErr) throw mErr;
  }
  return data.id as string;
}

export async function addContribution(goalId: string, amount: number, note?: string): Promise<void> {
  const uid = await me();
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase
    .from('shared_goal_contributions')
    .insert({ goal_id: goalId, user_id: uid, amount, note: note?.trim() || null });
  if (error) throw error;
}

export async function deleteSharedGoal(id: string): Promise<void> {
  const { error } = await supabase.from('shared_goals').delete().eq('id', id);
  if (error) throw error;
}

export async function leaveSharedGoal(id: string): Promise<void> {
  const uid = await me();
  if (!uid) return;
  const { error } = await supabase
    .from('shared_goal_members')
    .delete()
    .eq('goal_id', id)
    .eq('user_id', uid);
  if (error) throw error;
}
