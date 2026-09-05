import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { PostImage } from './PostImage';
import { CachedImage } from '../ui/CachedImage';

let mockResolvedImageUrl: string | null = null;

jest.mock('@expo/vector-icons/Ionicons', () => jest.fn(() => null));
jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: () => mockResolvedImageUrl,
}));
jest.mock('../ui/CachedImage', () => ({
  CachedImage: jest.fn(() => null),
}));

describe('PostImage presentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvedImageUrl = 'photo.jpg';
  });

  test('shows an intentional placeholder when private media cannot be resolved', () => {
    mockResolvedImageUrl = null;

    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<PostImage url="private/photo.jpg" />);
    });

    expect(renderer.root.findByProps({ testID: 'post-image-placeholder' })).toBeTruthy();
    expect(CachedImage).not.toHaveBeenCalled();
  });

  test('fits the full photo when opened instead of zooming and cropping it', () => {
    act(() => {
      TestRenderer.create(<PostImage url="photo.jpg" immersive />);
    });

    expect(CachedImage).toHaveBeenCalledWith(
      expect.objectContaining({ contentFit: 'contain' }),
      undefined,
    );
  });

  test('keeps Feed thumbnails edge-to-edge', () => {
    act(() => {
      TestRenderer.create(<PostImage url="photo.jpg" capTall />);
    });

    expect(CachedImage).toHaveBeenCalledWith(
      expect.objectContaining({ contentFit: 'cover' }),
      undefined,
    );
  });

  test('shows an ordinary detail photo uncropped at its measured aspect ratio', () => {
    act(() => {
      TestRenderer.create(<PostImage url="photo.jpg" detail />);
    });

    const firstProps = jest.mocked(CachedImage).mock.calls.at(-1)?.[0];
    expect(firstProps?.contentFit).toBe('contain');

    act(() => {
      firstProps?.onLoad?.({ source: { width: 900, height: 1600 } } as never);
    });

    const measuredProps = jest.mocked(CachedImage).mock.calls.at(-1)?.[0];
    const measuredStyle = measuredProps?.style as unknown as { aspectRatio: number };
    expect(measuredProps?.contentFit).toBe('contain');
    expect(measuredStyle.aspectRatio).toBe(900 / 1600);
  });
});
