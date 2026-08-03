import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, radius } from '../ui/theme';
import { useResolvedMediaUrl } from '../media/useResolvedMediaUrl';

export function PostVideo({ url, detail = false }: { url: string; detail?: boolean }) {
  const resolvedUrl = useResolvedMediaUrl(url);
  const player = useVideoPlayer(resolvedUrl ?? null, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  useEffect(() => {
    if (!resolvedUrl) player.pause();
  }, [player, resolvedUrl]);

  return (
    <View style={[styles.frame, detail && styles.detailFrame]}>
      {resolvedUrl ? (
        <VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
          accessibilityLabel="Post video. Tap play to watch."
        />
      ) : (
        <View style={styles.placeholder} accessibilityLabel="Private video unavailable" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
    borderRadius: radius.sm,
    backgroundColor: colors.navy,
  },
  detailFrame: { aspectRatio: 9 / 16 },
  video: { width: '100%', height: '100%' },
  placeholder: { flex: 1, backgroundColor: colors.navy },
});
