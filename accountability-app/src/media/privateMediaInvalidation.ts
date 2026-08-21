const listeners = new Set<() => void>();

export function notifyPrivateMediaCacheInvalidation(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // One mounted consumer must not block cache invalidation for the others.
    }
  }
}

export function subscribePrivateMediaCacheInvalidation(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
