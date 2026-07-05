import { Platform } from 'react-native';
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

/**
 * Memories: a personal photo/video vault, built to cost as little as possible.
 * The playbook (same tricks the big photo apps use, free versions):
 *  - client-side compression: photos resized to ≤1600px JPEG q0.72 BEFORE
 *    upload — a 4 MB camera shot becomes ~250 KB (≈15× storage + bandwidth cut)
 *  - immutable CDN caching: unique paths + 1-year cache-control, so the CDN
 *    (not our origin) serves repeat views
 *  - signed URLs are minted in batch and reused until near expiry, instead of
 *    a fresh API call per image per render
 *  - disk-cached rendering (expo-image) so a photo is downloaded once per device
 *  - hard quota (1 GiB/user) enforced by the DATABASE, with a 60 MB/file cap
 */

export const QUOTA_BYTES = 1024 * 1024 * 1024; // 1 GiB free
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB per video
const MAX_IMAGE_DIM = 1600;
const SIGN_TTL_S = 60 * 60 * 24 * 7; // 7-day links, re-minted when 1 day is left

export type Memory = {
  id: string;
  path: string;
  kind: 'image' | 'video';
  bytes: number;
  location: string | null;
  created_at: string;
  url: string; // signed
};

async function me(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error('Not signed in.');
  return uid;
}

export async function getMemoriesUsage(): Promise<number> {
  const { data, error } = await supabase.rpc('memories_usage');
  if (error) throw error;
  return Number(data ?? 0);
}

export function formatBytes(n: number): string {
  if (n <= 0) return '0 KB';
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

// ---- signed-url cache: one batch call, reused across renders ----
const urlCache = new Map<string, { url: string; expiresAt: number }>();

async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  const soon = Date.now() + 24 * 60 * 60 * 1000; // refresh if <1 day left
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit && hit.expiresAt > soon) out.set(p, hit.url);
    else missing.push(p);
  }
  if (missing.length > 0) {
    const { data, error } = await supabase.storage
      .from('memories')
      .createSignedUrls(missing, SIGN_TTL_S);
    if (error) throw error;
    const expiresAt = Date.now() + SIGN_TTL_S * 1000;
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) {
        urlCache.set(row.path, { url: row.signedUrl, expiresAt });
        out.set(row.path, row.signedUrl);
      }
    }
  }
  return out;
}

export async function listMemories(): Promise<Memory[]> {
  const { data, error } = await supabase
    .from('memories')
    .select('id,path,kind,bytes,location,created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const rows = data ?? [];
  const urls = await signedUrls(rows.map((r: any) => r.path as string));
  return rows
    .map((r: any) => ({ ...r, url: urls.get(r.path) ?? '' }))
    .filter((m: Memory) => m.url !== '');
}

async function uploadBuffer(
  buf: ArrayBuffer,
  ext: string,
  contentType: string,
  kind: 'image' | 'video',
  location: string | null,
): Promise<void> {
  const uid = await me();
  if (buf.byteLength > MAX_FILE_BYTES) {
    throw new Error(`That file is too big (max ${formatBytes(MAX_FILE_BYTES)}).`);
  }
  const used = await getMemoriesUsage();
  if (used + buf.byteLength > QUOTA_BYTES) {
    throw new Error('Memories storage is full (1 GB). Delete some memories to save more.');
  }
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from('memories').upload(path, buf, {
    contentType,
    cacheControl: '31536000', // unique path → cache forever at the CDN
  });
  if (error) throw error;
  const { error: rowError } = await supabase
    .from('memories')
    .insert({ path, kind, bytes: buf.byteLength, location });
  if (rowError) {
    // quota trigger said no — don't leave an orphan file behind
    await supabase.storage.from('memories').remove([path]).catch(() => {});
    throw rowError;
  }
}

/** Save a picture at post time ("Add to Memories" checkbox). Compressed first. */
export async function saveImageToMemories(
  localUri: string,
  location: string | null = null,
): Promise<void> {
  const shrunk = await ImageManipulator.manipulateAsync(
    localUri,
    [{ resize: { width: MAX_IMAGE_DIM } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!shrunk.base64) throw new Error('Could not read that image.');
  await uploadBuffer(decode(shrunk.base64), 'jpg', 'image/jpeg', 'image', location);
}

/** Save a picture that's already hosted (bookmark on a feed/group/page post) —
 *  it was compressed when posted, so copy the bytes as-is. */
export async function saveRemoteImageToMemories(url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not fetch that photo.');
  const buf = await res.arrayBuffer();
  const isPng = url.split('?')[0].toLowerCase().endsWith('.png');
  await uploadBuffer(
    buf,
    isPng ? 'png' : 'jpg',
    isPng ? 'image/png' : 'image/jpeg',
    'image',
    null,
  );
}

/**
 * Place label for a memory — ONLY if location permission was already granted
 * (e.g. for GPS runs). Never prompts; returns null on web or without permission.
 */
export async function currentPlaceLabel(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const Location = await import('expo-location');
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const pos = await Location.getLastKnownPositionAsync();
    if (!pos) return null;
    const places = await Location.reverseGeocodeAsync(pos.coords);
    const p = places[0];
    if (!p) return null;
    return [p.city ?? p.subregion, p.region].filter(Boolean).join(', ') || null;
  } catch {
    return null; // a missing place label must never block a post
  }
}

export async function deleteMemory(m: Memory): Promise<void> {
  const { error } = await supabase.from('memories').delete().eq('id', m.id);
  if (error) throw error;
  urlCache.delete(m.path);
  await supabase.storage.from('memories').remove([m.path]).catch(() => {});
}
