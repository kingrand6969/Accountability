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
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    unreadMessageCount()
      .then((count) => {
        if (mounted.current) setUnread(count);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!userId) {
      setUnread(0);
      return () => {
        mounted.current = false;
      };
    }

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
      mounted.current = false;
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  return { unread, refresh };
}
