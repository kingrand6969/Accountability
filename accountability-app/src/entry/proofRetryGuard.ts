export type ProofRetryToken = Readonly<{
  attempt: number;
  ownerId: string | null;
}>;

export function createProofRetryGuard() {
  let attempt = 0;

  return {
    begin(ownerId: string | null): ProofRetryToken {
      attempt += 1;
      return { attempt, ownerId };
    },
    invalidate() {
      attempt += 1;
    },
    isCurrent(
      token: ProofRetryToken,
      currentOwnerId: string | null,
      mounted: boolean,
    ): boolean {
      return mounted && token.attempt === attempt && token.ownerId === currentOwnerId;
    },
  };
}
