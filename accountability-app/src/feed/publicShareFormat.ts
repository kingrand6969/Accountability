export const PUBLIC_SHARE_ORIGIN = 'https://joinaccountability.app';

export function publicShareUrl(id: string): string {
  return `${PUBLIC_SHARE_ORIGIN}/s/${encodeURIComponent(id)}`;
}

export function publicShareMessage(title: string, url: string): string {
  const clean = title.trim() || 'A win worth sharing';
  // The HTTPS destination is supplied as a separate share payload whenever the
  // operating system supports it. Keep the human message clean so recipients
  // see a polished card rather than suspicious link-heavy copy.
  void url;
  return `${clean}\n\nShared with permission from AccountAbility.`;
}

export function publicShareContent(title: string, url: string, platform: 'ios' | 'android' | 'web') {
  const message = publicShareMessage(title, url);
  if (platform === 'ios') return { message, url };
  // Android's native Share API has no separate URL field. A single branded
  // HTTPS URL allows messaging apps to render the controlled Open Graph card.
  // It is never a custom scheme, user id, or private media address.
  if (platform === 'android') return { message: `${message}\n\n${url}` };
  return { message, url };
}
