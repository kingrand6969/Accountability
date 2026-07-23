import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../ui/Glass';
import { SwipeDeck } from './SwipeDeck';
import { metricMeta, type ChallengeCard } from '../compete/api';
import { MissionIcon } from './MissionIcon';
import { challengeArtFor } from './missionArt';
import { font, radius, spacing } from '../ui/theme';
import { INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';

function daysLeft(ends: string): string {
  const ms = new Date(ends).getTime() - Date.now();
  if (ms <= 0) return 'Ended';
  const d = Math.ceil(ms / 86400000);
  return d === 1 ? '1 day left' : `${d} days left`;
}

/** The member's live challenges, previewed as a swipeable deck on the Trophy Case. */
export function ChallengesCarousel({
  items,
  onOpen,
  onBrowse,
}: {
  items: ChallengeCard[] | null;
  onOpen: (id: string) => void;
  onBrowse: () => void;
}) {
  if (items === null) {
    return (
      <GlassCard>
        <View style={styles.inner}>
          <ActivityIndicator color={ACCENT} />
        </View>
      </GlassCard>
    );
  }

  if (items.length === 0) {
    return (
      <GlassCard>
        <View style={styles.inner}>
          <View style={styles.iconWrap}>
            <Ionicons name="trophy" size={22} color={ACCENT} />
          </View>
          <Text style={styles.title}>No active challenges</Text>
          <Text style={styles.sub}>
            Compete in step, distance &amp; workout challenges with people near you.
          </Text>
          <Pressable
            onPress={onBrowse}
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Browse challenges</Text>
          </Pressable>
        </View>
      </GlassCard>
    );
  }

  return (
    <SwipeDeck
      count={items.length}
      ariaUnit="challenge"
      itemLabel={(i) => `Open ${items[i].title}`}
      renderItem={(i) => <ChallengePage c={items[i]} onOpen={onOpen} />}
    />
  );
}

function ChallengePage({ c, onOpen }: { c: ChallengeCard; onOpen: (id: string) => void }) {
  const meta = metricMeta(c.metric);
  const ended = new Date(c.ends_at).getTime() <= Date.now();
  return (
    <GlassCard>
      <Pressable
        onPress={() => onOpen(c.id)}
        style={({ pressed }) => [styles.inner, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${c.title}`}
      >
        {(() => {
          const art = challengeArtFor(c.metric);
          return art ? (
            <MissionIcon source={art} size={56} style={{ marginBottom: 2 }} />
          ) : (
            <View style={styles.iconWrap}>
              <Ionicons name={meta.icon as never} size={22} color={ACCENT} />
            </View>
          );
        })()}
        <Text style={styles.title} numberOfLines={2}>
          {c.title}
        </Text>
        <Text style={styles.meta}>
          {meta.label} · {c.participants} in · {daysLeft(c.ends_at)}
        </Text>
        <View style={[styles.pill, c.joined && styles.pillJoined]}>
          <Text style={c.joined ? styles.pillJoinedText : styles.pillText}>
            {ended ? 'View results' : c.joined ? "You're in ✓" : 'Tap to join'}
          </Text>
        </View>
      </Pressable>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  inner: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
    minHeight: 168,
    justifyContent: 'center',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(37,99,235,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: { fontFamily: font.bold, fontSize: 16, color: INK, textAlign: 'center' },
  meta: { fontFamily: font.medium, fontSize: 12.5, color: INK_SOFT, textAlign: 'center' },
  sub: { fontFamily: font.regular, fontSize: 13, color: INK_SOFT, textAlign: 'center', lineHeight: 18 },
  btn: {
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 6,
  },
  btnText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  pill: {
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  pillText: { color: ACCENT, fontFamily: font.bold, fontSize: 13 },
  pillJoined: { backgroundColor: 'rgba(22,163,74,0.14)' },
  pillJoinedText: { color: '#16a34a', fontFamily: font.bold, fontSize: 13 },
});
