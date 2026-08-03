import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RouteTrace } from '../activity/RouteTrace';
import { formatDuration, formatKm, formatPace, type Pt } from '../activity/geo';
import { authorLabel } from './format';
import { Avatar } from './Avatar';
import { PostImage } from './PostImage';
import { PostVideo } from './PostVideo';
import type { FeedPost } from './types';
import { colors, font, radius, spacing } from '../ui/theme';

export type ImmersivePostState =
  | 'loading'
  | 'retryable-error'
  | 'unavailable'
  | 'offline-cached'
  | 'offline-uncached'
  | 'comments-loading'
  | 'comments-error'
  | 'comments-empty'
  | 'populated';

export function deriveImmersivePostState(input: {
  loading: boolean;
  post: FeedPost | null;
  error?: string | null;
  online?: boolean;
  cached?: boolean;
  commentsLoading?: boolean;
  commentsError?: boolean;
  commentCount?: number;
}): ImmersivePostState {
  if (input.loading) return 'loading';
  if (input.online === false) {
    return input.cached && input.post ? 'offline-cached' : 'offline-uncached';
  }
  if (!input.post && input.error) return 'retryable-error';
  if (!input.post) return 'unavailable';
  if (input.commentsLoading) return 'comments-loading';
  if (input.commentsError) return 'comments-error';
  return (input.commentCount ?? 0) === 0 ? 'comments-empty' : 'populated';
}

export type ImmersiveViewContext = {
  postId: string;
  userId: string | null;
  generation: number;
};

export type ImmersiveOperationToken = ImmersiveViewContext & {
  nonce: number;
  kind: 'like' | 'comment' | 'voice' | 'options';
};

export function createImmersiveOperationToken(
  context: ImmersiveViewContext,
  kind: ImmersiveOperationToken['kind'],
  nonce: number,
): ImmersiveOperationToken {
  return { ...context, kind, nonce };
}

export function immersiveOperationOwnsCompletion(
  token: ImmersiveOperationToken,
  locked: ImmersiveOperationToken | null,
  current: ImmersiveViewContext,
  mounted: boolean,
) {
  return (
    mounted &&
    locked === token &&
    token.postId === current.postId &&
    token.userId === current.userId &&
    token.generation === current.generation
  );
}

export type ImmersiveSnapshot<TPost, TComment, TPerson, TVoice> = {
  viewKey: string;
  post: TPost | null;
  comments: TComment[];
  encouragers: TPerson[];
  voices: TVoice[];
  commentsLoading: boolean;
  commentsError: boolean;
};

export function visibleImmersiveSnapshot<TPost, TComment, TPerson, TVoice>(
  snapshot: ImmersiveSnapshot<TPost, TComment, TPerson, TVoice>,
  currentViewKey: string,
) {
  return snapshot.viewKey === currentViewKey ? snapshot : null;
}

export function beginImmersiveOperation(
  lock: ImmersiveOperationToken | null,
  context: ImmersiveViewContext,
  kind: ImmersiveOperationToken['kind'],
  nonce: number,
) {
  return lock ? { accepted: false as const, token: lock } : {
    accepted: true as const,
    token: createImmersiveOperationToken(context, kind, nonce),
  };
}

export function completeImmersiveOperation(
  token: ImmersiveOperationToken,
  lock: ImmersiveOperationToken | null,
  current: ImmersiveViewContext,
  mounted: boolean,
) {
  const owns = immersiveOperationOwnsCompletion(token, lock, current, mounted);
  return { apply: owns, notify: owns, release: lock === token };
}

export class ImmersiveOperationCoordinator {
  private nonce = 0;
  private locks = new Map<ImmersiveOperationToken['kind'], ImmersiveOperationToken>();

  start(kind: ImmersiveOperationToken['kind'], context: ImmersiveViewContext) {
    const begun = beginImmersiveOperation(
      this.locks.get(kind) ?? null,
      context,
      kind,
      ++this.nonce,
    );
    if (!begun.accepted) return null;
    this.locks.set(kind, begun.token);
    return begun.token;
  }

  complete(
    token: ImmersiveOperationToken,
    current: ImmersiveViewContext,
    mounted: boolean,
  ) {
    const result = completeImmersiveOperation(
      token,
      this.locks.get(token.kind) ?? null,
      current,
      mounted,
    );
    if (result.release && this.locks.get(token.kind) === token) {
      this.locks.delete(token.kind);
    }
    return result;
  }

  owns(token: ImmersiveOperationToken, current: ImmersiveViewContext, mounted: boolean) {
    return immersiveOperationOwnsCompletion(
      token,
      this.locks.get(token.kind) ?? null,
      current,
      mounted,
    );
  }

  cancel(kind: ImmersiveOperationToken['kind']) {
    this.locks.delete(kind);
  }

  rotate() {
    this.locks.clear();
  }

  busy(kind: ImmersiveOperationToken['kind']) {
    return this.locks.has(kind);
  }
}

