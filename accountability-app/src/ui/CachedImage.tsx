import { useState } from 'react';
import { Image, type ImageContentFit, type ImageLoadEventData } from 'expo-image';
import {
  Image as NativeImage,
  type ImageLoadEvent as NativeImageLoadEvent,
  type ImageStyle,
  type StyleProp,
} from 'react-native';

type Props = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  /** How the image fills its box. Maps to RN's resizeMode (default 'cover'). */
  contentFit?: ImageContentFit;
  transition?: number;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string | null;
  onLoad?: (e: ImageLoadEventData) => void;
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
  style,
  contentFit = 'cover',
  transition = 120,
  priority,
  recyclingKey,
  onLoad,
  accessibilityLabel,
}: Props) {
  const [useNativeFallback, setUseNativeFallback] = useState(false);

  if (
    useNativeFallback &&
    uri &&
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

    return (
      <NativeImage
        source={{ uri }}
        style={style}
        resizeMode={resizeMode}
        onLoad={handleLoad}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }

  return (
    <Image
      source={uri ? { uri } : undefined}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transition}
      priority={priority}
      recyclingKey={recyclingKey ?? undefined}
      onLoad={onLoad}
      onError={() => {
        if (
          uri?.toLowerCase().startsWith('https://') &&
          (contentFit === 'cover' || contentFit === 'contain')
        ) {
          setUseNativeFallback(true);
        }
      }}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
