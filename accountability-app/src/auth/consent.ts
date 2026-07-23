import { supabase } from '../lib/supabase';
import { LEGAL_VERSION } from '../legal/content';

/** Stamp the signed-in member as having accepted the current Terms/Privacy +
 *  the 13+ age confirmation. Called once a session exists (right after sign-up
 *  or after email verification). Best-effort — never blocks entering the app. */
export async function recordConsent(): Promise<void> {
  try {
    await supabase.rpc('record_consent', { p_version: LEGAL_VERSION });
  } catch {
    // a failed stamp shouldn't trap a new member on the auth screen; the
    // required checkbox already gated sign-up, and we can re-prompt later
  }
}
