import { describe, expect, jest, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import {
  deriveImmersivePostState,
  createImmersiveOperationToken,
  beginImmersiveOperation,
  completeImmersiveOperation,
  ImmersiveOperationCoordinator,
  immersiveOperationOwnsCompletion,
  immersiveResultBelongsToView,
  presentImmersivePost,
  visibleImmersiveSnapshot,
} from './ImmersivePost';
import type { FeedPost } from './types';

jest.mock('./Avatar', () => ({ Avatar: () => null }));
jest.mock('./PostImage', () => ({ PostImage: () => null }));
jest.mock('./PostVideo', () => ({ PostVideo: () => null }));

const routeSource = readFileSync(require.resolve('../app/post/[id]'), 'utf8');
const componentSource = readFileSync(require.resolve('./ImmersivePost'), 'utf8');

const post = {
  id: 'post-a',
  user_id: 'owner',
  author_name: 'Kin',
  author_avatar: null,
  body: 'Morning run.\nClear mind.',
  image_url: 'private-media-ref',
  created_at: '2026-07-30T00:00:00Z',
  like_count: 17,
  comment_count: 0,
  liked_by_me: false,
  audience: 'buddies',
  post_type: 'run',
  share_data: { verified: true, distance_m: 5200, duration_s: 1694, route: [] },
  activity_id: 'activity-a',
  tagged: [],
  event: null,
} as FeedPost;

describe('Group 3 immersive Post Detail contract', () => {
  test('derives explicit loading, retry, missing, revoked, offline, and comment states', () => {
    expect(deriveImmersivePostState({ loading: true, post: null })).toBe('loading');
    expect(deriveImmersivePostState({ loading: false, post: null, error: 'network' })).toBe('retryable-error');
    expect(deriveImmersivePostState({ loading: false, post: null })).toBe('unavailable');
    expect(deriveImmersivePostState({ loading: false, post, online: false, cached: true })).toBe('offline-cached');
    expect(deriveImmersivePostState({ loading: false, post: null, online: false, cached: false })).toBe('offline-uncached');
    expect(deriveImmersivePostState({ loading: false, post, commentsLoading: true })).toBe('comments-loading');
    expect(deriveImmersivePostState({ loading: false, post, commentsError: true })).toBe('comments-error');
    expect(deriveImmersivePostState({ loading: false, post, commentCount: 0 })).toBe('comments-empty');
    expect(deriveImmersivePostState({ loading: false, post, commentCount: 2 })).toBe('populated');
  });

  test('derives honest ownership, audience, redaction, media, and run presentation', () => {
    expect(presentImmersivePost(post, 'owner')).toMatchObject({
      owner: true,
      ownerLabel: 'Your post',
      audienceLabel: 'Buddies only',
      run: true,
      mediaAvailable: true,
      redacted: false,
      privacyLabel: null,
    });
    expect(presentImmersivePost({ ...post, user_id: 'other', audience: 'public' }, 'owner')).toMatchObject({
      owner: false,
      ownerLabel: 'Buddy post',
      audienceLabel: 'Public',
    });
    expect(presentImmersivePost({ ...post, image_url: null, author_name: null }, 'owner')).toMatchObject({
      mediaAvailable: false,
      redacted: true,
      privacyLabel: 'Author details unavailable',
    });
    expect(presentImmersivePost({ ...post, post_type: 'photo' }, 'owner').run).toBe(false);
  });

  test('operation tokens synchronously reject duplicates and stale completions', () => {
    const viewA = { postId: 'post-a', userId: 'owner', generation: 8 };
    const first = createImmersiveOperationToken(viewA, 'comment', 1);
    const second = createImmersiveOperationToken(viewA, 'comment', 2);
    expect(immersiveOperationOwnsCompletion(first, first, viewA, true)).toBe(true);
    expect(immersiveOperationOwnsCompletion(second, first, viewA, true)).toBe(false);
    expect(immersiveOperationOwnsCompletion(first, first, { ...viewA, postId: 'post-b' }, true)).toBe(false);
    expect(immersiveOperationOwnsCompletion(first, first, { ...viewA, generation: 9 }, true)).toBe(false);
    expect(immersiveOperationOwnsCompletion(first, first, { ...viewA, userId: 'other' }, true)).toBe(false);
    expect(immersiveOperationOwnsCompletion(first, first, viewA, false)).toBe(false);
    expect(beginImmersiveOperation(first, viewA, 'comment', 2).accepted).toBe(false);
    expect(beginImmersiveOperation(null, viewA, 'comment', 2).accepted).toBe(true);
    expect(completeImmersiveOperation(first, first, viewA, true)).toEqual({
      apply: true,
      notify: true,
      release: true,
    });
    expect(completeImmersiveOperation(first, first, { ...viewA, generation: 9 }, true)).toEqual({
      apply: false,
      notify: false,
      release: true,
    });
  });

  test('hides the entire private snapshot immediately for A-to-B, logout, and ABA views', () => {
    const snapshot = {
      viewKey: 'post-a:owner',
      post,
      comments: [{ id: 'private-comment' }],
      encouragers: [{ id: 'private-supporter' }],
      voices: [{ id: 'private-voice' }],
      commentsLoading: false,
      commentsError: false,
    };
    expect(visibleImmersiveSnapshot(snapshot, 'post-a:owner')).toBe(snapshot);
    expect(visibleImmersiveSnapshot(snapshot, 'post-b:owner')).toBeNull();
    expect(visibleImmersiveSnapshot(snapshot, 'post-a:')).toBeNull();
    expect(visibleImmersiveSnapshot(snapshot, 'post-a:other')).toBeNull();
    expect(routeSource).toContain('key={viewKey}');
    expect(routeSource).toContain('visibleImmersiveSnapshot(snapshot, renderViewKey)');
  });

  test('rejects A-to-B, ABA, blur, unmount, and account-switch stale results', () => {
    expect(immersiveResultBelongsToView('post-a', 4, 'owner', true, 'post-a', 4, 'owner')).toBe(true);
    expect(immersiveResultBelongsToView('post-a', 4, 'owner', true, 'post-b', 4, 'owner')).toBe(false);
    expect(immersiveResultBelongsToView('post-a', 3, 'owner', true, 'post-a', 4, 'owner')).toBe(false);
    expect(immersiveResultBelongsToView('post-a', 4, 'owner', false, 'post-a', 4, 'owner')).toBe(false);
    expect(immersiveResultBelongsToView('post-a', 4, 'owner', true, 'post-a', 4, 'other')).toBe(false);
  });

  test('keeps data loading in the route and Supabase out of the presentation component', () => {
    expect(routeSource).toContain('getPost(id)');
    expect(routeSource).toContain('listComments(id)');
    expect(routeSource).toContain('listEncouragers(id)');
    expect(routeSource).toContain('listVoiceEncouragements(id)');
    expect(routeSource).toContain('<ImmersivePost');
    expect(componentSource).not.toContain('supabase');
    expect(routeSource).toContain('deriveImmersivePostState({');
    expect(routeSource).toContain("NetInfo.addEventListener");
    expect(routeSource).toContain("viewState === 'offline-cached'");
    expect(routeSource).toContain("viewState === 'offline-uncached'");
    expect(routeSource).toContain('dataViewKeyRef.current');
    expect(routeSource).toContain('sameLoadedView && !onlineRef.current');
  });

  test('opens encouragement from the canonical query and preserves all actions', () => {
    expect(routeSource).toContain("useState(encouragement === '1')");
    expect(routeSource).toContain('showPostMenu');
    expect(routeSource).toContain('setLiked');
    expect(routeSource).toContain('<SaveToMemories');
    expect(routeSource).toContain('<BroadcastSheet');
    expect(routeSource).toContain('operations.current.start(');
    expect(routeSource).toContain('operations.current.complete(');
    expect(routeSource).toContain('viewGeneration.current += 1');
    expect(componentSource).toContain('label="Encourage this post"');
    expect(componentSource).toContain('label="Comment on this post"');
    expect(componentSource).toContain('label="Share this post"');
    expect(componentSource).toContain('accessibilityLabel={label}');
  });

  test('real coordinator blocks a same-frame duplicate API call', () => {
    const coordinator = new ImmersiveOperationCoordinator();
    const context = { postId: 'post-a', userId: 'owner', generation: 1 };
    const api = jest.fn();
    const first = coordinator.start('like', context);
    if (first) api();
    const duplicate = coordinator.start('like', context);
    if (duplicate) api();
    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('deferred A completion cannot apply, notify, or unlock B after ABA, blur, or unmount', async () => {
    const coordinator = new ImmersiveOperationCoordinator();
    const viewA = { postId: 'post-a', userId: 'owner', generation: 1 };
    const old = coordinator.start('comment', viewA)!;
    const pending = deferred<void>();
    const completion = pending.promise.then(() =>
      coordinator.complete(old, viewA, true),
    );
    coordinator.rotate();
    const viewB = { postId: 'post-a', userId: 'owner', generation: 2 };
    const current = coordinator.start('comment', viewB)!;
    pending.resolve();
    await expect(completion).resolves.toEqual({
      apply: false,
      notify: false,
      release: false,
    });
    expect(coordinator.busy('comment')).toBe(true);
    expect(coordinator.owns(current, viewB, true)).toBe(true);
    expect(coordinator.owns(current, viewB, false)).toBe(false);
    coordinator.complete(current, viewB, false);
    expect(coordinator.busy('comment')).toBe(false);
  });

  test.each(['success', 'failure'] as const)(
    'current comment %s releases busy only after its deferred work settles',
    async (outcome) => {
      const coordinator = new ImmersiveOperationCoordinator();
      const view = { postId: 'post-a', userId: 'owner', generation: 1 };
      const token = coordinator.start('comment', view)!;
      const api = deferred<void>();
      const reload = deferred<void>();
      const lifecycle = (async () => {
        try {
          await api.promise;
          await reload.promise;
        } finally {
          return coordinator.complete(token, view, true);
        }
      })();
      expect(coordinator.busy('comment')).toBe(true);
      if (outcome === 'success') api.resolve();
      else api.reject(new Error('comment failed'));
      reload.resolve();
      await expect(lifecycle).resolves.toMatchObject({ release: true });
      expect(coordinator.busy('comment')).toBe(false);
    },
  );

  test('deferred menu callback navigates only for the current view token', () => {
    const coordinator = new ImmersiveOperationCoordinator();
    const navigate = jest.fn();
    const viewA = { postId: 'post-a', userId: 'owner', generation: 1 };
    const stale = coordinator.start('options', viewA)!;
    coordinator.rotate();
    const viewB = { postId: 'post-b', userId: 'owner', generation: 2 };
    const current = coordinator.start('options', viewB)!;
    const callback = (token: typeof stale, view: typeof viewA) => {
      if (coordinator.complete(token, view, true).apply) navigate();
    };
    callback(stale, viewB);
    expect(navigate).not.toHaveBeenCalled();
    expect(coordinator.busy('options')).toBe(true);
    callback(current, viewB);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  test('matches the approved immersive first viewport visual contract', () => {
    expect(componentSource).toContain('minHeight: height');
    expect(componentSource).toContain('label="Back"');
    expect(componentSource).toContain('label="Post options"');
    expect(componentSource).toContain('fontFamily: font.serif');
    expect(componentSource).toContain('fontFamily: font.handwritten');
    expect(componentSource).toContain('<RouteTrace');
    expect(componentSource).toContain('label="km"');
    expect(componentSource).toContain('label="time"');
    expect(componentSource).toContain('label="pace /km"');
    expect(componentSource).toContain('encouragementCard');
    expect(componentSource).toContain('miniWave');
    expect(componentSource).toContain('chevron-forward');
    expect(componentSource).toContain('actionBar');
    expect(componentSource).toContain("backgroundColor: 'rgba(2,8,20,.78)'");
    expect(routeSource).toContain('ListFooterComponent={');
    expect(routeSource.indexOf('<ImmersivePost')).toBeLessThan(routeSource.indexOf('ListFooterComponent={'));
  });

  test('prevents the rejected generic Post Detail presentation', () => {
    expect(componentSource).not.toContain('Georgia');
    expect(componentSource).not.toContain('fontStyle');
    expect(componentSource).not.toContain('headerRow');
    expect(componentSource).not.toContain('bottomNavigation');
    expect(componentSource).not.toContain('actionRow');
    expect(componentSource).not.toContain('Proof shared.');
  });

  test('keeps decorative overlays silent and media/actions explicit for TalkBack', () => {
    expect(componentSource).toContain('accessible={false}');
    expect(componentSource).toContain('importantForAccessibility="no-hide-descendants"');
    expect(componentSource).toContain('accessibilityLabel={mediaSummary}');
    expect(componentSource).toContain('accessibilityRole="image"');
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
