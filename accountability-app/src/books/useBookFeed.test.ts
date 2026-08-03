import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { BookFeed, BookPrefs } from './api';
import { useBookFeed } from './useBookFeed';

const mockGetBookFeed = jest.fn<(prefs: BookPrefs) => Promise<BookFeed>>();

jest.mock('./api', () => ({
  getBookFeed: (prefs: BookPrefs) => mockGetBookFeed(prefs),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function feed(id: number): BookFeed {
  return {
    pick: { id, title: `Book ${id}`, author: 'Author', coverUrl: null, readUrl: null },
    more: [],
    interestLabel: 'Motivation & discipline',
  };
}

function Probe({
  prefs,
  onRender,
}: {
  prefs: BookPrefs | null;
  onRender: (state: ReturnType<typeof useBookFeed>) => void;
}) {
  onRender(useBookFeed(prefs, true));
  return null;
}

describe('useBookFeed', () => {
  afterEach(() => {
    mockGetBookFeed.mockReset();
  });

  it('derives loading immediately and exposes the matching result', async () => {
    const pending = deferred<BookFeed>();
    mockGetBookFeed.mockReturnValue(pending.promise);
    const renders: ReturnType<typeof useBookFeed>[] = [];
    const prefs: BookPrefs = { interests: ['motivation'], cadence: 'daily' };
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, { prefs, onRender: (state) => renders.push(state) }),
      );
    });
    expect(renders.at(-1)).toMatchObject({ feed: null, error: null, loading: true });

    await act(async () => {
      pending.resolve(feed(1));
      await pending.promise;
    });
    expect(renders.at(-1)).toMatchObject({ feed: feed(1), error: null, loading: false });

    await act(async () => renderer.unmount());
  });

  it('ignores a stale feed after preferences change', async () => {
    const first = deferred<BookFeed>();
    const second = deferred<BookFeed>();
    mockGetBookFeed.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const renders: ReturnType<typeof useBookFeed>[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          prefs: { interests: ['motivation'], cadence: 'daily' },
          onRender: (state) => renders.push(state),
        }),
      );
    });
    await act(async () => {
      renderer.update(
        createElement(Probe, {
          prefs: { interests: ['money'], cadence: 'weekly' },
          onRender: (state) => renders.push(state),
        }),
      );
    });

    await act(async () => {
      first.resolve(feed(1));
      await first.promise;
    });
    expect(renders.at(-1)).toMatchObject({ feed: null, loading: true });

    await act(async () => {
      second.resolve(feed(2));
      await second.promise;
    });
    expect(renders.at(-1)).toMatchObject({ feed: feed(2), loading: false });

    await act(async () => renderer.unmount());
  });
});
