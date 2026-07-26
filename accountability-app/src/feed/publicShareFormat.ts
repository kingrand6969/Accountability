export const PUBLIC_SHARE_ORIGIN = 'https://kingrand.io';

export function publicShareUrl(id: string): string {
  return `${PUBLIC_SHARE_ORIGIN}/s/${encodeURIComponent(id)}`;
}

export function publicShareMessage(title: string, url: string): string {
  const clean = title.trim() || 'A win worth sharing';
  return `${clean}\n\nView this AccountAbility update:\n${url}`;
}
