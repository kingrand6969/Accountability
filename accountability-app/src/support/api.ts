import { supabase } from '../lib/supabase';

export type SupportKind = 'support' | 'report' | 'feedback';

/** File an in-app support / report-a-problem / feedback message for the team. */
export async function sendSupportMessage(
  kind: SupportKind,
  body: string,
  subject?: string,
): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Please write a message.');
  const { error } = await supabase
    .from('support_messages')
    .insert({ kind, body: trimmed, subject: subject?.trim() || null });
  if (error) throw error;
}
