const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_EXTENSION = /^(?:jpg|png|mp4|mov|webm|m4a)$/;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** Immutable identity for a Journey derivative owned by one publish operation. */
export function operationDigestObjectFilename(
  operationId: string,
  sha256: string,
  extension: string,
): string {
  if (!OPERATION_ID.test(operationId)) throw new Error('Invalid operation object filename.');
  return `${operationId}/${digestObjectFilename(sha256, extension)}`;
}
