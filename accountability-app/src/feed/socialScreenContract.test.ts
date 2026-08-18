import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveFeedCardPresentation,
  deriveFeedViewState,
  feedRowsBelongToView,
  scheduleIdentityBoundAction,
} from './SocialModeSelector';
import type { FeedPost } from './types';
import { DIRECT_POST_HREF } from '../entry/createFlow';

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
const proofCardSource = source('FeedProofCard.tsx');
const headlineSource = source('ProofHeadlineOverlay.tsx');
const metricSource = source('RunRouteMetricOverlay.tsx');
const storyRailSource = source('../stories/StoryRail.tsx');
const memorySource = source('../memories/SaveToMemories.tsx');

function jsxCalls(componentSource: string, componentName: string): string[] {
  return [
    ...componentSource.matchAll(
      new RegExp(`<${componentName}\\b[\\s\\S]*?\\/>`, 'g'),
    ),
  ].map(([call]) => call);
}

function callWith(calls: string[], marker: string): string {
  return calls.find((call) => call.includes(marker)) ?? '';
}

function styleBlock(componentSource: string, styleName: string): string {
  const match = componentSource.match(
    new RegExp(`(?:^|\\n)\\s*${styleName}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`),
  );
  return match?.[1] ?? '';
}

function hasBooleanProp(openingTag: string, prop: string): boolean {
  return new RegExp(`\\b${prop}(?=\\s|\\/?>)`).test(openingTag);
}

function sourceSection(
  componentSource: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = componentSource.indexOf(startMarker);
  const end = componentSource.indexOf(endMarker, start + startMarker.length);
  return start >= 0 && end > start ? componentSource.slice(start, end) : '';
}

