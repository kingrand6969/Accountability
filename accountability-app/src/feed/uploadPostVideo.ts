import { uploadBytesToR2 } from '../lib/r2';
import { MAX_POST_VIDEO_BYTES, videoExtensionForMime } from './videoPolicy';

export async function uploadPostVideo(
  uri: string,
  mimeType: string,
  operationId?: string,
): Promise<string> {
  const ext = videoExtensionForMime(mimeType);
  if (!ext) throw new Error('Choose an MP4, MOV, or WebM video.');

  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read that video.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_POST_VIDEO_BYTES) {
    throw Object.assign(new Error('Choose a video smaller than 50 MB.'), { status: 413 });
  }

  return uploadBytesToR2(bytes, 'video', mimeType, ext, { operationId });
}
