import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import {
  cachePrivateImageRef,
  cachePrivateImageUrl,
  isAwsSignedImageUrl,
} from './privateImageFileCache';
import { isPrivateImageRef } from './privateImageByteProxy';
import { isPrivateMediaRef, subscribePrivateMediaCacheInvalidation } from './privateMedia';
import { useResolvedMediaUrl } from './useResolvedMediaUrl';

type LocalImageResolution = {
  generation: number;
  source: string;
  url: string | null;
};

export function useResolvedImageUrl(value: string | null | undefined): string | null {
  const rawPrivateRef = value && isPrivateMediaRef(value) ? value : null;
  const nativeRawImageRef =
    Platform.OS !== 'web' && value && isPrivateImageRef(value) ? value : null;
  const authorizedUrl = useResolvedMediaUrl(value, !nativeRawImageRef);
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
    const source = nativeRawImageRef ?? signedImageUrl;
    if (
      !source ||
      (directSignedUrl !== null && blockedDirectUrl === directSignedUrl)
    ) {
      return;
    }
    let active = true;
    const resolution = nativeRawImageRef
      ? cachePrivateImageRef(nativeRawImageRef)
      : cachePrivateImageUrl(source);
    void resolution
      .then((url) => {
        if (active) setLocalResolution({ source, generation: authGeneration, url });
      })
      .catch(() => {
        if (active) {
          setLocalResolution({ source, generation: authGeneration, url: null });
        }
      });
    return () => {
      active = false;
    };
  }, [authGeneration, blockedDirectUrl, directSignedUrl, nativeRawImageRef, signedImageUrl]);

  if (nativeRawImageRef) {
    return localResolution?.source === nativeRawImageRef &&
      localResolution.generation === authGeneration
      ? localResolution.url
      : null;
  }
  if (!authorizedUrl) return null;
  if (!signedImageUrl) return authorizedUrl;
  if (directSignedUrl !== null && blockedDirectUrl === directSignedUrl) return null;
  if (Platform.OS === 'web') return authorizedUrl;
  return localResolution?.source === signedImageUrl &&
    localResolution.generation === authGeneration
    ? localResolution.url
    : null;
}
