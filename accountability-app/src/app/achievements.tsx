import { useCallback, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  RANKS,
  TIER_META,
  flexPoints,
  medalMetal,
  medalState,
  prestigeState,
  rankFor,
  type MedalState,
} from '../achievements/catalog';
import { missionPoints, type MissionState } from '../achievements/missions';

const SEEN_KEY = 'achievements:seen:v1';

export default function Achievements() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
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
  const currentRank = rankFor(points);
  const level = Math.max(1, RANKS.findIndex((item) => item.name === currentRank.name) + 1);
  const consistency = states?.find((state) => state.def.id === 'devotion')?.value ?? 0;
  const featured = states
    ?.slice()
    .sort((a, b) => (b.unlocked ? b.tierIndex + 1 : 0) - (a.unlocked ? a.tierIndex + 1 : 0))
    .slice(0, 3) ?? [];
  const medalCellWidth = Math.max(
    142,
    Math.min(176, (colMax - spacing.lg * 2 - spacing.md) / 2),
  );

  async function onFlex() {
    if (flexing) return;
    setFlexing(true);
    try {
      await flexRank(rankFor(points).name);
      hapticSuccess();
      showToast('Shared with your buddies');
      load();
    } catch (e) {
      Alert.alert('Could not post your flex', String((e as Error).message ?? e));
    } finally {
      setFlexing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scroll, { maxWidth: colMax }]}>
        <View style={styles.editorialHeader}>
          <Text style={styles.eyebrow}>YOUR TROPHY CASE</Text>
          <Text style={styles.pageTitle}>Momentum Builder</Text>
          <Text style={styles.pageSubtitle}>
            A record of the days you kept your promise - never a shortcut.
          </Text>
        </View>

        <View style={styles.rankPanel}>
          <View style={styles.rankTop}>
            <View style={styles.levelSeal}>
              <Text style={styles.levelValue}>{level}</Text>
            </View>
            <View style={styles.rankCopy}>
              <Text style={styles.rankName}>{currentRank.name}</Text>
              <Text style={styles.rankPoints}>{points.toLocaleString()} XP</Text>
            </View>
            <Pressable
              onPress={() => router.push('/activity' as never)}
              style={({ pressed }) => [styles.pathLink, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Open your Journey path"
            >
              <Text style={styles.pathLinkText}>View path</Text>
            </Pressable>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.max(3, Math.round(currentRank.progress * 100))}%` }]} />
          </View>
          <Text style={styles.xpHint}>
            {currentRank.next
              ? `${Math.max(0, currentRank.next.at - points).toLocaleString()} XP to ${currentRank.next.name}`
              : 'Highest momentum rank reached'}
          </Text>
        </View>
        {/* rank ladder — swipe to preview every rank up to Mythical */}
        <RankCarousel points={points} ready={states !== null && missions !== null} />
        <Text style={styles.caption}>
          {earned} of {MEDALS.length} medals earned - swipe or tap to preview ranks
        </Text>

        {/* missions — social & sharing actions (distinct from the fitness medals) */}
        <View style={styles.collectionSummary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{earned}</Text>
            <Text style={styles.summaryLabel}>Earned</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{points.toLocaleString()}</Text>
            <Text style={styles.summaryLabel}>Flex Points</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue} numberOfLines={1}>{currentRank.name}</Text>
            <Text style={styles.summaryLabel}>Current rank</Text>
          </View>
        </View>

        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>FEATURED MEDALS</Text>
          <Text style={styles.seeAll}>{earned} earned</Text>
        </View>
        <View style={styles.featuredRow}>
          {featured.map((state) => (
            <Pressable
              key={state.def.id}
              onPress={() => setSelected(state)}
              style={({ pressed }) => [styles.featuredMedal, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`${state.def.title}, ${state.tierName ?? 'locked'}`}
            >
              <Medal state={state} size={72} />
              <Text style={styles.featuredMetal}>
                {state.unlocked ? TIER_META[medalMetal(state.def, state.tierIndex)].name : 'Locked'}
              </Text>
              <Text style={styles.featuredName} numberOfLines={1}>{state.def.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.consistencyCard}>
          <View style={styles.consistencyHeader}>
            <View>
              <Text style={styles.sectionLabel}>CONSISTENCY</Text>
              <Text style={styles.consistencyValue}>{Math.floor(consistency)}</Text>
            </View>
            <View style={styles.consistencyCopy}>
              <Text style={styles.consistencyTitle}>of 100 consistent days</Text>
              <Text style={styles.consistencyHint}>
                {consistency >= 100
                  ? 'Milestone reached - keep building.'
                  : 'Your next lasting milestone is 100 days.'}
              </Text>
            </View>
            <Ionicons
              name="medal-outline"
              size={42}
              color={consistency >= 100 ? '#C08214' : '#9AA6B4'}
            />
          </View>
          <View style={styles.longTrack}>
            <View style={[styles.longFill, { width: `${Math.min(100, Math.round(consistency))}%` }]} />
          </View>
        </View>

        <Text style={[styles.sectionLabel, styles.sectionTop]}>PRESTIGE PATH</Text>
        <Text style={styles.sectionHint}>Built for years of showing up, not a month of activity.</Text>
        <View style={styles.prestigePath}>
          {[
            { label: '1 Year', detail: '365 days', at: 365 },
            { label: '500 Days', detail: 'Steadfast', at: 500 },
            { label: '1,000 Days', detail: 'Legendary', at: 1000 },
            { label: 'Legacy', detail: '5+ years', at: 1825 },
          ].map((milestone, index) => {
            const reached = consistency >= milestone.at;
            return (
              <View key={milestone.label} style={styles.prestigeItem}>
                <View style={[styles.prestigeMedallion, reached && styles.prestigeMedallionReached]}>
                  <Ionicons
                    name={reached ? 'checkmark' : 'lock-closed'}
                    size={20}
                    color={reached ? '#fff' : '#7C8796'}
                  />
                </View>
                <View style={styles.prestigeCopy}>
                  <Text style={styles.prestigeLabel}>{milestone.label}</Text>
                  <Text style={styles.prestigeDetail}>
                    {milestone.detail} - {reached ? 'Earned' : 'Not reached'}
                  </Text>
                </View>
                {index < 3 ? <View style={styles.prestigeConnector} /> : null}
              </View>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionTop]}>MISSIONS</Text>
        <Text style={styles.sectionHint}>Actions & social wins that earn Flex Points</Text>
        <MissionsList states={missions} onFlex={onFlex} flexing={flexing} />

        {/* live challenges — swipe through the competitions you can join */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>CHALLENGES</Text>
          <Pressable
            onPress={() => router.push('/compete' as never)}
            style={({ pressed }) => [styles.seeAllButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="See all challenges"
          >
            <Text style={styles.seeAll}>See all</Text>
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
                style={({ pressed }) => [
                  styles.cell,
                  {
                    width: medalCellWidth,
                    borderColor: s.unlocked
                      ? TIER_META[medalMetal(s.def, s.tierIndex)].base
                      : 'rgba(148,163,184,0.34)',
                  },
                  pressed && styles.pressed,
                ]}
                onPress={() => setSelected(s)}
                accessibilityRole="button"
                accessibilityLabel={`${s.def.title}, ${s.tierName ?? 'locked'}, ${Math.round(s.progress * 100)} percent progress`}
                accessibilityHint="Opens medal details and the full tier ladder"
              >
                <LinearGradient
                  pointerEvents="none"
                  colors={
                    s.unlocked
                      ? [
                          `${TIER_META[medalMetal(s.def, s.tierIndex)].light}42`,
                          `${TIER_META[medalMetal(s.def, s.tierIndex)].base}12`,
                          'rgba(255,255,255,0)',
                        ]
                      : [
                          'rgba(226,232,240,0.72)',
                          'rgba(248,250,252,0.18)',
                          'rgba(255,255,255,0)',
                        ]
                  }
                  style={styles.cellGlow}
                />
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusChip,
                      {
                        backgroundColor: s.unlocked
                          ? `${TIER_META[medalMetal(s.def, s.tierIndex)].base}22`
                          : 'rgba(100,116,139,0.1)',
                      },
                    ]}
                  >
                    <Ionicons
                      name={s.unlocked ? 'checkmark-circle' : 'lock-closed'}
                      size={13}
                      color={
                        s.unlocked
                          ? TIER_META[medalMetal(s.def, s.tierIndex)].dark
                          : '#64748b'
                      }
                    />
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: s.unlocked
                            ? TIER_META[medalMetal(s.def, s.tierIndex)].dark
                            : '#64748b',
                        },
                      ]}
                    >
                      {s.unlocked
                        ? TIER_META[medalMetal(s.def, s.tierIndex)].name
                        : 'Locked'}
                    </Text>
                  </View>
                  {prestigeState(s.def, s.value).rings > 0 ? (
                    <View style={styles.prestigeChip}>
                      <Ionicons name="sparkles" size={12} color="#6d28d9" />
                      <Text style={styles.prestigeText}>
                        P{prestigeState(s.def, s.value).rings}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.medalStage,
                    s.unlocked && {
                      shadowColor: TIER_META[medalMetal(s.def, s.tierIndex)].glow,
                    },
                  ]}
                >
                  <Medal state={s} size={92} />
                </View>
                <Text style={styles.cellTitle} numberOfLines={1}>
                  {s.def.title}
                </Text>
                <Text style={[styles.cellTier, s.unlocked && { color: ACCENT }]} numberOfLines={1}>
                  {s.tierName ?? 'Locked'}
                  {prestigeState(s.def, s.value).rings > 0
                    ? ` - Prestige ${prestigeState(s.def, s.value).rings}`
                    : ''}
                </Text>
                <View style={styles.miniTrack}>
                  <View style={[styles.miniFill, { width: `${Math.round(s.progress * 100)}%` }]} />
                </View>
                <Text style={styles.cellNext} numberOfLines={1}>
                  {s.next ? `${fmt(s.value)}/${s.next.at} ${s.def.unit}` : 'Maxed out'}
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
            `/compose?text=${encodeURIComponent(`Just earned the ${s.tierName} ${s.def.title} medal`)}` as never,
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
            `/compose?text=${encodeURIComponent(`Just earned the ${s.tierName} ${s.def.title} medal`)}` as never,
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
                        {done ? '  Earned' : ''}
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
              <Pressable
                onPress={onClose}
                style={styles.doneBtn}
                accessibilityRole="button"
                accessibilityLabel="Close Trophy Case details"
              >
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
  screen: { flex: 1, backgroundColor: '#F7F4EC' },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  pressed: { opacity: 0.75 },
  editorialHeader: { paddingTop: 4, paddingBottom: 2 },
  eyebrow: { color: '#155EEF', fontFamily: font.bold, fontSize: 10.5, letterSpacing: 1.5 },
  pageTitle: { marginTop: 5, color: '#081A3A', fontFamily: font.bold, fontSize: 29, letterSpacing: -0.7 },
  pageSubtitle: { marginTop: 4, color: '#647084', fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  rankPanel: { borderWidth: 1, borderColor: '#DED9CC', borderRadius: 18, backgroundColor: '#FFFCF6', padding: 15 },
  rankTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  levelSeal: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#081A3A', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#A9B4C8' },
  levelValue: { color: '#fff', fontFamily: font.extrabold, fontSize: 17 },
  rankCopy: { flex: 1 },
  rankName: { color: '#081A3A', fontFamily: font.bold, fontSize: 17 },
  rankPoints: { marginTop: 2, color: '#647084', fontFamily: font.medium, fontSize: 11.5 },
  pathLink: { minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  pathLinkText: { color: '#155EEF', fontFamily: font.bold, fontSize: 12 },
  xpTrack: { marginTop: 13, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: '#DDE4EF' },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: '#155EEF' },
  xpHint: { marginTop: 6, color: '#647084', fontFamily: font.medium, fontSize: 10.5, textAlign: 'right' },
  featuredRow: { flexDirection: 'row', gap: 8 },
  featuredMedal: { flex: 1, minHeight: 142, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DED9CC', borderRadius: 16, backgroundColor: '#FFFCF6', padding: 8 },
  featuredMetal: { marginTop: 2, color: '#081A3A', fontFamily: font.bold, fontSize: 10.5, textTransform: 'uppercase' },
  featuredName: { marginTop: 2, color: '#647084', fontFamily: font.medium, fontSize: 9.5, maxWidth: '100%' },
  consistencyCard: { borderWidth: 1, borderColor: '#DED9CC', borderRadius: 18, backgroundColor: '#FFFCF6', padding: 15 },
  consistencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  consistencyValue: { marginTop: 3, color: '#081A3A', fontFamily: font.bold, fontSize: 32 },
  consistencyCopy: { flex: 1 },
  consistencyTitle: { color: '#081A3A', fontFamily: font.semibold, fontSize: 13 },
  consistencyHint: { marginTop: 3, color: '#647084', fontFamily: font.regular, fontSize: 10.5, lineHeight: 15 },
  longTrack: { marginTop: 12, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#DDE4EF' },
  longFill: { height: '100%', borderRadius: 3, backgroundColor: '#155EEF' },
  prestigePath: { borderWidth: 1, borderColor: '#DED9CC', borderRadius: 18, backgroundColor: '#FFFCF6', padding: 14, gap: 4 },
  prestigeItem: { minHeight: 62, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  prestigeMedallion: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: '#BCC3CD', backgroundColor: '#E8E9EA', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  prestigeMedallionReached: { borderColor: '#C08214', backgroundColor: '#C08214' },
  prestigeCopy: { marginLeft: 12, flex: 1 },
  prestigeLabel: { color: '#081A3A', fontFamily: font.bold, fontSize: 13.5 },
  prestigeDetail: { marginTop: 2, color: '#647084', fontFamily: font.regular, fontSize: 10.5 },
  prestigeConnector: { position: 'absolute', left: 20, top: 50, width: 2, height: 20, backgroundColor: '#D3D6DA' },
  caption: {
    fontFamily: font.medium,
    fontSize: 12,
    color: INK_SOFT,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  collectionSummary: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: spacing.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  summaryValue: { color: INK, fontFamily: font.extrabold, fontSize: 17 },
  summaryLabel: {
    color: INK_SOFT,
    fontFamily: font.medium,
    fontSize: 10.5,
    marginTop: 3,
  },
  summaryDivider: { width: 1, height: 34, backgroundColor: 'rgba(30,27,75,0.1)' },
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
  seeAllButton: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  cell: {
    minHeight: 252,
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  cellGlow: { position: 'absolute', left: 0, top: 0, right: 0, height: 122 },
  statusRow: {
    minHeight: 27,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusChip: {
    minHeight: 25,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: { fontFamily: font.bold, fontSize: 10.5 },
  prestigeChip: {
    minHeight: 25,
    paddingHorizontal: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(124,58,237,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  prestigeText: { color: '#6d28d9', fontFamily: font.extrabold, fontSize: 10 },
  medalStage: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
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
