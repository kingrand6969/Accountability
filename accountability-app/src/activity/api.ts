import { supabase } from '../lib/supabase';
import type { Pt } from './geo';
import { uploadQueuedActivity } from './activityUpload';
import { createActivityId, type QueuedActivity } from './offlineQueueTypes';

export type ActivityType = 'run' | 'walk' | 'ride';

export type NewActivity = {
  type: ActivityType;
  distance_m: number;
  duration_s: number;
  route: Pt[];
  started_at: string;
};

export async function saveActivity(a: NewActivity): Promise<string> {
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');

  const now = Date.now();
  const entry: QueuedActivity = {
    schema: 1,
    id: createActivityId(),
    ownerId: uid,
    activity: {
      ...a,
      distance_m: Math.round(a.distance_m),
      duration_s: Math.round(a.duration_s),
    },
    createdAt: new Date(now).toISOString(),
    status: 'saved',
    attemptCount: 0,
    nextAttemptAt: now,
    lastError: null,
  };
  return uploadQueuedActivity(entry);
}
