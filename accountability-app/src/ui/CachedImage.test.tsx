import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import React from 'react';
import { Image as NativeImage } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CachedImage } from './CachedImage';

jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));

describe('CachedImage native fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('falls back once per HTTPS URI and resets when the URI changes', async () => {
    const onLoad = jest.fn();
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
    expect(nativeImage.props.onError).toBeUndefined();

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

  test('uses the native renderer immediately for an AWS-signed private image URL', async () => {
    const signedUri =
      'https://media.example/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260820T000000Z';
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

    expect(renderer.root.findAllByType('ExpoImage' as never)).toHaveLength(0);
    expect(renderer.root.findByType(NativeImage).props).toMatchObject({
      source: { uri: signedUri },
      resizeMode: 'cover',
      accessibilityLabel: 'Signed profile photo',
    });

    await act(async () => renderer.unmount());
  });
});
