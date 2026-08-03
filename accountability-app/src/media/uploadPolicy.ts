export type UploadFailureClass =
  | 'availability'
  | 'auth'
  | 'validation'
  | 'quota'
  | 'rate_limit'
  | 'unknown';

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(1, Math.floor((base64.length * 3) / 4) - padding);
}

export function classifyUploadFailure(error: unknown): UploadFailureClass {
  if (typeof error !== 'object' || error === null) return 'unknown';
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    context?: { status?: unknown };
  };
  const status = Number(value.status ?? value.statusCode ?? value.context?.status);
  if (status === 401 || status === 403) return 'auth';
  if (status === 413 || status === 415 || status === 400) return 'validation';
  if (status === 429) return 'rate_limit';
  if (status === 507) return 'quota';
  if (status === 502 || status === 503 || status === 504 || status === 0) return 'availability';
  return 'unknown';
}

/** Private media must fail closed. A provider outage must never redirect a
 * photo into a publicly addressed compatibility bucket. */
export function mayUseStorageFallback(_error: unknown): boolean {
  return false;
}
