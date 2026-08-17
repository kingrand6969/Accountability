import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

import { PostImage } from './PostImage';
import { CachedImage } from '../ui/CachedImage';

jest.mock('../media/useResolvedMediaUrl', () => ({
  useResolvedMediaUrl: (url: string) => url,
}));
jest.mock('../ui/CachedImage', () => ({
  CachedImage: jest.fn(() => null),
}));

describe('PostImage presentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
