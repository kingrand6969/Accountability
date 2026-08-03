import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { unreadMessageCount } from './api';
import { nextUnreadMessagesChannelName } from './unreadChannelIdentity';

/**
 * Live unread-message count: initial fetch + Supabase Realtime on new messages
 * addressed to me, so the Messages tab badge appears the moment one arrives.
 */
export function useUnreadMessages(userId: string | null): {
  unread: number;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = useState<{
    userId: string;
    unread: number;
  } | null>(null);
  const requestSequence = useRef(0);
  const unread =
    userId && snapshot?.userId === userId ? snapshot.unread : 0;

  const refresh = useCallback(() => {
    if (!userId) return;
    const requestedUserId = userId;
    const request = ++requestSequence.current;
    unreadMessageCount()
      .then((count) => {
        if (request === requestSequence.current) {
          setSnapshot({ userId: requestedUserId, unread: count });
        }
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    refresh();
    const channel = supabase
      .channel(nextUnreadMessagesChannelName(userId))
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'buddy_messages',
          filter: `recipient=eq.${userId}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      requestSequence.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  return { unread, refresh };
}
