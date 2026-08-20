import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import React from 'react';
import { Image as NativeImage } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CachedImage } from './CachedImage';

jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));
const mockUseResolvedImageUrl = jest.fn((value: string | null | undefined) => value ?? null);
jest.mock('../media/useResolvedImageUrl', () => ({
  useResolvedImageUrl: (value: string | null | undefined) => mockUseResolvedImageUrl(value),
}));

describe('CachedImage native fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseResolvedImageUrl.mockImplementation((value) => value ?? null);
  });

  test('falls back once per HTTPS URI and resets when the URI changes', async () => {
    const onLoad = jest.fn();
    const onError = jest.fn();
    const firstUri = 'https://images.example/first.jpg';
    const secondUri = 'https://images.example/second.jpg';
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <CachedImage
          uri={firstUri}
          style={{ width: 96, height: 64 }}
          contentFit="contain"
          transition={240}
          priority="high"
          recyclingKey="profile-photo"
          onLoad={onLoad}
          onError={onError}
          accessibilityLabel="Profile photo"
        />,
      );
    });

    const expoImage = renderer.root.findByType('ExpoImage' as never);
    expect(expoImage.props).toMatchObject({
      source: { uri: firstUri },
      contentFit: 'contain',
      cachePolicy: 'memory-disk',
      transition: 240,
      priority: 'high',
      recyclingKey: 'profile-photo',
      accessibilityLabel: 'Profile photo',
    });

    await act(async () => {
      expoImage.props.onError({ error: 'The image could not be decoded' });
    });

    expect(renderer.root.findAllByType('ExpoImage' as never)).toHaveLength(0);
    const nativeImage = renderer.root.findByType(NativeImage);
    expect(nativeImage.props).toMatchObject({
      source: { uri: firstUri },
      resizeMode: 'contain',
      accessibilityLabel: 'Profile photo',
    });
    expect(nativeImage.props.onError).toEqual(expect.any(Function));

    await act(async () => {
      nativeImage.props.onLoad({
        nativeEvent: { source: { uri: firstUri, width: 1200, height: 800 } },
      });
    });
    expect(onLoad).toHaveBeenCalledWith({
      cacheType: 'none',
      source: {
        url: firstUri,
        width: 1200,
        height: 800,
        mediaType: null,
      },
    });

    await act(async () => {
      nativeImage.props.onError({ nativeEvent: { error: 'Native image loader failed' } });
    });
    expect(onError).toHaveBeenCalledWith('Native image loader failed');
    expect(renderer.root.findAllByType(NativeImage)).toHaveLength(0);
    expect(renderer.root.findByType('ExpoImage' as never).props.source).toBeUndefined();

    await act(async () => {
      renderer.update(<CachedImage uri={secondUri} contentFit="cover" />);
    });

    expect(renderer.root.findAllByType(NativeImage)).toHaveLength(0);
    const secondExpoImage = renderer.root.findByType('ExpoImage' as never);
    expect(secondExpoImage.props).toMatchObject({
      source: { uri: secondUri },
      contentFit: 'cover',
    });

    await act(async () => {
      secondExpoImage.props.onError({ error: 'The image could not be decoded' });
    });
    expect(renderer.root.findByType(NativeImage).props.resizeMode).toBe('cover');

    await act(async () => {
      renderer.update(<CachedImage uri={firstUri} contentFit="contain" />);
    });
    expect(renderer.root.findAllByType(NativeImage)).toHaveLength(0);
    expect(renderer.root.findByType('ExpoImage' as never).props.source).toEqual({
      uri: firstUri,
    });

    await act(async () => renderer.unmount());
  });

  test('renders an AWS-signed private image only through its localized file URI', async () => {
    const signedUri =
      'https://media.example/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260820T000000Z';
    const fileUri = 'file:///private-images/session/avatar.jpg';
    mockUseResolvedImageUrl.mockImplementation((value) => (value === signedUri ? fileUri : value ?? null));
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(
        <CachedImage
          uri={signedUri}
          style={{ width: 84, height: 84 }}
          contentFit="cover"
          accessibilityLabel="Signed profile photo"
        />,
      );
    });

    expect(renderer.root.findAllByType(NativeImage)).toHaveLength(0);
    expect(renderer.root.findByType('ExpoImage' as never).props).toMatchObject({
      source: { uri: fileUri },
      contentFit: 'cover',
      accessibilityLabel: 'Signed profile photo',
    });
    expect(renderer.root.findByType('ExpoImage' as never).props.source.uri).not.toContain('X-Amz');

    await act(async () => renderer.unmount());
  });

  test('routes a raw R2 image reference through the image-only resolver', async () => {
    const privateRef = 'r2://avatars/member/avatar.jpg';
    mockUseResolvedImageUrl.mockReturnValue('file:///private-images/session/avatar.jpg');
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CachedImage uri={privateRef} contentFit="cover" />);
    });

    expect(mockUseResolvedImageUrl).toHaveBeenCalledWith(privateRef);
    expect(renderer.root.findByType('ExpoImage' as never).props.source).toEqual({
      uri: 'file:///private-images/session/avatar.jpg',
    });
    await act(async () => renderer.unmount());
  });

  test('falls back to the native renderer for a localized file and recovers for a renewed URI', async () => {
    const privateRef = 'r2://avatars/member/avatar.jpg';
    let localizedUri = 'file:///private-images/session-a/avatar.jpg';
    mockUseResolvedImageUrl.mockImplementation(() => localizedUri);
    let renderer!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      renderer = TestRenderer.create(<CachedImage uri={privateRef} contentFit="cover" />);
    });
    const expoImage = renderer.root.findByType('ExpoImage' as never);
    await act(async () => expoImage.props.onError({ error: 'Local decoder failed' }));
    expect(renderer.root.findByType(NativeImage).props.source).toEqual({ uri: localizedUri });

    await act(async () => {
      renderer.root.findByType(NativeImage).props.onError({
        nativeEvent: { error: 'Native local decoder failed' },
      });
    });
    expect(renderer.root.findByType('ExpoImage' as never).props.source).toBeUndefined();

    localizedUri = 'file:///private-images/session-b/avatar.jpg';
    await act(async () => {
      renderer.update(<CachedImage uri={privateRef} contentFit="cover" />);
    });
    expect(renderer.root.findAllByType(NativeImage)).toHaveLength(0);
    expect(renderer.root.findByType('ExpoImage' as never).props.source).toEqual({ uri: localizedUri });
    await act(async () => renderer.unmount());
  });
});
