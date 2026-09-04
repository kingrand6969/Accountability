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
  test('renders offline and refresh failures as full-width semantic status bands', () => {
    const offline = styleBlock(feedSource, 'offlineNotice');
    const error = styleBlock(feedSource, 'inlineError');

    expect(offline).toContain('backgroundColor: theme.surface.muted');
    expect(offline).not.toContain('margin');
    expect(offline).not.toContain('border');
    expect(error).toContain('backgroundColor: theme.status.dangerSoft');
    expect(error).not.toContain('margin');
    expect(error).not.toContain('border');
    expect(error).not.toContain('borderRadius');
  });

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

  test('uses the behavior-tested suggestion coordinator for discovery and requests', () => {
    expect(feedSource).toContain('createFeedBuddySuggestionCoordinator');
    expect(feedSource).toContain('suggestionCoordinator.runDiscovery');
    expect(feedSource).toContain('suggestionCoordinator.startRequest');
    expect(feedSource).not.toContain('suggestionGeneration');
    expect(feedSource).not.toContain('buddyRequestsInFlightRef');
  });

  test('preserves the remaining Feed post-entry paths and other handoffs', () => {
    expect(DIRECT_POST_HREF).toEqual({ pathname: '/compose', params: { text: '' } });
    expect(feedSource).toContain("from '../../entry/createFlow'");
    expect(feedSource).toContain('onCreate={() => setCreateOpen(true)}');
    expect(feedSource).toContain('route: DIRECT_POST_HREF');
    expect(feedSource).toContain('router.push(DIRECT_POST_HREF as never)');
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

  test('renders flat Quiet Social posts with one divider owned by the Feed list', () => {
    const cardStyle = styleBlock(proofCardSource, 'card');
    expect(cardStyle).toContain('backgroundColor: theme.surface.canvas');
    expect(cardStyle).not.toContain('marginHorizontal');
    expect(cardStyle).not.toContain('marginBottom');
    expect(cardStyle).not.toContain('borderWidth');
    expect(cardStyle).not.toContain('borderRadius');
    expect(cardStyle).not.toContain('shadow.card');

    const actionRowStyle = styleBlock(proofCardSource, 'actions');
    expect(actionRowStyle).not.toContain('borderTopWidth');
    expect(feedSource.match(/ItemSeparatorComponent/g)).toHaveLength(1);
    expect(feedSource).toContain('ItemSeparatorComponent={() => <View style={styles.feedDivider} />}');
    expect(feedSource).toContain('StyleSheet.hairlineWidth');

    const dividerStyle = styleBlock(feedSource, 'feedDivider');
    expect(dividerStyle).toContain('height: StyleSheet.hairlineWidth');
    expect(dividerStyle).toContain('marginHorizontal: spacing.lg');
    expect(dividerStyle).toContain('backgroundColor: theme.border.subtle');
  });

  test('renders the exact compact social header without a segmented selector', () => {
    expect(brandHeaderSource).toContain('<BrandWordmark compact />');
    expect(brandHeaderSource).toContain('accessibilityLabel="Search"');
    expect(brandHeaderSource).toContain('accessibilityLabel="Create"');
    expect(brandHeaderSource).toContain('accessibilityLabel="Notifications"');
    expect(brandHeaderSource).toContain('width: spacing.touch');
    expect(modeSelectorSource).not.toContain('accessibilityRole="tablist"');
  });

  test('keeps the social brand mark accessible without large-text wordmark clipping', () => {
    expect(brandHeaderSource).not.toContain('useWindowDimensions');
    expect(brandHeaderSource).toContain('width: spacing.touch');
    expect(brandHeaderSource).toContain('height: spacing.touch');
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

  test('keeps truthful run data responsive without vertical rules', () => {
    expect(metricSource).toContain('<RouteTrace');
    expect(metricSource).toContain('formatKm(distance)');
    expect(metricSource).toContain('formatDuration(duration)');
    expect(metricSource).toContain('formatPace(distance, duration)');
    expect(metricSource.match(/<LinearGradient/g)).toHaveLength(1);
    expect(metricSource).not.toContain('styles.rule');
    expect(metricSource).toContain('const isLargeText = fontScale >= 1.75');
    expect(metricSource).toContain('styles.overlayLarge');
    expect(metricSource).toContain('styles.routeLarge');
    expect(metricSource).toContain('styles.statsLarge');
    expect(styleBlock(metricSource, 'stats')).toContain("alignItems: 'flex-end'");
    expect(styleBlock(metricSource, 'stats')).toContain('gap: spacing.lg');
    expect(styleBlock(metricSource, 'statsLarge')).toContain("flexDirection: 'column'");
    expect(styleBlock(metricSource, 'routeLarge')).toContain("position: 'relative'");
    expect(styleBlock(metricSource, 'metric')).toContain('minWidth: 68');
    expect(styleBlock(metricSource, 'value')).toContain("color: '#FFFFFF'");
    expect(styleBlock(metricSource, 'value')).toContain('lineHeight: 23');
    expect(styleBlock(metricSource, 'label')).toContain('marginTop: 2');
    expect(styleBlock(metricSource, 'label')).toContain("color: 'rgba(255,255,255,.72)'");
  });

  test('uses grouped Feed actions with explicit Share and Save utility labels', () => {
    const actions = jsxCalls(proofCardSource, 'Action');
    const cheerAction = callWith(actions, 'onPress={onToggleLike}');
    const commentAction = callWith(actions, 'onPress={onComment}');
    const shareAction = callWith(actions, 'onPress={onShare}');
    expect(cheerAction).toMatch(/\bicon=["']cheer["']/);
    expect(cheerAction).toMatch(/\bcount=\{post\.like_count\}/);
    expect(cheerAction).not.toMatch(/\blabel=\{`Cheer/);
    expect(commentAction).toMatch(/\bicon=["']chatbubble-outline["']/);
    expect(commentAction).toMatch(/\bcount=\{post\.comment_count\}/);
    expect(commentAction).not.toMatch(/\blabel=\{`Comment/);
    expect(shareAction).toMatch(/\bicon=["']share-outline["']/);
    expect(shareAction).toMatch(/\bshortLabel=["']Share["']/);
    expect(proofCardSource).not.toContain('paper-plane-outline');
    for (const action of [cheerAction, commentAction, shareAction]) {
      expect(action).toMatch(/\baccessibilityLabel=/);
    }

    const memoryAction = jsxCalls(proofCardSource, 'SaveToMemories')[0] ?? '';
    expect(memoryAction).toMatch(/\burl=\{post\.image_url\}/);
    expect(hasBooleanProp(memoryAction, 'feedAction')).toBe(true);
    expect(hasBooleanProp(memoryAction, 'iconOnly')).toBe(false);
    const actionStyle = styleBlock(proofCardSource, 'action');
    expect(actionStyle).toMatch(/\bminWidth:\s*48\b/);
    expect(actionStyle).toMatch(/\bminHeight:\s*48\b/);

    const actionComponent = sourceSection(
      proofCardSource,
      'function Action(',
      'type ProofCardStyles',
    );
    expect(actionComponent).toMatch(/shortLabel\s*&&\s*styles\.labeledAction/);
    expect(actionComponent).toMatch(
      /\{shortLabel\s*\?\s*<Text\s+style=\{styles\.utilityActionText\}>\{shortLabel\}<\/Text>\s*:\s*null\}/,
    );
    expect(actionComponent).toContain("name={active ? 'thumbs-up' : 'thumbs-up-outline'}");
    expect(actionComponent).toContain('accessibilityState={active === undefined ? undefined : { selected: active }}');
    expect(actionComponent).toMatch(
      /active\s*\?\s*theme\.ink\.action\s*:\s*theme\.ink\.muted/,
    );
    expect(proofCardSource).not.toContain('hand-left-outline');
    expect(proofCardSource).not.toContain('hand-right-outline');
    expect(proofCardSource).not.toContain('function CheerIcon(');
    expect(proofCardSource).toContain('<View style={styles.socialActions}>');
    expect(proofCardSource).toContain('<View style={styles.utilityActions}>');
    expect(actionStyle).not.toContain('flex: 1');
  });

  test('opens only the Comment action with an explicit keyboard-focus intent', () => {
    const proofCardCall = jsxCalls(feedSource, 'FeedProofCard')[0] ?? '';
    expect(proofCardSource).toContain('onComment: () => void');
    expect(proofCardSource).toContain('onPress={onComment}');
    expect(proofCardSource).toContain('<Pressable onPress={onOpen}');
    expect(proofCardSource).toContain('onPress={onOpenMedia ?? onOpen}');
    expect(proofCardCall).toContain("onOpen={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}");
    expect(proofCardCall).toContain("onComment={() => router.push({ pathname: '/post/[id]', params: { id: item.id, comment: '1' } } as never)}");
  });

  test.each([
    ['Cheer', 'onPress={onToggleLike}', 'like_count'],
    ['Comment', 'onPress={onComment}', 'comment_count'],
  ])('%s accessibility omits a numeric zero count', (_name, marker, countName) => {
    const action = callWith(jsxCalls(proofCardSource, 'Action'), marker);
    expect(action).toMatch(
      new RegExp(
        `accessibilityLabel=\\{[\\s\\S]*post\\.${countName}\\s*>\\s*0`,
      ),
    );
  });

  test('keeps the memory control accessible and stateful', () => {
    const memoryComponent = sourceSection(
      memorySource,
      'export function SaveToMemories(',
      'const styles = StyleSheet.create',
    );
    expect(memoryComponent).toMatch(/\baccessibilityLabel=/);
    expect(memoryComponent).toMatch(
      /accessibilityState=\{\{\s*disabled:\s*busy\s*\|\|\s*saved,\s*busy\s*\}\}/,
    );
  });

  test('renders the Feed memory action as a labeled stateful bookmark', () => {
    const memoryComponent = sourceSection(
      memorySource,
      'export function SaveToMemories(',
      'const styles = StyleSheet.create',
    );

    expect(memoryComponent).toMatch(
      /<Ionicons\b(?=[^>]*\bname=\{saved\s*\?\s*['"]bookmark['"]\s*:\s*['"]bookmark-outline['"]\})(?=[^>]*\bsize=\{feedAction\s*\?\s*21\s*:\s*17\})[^>]*\/>/,
    );
    expect(memoryComponent).toMatch(
      /\{inline\s*\|\|\s*feedAction\s*\?\s*\(\s*<Text[\s\S]*?feedAction\s*\?\s*styles\.feedActionText\s*:\s*styles\.inlineText[\s\S]*?>\s*\{feedAction\s*\?\s*['"]Save['"]\s*:\s*saved\s*\?\s*['"]Saved['"]\s*:\s*['"]Save['"]\}\s*<\/Text>/,
    );
    expect(memoryComponent).toMatch(/\bsaved\s*&&\s*styles\.inlineSaved\b/);
    expect(memoryComponent).not.toMatch(/['"]albums(?:-outline)?['"]/);

    const feedActionStyle = styleBlock(memorySource, 'feedAction');
    expect(feedActionStyle).toMatch(/\bminWidth:\s*48\b/);
    expect(feedActionStyle).toMatch(/\bminHeight:\s*48\b/);
  });

  test('keeps memory labels out of the loading state', () => {
    const memoryComponent = sourceSection(
      memorySource,
      'export function SaveToMemories(',
      'const styles = StyleSheet.create',
    );

    expect(memoryComponent).toMatch(
      /\{busy\s*\?\s*\(\s*<ActivityIndicator\b[\s\S]*?\/>\s*\)\s*:\s*\(\s*<>\s*<Ionicons\b[\s\S]*?\/>\s*\{inline\s*\|\|\s*feedAction\s*\?\s*\(\s*<Text\b[\s\S]*?<\/Text>\s*\)\s*:\s*null\}\s*<\/>\s*\)\}/,
    );
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

  test('commits the critical Feed page through a non-blocking, identity-guarded loader', () => {
    const loadSource = sourceSection(
      feedSource,
      'const load = useCallback',
      'const unsubscribe = NetInfo.addEventListener',
    );
    expect(loadSource).toContain('runFeedCriticalLoad({');
    expect(loadSource).toContain('onPage: (page) =>');
    expect(loadSource).toContain('onPreviews: setEncouragementPreviews');
    expect(loadSource).toContain('currentUserIdRef.current === requestedOwnerId');
    expect(loadSource).toContain('dataOwnerIdRef.current');
    expect(loadSource).toContain('postCountRef.current');
    expect(loadSource).toContain('}, [myId]);');
    expect(loadSource).not.toContain('[dataOwnerId, myId, posts.length]');
    expect(loadSource).not.toContain('await listEncouragementPreviews');
  });

  test('keeps the Feed header mounted and replaces the cold blank spinner with fixed post skeletons', () => {
    expect(feedSource).toContain("viewState === 'initial-loading' ? (");
    expect(feedSource).toContain('<FeedLoadingSkeleton />');
    expect(feedSource).toContain('const FEED_SKELETON_ROWS = [0, 1] as const');
    expect(feedSource).toContain('function FeedLoadingSkeleton()');
    expect(feedSource).not.toMatch(/\{loading\s*\?\s*\([\s\S]{0,120}<View style=\{styles\.center\}/);
    expect(feedSource).not.toContain('if (restored) {\n      setLoading(true);');
  });

  test('keeps previews best-effort, suppresses Pro ads, and separates error from empty', () => {
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
    expect(feedSource).toContain(
      'if (reconnected && restored && myId) void load({ forceFresh: true })',
    );
  });

  test('reuses a brief first-page snapshot except for explicit refresh and reconnect', () => {
    expect(feedSource).toContain(
      'loadPage: () => listPersonalFeed(requestedOwnerId, undefined, { forceFresh })',
    );
    expect(feedSource).toContain('await load({ forceFresh: true })');
    expect(feedSource).toContain('void load({ forceFresh: true })');
    expect(feedSource).toContain('if (restored && myId && connectivityRef.current) void load()');
    expect(feedSource).toContain('void Promise.resolve().then(() => load())');
  });

  test('loads once after restoration without refreshing on every Feed focus', () => {
    expect(feedSource).toMatch(
      /useEffect\(\(\) => \{\s*if \(restored\) \{\s*void Promise\.resolve\(\)\.then\(\(\) => load\(\)\);\s*\}\s*\}, \[load, restored\]\);/,
    );
    const focusBlock = feedSource.match(/useFocusEffect\([\s\S]*?\n\s*\);/)?.[0] ?? '';
    expect(focusBlock).not.toContain('void load()');
    expect(focusBlock).not.toContain('setLoading(true)');
  });

  test('prepends newly committed owner posts on focus without replacing the current Feed', () => {
    expect(feedSource).toContain('reconcileFeedPostsPublished');
    expect(feedSource).toContain('fetchPost: getPost');
    expect(feedSource).toContain('currentUserIdRef.current === requestedOwnerId');
    expect(feedSource).toContain("feed_source: 'self'");
    expect(feedSource).toContain('suggested: false');
    expect(feedSource).toMatch(
      /setPosts\(\(current\) => \[\s*\.\.\.published,\s*\.\.\.current\.filter\(\(post\) => !publishedIds\.has\(post\.id\)\),\s*\]\)/,
    );
    const focusBlock = feedSource.match(/useFocusEffect\([\s\S]*?\n\s*\);/)?.[0] ?? '';
    expect(focusBlock).toContain('void reconcilePublishedPosts()');
    expect(focusBlock).not.toContain('void load()');
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
