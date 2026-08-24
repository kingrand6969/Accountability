import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { Message } from './api';
import { CachedImage } from '../ui/CachedImage';
import { colors, font, radius, spacing, type AppThemeColors } from '../ui/theme';

/**
 * Presentation for one chat message row — bubble grouping, day separators,
 * avatars and timestamps (Messenger grammar). Kept apart from the screen so
 * the layout can be previewed/tested with mock data.
 *
 * Rows arrive NEWEST-FIRST (the chat list is inverted): `newer` is the message
 * displayed below this one, `older` the one above.
 */

/** Consecutive messages from the same sender within this window render as one
 *  visual group (tight spacing, shared avatar/timestamp). */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

const dayOf = (iso: string) => new Date(iso).toDateString();

function sameGroup(newer: Message, older: Message): boolean {
  return (
    newer.sender === older.sender &&
    dayOf(newer.created_at) === dayOf(older.created_at) &&
    new Date(newer.created_at).getTime() - new Date(older.created_at).getTime() < GROUP_WINDOW_MS
  );
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === today.getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const CHAT_AVATAR = 26;

function TheirAvatar({
  visible,
  avatar,
  theme,
  themedStyles,
}: {
  visible: boolean;
  avatar: string | null;
  theme?: AppThemeColors;
  themedStyles: ReturnType<typeof createThemedStyles> | null;
}) {
  return (
    <View style={styles.avatarSlot}>
      {visible ? (
        avatar ? (
          <CachedImage uri={avatar} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, themedStyles?.avatarFallback]}>
            <Ionicons name="person" size={13} color={theme?.ink.muted ?? colors.textFaint} />
          </View>
        )
      ) : null}
    </View>
  );
}

export function MessageRow({
  item,
  newer,
  older,
  mine,
  hasMore,
  avatar,
  theme,
}: {
  item: Message;
  newer?: Message;
  older?: Message;
  mine: boolean;
  /** true while older pages may still exist — suppresses a misleading day
   *  separator at the pagination boundary */
  hasMore: boolean;
  avatar: string | null;
  /** Optional semantic palette; omitted callers retain the legacy Light presentation. */
  theme?: AppThemeColors;
}) {
  const themedStyles = useMemo(() => (theme ? createThemedStyles(theme) : null), [theme]);
  const groupStart = !older || !sameGroup(item, older); // chronologically first of its group
  const groupEnd = !newer || !sameGroup(newer, item); // chronologically last of its group
  const showDay = older ? dayOf(older.created_at) !== dayOf(item.created_at) : !hasMore;

  return (
    <View>
      {showDay ? (
        <View style={styles.dayRow}>
          <Text style={[styles.dayText, themedStyles?.dayText]}>{dayLabel(item.created_at)}</Text>
        </View>
      ) : null}
      <View
        style={[
          styles.row,
          mine ? styles.rowMine : styles.rowTheirs,
          groupStart && styles.rowGroupStart,
        ]}
      >
        {!mine ? (
          <TheirAvatar
            visible={groupEnd}
            avatar={avatar}
            theme={theme}
            themedStyles={themedStyles}
          />
        ) : null}
        <View
          style={[
            styles.bubble,
            mine
              ? [styles.mine, themedStyles?.mine]
              : [styles.theirs, themedStyles?.theirs],
            mine
              ? {
                  borderTopRightRadius: groupStart ? radius.lg : 6,
                  borderBottomRightRadius: groupEnd ? radius.lg : 6,
                }
              : {
                  borderTopLeftRadius: groupStart ? radius.lg : 6,
                  borderBottomLeftRadius: groupEnd ? radius.lg : 6,
                },
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              themedStyles?.bubbleText,
              mine && styles.mineText,
              mine && themedStyles?.mineText,
            ]}
          >
            {item.body}
          </Text>
        </View>
      </View>
      {groupEnd ? (
        <Text
          style={[
            styles.timeText,
            themedStyles?.timeText,
            mine ? styles.timeMine : styles.timeTheirs,
          ]}
        >
          {timeLabel(item.created_at)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dayRow: { alignItems: 'center', marginVertical: spacing.md },
  dayText: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    color: colors.textFaint,
    letterSpacing: 0.3,
  },

  row: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 2 },
  rowGroupStart: { marginTop: spacing.sm },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  avatarSlot: { width: CHAT_AVATAR, marginRight: 6, alignSelf: 'flex-end' },
  avatar: { width: CHAT_AVATAR, height: CHAT_AVATAR, borderRadius: CHAT_AVATAR / 2 },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bubble: {
    maxWidth: '76%',
    borderRadius: radius.lg,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  mine: { backgroundColor: colors.primary },
  theirs: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleText: { fontSize: 15, lineHeight: 21, fontFamily: font.regular, color: colors.text },
  mineText: { color: colors.onPrimary },

  timeText: { fontFamily: font.regular, fontSize: 10.5, color: colors.textFaint, marginTop: 3 },
  timeMine: { alignSelf: 'flex-end', marginRight: 4 },
  timeTheirs: { alignSelf: 'flex-start', marginLeft: CHAT_AVATAR + 6 + 4 },
});

const createThemedStyles = (theme: AppThemeColors) => StyleSheet.create({
  dayText: { color: theme.ink.muted },
  avatarFallback: { backgroundColor: theme.surface.muted },
  mine: { backgroundColor: theme.ink.action },
  theirs: {
    backgroundColor: theme.surface.muted,
    borderColor: theme.border.subtle,
  },
  bubbleText: { color: theme.ink.primary },
  mineText: { color: theme.ink.inverse },
  timeText: { color: theme.ink.muted },
});
