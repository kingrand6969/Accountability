import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, radius } from '../ui/theme';
import { useResolvedMediaUrl } from '../media/useResolvedMediaUrl';

export function PostVideo({
  url,
  detail = false,
  active = false,
}: {
  url: string;
  detail?: boolean;
  active?: boolean;
}) {
  const resolvedUrl = useResolvedMediaUrl(active ? url : null);
  return (
    <View style={[styles.frame, detail && styles.detailFrame]}>
      {active && resolvedUrl ? (
        <ActivePostVideo url={resolvedUrl} />
      ) : (
        <View style={styles.placeholder} accessibilityLabel="Video paused while off screen" />
      )}
    </View>
  );
}

function ActivePostVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });

  useEffect(() => () => player.pause(), [player]);

  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      contentFit="contain"
      accessibilityLabel="Post video. Tap play to watch."
    />
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
