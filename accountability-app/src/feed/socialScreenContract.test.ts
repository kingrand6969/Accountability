import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveFeedCardPresentation,
  deriveFeedViewState,
  deriveMyDayValues,
  feedRowsBelongToView,
  restoreFeedSession,
  scheduleIdentityBoundAction,
} from './SocialModeSelector';
import type { FeedPost } from './types';

const feedSource = readFileSync(require.resolve('../app/(app)/index'), 'utf8');
function source(name: string) {
  try {
    return readFileSync(join(__dirname, name), 'utf8');
  } catch {
    return '';
  }
}
const brandHeaderSource = source('SocialBrandHeader.tsx');
const modeSelectorSource = source('SocialModeSelector.tsx');
const myDaySource = source('MyDayRail.tsx');
const proofCardSource = source('FeedProofCard.tsx');
const headlineSource = source('ProofHeadlineOverlay.tsx');
const metricSource = source('RunRouteMetricOverlay.tsx');
const storyRailSource = source('../stories/StoryRail.tsx');

describe('Group 3 social Feed contract', () => {
  test('preserves cursor pagination and request-generation guards', () => {
    expect(feedSource).toContain('const loadGeneration = useRef(0)');
    expect(feedSource).toContain('const generation = ++loadGeneration.current');
    expect(feedSource).toContain('if (generation !== loadGeneration.current) return');
    expect(feedSource).toContain(
      'const page = await listFeed(oldest, undefined, undefined, feedMode)',
    );
    expect(feedSource).toContain('if (page.length < FEED_PAGE_SIZE) setEndReached(true)');
    expect(feedSource).toContain(
      'if (loadingMore || endReached || loading || posts.length === 0) return',
    );
    expect(feedSource).toContain('setLoadingMore(false)');
  });

  test('preserves Buddies and Discover as modes of the same Feed screen', () => {
    expect(feedSource).toContain("type FeedMode");
    expect(feedSource).toContain("const [feedMode, setFeedMode] = useState<FeedMode>('buddies')");
    expect(modeSelectorSource).toContain("(['buddies', 'discover'] as const)");
    expect(feedSource).toContain('<DiscoverExperience />');
  });

  test('preserves composer, story, post-detail, and encouragement-preview handoffs', () => {
    expect(feedSource).toContain("router.push('/compose' as never)");
    expect(feedSource).toContain("router.push('/compose?photo=1' as never)");
    expect(feedSource).toContain("router.push('/win-card' as never)");
    expect(feedSource).toContain('<MyDayRail values={myDayValues} />');
    expect(feedSource).toContain('<StoryRail');
    expect(feedSource).toContain('ref={storyRailRef}');
    expect(feedSource).toContain("pathname: '/post/[id]'");
    expect(feedSource).toContain('listEncouragementPreviews(page.map((post) => post.id))');
    expect(feedSource).toContain("encouragement: '1'");
  });

  test('uses the approved Group 3 Feed presentation contracts', () => {
    expect(feedSource).toContain("from '../../feed/SocialBrandHeader'");
    expect(feedSource).toContain("from '../../feed/SocialModeSelector'");
    expect(feedSource).toContain("from '../../feed/MyDayRail'");
    expect(feedSource).toContain("from '../../feed/FeedProofCard'");
    expect(feedSource).toContain('<SocialBrandHeader');
    expect(feedSource).toContain('<SocialModeSelector');
    expect(feedSource).toContain('<MyDayRail');
    expect(feedSource).toContain('<FeedProofCard');
  });

  test('renders the exact compact social header and selected cobalt selector', () => {
    expect(brandHeaderSource).toContain('<BrandMark');
    expect(brandHeaderSource).toContain('AccountAbility');
    expect(brandHeaderSource).toContain('accessibilityLabel="Search"');
    expect(brandHeaderSource).toContain('accessibilityLabel="Create"');
    expect(brandHeaderSource).toContain('accessibilityLabel="Notifications"');
    expect(brandHeaderSource).toContain('minWidth: 44');
    expect(modeSelectorSource).toContain("(['buddies', 'discover'] as const)");
    expect(modeSelectorSource).toContain('accessibilityState={{ selected: mode === value }}');
    expect(modeSelectorSource).toContain('backgroundColor: colors.primary');
  });

  test('keeps the social brand mark accessible without large-text wordmark clipping', () => {
    expect(brandHeaderSource).toContain('useWindowDimensions');
    expect(brandHeaderSource).toContain('fontScale >= 1.25');
    expect(brandHeaderSource).toContain('isLargeText ? null');
    expect(brandHeaderSource).toContain('accessibilityLabel="AccountAbility"');
    expect(brandHeaderSource).toContain('minWidth: 44');
    expect(brandHeaderSource).toContain('minHeight: 44');
  });

  test('keeps a deterministic four-tile My Day model without fabricated metrics', () => {
    expect(myDaySource).toContain("key: 'move'");
    expect(myDaySource).toContain("key: 'fuel'");
    expect(myDaySource).toContain("key: 'mind'");
    expect(myDaySource).toContain("key: 'connect'");
    expect(myDaySource).toContain("value.value ?? 'Not set'");
    expect(myDaySource).not.toContain('<StoryRail');
  });

  test('uses approved proof typography, metrics, actions, and supporter summary', () => {
    expect(headlineSource).toContain('fontFamily: font.serif');
    expect(headlineSource).toContain('fontFamily: font.handwritten');
    expect(headlineSource).not.toContain('Georgia');
    expect(headlineSource).not.toContain('fontStyle');
    expect(metricSource).toContain('<RouteTrace');
    expect(metricSource).toContain("label=\"pace /km\"");
    expect(proofCardSource).toContain('accessibilityLabel="Post options"');
    expect(proofCardSource).toContain('accessibilityLabel="View comments"');
    expect(proofCardSource).toContain('accessibilityLabel="Share this post"');
    expect(proofCardSource).toContain('FeedSupporterSummary');
    expect(proofCardSource).not.toContain('EncouragementBar');
    expect(proofCardSource.toLowerCase()).not.toContain('waveform');
    expect(proofCardSource.toLowerCase()).not.toContain('chevron');
    expect(metricSource).toContain('formatDuration(duration)');
    expect(metricSource).not.toContain('formatDurationLong');
    expect(proofCardSource).not.toContain("'I showed up today.'");
  });

  test('preserves one FlatList and an honest Buddies offset contract', () => {
    expect(feedSource.match(/<FlatList(?=\s)/g)).toHaveLength(1);
    expect(feedSource).toContain('const buddiesOffset = useRef(0)');
    expect(feedSource).toContain('buddiesOffset.current = event.nativeEvent.contentOffset.y');
    expect(feedSource).toContain('scrollToOffset');
    expect(feedSource).not.toContain('modeOffsets');
  });

  test('scrolls the compact composer and My Day rail as the list header', () => {
    expect(feedSource).toContain('ListHeaderComponent={feedHeader}');
    expect(feedSource).not.toContain('return false ?');
    expect(feedSource).toContain('const feedHeader = (');
    expect(feedSource).toContain('<MyDayRail');
  });

  test('keeps previews best-effort, suppresses Pro ads, and separates error from empty', () => {
    expect(feedSource).toContain('setPosts(page)');
    expect(feedSource.indexOf('setPosts(page)')).toBeLessThan(
      feedSource.indexOf('await listEncouragementPreviews(page.map((post) => post.id))'),
    );
    expect(feedSource).toContain('adsReady && !isPro && !proLoading');
    expect(feedSource).toContain('ListEmptyComponent={loadError ? null :');
  });

  test('contains no mojibake in the owned Feed presentation', () => {
    const combined = [
      feedSource,
      brandHeaderSource,
      modeSelectorSource,
      myDaySource,
      proofCardSource,
      headlineSource,
      metricSource,
    ].join('\n');
    expect(combined).not.toMatch(/[Ââ]/);
  });

  test('derives every required Feed lifecycle state', () => {
    expect(deriveFeedViewState({ loading: true, loadingMore: false, postCount: 0, error: null, online: true })).toBe('initial-loading');
    expect(deriveFeedViewState({ loading: false, loadingMore: true, postCount: 2, error: null, online: true })).toBe('pagination-loading');
    expect(deriveFeedViewState({ loading: false, loadingMore: false, postCount: 2, error: null, online: true })).toBe('populated');
    expect(deriveFeedViewState({ loading: false, loadingMore: false, postCount: 0, error: null, online: true })).toBe('empty');
    expect(deriveFeedViewState({ loading: false, loadingMore: false, postCount: 0, error: 'failed', online: true })).toBe('retryable-error');
    expect(deriveFeedViewState({ loading: false, loadingMore: false, postCount: 2, error: null, online: false })).toBe('offline-cached');
    expect(deriveFeedViewState({ loading: false, loadingMore: false, postCount: 0, error: null, online: false })).toBe('offline-uncached');
  });

  test('restores only safe Feed session values', () => {
    expect(restoreFeedSession({ mode: 'discover', buddiesOffset: 172.5 })).toEqual({
      mode: 'discover',
      buddiesOffset: 172.5,
    });
    expect(restoreFeedSession({ mode: 'invalid', buddiesOffset: -9 })).toEqual({
      mode: 'buddies',
      buddiesOffset: 0,
    });
    expect(feedSource).toContain('pendingBuddiesOffset.current = saved.buddiesOffset');
    expect(feedSource).toContain('onContentSizeChange={() =>');
    expect(feedSource).toContain('explicit offset persistence is deferred to Task 3.3');
    expect(feedSource).not.toContain('feed-cache');
    expect(feedSource).not.toContain('JSON.stringify(page)');
  });

  test('derives honest My Day values only from authorized inputs', () => {
    const run = {
      id: 'run-1',
      user_id: 'me',
      post_type: 'run',
      image_url: 'authorized-image',
      share_data: { verified: true, distance_m: 5200 },
    } as unknown as FeedPost;
    const values = deriveMyDayValues([run], 'me', 3);
    expect(values.move).toEqual({ value: '5.20 km', image: 'authorized-image' });
    expect(values.connect.value).toBe('3 encouraged');
    expect(values.fuel).toEqual({ value: null, image: null });
    expect(deriveMyDayValues([run], 'someone-else', 0).move).toEqual({
      value: null,
      image: null,
    });
  });

  test('derives truthful ownership, audience, and redaction labels', () => {
    const post = {
      user_id: 'me',
      audience: 'buddies',
      author_name: null,
      author_avatar: null,
    } as FeedPost;
    expect(deriveFeedCardPresentation(post, 'me')).toEqual({
      redacted: true,
      ownerLabel: 'Your post',
      audienceLabel: 'Buddies only',
    });
    expect(deriveFeedCardPresentation({ ...post, user_id: 'other', audience: 'public' }, 'me')).toMatchObject({
      ownerLabel: 'Buddy post',
      audienceLabel: 'Public',
    });
  });

  test('keeps the story controller mounted outside the closing create modal', () => {
    expect(feedSource).toContain('<StoryRail');
    expect(feedSource).toContain('ref={storyRailRef}');
    expect(feedSource).toContain('controllerOnly');
    expect(feedSource.indexOf('</Modal>')).toBeLessThan(feedSource.lastIndexOf('<StoryRail'));
    expect(feedSource).toContain('storyRailRef.current?.openPicker()');
    expect(storyRailSource).toContain('if (controllerOnly) return;');
    expect(storyRailSource).toContain('if (controllerOnly) {');
  });

  test('never exposes rows across logout or account transitions', () => {
    expect(feedRowsBelongToView('user-a', 'user-a', 'buddies', 'buddies')).toBe(true);
    expect(feedRowsBelongToView('user-a', null, 'buddies', 'buddies')).toBe(false);
    expect(feedRowsBelongToView('user-a', 'user-b', 'buddies', 'buddies')).toBe(false);
    expect(feedRowsBelongToView(null, 'user-b', 'buddies', 'buddies')).toBe(false);
    expect(feedRowsBelongToView('user-a', 'user-a', 'discover', 'buddies')).toBe(false);
    expect(feedSource).toContain('setDataOwnerId(null)');
    expect(feedSource).toContain('setPosts([])');
    expect(feedSource).toContain('setEncouragementPreviews(new Map())');
  });

  test('persists harmless position only at lifecycle boundaries', () => {
    expect(feedSource).toContain('onScrollEndDrag={persistFeedPosition}');
    expect(feedSource).toContain('onMomentumScrollEnd={persistFeedPosition}');
    expect(feedSource).not.toContain('onScroll={persistFeedPosition}');
    expect(feedSource).toContain("AppState.addEventListener('change'");
    expect(feedSource).toContain('loadGeneration.current += 1');
    expect(feedSource).toContain('if (reconnected && restored && myId) void load()');
  });

  test('clears pending offset only after a real list scroll call', () => {
    const scrollIndex = feedSource.indexOf('list.scrollToOffset({ offset, animated: false })');
    const clearIndex = feedSource.indexOf('pendingBuddiesOffset.current = null', scrollIndex);
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(scrollIndex);
    expect(feedSource).toContain('!feedListRef.current');
    expect(feedSource).not.toContain('onLayout={restorePendingBuddiesOffset}');
    expect(feedSource).toContain('listContentReady.current = false');
  });

  test('binds profile and user-scoped overlays to the exact active identity', () => {
    expect(feedSource).toContain('const generation = ++profileGeneration.current');
    expect(feedSource).toContain('generation !== profileGeneration.current');
    expect(feedSource).toContain('if (!myId) return');
    expect(feedSource).toContain('setBroadcast(null)');
    expect(feedSource).toContain('setAttending(new Set())');
    expect(feedSource).toContain('setCreateOpen(false)');
    expect(feedSource).toContain('likesInFlight.current.clear()');
    expect(feedSource).toContain('visible={!!myId && createOpen}');
    expect(feedSource).toContain('post={dataOwnerId === myId && myId ? broadcast : null}');
  });

  test('tears down story editor state across logout and account switch', () => {
    expect(feedSource).toContain('{myId ? (');
    expect(feedSource).toContain('key={myId}');
    expect(feedSource).toContain('controllerOnly');
    expect(feedSource).toContain("disabled={item.kind === 'story' && !myId}");
  });

  test('cancels delayed Create actions when identity changes and preserves same-user actions', () => {
    jest.useFakeTimers();
    let currentUserId: string | null = 'user-a';
    const action = jest.fn();
    const consumed = jest.fn();

    const pending = scheduleIdentityBoundAction(
      'user-a',
      () => currentUserId,
      action,
      250,
      consumed,
    );
    currentUserId = 'user-b';
    clearTimeout(pending);
    jest.advanceTimersByTime(250);
    expect(action).not.toHaveBeenCalled();
    expect(consumed).not.toHaveBeenCalled();

    scheduleIdentityBoundAction('user-a', () => currentUserId, action, 250, consumed);
    jest.advanceTimersByTime(250);
    expect(action).not.toHaveBeenCalled();
    expect(consumed).toHaveBeenCalledTimes(1);

    scheduleIdentityBoundAction('user-b', () => currentUserId, action, 250, consumed);
    jest.advanceTimersByTime(250);
    expect(action).toHaveBeenCalledTimes(1);
    expect(consumed).toHaveBeenCalledTimes(2);
    jest.useRealTimers();

    expect(feedSource).toContain('const requestedUserId = myId');
    expect(feedSource).toContain('currentUserIdRef.current = myId');
    expect(feedSource).toContain('() => currentUserIdRef.current');
    expect(feedSource).toContain('clearTimeout(pendingCreateAction.current)');
  });
});