export function immersiveResultBelongsToView(
  requestedId: string,
  requestedGeneration: number,
  requestedOwnerId: string | null,
  mounted: boolean,
  currentId: string,
  currentGeneration: number,
  currentOwnerId: string | null,
) {
  return (
    mounted &&
    requestedId === currentId &&
    requestedGeneration === currentGeneration &&
    requestedOwnerId === currentOwnerId
  );
}

export function presentImmersivePost(post: FeedPost, viewerId: string | null) {
  return {
    owner: post.user_id === viewerId,
    ownerLabel: post.user_id === viewerId ? 'Your post' : 'Buddy post',
    audienceLabel:
      post.audience === 'public'
        ? 'Public'
        : post.audience === 'group'
          ? 'Group only'
          : 'Buddies only',
    run: post.post_type === 'run',
    mediaAvailable: Boolean(post.image_url),
    redacted: !post.author_name,
    privacyLabel: !post.author_name ? 'Author details unavailable' : null,
  };
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function routeValue(value: unknown): Pt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const lat = numberValue((item as Record<string, unknown>).lat);
    const lon = numberValue((item as Record<string, unknown>).lon);
    return lat == null || lon == null ? [] : [{ lat, lon }];
  });
}

export function ImmersivePost({
  post,
  viewerId,
  supporterCount,
  supporterNames,
  supporterAvatars,
  onBack,
  onOptions,
  onEncourage,
  onComment,
  onShare,
  onOpenEncouragement,
}: {
  post: FeedPost;
  viewerId: string | null;
  supporterCount: number;
  supporterNames: string;
  supporterAvatars: { id: string; name: string | null; avatar_url: string | null }[];
  onBack(): void;
  onOptions(): void;
  onEncourage(): void;
  onComment(): void;
  onShare(): void;
  onOpenEncouragement(): void;
}) {
  const { height, width } = useWindowDimensions();
  const presentation = presentImmersivePost(post, viewerId);
  const distance = numberValue(post.share_data.distance_m);
  const duration = numberValue(post.share_data.duration_s);
  const route = routeValue(post.share_data.route);
  const verified = post.share_data.verified === true;
  const mediaSummary = `${presentation.run ? 'Run proof' : 'Post media'} by ${authorLabel(post.author_name)}. ${presentation.ownerLabel}. ${presentation.audienceLabel}. ${presentation.mediaAvailable ? post.body || 'No caption.' : 'Media unavailable.'}${presentation.privacyLabel ? ` ${presentation.privacyLabel}.` : ''}`;

  return (
    <View style={[styles.hero, { minHeight: height }]}>
      <View
        style={StyleSheet.absoluteFill}
        accessibilityRole="image"
        accessibilityLabel={mediaSummary}
      >
        {post.image_url ? (
          post.post_type === 'video' ? (
            <View
              style={[
                styles.photoFill,
                { transform: [{ scale: Math.max(1, height / Math.max(width * (16 / 9), 1)) }] },
              ]}
            >
              <PostVideo url={post.image_url} detail />
            </View>
          ) : (
            <View
              style={[
                styles.photoFill,
                { transform: [{ scale: Math.max(1, height / Math.max(width * 1.25, 1)) }] },
              ]}
            >
              <PostImage url={post.image_url} immersive />
            </View>
          )
        ) : (
          <View style={styles.mediaUnavailable}>
            <Ionicons name="image-outline" size={38} color="rgba(255,255,255,.8)" />
            <Text style={styles.mediaUnavailableText}>Media unavailable</Text>
          </View>
        )}
      </View>
      <LinearGradient
        colors={['rgba(2,8,20,.22)', 'transparent', 'rgba(2,8,20,.96)']}
        locations={[0, 0.36, 1]}
        style={StyleSheet.absoluteFill}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />

      <View style={styles.topControls}>
        <IconButton icon="arrow-back" label="Back" onPress={onBack} />
        <IconButton icon="ellipsis-horizontal" label="Post options" onPress={onOptions} />
      </View>

      <View style={styles.story}>
        <View style={styles.headlineRow}>
          {post.body ? <Text style={styles.headline} numberOfLines={3}>{post.body}</Text> : <View style={styles.headline} />}
          {verified ? (
            <View
              style={styles.verified}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={styles.verifiedText}>Verified</Text>
              <Ionicons name="checkmark-circle-outline" size={30} color="#4F8CFF" />
            </View>
          ) : null}
        </View>

        {route.length > 1 ? (
          <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.route}>
            <RouteTrace points={route} width={118} height={80} stroke={3} accent="#4F8CFF" pad={7} />
          </View>
        ) : null}

        {presentation.run && distance != null && duration != null ? (
          <View style={styles.metrics} accessibilityLabel={`${formatKm(distance)} kilometers, ${formatDuration(duration)} time, ${formatPace(distance, duration)} pace per kilometer`}>
            <Metric value={formatKm(distance)} label="km" />
            <Metric value={formatDuration(duration)} label="time" />
            <Metric value={formatPace(distance, duration)} label="pace /km" />
          </View>
        ) : null}

        <View style={styles.authorLine}>
          <Avatar url={post.author_avatar} name={post.author_name} size={34} />
          <View style={styles.authorCopy}>
            <Text style={styles.author}>{authorLabel(post.author_name)}</Text>
            <Text style={styles.accessLabel}>{presentation.ownerLabel} · {presentation.audienceLabel}</Text>
            <Text style={styles.caption} numberOfLines={2}>
              {presentation.privacyLabel || post.body}
            </Text>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [styles.encouragementCard, pressed && styles.pressed]}
          onPress={onOpenEncouragement}
          accessibilityRole="button"
          accessibilityLabel={`${supporterCount} supporters. Open encouragement.`}
        >
          <View style={styles.faces}>
            {supporterAvatars.slice(0, 3).map((person, index) => (
              <View key={person.id} style={[styles.face, { marginLeft: index ? -10 : 0 }]}>
                <Avatar url={person.avatar_url} name={person.name} size={30} />
              </View>
            ))}
          </View>
          <View style={styles.encouragementCopy}>
            <Text style={styles.encouragementNames} numberOfLines={1}>
              {supporterNames || 'Your buddies'}
            </Text>
            <Text style={styles.encouragementText}>are cheering you on</Text>
            <View style={styles.miniWave} accessible={false} importantForAccessibility="no-hide-descendants">
              {[5, 10, 7, 14, 9, 16, 6, 12, 8, 5].map((barHeight, index) => (
                <View key={index} style={[styles.waveBar, { height: barHeight }]} />
              ))}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <View style={styles.actionBar}>
          <Action icon={post.liked_by_me ? 'flame' : 'flame-outline'} label="Encourage this post" shortLabel="Encourage" active={post.liked_by_me} onPress={onEncourage} />
          <Action icon="chatbubble-outline" label="Comment on this post" shortLabel="Comment" onPress={onComment} />
          <Action icon="paper-plane-outline" label="Share this post" shortLabel="Share" onPress={onShare} />
        </View>
      </View>
    </View>
  );
}

