import { useEffect, useState } from 'react';
import { getBookFeed, type BookFeed, type BookPrefs } from './api';

type FeedResult = {
  key: string;
  feed: BookFeed | null;
  error: Error | null;
};

export function useBookFeed(prefs: BookPrefs | null, enabled: boolean) {
  const requestKey = enabled && prefs ? JSON.stringify(prefs) : null;
  const [result, setResult] = useState<FeedResult | null>(null);
  const current = result?.key === requestKey ? result : null;

  useEffect(() => {
    if (!requestKey) return;

    let active = true;
    const requestPrefs = JSON.parse(requestKey) as BookPrefs;
    getBookFeed(requestPrefs).then(
      (feed) => {
        if (active) setResult({ key: requestKey, feed, error: null });
      },
      (cause) => {
        if (!active) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        setResult({ key: requestKey, feed: null, error });
      },
    );

    return () => {
      active = false;
    };
  }, [requestKey]);

  return {
    feed: current?.feed ?? null,
    error: current?.error ?? null,
    loading: Boolean(requestKey && !current),
  };
}
