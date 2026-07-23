import { supabase } from '../lib/supabase';

/** What the signed-in member is allowed to see about their own standing.
 *  Mirrors the `my_moderation_state()` RPC (migration 0062). */
export type ModerationState = {
  banned: boolean;
  ban_message: string | null;
  /** ISO timestamp while an active restriction is in force, else null. */
  restricted_until: string | null;
  restrict_message: string | null;
  /** The warning text while a warning is unacknowledged, else null. */
  warning: string | null;
};

const EMPTY: ModerationState = {
  banned: false,
  ban_message: null,
  restricted_until: null,
  restrict_message: null,
  warning: null,
};

/** Reads the caller's own sanction state. Fails open (returns EMPTY) so a
 *  transient network/RPC error never locks a member out of their account. */
export async function fetchModerationState(): Promise<ModerationState> {
  try {
    const { data, error } = await supabase.rpc('my_moderation_state');
    if (error || !data) return EMPTY;
    return { ...EMPTY, ...(data as Partial<ModerationState>) };
  } catch {
    return EMPTY;
  }
}

/** Marks the current warning as seen so the modal stops showing. */
export async function acknowledgeWarning(): Promise<void> {
  try {
    await supabase.rpc('acknowledge_warning');
  } catch {
    /* best-effort — the modal closes locally regardless */
  }
}

/**
 * Tells the server "this member is here" so it can record the connection's IP
 * (server-side — abuse prevention, disclosed in the Privacy Policy) and answer
 * whether this network is banned. Fails open: any error counts as not banned.
 */
export async function sessionPing(): Promise<{ ipBanned: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke('session-ping', { body: {} });
    if (error || !data) return { ipBanned: false };
    return { ipBanned: !!(data as { ip_banned?: boolean }).ip_banned };
  } catch {
    return { ipBanned: false };
  }
}
