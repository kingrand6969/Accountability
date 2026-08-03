export type CreateChoice = {
  id: 'post' | 'photo-video' | 'flex' | 'share-run' | 'my-day';
  title: string;
  detail: string;
  accessibilityLabel: string;
  route: '/win-card' | '/run' | '/add' | null;
  action: 'open-editor' | 'choose-media' | null;
};

export const CREATE_CHOICES: readonly CreateChoice[] = [
  {
    id: 'post',
    title: 'Post',
    detail: 'Share an update with your people',
    accessibilityLabel: 'Post. Share an update with your people',
    route: null,
    action: 'open-editor',
  },
  {
    id: 'photo-video',
    title: 'Photo/video',
    detail: 'Choose a photo or video to share',
    accessibilityLabel: 'Photo or video. Choose media to share',
    route: null,
    action: 'choose-media',
  },
  {
    id: 'flex',
    title: 'Flex',
    detail: 'Celebrate a win',
    accessibilityLabel: 'Flex. Celebrate a win',
    route: '/win-card',
    action: null,
  },
  {
    id: 'share-run',
    title: 'Share a run',
    detail: 'Track and share your run',
    accessibilityLabel: 'Share a run. Track and share your run',
    route: '/run',
    action: null,
  },
  {
    id: 'my-day',
    title: 'Add to My Day',
    detail: "Update today's promises",
    accessibilityLabel: "Add to My Day. Update today's promises",
    route: '/add',
    action: null,
  },
];

export const CREATE_HUB_MODEL = {
  choices: CREATE_CHOICES,
  sections: ['preview', 'audience'] as const,
  continueLabel: 'Continue',
};

export type CreateMedia = 'photo' | 'video';
export type CreateAudience = 'buddies' | 'public';

export function createPickerReadinessGate(initial: CreateMedia | null = null) {
  let pending: CreateMedia | null = initial;
  return {
    request(media: CreateMedia, ready: boolean): CreateMedia | null {
      if (ready) return media;
      pending = media;
      return null;
    },
    resolve(ready: boolean): CreateMedia | null {
      if (!ready || !pending) return null;
      const media = pending;
      pending = null;
      return media;
    },
    clear() {
      pending = null;
    },
  };
}

export type CreateContinuation =
  | { kind: 'editor'; audience: CreateAudience }
  | { kind: 'picker'; media: CreateMedia; audience: CreateAudience }
  | { kind: 'route'; route: '/win-card' | '/run' | '/add' };

export function decideCreateContinuation({
  choiceId,
  media,
  audience,
}: {
  choiceId: CreateChoice['id'];
  media: CreateMedia;
  audience: CreateAudience;
}): CreateContinuation {
  const choice = CREATE_CHOICES.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error(`Unknown create choice: ${choiceId}`);
  if (choice.route) return { kind: 'route', route: choice.route };
  if (choice.action === 'choose-media') return { kind: 'picker', media, audience };
  return { kind: 'editor', audience };
}

type ComposeParams = {
  edit?: string | string[];
  photo?: string | string[];
  event?: string | string[];
  text?: string | string[];
};

export type ComposeMode = 'hub' | 'post' | 'photo' | 'event' | 'edit';

export function resolveComposeMode(params: ComposeParams): ComposeMode {
  if (typeof params.edit === 'string' && params.edit) return 'edit';
  if (params.event === '1') return 'event';
  if (params.photo === '1') return 'photo';
  if (typeof params.text === 'string' && params.text) return 'post';
  return 'hub';
}
