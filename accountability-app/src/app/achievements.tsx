import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassBackdrop } from '../ui/Glass';
import { contentMaxWidth } from '../ui/responsive';
import { hapticSuccess } from '../ui/haptics';
import { showToast } from '../ui/Toast';
import { font, radius, spacing } from '../ui/theme';
import { INK, INK_SOFT, ACCENT } from '../compete/CompeteUI';
import { Medal } from '../achievements/Medal';
import { RankCarousel } from '../achievements/RankCarousel';
import { ChallengesCarousel } from '../achievements/ChallengesCarousel';
import { MissionsList } from '../achievements/MissionsList';
import { Confetti } from '../achievements/Confetti';
import { getMetrics, getMissionProgress, buildMissionStates, flexRank } from '../achievements/api';
import { listChallenges, type ChallengeCard } from '../compete/api';
import {
  MEDALS,
  TIER_META,
  flexPoints,
  medalMetal,
  medalState,
  rankFor,
  type MedalState,
} from '../achievements/catalog';
import { missionPoints, type MissionState } from '../achievements/missions';

const SEEN_KEY = 'achievements:seen:v1';

export default function Achievements() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const [states, setStates] = useState<MedalState[] | null>(null);
  const [selected, setSelected] = useState<MedalState | null>(null);
  const [unlock, setUnlock] = useState<MedalState | null>(null);
  const [challenges, setChallenges] = useState<ChallengeCard[] | null>(null);
  const [missions, setMissions] = useState<MissionState[] | null>(null);
  const [flexing, setFlexing] = useState(false);

  const load = useCallback(() => {
    listChallenges()
      .then(setChallenges)
      .catch(() => setChallenges([]));
    Promise.all([getMetrics(), getMissionProgress()])
      .then(async ([m, progress]) => {
        const list = MEDALS.map((def) => medalState(def, m[def.metric]));
        setStates(list);
        setMissions(buildMissionStates(m, progress));
        // celebrate a fresh unlock (or the best one on first ever visit)
        try {
          const raw = await AsyncStorage.getItem(SEEN_KEY);
          const seen: Record<string, number> | null = raw ? JSON.parse(raw) : null;
          let toCelebrate: MedalState | null = null;
          if (seen === null) {
            toCelebrate = list.filter((s) => s.unlocked).sort((a, b) => b.tierIndex - a.tierIndex)[0] ?? null;
          } else {
            toCelebrate = list.find((s) => s.unlocked && s.tierIndex > (seen[s.def.id] ?? -1)) ?? null;
          }
          const current: Record<string, number> = {};
          list.forEach((s) => (current[s.def.id] = s.tierIndex));
          await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(current));
          if (toCelebrate) {
            hapticSuccess();
            setUnlock(toCelebrate);
          }
        } catch {
          // celebration is non-critical
        }
      })
      .catch(() => {
        setStates(MEDALS.map((def) => medalState(def, 0)));
        setMissions(
          buildMissionStates(
            {
              streak: 0,
              totalKm: 0,
              workouts: 0,
              challenges: 0,
              buddies: 0,
              activities: 0,
              longestKm: 0,
              activeDays: 0,
              challengeWins: 0,
              memories: 0,
              goalsHit: 0,
              totalHours: 0,
              places: 0,
              invitesAccepted: 0,
              postsShared: 0,
              likesGiven: 0,
              groupsJoined: 0,
              buddyMessages: 0,
              profileFields: 0,
            },
            new Map(),
          ),
        );
      });
  }, []);

  useFocusEffect(load);

  const points = (states ? flexPoints(states) : 0) + (missions ? missionPoints(missions) : 0);
  const earned = states ? states.filter((s) => s.unlocked).length : 0;

  async function onFlex() {
    if (flexing) return;
    setFlexing(true);
    try {
      await flexRank(rankFor(points).name);
      hapticSuccess();
      showToast('Flexed to your buddies 💪');
      load();
    } catch (e) {
      Alert.alert('Could not post your flex', String((e as Error).message ?? e));
    } finally {
      setFlexing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: colMax }]}>
        {/* rank ladder — swipe to preview every rank up to Mythical */}
        <RankCarousel points={points} ready={states !== null && missions !== null} />
        <Text style={styles.caption}>
          {earned} of {MEDALS.length} medals earned · swipe or tap ‹ › to preview ranks
        </Text>

        {/* missions — social & sharing actions (distinct from the fitness medals) */}
        <Text style={[styles.sectionLabel, styles.sectionTop]}>MISSIONS</Text>
        <Text style={styles.sectionHint}>Actions & social wins that earn Flex Points</Text>
        <MissionsList states={missions} onFlex={onFlex} flexing={flexing} />

        {/* live challenges — swipe through the competitions you can join */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>CHALLENGES</Text>
          <Pressable onPress={() => router.push('/compete' as never)} hitSlop={8}>
            <Text style={styles.seeAll}>See all ›</Text>
          </Pressable>
        </View>
        <ChallengesCarousel
          items={challenges}
          onOpen={(id) => router.push({ pathname: '/challenge/[id]', params: { id } })}
          onBrowse={() => router.push('/compete' as never)}
        />

        <Text style={[styles.sectionLabel, styles.sectionTop]}>MEDALS</Text>
        <Text style={styles.sectionHint}>Milestones from your training</Text>
        {states === null ? (
          <ActivityIndicator color={ACCENT} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.grid}>
            {states.map((s) => (
              <Pressable
                key={s.def.id}
                style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
                onPress={() => setSelected(s)}
                accessibilityRole="button"
                accessibilityLabel={`${s.def.title}, ${s.tierName ?? 'locked'}`}
              >
                <Medal state={s} size={86} />
                <Text style={styles.cellTitle} numberOfLines={1}>
                  {s.def.title}
                </Text>
                <Text style={[styles.cellTier, s.unlocked && { color: ACCENT }]} numberOfLines={1}>
                  {s.tierName ?? 'Locked'}
                </Text>
                <View style={styles.miniTrack}>
                  <View style={[styles.miniFill, { width: `${Math.round(s.progress * 100)}%` }]} />
                </View>
                <Text style={styles.cellNext} numberOfLines={1}>
                  {s.next ? `${fmt(s.value)}/${s.next.at} ${s.def.unit}` : 'Maxed out ✓'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* medal detail */}
      <MedalSheet
        state={selected}
        onClose={() => setSelected(null)}
        onShare={(s) => {
          setSelected(null);
          router.push(
            `/compose?text=${encodeURIComponent(`Just earned the ${s.tierName} ${s.def.title} medal 🏅`)}` as never,
          );
        }}
      />

      {/* unlock celebration */}
      <MedalSheet
        state={unlock}
        celebrate
        onClose={() => setUnlock(null)}
        onShare={(s) => {
          setUnlock(null);
          router.push(
            `/compose?text=${encodeURIComponent(`Just earned the ${s.tierName} ${s.def.title} medal 🏅`)}` as never,
          );
        }}
      />
    </View>
  );
}

function MedalSheet({
  state,
  celebrate,
  onClose,
  onShare,
}: {
  state: MedalState | null;
  celebrate?: boolean;
  onClose: () => void;
  onShare: (s: MedalState) => void;
}) {
  return (
    <Modal visible={!!state} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {state ? (
            <>
              {celebrate ? <Confetti /> : null}
              <View style={styles.sheetMedal}>
                <Medal state={state} size={128} />
              </View>
              {celebrate ? <Text style={styles.unlockKicker}>Medal unlocked!</Text> : null}
              <Text style={styles.sheetTitle}>
                {state.tierName ? `${state.tierName} ${state.def.title}` : state.def.title}
              </Text>
              <Text style={styles.sheetBlurb}>{state.def.blurb}</Text>

              <View style={styles.ladder}>
                {state.def.tiers.map((t, i) => {
                  const done = i <= state.tierIndex;
                  return (
                    <View key={t.name} style={styles.ladderRow}>
                      <View style={[styles.ladderDot, { backgroundColor: done ? TIER_META[medalMetal(state.def, i)].base : 'rgba(30,27,75,0.12)' }]} />
                      <Text style={[styles.ladderName, done && { color: INK, fontFamily: font.bold }]}>
                        {t.name}
                      </Text>
                      <Text style={styles.ladderAt}>
                        {t.at} {state.def.unit}
                        {done ? '  ✓' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>

              {state.unlocked ? (
                <Pressable
                  style={({ pressed }) => [styles.shareBtn, pressed && styles.pressed]}
                  onPress={() => onShare(state)}
                  accessibilityRole="button"
                >
                  <Text style={styles.shareText}>Post as a Flex</Text>
                </Pressable>
              ) : (
                <Text style={styles.lockedHint}>
                  {state.next ? `${state.next.at - Math.floor(state.value)} more ${state.def.unit} to unlock` : ''}
                </Text>
              )}
              <Pressable onPress={onClose} style={styles.doneBtn} accessibilityLabel="Close">
                <Text style={styles.doneText}>{celebrate ? 'Nice!' : 'Close'}</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function fmt(n: number): string {
  return n >= 100 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString();
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  pressed: { opacity: 0.75 },
  caption: {
    fontFamily: font.medium,
    fontSize: 12,
    color: INK_SOFT,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sectionLabel: { fontFamily: font.extrabold, fontSize: 12, letterSpacing: 1.2, color: INK },
  sectionHint: { fontFamily: font.regular, fontSize: 12, color: INK_SOFT, marginTop: 2, marginBottom: 8 },
  sectionTop: { marginTop: spacing.md },
  seeAll: { fontFamily: font.bold, fontSize: 13, color: ACCENT },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  cell: {
    width: 152,
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cellTitle: { fontFamily: font.bold, fontSize: 14, color: INK, marginTop: 4 },
  cellTier: { fontFamily: font.semibold, fontSize: 12, color: INK_SOFT },
  miniTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(30,27,75,0.1)',
    alignSelf: 'stretch',
    marginTop: 2,
    overflow: 'hidden',
  },
  miniFill: { height: 5, borderRadius: 3, backgroundColor: ACCENT },
  cellNext: { fontFamily: font.medium, fontSize: 11, color: INK_SOFT },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  sheetMedal: { marginVertical: spacing.sm },
  unlockKicker: {
    fontFamily: font.extrabold,
    fontSize: 13,
    color: ACCENT,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 20, color: INK, textAlign: 'center' },
  sheetBlurb: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: INK_SOFT,
    textAlign: 'center',
    lineHeight: 19,
  },
  ladder: { alignSelf: 'stretch', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  ladderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ladderDot: { width: 10, height: 10, borderRadius: 5 },
  ladderName: { flex: 1, fontFamily: font.medium, fontSize: 13.5, color: INK_SOFT },
  ladderAt: { fontFamily: font.semibold, fontSize: 12.5, color: INK_SOFT },
  shareBtn: {
    alignSelf: 'stretch',
    backgroundColor: ACCENT,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  shareText: { color: '#fff', fontFamily: font.bold, fontSize: 15 },
  lockedHint: { fontFamily: font.medium, fontSize: 13, color: INK_SOFT, textAlign: 'center', marginTop: 4 },
  doneBtn: { paddingVertical: 10, paddingHorizontal: 20, marginTop: 2 },
  doneText: { fontFamily: font.bold, fontSize: 14, color: INK_SOFT },
});
