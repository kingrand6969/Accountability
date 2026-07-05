export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function authorLabel(name: string | null): string {
  const n = name?.trim();
  return n && n.length > 0 ? n : 'Someone';
}

/** "with Alice", "with Alice and Bob", "with Alice, Bob and 2 others". */
export function taggedLabel(tagged: { name: string | null }[]): string | null {
  const names = tagged.map((t) => authorLabel(t.name));
  if (names.length === 0) return null;
  if (names.length === 1) return `with ${names[0]}`;
  if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
  return `with ${names[0]}, ${names[1]} and ${names.length - 2} other${names.length === 3 ? '' : 's'}`;
}
