import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export type R2Kind = 'avatar' | 'cover' | 'post';

/**
 * Upload a base64 image straight to Cloudflare R2 (zero-egress delivery).
 *
 * Flow: ask the `r2-sign` Edge Function for a one-time signed URL (it authorizes
 * the caller and holds the R2 credentials server-side), PUT the bytes directly to
 * R2, and return the public URL to store in Postgres. The bytes never pass through
 * Supabase, so this move takes serving those images off Supabase's metered egress.
 *
 * NOTE: not yet wired into the upload flows — it activates once the `r2-sign`
 * function is deployed and its R2 secrets are set (see supabase/functions/r2-sign).
 */
export async function uploadToR2(base64: string, kind: R2Kind, ext = 'jpg'): Promise<string> {
  const body = decode(base64);
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  // Declare size + type so the signing function can reject oversized/abusive
  // uploads and rate-limit per user before handing back an upload URL.
  const { data, error } = await supabase.functions.invoke('r2-sign', {
    body: { kind, ext, bytes: body.byteLength, contentType },
  });
  if (error) throw error;
  const { uploadUrl, publicUrl } = (data ?? {}) as { uploadUrl?: string; publicUrl?: string };
  if (!uploadUrl || !publicUrl) throw new Error('Could not get an upload URL.');

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      // objects are content-addressed by a unique/stable key → cache hard at the CDN
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

  // stable-path images (avatar/cover) are overwritten in place → bust the cache
  return kind === 'post' ? publicUrl : `${publicUrl}?t=${Date.now()}`;
}
