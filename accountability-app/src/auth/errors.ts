/** Turn raw Supabase auth error messages into friendly, human copy. */
export function authErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'That email already has an account. Try logging in instead.';
  if (m.includes('invalid login credentials'))
    return 'Email or password is incorrect. Please try again.';
  if (m.includes('email not confirmed'))
    return 'Please confirm your email first — check your inbox for the code.';
  if (m.includes('token has expired') || m.includes('expired'))
    return 'That code has expired. Tap “Resend code” to get a new one.';
  if (m.includes('invalid') && m.includes('token'))
    return 'That code isn’t right. Please check it and try again.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return 'Too many attempts — please wait a minute and try again.';
  if (m.includes('password')) return 'Password must be at least 8 characters.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Network problem — check your connection and try again.';
  return raw;
}

/** Supabase reports an unconfirmed-email sign-in with this message. */
export function isUnconfirmed(raw: string): boolean {
  return raw.toLowerCase().includes('email not confirmed');
}
