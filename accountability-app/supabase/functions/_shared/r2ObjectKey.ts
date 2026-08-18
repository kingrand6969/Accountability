const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_EXTENSION = /^(?:jpg|png|mp4|mov|webm|m4a)$/;

/**
 * Builds the complete filename for an immutable R2 object.
 *
 * Keeping the operation journal ID out of the filename leaves the longest
 * supported form at 69 characters (`<sha256>.webm`), below every existing
 * private-media and database validator's 100-character ceiling.
 */
export function digestObjectFilename(sha256: string, extension: string): string {
  if (!SHA256.test(sha256) || !SAFE_EXTENSION.test(extension)) {
    throw new Error('Invalid digest object filename.');
  }
  return `${sha256}.${extension}`;
}
