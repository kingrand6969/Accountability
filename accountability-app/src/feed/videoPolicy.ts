export const MAX_POST_VIDEO_DURATION_MS = 60_000;
export const MAX_POST_VIDEO_BYTES = 50 * 1024 * 1024;

type VideoCandidate = {
  mimeType: string | null | undefined;
  durationMs: number | null | undefined;
  fileSize: number | null | undefined;
};

type VideoValidation = { ok: true } | { ok: false; message: string };

export function videoExtensionForMime(mimeType: string | null | undefined): string | null {
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/quicktime') return 'mov';
  if (mimeType === 'video/webm') return 'webm';
  return null;
}

export function validatePostVideo(candidate: VideoCandidate): VideoValidation {
  if (!videoExtensionForMime(candidate.mimeType)) {
    return { ok: false, message: 'Choose an MP4, MOV, or WebM video.' };
  }
  if (!candidate.durationMs || candidate.durationMs > MAX_POST_VIDEO_DURATION_MS) {
    return { ok: false, message: 'Choose a video that is 60 seconds or shorter.' };
  }
  if (!candidate.fileSize || candidate.fileSize > MAX_POST_VIDEO_BYTES) {
    return { ok: false, message: 'Choose a video smaller than 50 MB.' };
  }
  return { ok: true };
}
