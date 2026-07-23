import { StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '../ui/Glass';
import { RankBadge } from './RankBadge';
import { SwipeDeck } from './SwipeDeck';
import { RANKS } from './catalog';
import { font, spacing } from '../ui/theme';
import { INK_SOFT, ACCENT } from '../compete/CompeteUI';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * The rank hero as a horizontal deck. Swipe / tap ‹ › to preview every rank in
 * the ladder — where you are now, what you've cleared, and the challenge to
 * reach each one ahead (right up to the Mythical flair). Snaps to your current
 * rank on first load.
 */
export function RankCarousel({ points, ready }: { points: number; ready: boolean }) {
  // highest rank whose threshold we've met
  let cur = 0;
  RANKS.forEach((r, i) => {
    if (points >= r.at) cur = i;
  });

  return (
    <SwipeDeck
      count={RANKS.length}
      initialIndex={cur}
      ready={ready}
      ariaUnit="rank"
      itemLabel={(i) => `Go to ${RANKS[i].name}`}
      renderItem={(i) => <RankPage index={i} cur={cur} points={points} />}
    />
  );
}

function RankPage({ index, cur, points }: { index: number; cur: number; points: number }) {
  const r = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const status = index < cur ? 'achieved' : index === cur ? 'current' : 'locked';

  let kicker: string;
  let kickerColor = INK_SOFT;
  let ptsLabel: string;
  let progress: number;
  let foot: string;

  if (status === 'current') {
    kicker = 'YOUR RANK';
    kickerColor = ACCENT;
    progress = next ? clamp01((points - r.at) / (next.at - r.at)) : 1;
    ptsLabel = next ? `${points} / ${next.at} Flex Points` : `${points} Flex Points`;
    foot = next ? `${next.at - points} pts to ${next.name}` : 'Top rank reached — legend 👑';
  } else if (status === 'achieved') {
    kicker = 'ACHIEVED';
    kickerColor = '#16a34a';
    progress = 1;
    ptsLabel = `${r.at} Flex Points`;
    foot = 'Unlocked ✓';
  } else {
    kicker = index === cur + 1 ? 'NEXT RANK' : 'RANK GOAL';
    progress = clamp01(points / r.at);
    ptsLabel = `${r.at} Flex Points`;
    const away = r.at - points;
    foot = `${away.toLocaleString()} Flex Points to go`;
  }

  return (
    <GlassCard>
      <View style={styles.inner}>
        <Text style={[styles.kicker, { color: kickerColor }]}>{kicker}</Text>
        <RankBadge rank={r.name} size={62} />
        <Text style={styles.pts}>{ptsLabel}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.foot}>{foot}</Text>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  inner: { padding: spacing.lg, alignItems: 'center', gap: 8, minHeight: 168, justifyContent: 'center' },
  kicker: { fontFamily: font.extrabold, fontSize: 11, letterSpacing: 1.5 },
  pts: { fontFamily: font.semibold, fontSize: 13, color: INK_SOFT, marginTop: 2 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(30,27,75,0.1)',
    alignSelf: 'stretch',
    marginTop: 4,
    overflow: 'hidden',
  },
  fill: { height: 8, borderRadius: 4, backgroundColor: ACCENT },
  foot: { fontFamily: font.medium, fontSize: 12, color: INK_SOFT, marginTop: 4, textAlign: 'center' },
});
