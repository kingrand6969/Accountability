import { useEffect, useState } from 'react';
import { isPrivateMediaRef, resolveMediaUrl } from './privateMedia';

export function useResolvedMediaUrl(value: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(value && !isPrivateMediaRef(value) ? value : null);
  useEffect(() => {
    let active = true;
    if (!value) setResolved(null);
    else if (!isPrivateMediaRef(value)) setResolved(value);
    else {
      setResolved(null);
      resolveMediaUrl(value).then((url) => { if (active) setResolved(url); }).catch(() => { if (active) setResolved(null); });
    }
    return () => { active = false; };
  }, [value]);
  return resolved;
}
