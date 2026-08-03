import { supabase } from '../lib/supabase';

export type ResolvedPrivateMedia = { url: string; expiresAt: string };
type CacheEntry = ResolvedPrivateMedia & { expiresAtMs: number };

const PRIVATE_MEDIA_PREFIX = 'r2://';
const REFRESH_EARLY_MS = 10_000;
const cache = new Map<string, CacheEntry>();

export function isPrivateMediaRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(PRIVATE_MEDIA_PREFIX);
}

export function clearPrivateMediaCache(): void {
  cache.clear();
}

export async function resolveMediaUrl(value: string): Promise<string> {
  if (!isPrivateMediaRef(value)) return value;
  const cached = cache.get(value);
  if (cached && cached.expiresAtMs - REFRESH_EARLY_MS > Date.now()) return cached.url;
  const { data, error } = await supabase.functions.invoke('media-read', { body: { ref: value } });
  if (error) throw error;
  const row = (data ?? {}) as Partial<ResolvedPrivateMedia>;
  const expiresAtMs = Date.parse(row.expiresAt ?? '');
  if (!row.url || !Number.isFinite(expiresAtMs)) throw new Error('Could not open this private image.');
  cache.set(value, { url: row.url, expiresAt: row.expiresAt!, expiresAtMs });
  return row.url;
}

/** Resolve up to 50 refs with one authorization-aware Edge invocation. */
export async function resolveMediaUrls(values: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(values)].filter(Boolean);
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const value of unique) {
    if (!isPrivateMediaRef(value)) {
      result.set(value, value);
      continue;
    }
    const cached = cache.get(value);
    if (cached && cached.expiresAtMs - REFRESH_EARLY_MS > Date.now()) result.set(value, cached.url);
    else missing.push(value);
  }
  if (missing.length === 0) return result;
  for (let index = 0; index < missing.length; index += 50) {
    const refs = missing.slice(index, index + 50);
    const { data, error } = await supabase.functions.invoke('media-read', { body: { refs } });
    if (error) throw error;
    const rows = Array.isArray(data?.items) ? data.items : [];
    for (const row of rows as (Partial<ResolvedPrivateMedia> & { ref?: string })[]) {
      const expiresAtMs = Date.parse(row.expiresAt ?? '');
      if (!row.ref || !row.url || !Number.isFinite(expiresAtMs)) continue;
      cache.set(row.ref, { url: row.url, expiresAt: row.expiresAt!, expiresAtMs });
      result.set(row.ref, row.url);
    }
  }
  return result;
}
