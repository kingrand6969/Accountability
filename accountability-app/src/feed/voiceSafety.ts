export type VoiceSafetyAction = 'delete' | 'report' | 'block';

export type VoiceSafetyView = {
  viewerId: string;
  postOwnerId: string;
  postId: string;
  generation: number;
  mounted: boolean;
};

export type VoiceSafetyToken = {
  voiceId: string;
  senderId: string;
  action: VoiceSafetyAction;
  viewerId: string;
  postOwnerId: string;
  postId: string;
  generation: number;
  operation: number;
};

export function voiceSafetyPermission(
  viewerId: string,
  senderId: string,
  postOwnerId: string,
) {
  const sender = viewerId === senderId;
  const recipient = viewerId === postOwnerId && !sender;
  return {
    delete: sender,
    report: recipient,
    block: recipient,
  };
}

export function voiceSafetyCompletionBelongsToView(
  token: VoiceSafetyToken,
  active: VoiceSafetyToken | null,
  view: VoiceSafetyView,
): boolean {
  return view.mounted
    && active !== null
    && token.operation === active.operation
    && token.voiceId === active.voiceId
    && token.senderId === active.senderId
    && token.action === active.action
    && token.viewerId === active.viewerId
    && token.postOwnerId === active.postOwnerId
    && token.postId === active.postId
    && token.generation === active.generation
    && token.viewerId === view.viewerId
    && token.postOwnerId === view.postOwnerId
    && token.postId === view.postId
    && token.generation === view.generation;
}

export class VoiceSafetyCoordinator {
  private view: VoiceSafetyView;
  private active: VoiceSafetyToken | null = null;
  private nextOperation = 0;

  constructor(view: VoiceSafetyView) {
    this.view = view;
  }

  update(view: VoiceSafetyView): void {
    this.view = view;
    this.active = null;
  }

  begin(
    voiceId: string,
    senderId: string,
    action: VoiceSafetyAction,
  ): VoiceSafetyToken | null {
    if (!this.view.mounted || this.active) return null;
    const permission = voiceSafetyPermission(
      this.view.viewerId,
      senderId,
      this.view.postOwnerId,
    );
    if (!permission[action]) return null;
    const token: VoiceSafetyToken = {
      voiceId,
      senderId,
      action,
      viewerId: this.view.viewerId,
      postOwnerId: this.view.postOwnerId,
      postId: this.view.postId,
      generation: this.view.generation,
      operation: ++this.nextOperation,
    };
    this.active = token;
    return token;
  }

  complete(token: VoiceSafetyToken): { apply: boolean; release: boolean } {
    if (!voiceSafetyCompletionBelongsToView(token, this.active, this.view)) {
      return { apply: false, release: false };
    }
    this.active = null;
    return { apply: true, release: true };
  }
}
