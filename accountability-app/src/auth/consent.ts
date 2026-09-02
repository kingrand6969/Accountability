import { supabase } from '../lib/supabase';
import { LEGAL_VERSION } from '../legal/content';

type LegalConsentChangeListener = (ownerId: string) => void;

const legalConsentChangeListeners = new Set<LegalConsentChangeListener>();

export function subscribeToLegalConsentChanges(
  listener: LegalConsentChangeListener,
): () => void {
  legalConsentChangeListeners.add(listener);
  return () => legalConsentChangeListeners.delete(listener);
}

function notifyLegalConsentChanged(ownerId: string): void {
  for (const listener of legalConsentChangeListeners) listener(ownerId);
}

export function isLegalConsentCurrent(
  acceptedVersion: string | null | undefined,
): boolean {
  return acceptedVersion === LEGAL_VERSION;
}

export async function getLegalConsentVersion(ownerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('terms_version')
    .eq('id', ownerId)
    .maybeSingle();
  if (error) throw error;
  return data?.terms_version ?? null;
}

/** Strict returning-member acceptance. The consent gate surfaces any failure. */
export async function acceptCurrentLegalTerms(): Promise<void> {
  const { error } = await supabase.rpc('record_consent', {
    p_version: LEGAL_VERSION,
  });
  if (error) throw error;
}

/** Stamp the signed-in member as having accepted the current Terms/Privacy +
 *  the 13+ age confirmation. Called once a session exists (right after sign-up
 *  or after email verification). Best-effort here; the signed-in consent gate
 *  handles a missing stamp and lets the member retry or sign out. */
export async function recordConsent(ownerId: string): Promise<void> {
  try {
    await acceptCurrentLegalTerms();
    notifyLegalConsentChanged(ownerId);
  } catch {
    // a failed stamp shouldn't trap a new member on the auth screen; the
    // required checkbox already gated sign-up, and we can re-prompt later
  }
}
