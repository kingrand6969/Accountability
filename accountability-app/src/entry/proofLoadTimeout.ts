export const PROOF_LOAD_TIMEOUT_MS = 10_000;

export async function withProofLoadTimeout<T>(
  operation: Promise<T>,
  timeoutMs = PROOF_LOAD_TIMEOUT_MS,
): Promise<{ status: 'success'; value: T } | { status: 'timeout' }> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutResult = new Promise<{ status: 'timeout' }>((resolve) => {
    timeout = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs);
  });
  const result = await Promise.race([
    operation.then((value) => ({ status: 'success' as const, value })),
    timeoutResult,
  ]);
  if (timeout) clearTimeout(timeout);
  return result;
}
