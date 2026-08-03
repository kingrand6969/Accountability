import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useResolvedMediaUrl } from './useResolvedMediaUrl';

const mockResolveMediaUrl = jest.fn<(value: string) => Promise<string>>();

jest.mock('./privateMedia', () => ({
  isPrivateMediaRef: (value: string | null | undefined) =>
    typeof value === 'string' && value.startsWith('r2://'),
  resolveMediaUrl: (value: string) => mockResolveMediaUrl(value),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function Probe({
  value,
  onRender,
}: {
  value: string | null;
  onRender: (resolved: string | null) => void;
}) {
  onRender(useResolvedMediaUrl(value));
  return null;
}

describe('useResolvedMediaUrl', () => {
  afterEach(() => {
    mockResolveMediaUrl.mockReset();
  });

  it('returns public and empty values immediately without private resolution', async () => {
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'https://cdn.example/photo.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://cdn.example/photo.jpg');

    await act(async () => {
      renderer.update(
        createElement(Probe, {
          value: null,
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBeNull();
    expect(mockResolveMediaUrl).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it('does not expose a stale private result after the source changes', async () => {
    const pending = deferred<string>();
    mockResolveMediaUrl.mockReturnValue(pending.promise);
    const renders: (string | null)[] = [];
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        createElement(Probe, {
          value: 'r2://post-images/member/private.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBeNull();

    await act(async () => {
      renderer.update(
        createElement(Probe, {
          value: 'https://cdn.example/new.jpg',
          onRender: (value) => renders.push(value),
        }),
      );
    });
    expect(renders.at(-1)).toBe('https://cdn.example/new.jpg');

    await act(async () => {
      pending.resolve('https://signed.example/stale.jpg');
      await pending.promise;
    });
    expect(renders.at(-1)).toBe('https://cdn.example/new.jpg');

    await act(async () => renderer.unmount());
  });
});
