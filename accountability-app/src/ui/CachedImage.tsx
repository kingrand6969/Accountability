import { useState } from 'react';
import {
  Image,
  type ImageContentFit,
  type ImageErrorEventData,
  type ImageLoadEventData,
} from 'expo-image';
import {
  Image as NativeImage,
  type ImageErrorEvent as NativeImageErrorEvent,
  type ImageLoadEvent as NativeImageLoadEvent,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { useResolvedImageUrl } from '../media/useResolvedImageUrl';

type Props = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  /** How the image fills its box. Maps to RN's resizeMode (default 'cover'). */
  contentFit?: ImageContentFit;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string | null;
  onLoad?: (e: ImageLoadEventData) => void;
  onError?: (message: string) => void;
  accessibilityLabel?: string;
};

/**
 * A remote image with on-device memory + disk caching (via expo-image).
 *
 * A photo is downloaded ONCE and reused from the device cache on every later
 * render/scroll, so repeat views cost ~zero outbound bandwidth — the same trick
 * Instagram/Facebook use. Drop-in replacement for a React Native
 * `<Image source={{ uri }} />`. Looks identical; only cheaper and faster.
 *
 * Only use this for REMOTE (http) images. Bundled `require()` assets don't need it.
 */
export function CachedImage({ uri, ...props }: Props) {
  return <CachedImageForUri key={uri ?? ''} uri={uri} {...props} />;
}

function CachedImageForUri({
  uri,
  ...props
}: Props) {
  const resolvedUri = useResolvedImageUrl(uri);
  return <CachedImageRenderer key={resolvedUri ?? ''} uri={resolvedUri} {...props} />;
}

function CachedImageRenderer({
  uri: resolvedUri,
  style,
  contentFit = 'cover',
  transition = 120,
  priority,
  recyclingKey,
  onLoad,
  onError,
  accessibilityLabel,
}: Props) {
  const [useNativeFallback, setUseNativeFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const displayUri = failed ? null : resolvedUri;
  const handleTerminalError = (message: string) => {
    setFailed(true);
    onError?.(message);
  };

  if (
    useNativeFallback &&
    displayUri &&
    (contentFit === 'cover' || contentFit === 'contain')
  ) {
    const resizeMode = contentFit === 'contain' ? 'contain' : 'cover';
    const handleLoad = (event: NativeImageLoadEvent) => {
      const { height, uri: loadedUri, width } = event.nativeEvent.source;
      onLoad?.({
        cacheType: 'none',
        source: {
          url: loadedUri,
          width,
          height,
          mediaType: null,
        },
      });
    };
    const handleError = (event: NativeImageErrorEvent) => {
      const message = String(event.nativeEvent.error || 'The image could not be displayed.');
      handleTerminalError(message);
    };

    return (
      <NativeImage
        source={{ uri: displayUri }}
        style={style}
        resizeMode={resizeMode}
        onLoad={handleLoad}
        onError={handleError}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return (
    <Image
      source={displayUri ? { uri: displayUri } : undefined}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transition}
      priority={priority}
      recyclingKey={recyclingKey ?? undefined}
      onLoad={onLoad}
      onError={(event: ImageErrorEventData) => {
        if (
          displayUri &&
          (contentFit === 'cover' || contentFit === 'contain')
        ) {
          setUseNativeFallback(true);
        } else {
          handleTerminalError(event.error || 'The image could not be displayed.');
        }
      }}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
