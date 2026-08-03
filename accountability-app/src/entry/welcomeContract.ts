export const WELCOME_ACTIONS = [
  { id: 'login', route: null },
  { id: 'create-account', route: '/sign-up' },
  { id: 'forgot-password', route: '/forgot-password' },
] as const;

export function welcomeErrorState(formError: string, fieldError: string) {
  const visible = Boolean(formError || fieldError);

  return {
    visible,
    liveRegion: visible ? ('assertive' as const) : ('none' as const),
  };
}