describe('Group 3 social Feed contract', () => {
  test('preserves cursor pagination and request-generation guards', () => {
    expect(feedSource).toContain('const loadGeneration = useRef(0)');
    expect(feedSource).toContain('const generation = ++loadGeneration.current');
    expect(feedSource).toContain('if (generation !== loadGeneration.current) return');
    expect(feedSource).toContain(
      'const page = await listPersonalFeed(myId, oldest)',
    );
    expect(feedSource).toContain('if (page.length < FEED_PAGE_SIZE) setEndReached(true)');
    expect(feedSource).toContain(
      'if (!myId || loadingMore || endReached || loading || posts.length === 0) return',
    );
    expect(feedSource).toContain('setLoadingMore(false)');
  });

  test('presents one unified Feed without the oversized Buddies and Discover selector', () => {
    expect(feedSource).not.toContain('SocialModeSelector,');
    expect(feedSource).not.toContain('DiscoverExperience');
    expect(feedSource).not.toContain('feedMode');
    expect(feedSource).not.toContain('dataMode');
    expect(modeSelectorSource).not.toContain("(['buddies', 'discover'] as const)");
  });

  test('preserves suggested metadata and labels only suggested Feed rows', () => {
    expect(feedSource).toContain('useState<UnifiedFeedPost[]>([])');
    expect(feedSource).toContain('post={item}');
    expect(proofCardSource).toContain("post.suggested ? 'Suggested for you' : null");
    expect(proofCardSource).toContain('accessibilityLabel="Suggested for you"');
    expect(proofCardSource).toContain('{suggestionLabel ? (');
    expect(proofCardSource).not.toContain('<Text style={styles.suggested}>Suggested for you</Text>');
  });

  test('opens every Feed text-post entry directly in the editor and preserves other handoffs', () => {
    expect(DIRECT_POST_HREF).toEqual({ pathname: '/compose', params: { text: '' } });
    expect(feedSource).toContain("from '../../entry/createFlow'");
    expect(feedSource.match(/router\.push\(DIRECT_POST_HREF as never\)/g)).toHaveLength(3);
    expect(feedSource).toContain('route: DIRECT_POST_HREF');
    expect(feedSource).not.toContain("router.push('/compose' as never)");
    expect(feedSource).toContain("router.push('/compose?photo=1' as never)");
    expect(feedSource).toContain("router.push('/win-card' as never)");
    expect(feedSource).toContain('<StoryRail');
    expect(feedSource).toContain('ref={attachStoryRail}');
    expect(feedSource).toContain("pathname: '/post/[id]'");
    expect(feedSource).toContain('listEncouragementPreviews(page.map((post) => post.id))');
    expect(feedSource).toContain("encouragement: '1'");
  });

  test('uses the approved Group 3 Feed presentation contracts', () => {
    expect(feedSource).toContain("from '../../feed/SocialBrandHeader'");
    expect(feedSource).toContain("from '../../feed/SocialModeSelector'");
    expect(feedSource).toContain("from '../../feed/FeedProofCard'");
    expect(feedSource).toContain('<SocialBrandHeader');
    expect(feedSource).not.toContain('<SocialModeSelector');
    expect(feedSource).toContain('<FeedProofCard');
  });

  test('renders the exact compact social header without a segmented selector', () => {
    expect(brandHeaderSource).toContain('<BrandMark');
    expect(brandHeaderSource).toContain('AccountAbility');
    expect(brandHeaderSource).toContain('accessibilityLabel="Search"');
    expect(brandHeaderSource).toContain('accessibilityLabel="Create"');
    expect(brandHeaderSource).toContain('accessibilityLabel="Notifications"');
    expect(brandHeaderSource).toContain('minWidth: 44');
    expect(modeSelectorSource).not.toContain('accessibilityRole="tablist"');
  });

  test('keeps the social brand mark accessible without large-text wordmark clipping', () => {
    expect(brandHeaderSource).toContain('useWindowDimensions');
    expect(brandHeaderSource).toContain('fontScale >= 1.25');
    expect(brandHeaderSource).toContain('isLargeText ? null');
    expect(brandHeaderSource).toContain('accessibilityLabel="AccountAbility"');
    expect(brandHeaderSource).toContain('minWidth: 44');
    expect(brandHeaderSource).toContain('minHeight: 44');
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

  test('uses icon-only Feed actions with visible counts and an icon-only memory affordance', () => {
    const actions = jsxCalls(proofCardSource, 'Action');
    const cheerAction = callWith(actions, 'onPress={onToggleLike}');
    const commentAction = callWith(actions, 'onPress={onOpen}');
    const shareAction = callWith(actions, 'onPress={onShare}');
    expect(cheerAction).toMatch(/\bicon=["']clap["']/);
    expect(cheerAction).toMatch(/\bcount=\{post\.like_count\}/);
    expect(cheerAction).not.toMatch(/\blabel=\{`Cheer/);
    expect(commentAction).toMatch(/\bicon=["']chatbubble-outline["']/);
    expect(commentAction).toMatch(/\bcount=\{post\.comment_count\}/);
    expect(commentAction).not.toMatch(/\blabel=\{`Comment/);
    expect(shareAction).toMatch(/\bicon=["']paper-plane-outline["']/);
    for (const action of [cheerAction, commentAction, shareAction]) {
      expect(action).toMatch(/\baccessibilityLabel=/);
    }

    const memoryAction = jsxCalls(proofCardSource, 'SaveToMemories')[0] ?? '';
    expect(memoryAction).toMatch(/\burl=\{post\.image_url\}/);
    expect(hasBooleanProp(memoryAction, 'inline')).toBe(true);
    expect(hasBooleanProp(memoryAction, 'iconOnly')).toBe(true);
    const actionStyle = styleBlock(proofCardSource, 'action');
    expect(actionStyle).toMatch(/\bflex:\s*1\b/);
    expect(actionStyle).toMatch(/\bminWidth:\s*48\b/);
    expect(actionStyle).toMatch(/\bminHeight:\s*48\b/);

    const actionComponent = sourceSection(
      proofCardSource,
      'function Action(',
      'const styles = StyleSheet.create',
    );
    expect(actionComponent).toContain('accessibilityState={active === undefined ? undefined : { selected: active }}');
    expect(actionComponent).toMatch(
      /Boolean\(active\)\s*\?\s*colors\.primary\s*:\s*colors\.textMuted/,
    );
  });

  test.each([
    ['Cheer', 'onPress={onToggleLike}', 'like_count'],
    ['Comment', 'onPress={onOpen}', 'comment_count'],
  ])('%s accessibility omits a numeric zero count', (_name, marker, countName) => {
    const action = callWith(jsxCalls(proofCardSource, 'Action'), marker);
    expect(action).toMatch(
      new RegExp(
        `accessibilityLabel=\\{[\\s\\S]*post\\.${countName}\\s*>\\s*0`,
      ),
    );
  });

  test('keeps the memory control accessible, stateful, and label-free in icon-only mode', () => {
    const memoryComponent = sourceSection(
      memorySource,
      'export function SaveToMemories(',
      'const styles = StyleSheet.create',
    );
    expect(memoryComponent).toMatch(/\baccessibilityLabel=/);
    expect(memoryComponent).toMatch(
      /accessibilityState=\{\{\s*disabled:\s*busy\s*\|\|\s*saved,\s*busy\s*\}\}/,
    );
    expect(memoryComponent).toMatch(/inline\s*&&\s*!iconOnly\s*\?/);
  });

  test.each([
    [
      'icon-only Memories uses the album glyph at 21',
      /\biconOnly\s*\?\s*(?:\(|<)[\s\S]*name=\{saved\s*\?\s*['"]albums['"]\s*:\s*['"]albums-outline['"]\}[\s\S]*size=\{21\}/,
    ],
    [
      'legacy Memories retains the bookmark glyph at 17',
      /\biconOnly\s*\?\s*(?:\(|<)[\s\S]*:[\s\S]*name=\{saved\s*\?\s*['"]bookmark['"]\s*:\s*['"]bookmark-outline['"]\}[\s\S]*size=\{17\}/,
    ],
  ])('%s', (_name, contract) => {
    const memoryComponent = sourceSection(
      memorySource,
      'export function SaveToMemories(',
      'const styles = StyleSheet.create',
    );
    expect(memoryComponent).toMatch(contract);
  });

  test('preserves one FlatList and an honest unified Feed offset contract', () => {
    expect(feedSource.match(/<FlatList(?=\s)/g)).toHaveLength(1);
    expect(feedSource).toContain('const feedOffset = useRef(0)');
    expect(feedSource).toContain('feedOffset.current = event.nativeEvent.contentOffset.y');
    expect(feedSource).toContain('scrollToOffset');
    expect(feedSource).not.toContain('modeOffsets');
  });

  test('scrolls the compact composer and My Day rail as the list header', () => {
    expect(feedSource).toContain('ListHeaderComponent={feedHeader}');
    expect(feedSource).not.toContain('return false ?');
    expect(feedSource).toContain('const feedHeader = (');
    expect(feedSource).toContain('<StoryRail');
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

  test('restores only a safe unified Feed offset', () => {
    expect(feedSource).toContain('pendingFeedOffset.current = savedOffset');
    expect(feedSource).toContain("typeof parsed.feedOffset === 'number'");
    expect(feedSource).toContain('onContentSizeChange={() =>');
    expect(feedSource).not.toContain('explicit offset persistence is deferred to Task 3.3');
    expect(feedSource).not.toContain('feed-cache');
    expect(feedSource).not.toContain('JSON.stringify(page)');
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

  test('keeps the visible story rail in the Feed header and picker ref available', () => {
    expect(feedSource).toContain('<StoryRail');
    expect(feedSource).toContain('ref={attachStoryRail}');
    expect(feedSource).not.toContain('controllerOnly');
    expect(feedSource.indexOf('<StoryRail', feedSource.indexOf('const feedHeader'))).toBeGreaterThan(-1);
    expect(feedSource).toContain('storyPickerQueue.request()');
    expect(feedSource).toContain('ref={attachStoryRail}');
    expect(feedSource).toContain('storyPickerQueue.reset()');
    expect(storyRailSource).not.toContain('controllerOnly');
  });

  test('opens Feed photos in a contained local overlay that closes without navigation', () => {
    expect(proofCardSource).toContain('onOpenMedia ?? onOpen');
    expect(feedSource).toContain('onOpenMedia=');
    expect(feedSource).toContain('visible={previewPhoto !== null}');
    expect(feedSource).toContain('onRequestClose={() => setPreviewPhoto(null)}');
    expect(feedSource).toContain('<PostImage url={previewPhoto} immersive />');
  });

  test('bounds Feed rendering and activates media from stable viewability callbacks', () => {
    expect(feedSource).toContain('itemVisiblePercentThreshold: 65');
    expect(feedSource).toContain('minimumViewTime: 180');
    expect(feedSource).toContain('initialNumToRender={4}');
    expect(feedSource).toContain('maxToRenderPerBatch={4}');
    expect(feedSource).toContain('updateCellsBatchingPeriod={50}');
    expect(feedSource).toContain('windowSize={7}');
    expect(feedSource).toContain("removeClippedSubviews={Platform.OS === 'android'}");
    expect(feedSource).toContain('onViewableItemsChanged={onViewableItemsChanged}');
    expect(feedSource).toContain('mediaActive={activeVideoId === item.id}');
    expect(proofCardSource).toContain('<PostVideo url={post.image_url} active={mediaActive} />');
  });

  test('isolates picker queue cleanup to the account that created it', () => {
    expect(feedSource).toContain('useMemo(() => createStoryPickerQueue(myId), [myId])');
    expect(feedSource).toContain('storyPickerQueue.reset()');
    expect(feedSource).toContain('}, [storyPickerQueue]);');
    expect(feedSource).not.toContain('useRef(createStoryPickerQueue())');
  });

  test('never exposes rows across logout or account transitions', () => {
    expect(feedRowsBelongToView('user-a', 'user-a')).toBe(true);
    expect(feedRowsBelongToView('user-a', null)).toBe(false);
    expect(feedRowsBelongToView('user-a', 'user-b')).toBe(false);
    expect(feedRowsBelongToView(null, 'user-b')).toBe(false);
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

  test('loads once after restoration without refreshing on every Feed focus', () => {
    expect(feedSource).toMatch(
      /useEffect\(\(\) => \{\s*if \(restored\) \{\s*setLoading\(true\);\s*void load\(\);\s*\}\s*\}, \[load, restored\]\);/,
    );
    const focusBlock = feedSource.match(/useFocusEffect\([\s\S]*?\n\s*\);/)?.[0] ?? '';
    expect(focusBlock).not.toContain('void load()');
    expect(focusBlock).not.toContain('setLoading(true)');
  });

  test('clears pending offset only after a real list scroll call', () => {
    const scrollIndex = feedSource.indexOf('list.scrollToOffset({ offset, animated: false })');
    const clearIndex = feedSource.indexOf('pendingFeedOffset.current = null', scrollIndex);
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeGreaterThan(scrollIndex);
    expect(feedSource).toContain('!feedListRef.current');
    expect(feedSource).not.toContain('onLayout={restorePendingFeedOffset}');
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
    expect(feedSource).not.toContain('controllerOnly');
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
