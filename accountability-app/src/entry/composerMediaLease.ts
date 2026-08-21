export type ComposerMediaLease = {
  owner: string;
  mountToken: number;
  requestToken: number;
};

export type ComposerMediaLeaseState = {
  owner: string | null;
  mountToken: number;
  requestToken: number;
  active: boolean;
  editing: boolean;
};

export function createComposerMediaLease(
  owner: string | null,
  mountToken: number,
  requestToken: number,
): ComposerMediaLease | null {
  return owner ? { owner, mountToken, requestToken } : null;
}

export function composerMediaLeaseIsCurrent(
  lease: ComposerMediaLease | null,
  state: ComposerMediaLeaseState,
): lease is ComposerMediaLease {
  return Boolean(
    lease
    && state.active
    && !state.editing
    && state.owner === lease.owner
    && state.mountToken === lease.mountToken
    && state.requestToken === lease.requestToken,
  );
}

export async function runComposerPickerLease<T>(input: {
  lease: ComposerMediaLease | null;
  current: () => ComposerMediaLeaseState;
  launch: () => Promise<T | null>;
  accept: (result: T) => Promise<void>;
  discard: (result: T) => Promise<void>;
}): Promise<boolean> {
  if (!composerMediaLeaseIsCurrent(input.lease, input.current())) return false;
  const result = await input.launch();
  if (result === null) return false;
  if (!composerMediaLeaseIsCurrent(input.lease, input.current())) {
    await input.discard(result);
    return false;
  }
  await input.accept(result);
  if (!composerMediaLeaseIsCurrent(input.lease, input.current())) {
    await input.discard(result);
    return false;
  }
  return true;
}
