import { supabase } from '../lib/supabase';
import type { Pt } from './geo';

export type ActivityType = 'run' | 'walk' | 'ride';

export type NewActivity = {
  type: ActivityType;
  distance_m: number;
  duration_s: number;
  route: Pt[];
  started_at: string;
};

export async function saveActivity(a: NewActivity): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');
  const { error } = await supabase.from('activities').insert({
    user_id: uid,
    type: a.type,
    distance_m: Math.round(a.distance_m),
    duration_s: Math.round(a.duration_s),
    route: a.route,
    started_at: a.started_at,
  });
  if (error) throw error;
}
