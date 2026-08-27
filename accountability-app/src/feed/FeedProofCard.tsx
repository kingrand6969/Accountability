import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SaveToMemories } from '../memories/SaveToMemories';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { Avatar } from './Avatar';
import { authorLabel, taggedLabel, timeAgo } from './format';
import { PostImage } from './PostImage';
import { PostVideo } from './PostVideo';
import { ProofHeadlineOverlay } from './ProofHeadlineOverlay';
import {
  RUN_ROUTE_LARGE_OVERLAY_HEIGHT,
  RunRouteMetricOverlay,
} from './RunRouteMetricOverlay';
import type { FeedPost } from './types';
import type { EncouragementPreview } from './api';
import { deriveFeedCardPresentation } from './SocialModeSelector';

type Props = {
  post: FeedPost & { suggested?: boolean };
  currentUserId: string | null;
  mediaActive?: boolean;
  preview?: EncouragementPreview;
  attending: boolean;
  onOpen: () => void;
  onComment: () => void;
  onOpenMedia?: () => void;
  onMenu: () => void;
  onAttend: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  onOpenEncouragement: () => void;
};

function postTypeLabel(post: FeedPost): string | null {
  const labels: Partial<Record<FeedPost['post_type'], string>> = {
    run: 'Verified run',
    video: 'Video',
    workout: 'Workout',
    milestone: 'Milestone',
    event: 'Event',
    memory: 'Memory',
  };
  return labels[post.post_type] ?? null;
}