function IconButton({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress(): void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.iconButton}>
      <Ionicons name={icon} size={24} color="#fff" />
    </Pressable>
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Action({ icon, label, shortLabel, active = false, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; shortLabel: string; active?: boolean; onPress(): void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <Ionicons name={icon} size={18} color={active ? '#76A5FF' : '#fff'} />
      <Text style={[styles.actionText, active && styles.actionActive]}>{shortLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { width: '100%', backgroundColor: colors.navy, overflow: 'hidden' },
  photoFill: { width: '100%', alignSelf: 'center' },
  mediaUnavailable: { flex: 1, minHeight: 720, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.navy },
  mediaUnavailableText: { color: 'rgba(255,255,255,.8)', fontFamily: font.medium },
  topControls: { position: 'absolute', top: spacing.xxl, left: spacing.md, right: spacing.md, flexDirection: 'row', justifyContent: 'space-between', zIndex: 3 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(2,8,20,.24)' },
  story: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, gap: spacing.md },
  headlineRow: { minHeight: 98, flexDirection: 'row', alignItems: 'flex-start' },
  headline: { flex: 1, color: '#fff', fontFamily: font.serif, fontSize: 34, lineHeight: 37, textShadowColor: 'rgba(0,0,0,.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8 },
  verified: { width: 74, alignItems: 'center', transform: [{ rotate: '-7deg' }] },
  verifiedText: { color: '#5F96FF', fontFamily: font.handwritten, fontSize: 22, lineHeight: 24 },
  route: { position: 'absolute', right: 0, top: 70 },
  metrics: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,.34)' },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: '#fff', fontFamily: font.bold, fontSize: 18 },
  metricLabel: { color: 'rgba(255,255,255,.76)', fontFamily: font.medium, fontSize: 10 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  authorCopy: { flex: 1 },
  author: { color: '#fff', fontFamily: font.bold, fontSize: 13 },
  accessLabel: { color: 'rgba(255,255,255,.72)', fontFamily: font.medium, fontSize: 9.5 },
  caption: { color: 'rgba(255,255,255,.8)', fontFamily: font.regular, fontSize: 11, lineHeight: 15 },
  encouragementCard: { minHeight: 70, borderRadius: radius.lg, backgroundColor: colors.cream, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  faces: { flexDirection: 'row', minWidth: 52 },
  face: { borderWidth: 2, borderColor: colors.cream, borderRadius: 17 },
  encouragementCopy: { flex: 1 },
  encouragementNames: { color: colors.navy, fontFamily: font.semibold, fontSize: 12 },
  encouragementText: { color: colors.textMuted, fontFamily: font.regular, fontSize: 10.5 },
  miniWave: { height: 18, flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  waveBar: { width: 2, borderRadius: 1, backgroundColor: colors.primary },
  actionBar: { minHeight: 48, borderRadius: radius.pill, backgroundColor: 'rgba(2,8,20,.78)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  action: { flex: 1, minHeight: 44, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#fff', fontFamily: font.semibold, fontSize: 11 },
  actionActive: { color: '#76A5FF' },
  pressed: { opacity: 0.72 },
});
