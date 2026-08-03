import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SaveToMemories } from '../memories/SaveToMemories';
import { colors, font, radius, shadow, spacing } from '../ui/theme';
import { Avatar } from './Avatar';
import { authorLabel, taggedLabel, timeAgo } from './format';
import { PostImage } from './PostImage';
import { PostVideo } from './PostVideo';
import { ProofHeadlineOverlay } from './ProofHeadlineOverlay';
import { RunRouteMetricOverlay } from './RunRouteMetricOverlay';
import type { FeedPost } from './types';
import type { EncouragementPreview } from './api';
import { deriveFeedCardPresentation } from './SocialModeSelector';

type Props = {
  post: FeedPost;
  currentUserId: string | null;
  preview?: EncouragementPreview;
  attending: boolean;
  onOpen: () => void;
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
    savings: 'Savings win',
  };
  return labels[post.post_type] ?? null;
}

export function FeedProofCard({
  post,
  currentUserId,
  preview,
  attending,
  onOpen,
  onMenu,
  onAttend,
  onToggleLike,
  onShare,
  onOpenEncouragement,
}: Props) {
  const typeLabel = postTypeLabel(post);
  const presentation = deriveFeedCardPresentation(post, currentUserId);
  return (
    <View
      style={styles.card}
      accessibilityLabel={`${presentation.ownerLabel}. ${presentation.audienceLabel}`}
    >
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
          <Ionicons name="ellipsis-horizontal" size={19} color={colors.textMuted} />
        </Pressable>
      </View>

      {post.body && post.post_type !== 'run' ? (
        <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel="Open post">
          <Text style={styles.body}>{post.body}</Text>
        </Pressable>
      ) : null}

      {post.event ? (
        <View style={styles.event}>
          <Ionicons name="calendar" size={20} color={colors.success} />
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
              onPress={onOpen}
              accessibilityRole="link"
              accessibilityLabel={`${typeLabel ?? 'Photo post'} by ${authorLabel(post.author_name)}. Open post details`}
              accessibilityHint="Opens the full post, comments, and encouragement"
              style={({ pressed }) => [styles.media, pressed && styles.pressed]}
            >
          {post.post_type === 'video' ? (
            <PostVideo url={post.image_url} />
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
          icon={post.liked_by_me ? 'flame' : 'flame-outline'}
          label={`Encourage${post.like_count > 0 ? ` ${post.like_count}` : ''}`}
          accessibilityLabel={post.liked_by_me ? 'Remove encouragement' : 'Encourage'}
          active={post.liked_by_me}
          onPress={onToggleLike}
        />
        <Action
          icon="chatbubble-outline"
          label={`Comment${post.comment_count > 0 ? ` ${post.comment_count}` : ''}`}
          accessibilityLabel="View comments"
          onPress={onOpen}
        />
        <Action
          icon="paper-plane-outline"
          label="Share"
          accessibilityLabel="Share this post"
          onPress={onShare}
        />
        {post.image_url && post.post_type !== 'video' ? (
          <SaveToMemories url={post.image_url} inline />
        ) : null}
      </View>
      <FeedSupporterSummary
        count={preview?.count ?? 0}
        people={preview?.people ?? []}
        onPress={onOpenEncouragement}
      />
    </View>
  );
}

function FeedSupporterSummary({
  count,
  people,
  onPress,
}: {
  count: number;
  people: NonNullable<EncouragementPreview['people']>;
  onPress: () => void;
}) {
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${count === 1 ? 'buddy has' : 'buddies have'} encouraged this post`}
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
        {count} {count === 1 ? 'buddy encouraged this' : 'buddies encouraged this'}
      </Text>
    </Pressable>
  );
}

function Action({
  icon,
  label,
  accessibilityLabel,
  active = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  accessibilityLabel: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={active ? colors.cheer : colors.textMuted} />
      <Text style={[styles.actionText, active && styles.active]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  authorHeader: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    backgroundColor: colors.card,
  },
  authorCopy: { flex: 1 },
  author: { color: colors.navy, fontFamily: font.bold, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  time: { color: colors.textMuted, fontFamily: font.medium, fontSize: 10.5 },
  type: {
    color: colors.primary,
    fontFamily: font.bold,
    fontSize: 9.5,
    textTransform: 'uppercase',
  },
  audience: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 9.5 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, color: colors.text, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  event: {
    minHeight: 64,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: colors.success,
  },
  eventCopy: { flex: 1 },
  eventTitle: { color: colors.text, fontFamily: font.bold, fontSize: 13 },
  eventMeta: { color: colors.textMuted, fontFamily: font.medium, fontSize: 10.5 },
  attend: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  attending: { backgroundColor: colors.textMuted },
  attendText: { color: '#fff', fontFamily: font.bold, fontSize: 12 },
  media: { minHeight: 220, backgroundColor: colors.navy, overflow: 'hidden' },
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
    paddingHorizontal: 2,
    backgroundColor: colors.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ece9e3',
  },
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.sm,
  },
  actionText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 11 },
  active: { color: colors.cheer },
  supporters: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  supporterAvatars: { flexDirection: 'row', alignItems: 'center', paddingLeft: 2 },
  supporterAvatar: {
    borderWidth: 2,
    borderColor: colors.card,
    borderRadius: 15,
    backgroundColor: colors.card,
  },
  supporterOverlap: { marginLeft: -8 },
  supporterText: { flex: 1, color: colors.textMuted, fontFamily: font.semibold, fontSize: 11.5 },
  pressed: { opacity: 0.7 },
});
