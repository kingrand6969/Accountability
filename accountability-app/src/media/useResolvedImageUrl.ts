import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { cachePrivateImageUrl, isAwsSignedImageUrl } from './privateImageFileCache';
import { isPrivateMediaRef, subscribePrivateMediaCacheInvalidation } from './privateMedia';
import { useResolvedMediaUrl } from './useResolvedMediaUrl';

type LocalImageResolution = {
  generation: number;
  source: string;
  url: string | null;
};

export function useResolvedImageUrl(value: string | null | undefined): string | null {
  const authorizedUrl = useResolvedMediaUrl(value);
  const rawPrivateRef = value && isPrivateMediaRef(value) ? value : null;
  const signedImageUrl = isAwsSignedImageUrl(authorizedUrl) ? authorizedUrl : null;
  const directSignedUrl = !rawPrivateRef && isAwsSignedImageUrl(value) ? value : null;
  const [authGeneration, setAuthGeneration] = useState(0);
  const [blockedDirectUrl, setBlockedDirectUrl] = useState<string | null>(null);
  const [localResolution, setLocalResolution] = useState<LocalImageResolution | null>(null);

  useEffect(() => {
    if (!rawPrivateRef && !directSignedUrl) return;
    return subscribePrivateMediaCacheInvalidation(() => {
      setLocalResolution(null);
      if (rawPrivateRef) setAuthGeneration((generation) => generation + 1);
      else if (directSignedUrl) setBlockedDirectUrl(directSignedUrl);
    });
  }, [directSignedUrl, rawPrivateRef]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (
      !signedImageUrl ||
      (directSignedUrl !== null && blockedDirectUrl === directSignedUrl)
    ) {
      return;
    }
    let active = true;
    void cachePrivateImageUrl(signedImageUrl)
      .then((url) => {
        if (active) setLocalResolution({ source: signedImageUrl, generation: authGeneration, url });
      })
      .catch(() => {
        if (active) {
          setLocalResolution({ source: signedImageUrl, generation: authGeneration, url: null });
        }
      });
    return () => {
      active = false;
    };
  }, [authGeneration, blockedDirectUrl, directSignedUrl, signedImageUrl]);

  if (!authorizedUrl) return null;
  if (!signedImageUrl) return authorizedUrl;
  if (directSignedUrl !== null && blockedDirectUrl === directSignedUrl) return null;
  if (Platform.OS === 'web') return authorizedUrl;
  return localResolution?.source === signedImageUrl &&
    localResolution.generation === authGeneration
    ? localResolution.url
    : null;
}
