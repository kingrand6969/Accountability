import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { unreadCount } from './api';

/**
 * Live unread-notification count: initial fetch + Supabase Realtime on new
 * inserts for me, so the tab dot appears the moment a buddy likes/tags/requests.
 */
export function useUnreadNotifications(): { unread: number; refresh: () => void } {
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(() => {
    unreadCount()
      .then(setUnread)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let uid: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let live = true;

    refresh();
    supabase.auth.getUser().then(({ data }) => {
      if (!live) return;
      uid = data.user?.id ?? null;
      if (!uid) return;
      channel = supabase
        .channel('notifications-unread')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
          () => setUnread((c) => c + 1),
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
