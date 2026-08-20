import { useEffect, useState } from 'react';
import {
  isPrivateMediaRef,
  PRIVATE_MEDIA_REFRESH_HEADROOM_MS,
  resolvePrivateMediaUrl,
  subscribePrivateMediaCacheInvalidation,
} from './privateMedia';

type PrivateMediaResolution = {
  ref: string;
  url: string | null;
};

const RENEWAL_RETRY_DELAY_MS = 15_000;
const MAX_RENEWAL_RETRIES = 2;

export function useResolvedMediaUrl(value: string | null | undefined): string | null {
  const privateRef = value && isPrivateMediaRef(value) ? value : null;
  const [privateResolution, setPrivateResolution] =
    useState<PrivateMediaResolution | null>(null);

  useEffect(() => {
    if (!privateRef) return;
    let active = true;
    let requestGeneration = 0;
    let hasSuccessfulResolution = false;
    let renewalRetries = 0;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const resolveCurrentRef = () => {
      const request = ++requestGeneration;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      void resolvePrivateMediaUrl(privateRef)
        .then(({ url, expiresAt }) => {
          if (!active || request !== requestGeneration) return;
          hasSuccessfulResolution = true;
          renewalRetries = 0;
          setPrivateResolution({ ref: privateRef, url });
          const refreshInMs = Math.max(
            1_000,
            Date.parse(expiresAt) - Date.now() - PRIVATE_MEDIA_REFRESH_HEADROOM_MS,
          );
          refreshTimer = setTimeout(resolveCurrentRef, refreshInMs);
        })
        .catch(() => {
          if (!active || request !== requestGeneration) return;
          if (!hasSuccessfulResolution) {
            setPrivateResolution({ ref: privateRef, url: null });
          }
          if (renewalRetries < MAX_RENEWAL_RETRIES) {
            renewalRetries += 1;
            refreshTimer = setTimeout(resolveCurrentRef, RENEWAL_RETRY_DELAY_MS);
          }
        });
    };

    resolveCurrentRef();
    const unsubscribe = subscribePrivateMediaCacheInvalidation(() => {
      if (!active) return;
      requestGeneration += 1;
      hasSuccessfulResolution = false;
      renewalRetries = 0;
      setPrivateResolution({ ref: privateRef, url: null });
      resolveCurrentRef();
    });

    return () => {
      active = false;
      requestGeneration += 1;
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [privateRef]);

  if (!value) return null;
  if (!privateRef) return value;
  return privateResolution?.ref === privateRef ? privateResolution.url : null;
}
