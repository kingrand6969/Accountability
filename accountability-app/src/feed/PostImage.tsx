import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CachedImage } from '../ui/CachedImage';
import { colors, font, radius } from '../ui/theme';
import { useResolvedImageUrl } from '../media/useResolvedImageUrl';

/** Tallest frame the FEED shows — 4:5 portrait, like Instagram/Facebook.
 *  Anything taller is centre-cropped in the feed and shown in full on tap. */
const FEED_MIN_RATIO = 4 / 5;

/**
 * A feed photo at its natural aspect ratio (never squashed into a fixed box).
 * With `capTall`, very tall photos are limited to a 4:5 frame and get a
 * "See full photo" hint — the whole image shows when the post is opened.
 * Parents must stretch (the feed wrappers set alignSelf: 'stretch').
 */
export function PostImage({
  url,
  capTall = false,
  immersive = false,
  detail = false,
}: {
  url: string;
  capTall?: boolean;
  immersive?: boolean;
  detail?: boolean;
}) {
  const [ratio, setRatio] = useState(16 / 9);
  const resolvedUrl = useResolvedImageUrl(url);

  const capped = capTall && ratio < FEED_MIN_RATIO;
  const shown = immersive ? FEED_MIN_RATIO : capped ? FEED_MIN_RATIO : ratio;

  return (
    <View style={styles.wrap}>
      {resolvedUrl ? <CachedImage
        uri={resolvedUrl}
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width > 0 && height > 0) setRatio(width / height);
        }}
        style={{
          width: '100%',
          aspectRatio: shown,
          borderRadius: immersive ? 0 : radius.sm,
          backgroundColor: colors.surface,
        }}
        contentFit={immersive || detail ? 'contain' : 'cover'}
      /> : (
        <View
          testID="post-image-placeholder"
          style={[
            styles.privatePlaceholder,
            immersive && styles.immersivePlaceholder,
            { aspectRatio: shown },
          ]}
        >
          {!immersive ? <Ionicons name="image-outline" size={26} color={colors.textMuted} /> : null}
        </View>
      )}
      {capped ? (
        <View style={styles.hint} pointerEvents="none">
          <Ionicons name="expand-outline" size={12} color="#fff" />
          <Text style={styles.hintText}>See full photo</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', width: '100%' },
  privatePlaceholder: {
    width: '100%',
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  immersivePlaceholder: { borderRadius: 0, backgroundColor: colors.navy },
  hint: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  hintText: { color: '#fff', fontFamily: font.semibold, fontSize: 11 },
});
