import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { unreadMessageCount } from './api';

/**
 * Live unread-message count: initial fetch + Supabase Realtime on new messages
 * addressed to me, so the Messages tab badge appears the moment one arrives.
 */
export function useUnreadMessages(): { unread: number; refresh: () => void } {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    unreadMessageCount()
      .then(setUnread)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let live = true;

    refresh();
    supabase.auth.getUser().then(({ data }) => {
      if (!live) return;
      const uid = data.user?.id;
      if (!uid) return;
      channel = supabase
        .channel('messages-unread')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'buddy_messages', filter: `recipient=eq.${uid}` },
          () => refresh(),
        )
        .subscribe();
    });

    return () => {
      live = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { unread, refresh };
}
