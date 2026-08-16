import { supabase } from '../lib/supabase';

export type BuddyCardViewerMode = 'owner' | 'buddy' | 'public';

export function buddyCardViewerMode(
  viewerId: string | null,
  targetId: string,
  isBuddy: boolean,
): BuddyCardViewerMode {
  if (viewerId === targetId) return 'owner';
  if (viewerId && isBuddy) return 'buddy';
  return 'public';
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_CHANGED = 'Account changed. Reopen this Buddy Card and try again.';

function assertUuid(id: string): void {
  if (!UUID_RE.test(id)) throw new Error('Invalid user id.');
}

export async function assertBuddyCardViewer(expectedViewerId: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (data.user?.id !== expectedViewerId) throw new Error(ACCOUNT_CHANGED);
}

/**
 * Checks the relationship for one immutable viewer/target pair. RLS remains
 * authoritative; the before/after auth checks only prevent a screen started by
 * one account from consuming a result after another account becomes active.
 */
export async function areBuddiesAsOwner(
  expectedViewerId: string,
  targetId: string,
): Promise<boolean> {
  if (expectedViewerId === targetId) return false;
  assertUuid(expectedViewerId);
  assertUuid(targetId);
  await assertBuddyCardViewer(expectedViewerId);
  const pair =
    `and(user_a.eq.${expectedViewerId},user_b.eq.${targetId}),` +
    `and(user_a.eq.${targetId},user_b.eq.${expectedViewerId})`;
  const { data, error } = await supabase
    .from('buddy_links')
    .select('user_a')
    .or(pair)
    .limit(1);
  if (error) throw error;
  await assertBuddyCardViewer(expectedViewerId);
  return (data?.length ?? 0) > 0;
}

/**
 * Sends a request for exactly the account and target captured at tap time.
 * The explicit from_user value also lets the buddy-request RLS policy reject a
 * request if authentication changes before PostgreSQL evaluates the insert.
 */
export async function sendBuddyRequestAsOwner(
  expectedOwnerId: string,
  targetId: string,
): Promise<void> {
  if (expectedOwnerId === targetId) throw new Error('You cannot connect with yourself.');
  assertUuid(expectedOwnerId);
  assertUuid(targetId);
  await assertBuddyCardViewer(expectedOwnerId);
  const { error } = await supabase
    .from('buddy_requests')
    .insert({ from_user: expectedOwnerId, to_user: targetId });
  if (error && error.code !== '23505') throw error;
  await assertBuddyCardViewer(expectedOwnerId);
}

export type BuddyCardConnectToken = Readonly<{
  key: symbol;
  ownerId: string;
  targetId: string;
}>;

/** A synchronous tap lock whose tokens cannot release a newer action. */
export function createBuddyCardConnectLock() {
  let active: BuddyCardConnectToken | null = null;
  return {
    tryAcquire(ownerId: string, targetId: string): BuddyCardConnectToken | null {
      if (active || ownerId === targetId) return null;
      active = { key: Symbol('buddy-card-connect'), ownerId, targetId };
      return active;
    },
    owns(token: BuddyCardConnectToken, ownerId: string, targetId: string): boolean {
      return active === token && token.ownerId === ownerId && token.targetId === targetId;
    },
    release(token: BuddyCardConnectToken): void {
      if (active === token) active = null;
    },
    cancel(token: BuddyCardConnectToken): void {
      if (active === token) active = null;
    },
  };
}

export type BuddyCardConnectLock = ReturnType<typeof createBuddyCardConnectLock>;
