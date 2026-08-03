import { useEffect, useState } from 'react';
import { isPrivateMediaRef, resolveMediaUrl } from './privateMedia';

type PrivateMediaResolution = {
  ref: string;
  url: string | null;
};

export function useResolvedMediaUrl(value: string | null | undefined): string | null {
  const privateRef = value && isPrivateMediaRef(value) ? value : null;
  const [privateResolution, setPrivateResolution] =
    useState<PrivateMediaResolution | null>(null);

  useEffect(() => {
    if (!privateRef) return;
    let active = true;
    resolveMediaUrl(privateRef)
      .then((url) => {
        if (active) setPrivateResolution({ ref: privateRef, url });
      })
      .catch(() => {
        if (active) setPrivateResolution({ ref: privateRef, url: null });
      });
    return () => { active = false; };
  }, [privateRef]);

  if (!value) return null;
  if (!privateRef) return value;
  return privateResolution?.ref === privateRef ? privateResolution.url : null;
}
