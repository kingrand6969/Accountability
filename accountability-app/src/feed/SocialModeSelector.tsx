import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FeedMode } from './api';
import { colors, font, radius, spacing } from '../ui/theme';
import { formatKm } from '../activity/geo';
import type { FeedPost } from './types';

export type PersistedFeedSession = { mode: FeedMode; buddiesOffset: number };

export function restoreFeedSession(value: unknown): PersistedFeedSession {
  if (!value || typeof value !== 'object') return { mode: 'buddies', buddiesOffset: 0 };
  const raw = value as Record<string, unknown>;
  return {
    mode: raw.mode === 'discover' ? 'discover' : 'buddies',
    buddiesOffset:
      typeof raw.buddiesOffset === 'number' && Number.isFinite(raw.buddiesOffset)
        ? Math.max(0, raw.buddiesOffset)
        : 0,
  };
}

export function feedRowsBelongToView(
  ownerId: string | null,
  currentUserId: string | null,
  dataMode: FeedMode | null,
  currentMode: FeedMode,
) {
  return ownerId === currentUserId && currentUserId !== null && dataMode === currentMode;
}

export function scheduleIdentityBoundAction(
  requestedUserId: string,
  getCurrentUserId: () => string | null,
  action: () => void,
  delayMs = 250,
  onConsumed?: () => void,
) {
  return setTimeout(() => {
    onConsumed?.();
    if (getCurrentUserId() === requestedUserId) action();
  }, delayMs);
}

export type FeedViewState =
  | 'initial-loading'
  | 'pagination-loading'
  | 'populated'
  | 'empty'
  | 'retryable-error'
  | 'offline-cached'
  | 'offline-uncached';

export function deriveFeedViewState(input: {
  loading: boolean;
  loadingMore: boolean;
  postCount: number;
  error: string | null;
  online: boolean;
}): FeedViewState {
  if (!input.online) return input.postCount > 0 ? 'offline-cached' : 'offline-uncached';
  if (input.loading && input.postCount === 0) return 'initial-loading';
  if (input.error) return 'retryable-error';
  if (input.loadingMore) return 'pagination-loading';
  return input.postCount > 0 ? 'populated' : 'empty';
}

export function deriveFeedCardPresentation(post: FeedPost, currentUserId: string | null) {
  const redacted = !post.author_name?.trim() && !post.author_avatar;
  return {
    redacted,
    ownerLabel: post.user_id === currentUserId ? 'Your post' : 'Buddy post',
    audienceLabel:
      post.audience === 'public'
        ? 'Public'
        : post.audience === 'group'
          ? 'Group restricted'
          : 'Buddies only',
  } as const;
}

export type MyDayValue = { value: string | null; image: string | null };
export type MyDayValues = Record<'move' | 'fuel' | 'mind' | 'connect', MyDayValue>;

export function deriveMyDayValues(
  posts: FeedPost[],
  currentUserId: string | null,
  connectionCount: number,
): MyDayValues {
  const run = posts.find(
    (post) =>
      post.user_id === currentUserId &&
      post.post_type === 'run' &&
      post.share_data.verified === true,
  );
  const distance =
    run && typeof run.share_data.distance_m === 'number' ? formatKm(run.share_data.distance_m) : null;
  return {
    move: { value: distance ? `${distance} km` : null, image: run?.image_url ?? null },
    fuel: { value: null, image: null },
    mind: { value: null, image: null },
    connect: { value: connectionCount > 0 ? `${connectionCount} encouraged` : null, image: null },
  };
}

export function SocialModeSelector({
  value,
  onChange,
}: {
  value: FeedMode;
  onChange: (mode: FeedMode) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.selector} accessibilityRole="tablist">
        {(['buddies', 'discover'] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value }}
            accessibilityLabel={mode === 'buddies' ? 'Buddies feed' : 'Discover'}
            style={({ pressed }) => [
              styles.tab,
              mode === value && styles.selected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, mode === value && styles.selectedLabel]}>
              {mode === 'buddies' ? 'Buddies' : 'Discover'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.card,
  },
  selector: {
    minHeight: 44,
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    padding: 2,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  selected: { backgroundColor: colors.primary },
  label: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
  selectedLabel: { color: colors.onPrimary },
  pressed: { opacity: 0.72 },
});
