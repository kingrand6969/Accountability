import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const PENDING_REF_KEY = 'pendingReferral';

async function me(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** How many people joined the app from my invite (feeds the Ambassador medal). */
export async function myReferralCount(): Promise<number> {
  const uid = await me();
  if (!uid) return 0;
  const { count } = await supabase
    .from('referrals')
    .select('referred_id', { count: 'exact', head: true })
    .eq('referrer_id', uid);
  return count ?? 0;
}

/** A link that opens the app / signup carrying my referral tag. */
export async function myInviteUrl(): Promise<string | null> {
  const uid = await me();
  if (!uid) return null;
  return Linking.createURL('/', { queryParams: { ref: uid } });
}

/**
 * Record that the signed-in (brand-new) member arrived from someone's invite.
 * Safe to call more than once — the PK + RLS keep it to a single, valid row.
 */
export async function recordReferral(referrerId: string): Promise<void> {
  const uid = await me();
  if (!uid || !referrerId || referrerId === uid) return;
  await supabase.from('referrals').insert({ referred_id: uid, referrer_id: referrerId });
  // duplicate / invalid referrer → rejected by PK/RLS; non-critical, ignore.
}

/**
 * If the app was opened from an invite link (…?ref=<uuid>), remember who invited
 * us so we can credit them once the new account is signed in. Called on launch,
 * before auth — the referral is redeemed later by redeemPendingReferral().
 */
export async function captureReferralFromLaunch(): Promise<void> {
  try {
    const url = await Linking.getInitialURL();
    const ref = url ? Linking.parse(url).queryParams?.ref : null;
    if (typeof ref === 'string' && ref.length > 0) {
      await AsyncStorage.setItem(PENDING_REF_KEY, ref);
    }
  } catch {
    // no URL / parse issue — nothing to capture
  }
}

/**
 * Once a session exists, spend any stashed invite: attribute the referral, then
 * clear it. No-op if there's nothing pending. The PK means it only ever counts
 * once, even if this runs on every launch.
 */
export async function redeemPendingReferral(): Promise<void> {
  const ref = await AsyncStorage.getItem(PENDING_REF_KEY).catch(() => null);
  if (!ref) return;
  await AsyncStorage.removeItem(PENDING_REF_KEY).catch(() => {});
  await recordReferral(ref).catch(() => {});
}