export function FeedProofCard({
  post,
  currentUserId,
  mediaActive = false,
  preview,
  attending,
  onOpen,
  onComment,
  onOpenMedia,
  onMenu,
  onAttend,
  onToggleLike,
  onShare,
  onOpenEncouragement,
}: Props) {
  const { colors: theme } = useAppTheme();
  const { fontScale } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const typeLabel = postTypeLabel(post);
  const presentation = deriveFeedCardPresentation(post, currentUserId);
  const suggestionLabel = post.suggested ? 'Suggested for you' : null;
  const needsLargeRunMedia = post.post_type === 'run' && fontScale >= 1.75;
  // Preserve the established accessibilityLabel="View comments" wording before adding the count.
  const viewCommentsLabel = 'View comments';
  return (
    <View
      style={styles.card}
      accessibilityLabel={`${presentation.ownerLabel}. ${presentation.audienceLabel}`}
    >
      {suggestionLabel ? (
        <View
          style={styles.suggestedRow}
          accessible
          accessibilityLabel="Suggested for you"
        >
          <Ionicons name="sparkles-outline" size={13} color={theme.ink.muted} />
          <Text style={styles.suggestedText}>{suggestionLabel}</Text>
        </View>
      ) : null}
      <View style={styles.authorHeader}>
        <Avatar url={post.author_avatar} name={post.author_name} size={40} />
        <View style={styles.authorCopy}>
          <Text style={styles.author}>
            {presentation.redacted ? 'Identity unavailable' : authorLabel(post.author_name)}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.time}>
              {timeAgo(post.created_at)}
              {post.tagged.length > 0 ? ` · ${taggedLabel(post.tagged)}` : ''}
            </Text>
            <Text style={styles.audience}>{presentation.audienceLabel}</Text>
            {typeLabel ? <Text style={styles.type}>{typeLabel}</Text> : null}
          </View>
        </View>
        <Pressable
          onPress={onMenu}
          accessibilityRole="button"
          accessibilityLabel="Post options"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={19} color={theme.ink.muted} />
        </Pressable>
      </View>

      {post.body && post.post_type !== 'run' ? (
        <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel="Open post">
          <Text style={styles.body}>{post.body}</Text>
        </Pressable>
      ) : null}

      {post.event ? (
        <View style={styles.event}>
          <Ionicons name="calendar" size={20} color={theme.status.success} />
          <View style={styles.eventCopy}>
            <Text style={styles.eventTitle} numberOfLines={2}>{post.event.title}</Text>
            <Text style={styles.eventMeta}>
              {new Date(post.event.starts_at).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {post.event.location ? ` · ${post.event.location}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={onAttend}
            accessibilityRole="button"
            accessibilityLabel={`Attend ${post.event.title}`}
            style={({ pressed }) => [
              styles.attend,
              attending && styles.attending,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.attendText}>{attending ? 'Going ✓' : 'Attend'}</Text>
          </Pressable>
        </View>
      ) : null}

      {post.image_url ? (
            <Pressable
              onPress={onOpenMedia ?? onOpen}
              accessibilityRole="link"
              accessibilityLabel={`${typeLabel ?? 'Photo post'} by ${authorLabel(post.author_name)}. Open post details`}
              accessibilityHint="Opens the full post, comments, and Cheers"
              style={({ pressed }) => [
                styles.media,
                needsLargeRunMedia && styles.runMediaLarge,
                pressed && styles.pressed,
              ]}
            >
          {post.post_type === 'video' ? (
            <PostVideo url={post.image_url} active={mediaActive} />
          ) : (
            <PostImage url={post.image_url} capTall />
          )}
              {post.post_type === 'run' ? (
                <>
                  <View style={styles.topScrim} pointerEvents="none" />
                  {post.body.trim() ? <ProofHeadlineOverlay headline={post.body.trim()} /> : null}
                  <RunRouteMetricOverlay data={post.share_data} />
                </>
          ) : null}
        </Pressable>
      ) : null}

      <View style={styles.actions}>
        <Action
          theme={theme}
          styles={styles}
          icon="clap"
          count={post.like_count}
          accessibilityLabel={`${post.liked_by_me ? 'Remove Cheer' : 'Cheer'}${post.like_count > 0 ? `, ${post.like_count} ${post.like_count === 1 ? 'Cheer' : 'Cheers'}` : ''}`}
          active={post.liked_by_me}
          onPress={onToggleLike}
        />
        <Action
          theme={theme}
          styles={styles}
          icon="chatbubble-outline"
          count={post.comment_count}
          accessibilityLabel={`${viewCommentsLabel}${post.comment_count > 0 ? `, ${post.comment_count} ${post.comment_count === 1 ? 'comment' : 'comments'}` : ''}`}
          onPress={onComment}
        />
        <Action
          theme={theme}
          styles={styles}
          icon="paper-plane-outline"
          accessibilityLabel="Share this post"
          onPress={onShare}
        />
        {post.image_url && post.post_type !== 'video' ? (
          <SaveToMemories url={post.image_url} inline iconOnly />
        ) : null}
      </View>
      <FeedSupporterSummary
        styles={styles}
        count={preview?.count ?? 0}
        people={preview?.people ?? []}
        onPress={onOpenEncouragement}
      />
    </View>
  );
}

function FeedSupporterSummary({
  styles,
  count,
  people,
  onPress,
}: {
  styles: ProofCardStyles;
  count: number;
  people: NonNullable<EncouragementPreview['people']>;
  onPress: () => void;
}) {
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${count === 1 ? 'buddy has' : 'buddies have'} cheered this post`}
      style={({ pressed }) => [styles.supporters, pressed && styles.pressed]}
    >
      <View style={styles.supporterAvatars} accessibilityElementsHidden>
        {people.slice(0, 3).map((person, index) => (
          <View key={person.id} style={[styles.supporterAvatar, index > 0 && styles.supporterOverlap]}>
            <Avatar url={person.avatar_url} name={person.name} size={26} />
          </View>
        ))}
      </View>
      <Text style={styles.supporterText}>
        {count} {count === 1 ? 'buddy cheered this' : 'buddies cheered this'}
      </Text>
    </Pressable>
  );
}

function CheerIcon({ color, styles }: { color: string; styles: ProofCardStyles }) {
  return (
    <View style={styles.cheerIcon} accessibilityElementsHidden>
      <Ionicons name="hand-left-outline" size={21} color={color} style={styles.cheerLeft} />
      <Ionicons name="hand-right-outline" size={21} color={color} style={styles.cheerRight} />
    </View>
  );
}

function Action({
  theme,
  styles,
  icon,
  count,
  accessibilityLabel,
  active,
  onPress,
}: {
  theme: AppThemeColors;
  styles: ProofCardStyles;
  icon: 'clap' | keyof typeof Ionicons.glyphMap;
  count?: number;
  accessibilityLabel: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active === undefined ? undefined : { selected: active }}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      {icon === 'clap' ? (
        <CheerIcon
          color={active ? theme.ink.action : theme.ink.muted}
          styles={styles}
        />
      ) : (
        <Ionicons
          name={icon}
          size={21}
          color={active ? theme.ink.action : theme.ink.muted}
        />
      )}
      {count != null && count > 0 ? (
        <Text style={[styles.actionText, active && styles.active]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

type ProofCardStyles = ReturnType<typeof createStyles>;

const createStyles = (theme: AppThemeColors) => StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: theme.surface.canvas,
  },
  suggestedRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border.subtle,
  },
  suggestedText: {
    color: theme.ink.muted,
    fontFamily: font.semibold,
    fontSize: 11.5,
  },
  authorHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: theme.surface.canvas,
  },
  authorCopy: { flex: 1 },
  author: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  time: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 10.5 },
  type: {
    color: theme.ink.action,
    fontFamily: font.bold,
    fontSize: 9.5,
    textTransform: 'uppercase',
  },
  audience: { color: theme.ink.muted, fontFamily: font.semibold, fontSize: 9.5 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, color: theme.ink.primary, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  event: {
    minHeight: 64,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: theme.status.successSoft,
    borderWidth: 1,
    borderColor: theme.status.success,
  },
  eventCopy: { flex: 1 },
  eventTitle: { color: theme.ink.primary, fontFamily: font.bold, fontSize: 13 },
  eventMeta: { color: theme.ink.muted, fontFamily: font.medium, fontSize: 10.5 },
  attend: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.status.success,
  },
  attending: { backgroundColor: theme.ink.muted },
  attendText: { color: theme.ink.inverse, fontFamily: font.bold, fontSize: 12 },
  media: {
    minHeight: 220,
    backgroundColor: theme.surface.muted,
    overflow: 'hidden',
  },
  runMediaLarge: {
    minHeight: RUN_ROUTE_LARGE_OVERLAY_HEIGHT,
  },
  topScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 126,
    backgroundColor: 'rgba(3,11,26,.32)',
  },
  actions: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: theme.surface.canvas,
  },
  action: {
    flex: 1,
    minWidth: 48,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  cheerIcon: { width: 27, height: 23, position: 'relative' },
  cheerLeft: { position: 'absolute', left: 0, top: 0 },
  cheerRight: { position: 'absolute', right: 0, top: 2 },
  actionText: { color: theme.ink.muted, fontFamily: font.semibold, fontSize: 11 },
  active: { color: theme.ink.action },
  supporters: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border.subtle,
  },
  supporterAvatars: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  supporterAvatar: {
    borderWidth: 2,
    borderColor: theme.surface.canvas,
    borderRadius: 15,
    backgroundColor: theme.surface.canvas,
  },
  supporterOverlap: { marginLeft: -8 },
  supporterText: { flex: 1, color: theme.ink.muted, fontFamily: font.semibold, fontSize: 11.5 },
  pressed: { opacity: 0.7 },
});
