export type ShareVisibility = Readonly<{
  audience: 'buddies' | 'public';
  showOnCard: boolean;
}>;

export const DEFAULT_SHOW_PUBLICLY = false;

export const VISIBILITY_SWITCH_ACCESSIBILITY_LABEL =
  'Share publicly and show on Buddy Card';

export function postVisibility(showPublicly: boolean): ShareVisibility {
  if (typeof showPublicly !== 'boolean') {
    throw new Error('Post visibility must be a boolean.');
  }
  return showPublicly
    ? { audience: 'public', showOnCard: true }
    : { audience: 'buddies', showOnCard: false };
}

/**
 * Existing rows may contain the former independent audience/card choices.
 * Only an exact prior public opt-in remains public; every ambiguous or invalid
 * shape falls back to the privacy-preserving Buddies-only state.
 */
export function normalizeStoredPostVisibility(value: {
  audience?: unknown;
  show_on_card?: unknown;
  showOnCard?: unknown;
}): ShareVisibility {
  const showOnCard = value.show_on_card ?? value.showOnCard;
  return postVisibility(value.audience === 'public' && showOnCard === true);
}

export function postVisibilityCopy(showPublicly: boolean): Readonly<{
  label: string;
  helper: string;
  accessibilityLabel: string;
  postAction: string;
}> {
  postVisibility(showPublicly);
  return showPublicly
    ? {
      label: 'Public + Buddy Card',
      helper: 'Everyone can see this post, and it will appear on your Buddy Card.',
      accessibilityLabel: VISIBILITY_SWITCH_ACCESSIBILITY_LABEL,
      postAction: 'Post publicly',
    }
    : {
      label: 'Buddies only',
      helper: 'Only accepted buddies can see this post. It will not appear on your Buddy Card.',
      accessibilityLabel: VISIBILITY_SWITCH_ACCESSIBILITY_LABEL,
      postAction: 'Post to buddies',
    };
}
