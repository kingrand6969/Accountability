import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsPro } from '../../pro/ProProvider';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { contentMaxWidth } from '../../ui/responsive';
import { font, radius, spacing } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import {
  RankRow,
  useCompetitionTheme,
  type CompetitionPalette,
} from '../../compete/CompeteUI';
import {
  getChallenge,
  getChallengeStandings,
  joinChallenge,
  leaveChallenge,
  metricMeta,
  type ChallengeCard,
  type StandingRow,
} from '../../compete/api';
import { MissionIcon } from '../../achievements/MissionIcon';
import { challengeEnded, daysLeft } from '../../achievements/challengeTime';
import { challengeArtFor } from '../../achievements/missionArt';
import { useAuth } from '../../auth/AuthProvider';
import { hasVerifiedChallengeWin } from '../../compete/challengeResult';

function fmtRange(startsAt: string, endsAt: string, checkedAt: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = new Date(startsAt).toLocaleDateString(undefined, opts);
  const e = new Date(endsAt).toLocaleDateString(undefined, opts);
  const left = daysLeft(endsAt, checkedAt);
  return `${s} – ${e} · ${left}`;
}

export default function ChallengeDetail() {
  const { palette } = useCompetitionTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const { isPro } = useIsPro();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const [challenge, setChallenge] = useState<ChallengeCard | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [challengeCheckedAt, setChallengeCheckedAt] = useState(0);

  const load = useCallback(() => {
    if (!id) return;
    setFailed(false);
    Promise.all([getChallenge(id), getChallengeStandings(id)])
      .then(([c, s]) => {
        setChallengeCheckedAt(Date.now());
        setChallenge(c);
        setStandings(s);
      })
      .catch(() => setFailed(true)) // a fetch error is NOT the same as "deleted"
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(load);

  async function onChallengeFriend() {
    if (!challenge) return;
    if (!isPro) {
      router.push('/paywall' as never);
      return;
    }
    const days = Math.max(
      1,
      Math.round(
        (new Date(challenge.ends_at).getTime() - new Date(challenge.starts_at).getTime()) /
          86400000,
      ),
    );
    const meta = metricMeta(challenge.metric);
    try {
      await Share.share({
        message:
          `I'm challenging you: "${challenge.title}" — ${days} days of ${meta.label.toLowerCase()} ` +
          `on AccountAbility. Get the app, add me as a buddy and join the challenge. ` +
          `Think you can beat me? 🏆`,
      });
    } catch {
      showToast('Sharing is available on your phone');
    }
  }

  async function toggle() {
    if (!challenge) return;
    setBusy(true);
    try {
      if (challenge.joined) await leaveChallenge(challenge.id);
      else await joinChallenge(challenge.id);
      showToast(challenge.joined ? 'Left the challenge' : 'Joined — go compete! 🏆');
      load();
    } catch (e) {
      Alert.alert('Could not update', String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <GlassBackdrop ref={bgRef} columnWidth={colMax} />
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={[styles.screen, styles.center]}>
        <GlassBackdrop ref={bgRef} columnWidth={colMax} />
        <Text style={styles.gone}>
          {failed ? "Couldn't load this challenge." : 'This challenge no longer exists.'}
        </Text>
        {failed ? (
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
            onPress={() => {
              setLoading(true);
              load();
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const meta = metricMeta(challenge.metric);
  const ended = challengeEnded(challenge.ends_at, challengeCheckedAt);
  const verifiedWin = ended && hasVerifiedChallengeWin(
    session?.user.id ?? null,
    challenge.participants,
    standings,
  );

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: colMax }]}>
        <GlassCard style={styles.hero}>
          <View style={styles.heroPad}>
            {(() => {
              const art = challengeArtFor(challenge.metric);
              return art ? (
                <MissionIcon source={art} size={64} style={{ marginBottom: 4 }} />
              ) : (
                <View style={styles.iconWrap}>
                  <Ionicons name={meta.icon as never} size={28} color={palette.accent} />
                </View>
              );
            })()}
            <Text style={styles.title}>{challenge.title}</Text>
            <Text style={styles.meta}>
              {meta.label} · {challenge.participants} competing
            </Text>
            <Text style={styles.range}>
              {fmtRange(challenge.starts_at, challenge.ends_at, challengeCheckedAt)}
            </Text>
            {ended ? (
              <>
                <View style={[styles.joinBtn, styles.endedBtn]}>
                  <Text style={styles.endedText}>Challenge ended</Text>
                </View>
                {verifiedWin ? (
                  <Pressable
                    style={({ pressed }) => [styles.inviteBtn, pressed && styles.pressed]}
                    onPress={() => router.push({
                      pathname: '/win-card',
                      params: {
                        achievementKind: 'challenge',
                        achievementSourceId: challenge.id,
                        achievementTitle: challenge.title,
                        autoPrompt: '1',
                      },
                    } as never)}
                    accessibilityRole="button"
                    accessibilityLabel="Flex this challenge win"
                  >
                    <Ionicons name="trophy-outline" size={15} color={palette.accent} />
                    <Text style={styles.inviteText}>Flex this win</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.joinBtn,
                  challenge.joined && styles.leaveBtn,
                  pressed && styles.pressed,
                ]}
                onPress={toggle}
                disabled={busy}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator
                    color={challenge.joined ? palette.inkSoft : palette.onAccent}
                  />
                ) : (
                  <Text style={challenge.joined ? styles.leaveText : styles.joinText}>
                    {challenge.joined ? 'Leave challenge' : 'Join challenge'}
                  </Text>
                )}
              </Pressable>
            )}
            {!ended ? (
              <Pressable
                style={({ pressed }) => [styles.inviteBtn, pressed && styles.pressed]}
                onPress={onChallengeFriend}
                accessibilityRole="button"
                accessibilityLabel="Challenge a friend on another app"
              >
                <Ionicons
                  name={isPro ? 'share-social' : 'lock-closed'}
                  size={15}
                  color={palette.accent}
                />
                <Text style={styles.inviteText}>
                  {isPro ? 'Challenge a friend — share anywhere' : 'Challenge a friend — Pro'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </GlassCard>

        <Text style={styles.section}>Standings</Text>
        <GlassCard style={styles.card}>
          <View style={styles.listPad}>
            {standings.length === 0 ? (
              <Text style={styles.empty}>No one has scored yet. Be the first to log something!</Text>
            ) : (
              standings.map((r) => (
                <RankRow
                  key={r.user_id}
                  rank={r.rnk}
                  name={r.display_name}
                  avatar={r.avatar_url}
                  score={r.score}
                  metric={challenge.metric}
                />
              ))
            )}
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const createStyles = (palette: CompetitionPalette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  gone: { fontFamily: font.medium, color: palette.inkSoft, fontSize: 15, textAlign: 'center' },
  retryBtn: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 24,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { color: palette.onAccent, fontFamily: font.bold, fontSize: 14 },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  pressed: { opacity: 0.7 },
  hero: {},
  heroPad: { padding: spacing.lg, alignItems: 'center', gap: 6 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.subtleAccent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { fontFamily: font.extrabold, fontSize: 20, color: palette.ink, textAlign: 'center' },
  meta: { fontFamily: font.semibold, fontSize: 13.5, color: palette.accent, textAlign: 'center' },
  range: { fontFamily: font.medium, fontSize: 12.5, color: palette.inkSoft, marginBottom: 8, textAlign: 'center' },
  joinBtn: {
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 28,
    minHeight: spacing.touch,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  joinText: { color: palette.onAccent, fontFamily: font.bold, fontSize: 15 },
  leaveBtn: { backgroundColor: palette.faintInk },
  leaveText: { color: palette.inkSoft, fontFamily: font.bold, fontSize: 15 },
  endedBtn: { backgroundColor: palette.quietInk },
  endedText: { color: palette.inkSoft, fontFamily: font.bold, fontSize: 15 },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: palette.accentBorderStrong,
    backgroundColor: palette.faintAccent,
    borderRadius: radius.pill,
    paddingVertical: 11,
    alignSelf: 'stretch',
    minHeight: spacing.touch,
    marginTop: 6,
  },
  inviteText: { flexShrink: 1, color: palette.accent, fontFamily: font.bold, fontSize: 13.5, textAlign: 'center' },
  section: { fontFamily: font.bold, fontSize: 15, color: palette.ink, marginTop: 4, marginLeft: 4 },
  card: {},
  listPad: { padding: spacing.sm, gap: 2 },
  empty: { fontFamily: font.medium, fontSize: 13.5, color: palette.inkSoft, textAlign: 'center', paddingVertical: 16 },
});
