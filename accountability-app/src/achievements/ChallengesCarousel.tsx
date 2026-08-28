import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassCard } from '../ui/Glass';
import { useAppTheme } from '../ui/AppThemeProvider';
import { SwipeDeck } from './SwipeDeck';
import { metricMeta, type ChallengeCard } from '../compete/api';
import { MissionIcon } from './MissionIcon';
import { challengeArtFor } from './missionArt';
import { challengeEnded, daysLeft } from './challengeTime';
import { font, radius, spacing, type AppThemeColors } from '../ui/theme';

const MINUTE_MS = 60_000;

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
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => challengePalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), MINUTE_MS);
    return () => clearInterval(interval);
  }, []);

  if (items === null) {
    return (
      <GlassCard plateOpacity={0}>
        <View style={styles.inner}>
          <ActivityIndicator color={palette.action} />
        </View>
      </GlassCard>
    );
  }

  if (items.length === 0) {
    return (
      <GlassCard plateOpacity={0}>
        <View style={styles.inner}>
          <View style={styles.iconWrap}>
            <Ionicons name="trophy" size={22} color={palette.action} />
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
      renderItem={(i) => <ChallengePage c={items[i]} now={now} onOpen={onOpen} />}
    />
  );
}

function ChallengePage({ c, now, onOpen }: { c: ChallengeCard; now: number; onOpen: (id: string) => void }) {
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => challengePalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
  const meta = metricMeta(c.metric);
  const ended = challengeEnded(c.ends_at, now);
  return (
    <GlassCard plateOpacity={0}>
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
              <Ionicons name={meta.icon as never} size={22} color={palette.action} />
            </View>
          );
        })()}
        <Text style={styles.title}>
          {c.title}
        </Text>
        <Text style={styles.meta}>
          {meta.label} · {c.participants} in · {daysLeft(c.ends_at, now)}
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

function challengePalette(theme: AppThemeColors) {
  return {
    ink: theme.ink.primary,
    muted: theme.ink.muted,
    action: theme.ink.action,
    actionInk: theme.ink.inverse,
    success: theme.status.success,
    icon: theme.surface.muted,
    pill: theme.surface.muted,
    pillJoined: theme.status.successSoft,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = challengePalette(theme);

  return StyleSheet.create({
  inner: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: 6,
    minHeight: 168,
    justifyContent: 'center',
    backgroundColor: theme.surface.card,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.icon,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: { fontFamily: font.bold, fontSize: 16, color: palette.ink, textAlign: 'center' },
  meta: { fontFamily: font.medium, fontSize: 12.5, color: palette.muted, textAlign: 'center' },
  sub: { fontFamily: font.regular, fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 18 },
  btn: {
    minHeight: spacing.touch,
    backgroundColor: palette.action,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 6,
  },
  btnText: { color: palette.actionInk, fontFamily: font.bold, fontSize: 14 },
  pill: {
    backgroundColor: palette.pill,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  pillText: { color: palette.action, fontFamily: font.bold, fontSize: 13 },
  pillJoined: { backgroundColor: palette.pillJoined },
  pillJoinedText: { color: palette.success, fontFamily: font.bold, fontSize: 13 },
  });
}
