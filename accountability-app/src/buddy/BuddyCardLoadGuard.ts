export type BuddyCardLoadToken = Readonly<{
  generation: number;
  targetId: string;
  viewerId: string | null | undefined;
}>;

/**
 * Identifies the one profile load that is still allowed to update the screen.
 * A token is not writable until it is bound to the current authenticated viewer.
 */
export class BuddyCardLoadGuard {
  private generation = 0;
  private current: BuddyCardLoadToken | null = null;

  begin(targetId: string): BuddyCardLoadToken {
    const token: BuddyCardLoadToken = {
      generation: ++this.generation,
      targetId,
      viewerId: undefined,
    };
    this.current = token;
    return token;
  }

  isCurrentTarget(token: BuddyCardLoadToken): boolean {
    return this.current === token;
  }

  bindViewer(token: BuddyCardLoadToken, viewerId: string | null): BuddyCardLoadToken | null {
    if (!this.isCurrentTarget(token)) return null;
    const boundToken: BuddyCardLoadToken = { ...token, viewerId };
    this.current = boundToken;
    return boundToken;
  }

  owns(token: BuddyCardLoadToken): boolean {
    return token.viewerId !== undefined && this.current === token;
  }

  cancel(token: BuddyCardLoadToken): void {
    if (this.current !== token) return;
    this.generation += 1;
    this.current = null;
  }
}
