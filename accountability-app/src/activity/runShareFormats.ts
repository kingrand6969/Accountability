export type RunShareFormat = 'original' | 'portrait' | 'feed' | 'square' | 'landscape';
export type RunMediaFit = 'cover' | 'contain';

export const RUN_SHARE_FORMATS = [
  { id: 'original', label: 'Original', short: 'Media', ratio: null },
  { id: 'portrait', label: 'Story', short: '9:16', ratio: 9 / 16 },
  { id: 'feed', label: 'Feed', short: '4:5', ratio: 4 / 5 },
  { id: 'square', label: 'Square', short: '1:1', ratio: 1 },
  { id: 'landscape', label: 'Wide', short: '16:9', ratio: 16 / 9 },
] as const;

export function runShareRatio(format: RunShareFormat, originalRatio?: number | null): number {
  if (format === 'original' && originalRatio && Number.isFinite(originalRatio) && originalRatio > 0) {
    return Math.min(2, Math.max(0.5, originalRatio));
  }
  return RUN_SHARE_FORMATS.find((item) => item.id === format)?.ratio ?? 4 / 5;
}

export function runShareExportSize(format: RunShareFormat, originalRatio?: number | null) {
  const ratio = runShareRatio(format, originalRatio);
  if (ratio > 1) return { width: 1920, height: Math.round(1920 / ratio) };
  return { width: 1080, height: Math.round(1080 / ratio) };
}
