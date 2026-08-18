import { useCallback, useMemo, useState } from 'react';
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
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
  type AppThemeMode,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import { ACCENT } from '../compete/CompeteUI';
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
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => trophyPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);
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
              color={consistency >= 100 ? '#C08214' : palette.consistencyLockedInk}
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
                    color={reached ? '#fff' : palette.prestigeLockedIcon}
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
          <ActivityIndicator color={palette.accent} style={{ marginTop: 40 }} />
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
                      : palette.lockedBorder,
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
                          palette.medalFade,
                        ]
                      : [
                          palette.lockedGlowStrong,
                          palette.lockedGlowSoft,
                          palette.medalFade,
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
                          : palette.lockedChip,
                      },
                    ]}
                  >
                    <Ionicons
                      name={s.unlocked ? 'checkmark-circle' : 'lock-closed'}
                      size={13}
                      color={
                        s.unlocked
                          ? mode === 'dark'
                            ? TIER_META[medalMetal(s.def, s.tierIndex)].light
                            : TIER_META[medalMetal(s.def, s.tierIndex)].dark
                          : palette.lockedInk
                      }
                    />
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: s.unlocked
                            ? mode === 'dark'
                              ? TIER_META[medalMetal(s.def, s.tierIndex)].light
                              : TIER_META[medalMetal(s.def, s.tierIndex)].dark
                            : palette.lockedInk,
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
                          <Ionicons name="sparkles" size={12} color={palette.prestigeInk} />
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
                <Text style={[styles.cellTier, s.unlocked && { color: palette.accent }]} numberOfLines={1}>
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
  const { colors: theme, mode } = useAppTheme();
  const palette = useMemo(() => trophyPalette(theme, mode), [theme, mode]);
  const styles = useMemo(() => createStyles(theme, mode), [theme, mode]);

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
                      <View style={[styles.ladderDot, { backgroundColor: done ? TIER_META[medalMetal(state.def, i)].base : palette.ladderLocked }]} />
                      <Text style={[styles.ladderName, done && { color: palette.glassInk, fontFamily: font.bold }]}>
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

function trophyPalette(theme: AppThemeColors, mode: AppThemeMode) {
  return {
    canvas: mode === 'dark' ? theme.surface.canvas : '#F7F4EC',
    card: mode === 'dark' ? theme.surface.card : '#FFFCF6',
    ink: mode === 'dark' ? theme.ink.primary : '#081A3A',
    muted: mode === 'dark' ? theme.ink.muted : '#647084',
    border: mode === 'dark' ? theme.border.subtle : '#DED9CC',
    consistencyLockedInk: mode === 'dark' ? theme.ink.muted : '#9AA6B4',
    ladderLocked: mode === 'dark' ? theme.border.strong : 'rgba(30,27,75,0.12)',
    prestigeLockedIcon: mode === 'dark' ? theme.ink.muted : '#7C8796',
    primary: mode === 'dark' ? theme.ink.action : '#155EEF',
    track: mode === 'dark' ? theme.interaction.skeleton : '#DDE4EF',
    levelSeal: mode === 'dark' ? theme.surface.raised : '#081A3A',
    levelInk: mode === 'dark' ? theme.ink.primary : '#fff',
    sealBorder: mode === 'dark' ? theme.border.strong : '#A9B4C8',
    lockedSurface: mode === 'dark' ? theme.surface.muted : '#E8E9EA',
    lockedSolidBorder: mode === 'dark' ? theme.border.strong : '#BCC3CD',
    connector: mode === 'dark' ? theme.border.subtle : '#D3D6DA',
    glassCard: mode === 'dark' ? theme.surface.card : 'rgba(255,255,255,0.78)',
    medalCard: mode === 'dark' ? theme.surface.card : 'rgba(255,255,255,0.82)',
    glassBorder: mode === 'dark' ? theme.border.subtle : 'rgba(255,255,255,0.92)',
    glassInk: mode === 'dark' ? theme.ink.primary : '#1e1b4b',
    glassMuted: mode === 'dark' ? theme.ink.muted : 'rgba(30,27,75,0.72)',
    glassDivider: mode === 'dark' ? theme.border.subtle : 'rgba(30,27,75,0.1)',
    accent: mode === 'dark' ? theme.ink.action : ACCENT,
    actionInk: mode === 'dark' ? theme.ink.inverse : '#fff',
    lockedBorder: mode === 'dark' ? theme.border.strong : 'rgba(148,163,184,0.34)',
    lockedChip: mode === 'dark' ? theme.surface.muted : 'rgba(100,116,139,0.1)',
    lockedInk: mode === 'dark' ? theme.ink.muted : '#64748b',
    lockedGlowStrong: mode === 'dark' ? theme.surface.muted : 'rgba(226,232,240,0.72)',
    lockedGlowSoft: mode === 'dark' ? theme.surface.card : 'rgba(248,250,252,0.18)',
    medalFade: mode === 'dark' ? 'rgba(13,27,46,0)' : 'rgba(255,255,255,0)',
    prestigeSurface: mode === 'dark' ? 'rgba(196,181,253,0.14)' : 'rgba(124,58,237,0.1)',
    prestigeInk: mode === 'dark' ? '#C4B5FD' : '#6d28d9',
    scrim: mode === 'dark' ? theme.interaction.scrim : 'rgba(15,23,42,0.55)',
    sheet: mode === 'dark' ? theme.surface.raised : '#fff',
  };
}

function createStyles(theme: AppThemeColors, mode: AppThemeMode) {
  const palette = trophyPalette(theme, mode);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60, width: '100%', alignSelf: 'center' },
  pressed: { opacity: 0.75 },
  editorialHeader: { paddingTop: 4, paddingBottom: 2 },
  eyebrow: { color: palette.primary, fontFamily: font.bold, fontSize: 10.5, letterSpacing: 1.5 },
  pageTitle: { marginTop: 5, color: palette.ink, fontFamily: font.bold, fontSize: 29, letterSpacing: -0.7 },
  pageSubtitle: { marginTop: 4, color: palette.muted, fontFamily: font.regular, fontSize: 13, lineHeight: 19 },
  rankPanel: { borderWidth: 1, borderColor: palette.border, borderRadius: 18, backgroundColor: palette.card, padding: 15 },
  rankTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  levelSeal: { width: 46, height: 46, borderRadius: 23, backgroundColor: palette.levelSeal, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: palette.sealBorder },
  levelValue: { color: palette.levelInk, fontFamily: font.extrabold, fontSize: 17 },
  rankCopy: { flex: 1 },
  rankName: { color: palette.ink, fontFamily: font.bold, fontSize: 17 },
  rankPoints: { marginTop: 2, color: palette.muted, fontFamily: font.medium, fontSize: 11.5 },
  pathLink: { minHeight: spacing.touch, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  pathLinkText: { color: palette.primary, fontFamily: font.bold, fontSize: 12 },
  xpTrack: { marginTop: 13, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.track },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: palette.primary },
  xpHint: { marginTop: 6, color: palette.muted, fontFamily: font.medium, fontSize: 10.5, textAlign: 'right' },
  featuredRow: { flexDirection: 'row', gap: 8 },
  featuredMedal: { flex: 1, minHeight: 142, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: palette.card, padding: 8 },
  featuredMetal: { marginTop: 2, color: palette.ink, fontFamily: font.bold, fontSize: 10.5, textTransform: 'uppercase' },
  featuredName: { marginTop: 2, color: palette.muted, fontFamily: font.medium, fontSize: 9.5, maxWidth: '100%' },
  consistencyCard: { borderWidth: 1, borderColor: palette.border, borderRadius: 18, backgroundColor: palette.card, padding: 15 },
  consistencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  consistencyValue: { marginTop: 3, color: palette.ink, fontFamily: font.bold, fontSize: 32 },
  consistencyCopy: { flex: 1 },
  consistencyTitle: { color: palette.ink, fontFamily: font.semibold, fontSize: 13 },
  consistencyHint: { marginTop: 3, color: palette.muted, fontFamily: font.regular, fontSize: 10.5, lineHeight: 15 },
  longTrack: { marginTop: 12, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: palette.track },
  longFill: { height: '100%', borderRadius: 3, backgroundColor: palette.primary },
  prestigePath: { borderWidth: 1, borderColor: palette.border, borderRadius: 18, backgroundColor: palette.card, padding: 14, gap: 4 },
  prestigeItem: { minHeight: 62, flexDirection: 'row', alignItems: 'center', position: 'relative' },
  prestigeMedallion: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, borderColor: palette.lockedSolidBorder, backgroundColor: palette.lockedSurface, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  prestigeMedallionReached: { borderColor: '#C08214', backgroundColor: '#C08214' },
  prestigeCopy: { marginLeft: 12, flex: 1 },
  prestigeLabel: { color: palette.ink, fontFamily: font.bold, fontSize: 13.5 },
  prestigeDetail: { marginTop: 2, color: palette.muted, fontFamily: font.regular, fontSize: 10.5 },
  prestigeConnector: { position: 'absolute', left: 20, top: 50, width: 2, height: 20, backgroundColor: palette.connector },
  caption: {
    fontFamily: font.medium,
    fontSize: 12,
    color: palette.glassMuted,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 4,
  },
  collectionSummary: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: palette.glassCard,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    paddingHorizontal: spacing.sm,
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  summaryValue: { color: palette.glassInk, fontFamily: font.extrabold, fontSize: 17 },
  summaryLabel: {
    color: palette.glassMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
    marginTop: 3,
  },
  summaryDivider: { width: 1, height: 34, backgroundColor: palette.glassDivider },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  sectionLabel: { fontFamily: font.extrabold, fontSize: 12, letterSpacing: 1.2, color: palette.glassInk },
  sectionHint: { fontFamily: font.regular, fontSize: 12, color: palette.glassMuted, marginTop: 2, marginBottom: 8 },
  sectionTop: { marginTop: spacing.md },
  seeAll: { fontFamily: font.bold, fontSize: 13, color: palette.accent },
  seeAllButton: { minWidth: 72, minHeight: spacing.touch, alignItems: 'flex-end', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  cell: {
    minHeight: 252,
    alignItems: 'center',
    gap: 5,
    backgroundColor: palette.medalCard,
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
    backgroundColor: palette.prestigeSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  prestigeText: { color: palette.prestigeInk, fontFamily: font.extrabold, fontSize: 10 },
  medalStage: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cellTitle: { fontFamily: font.bold, fontSize: 14, color: palette.glassInk, marginTop: 4 },
  cellTier: { fontFamily: font.semibold, fontSize: 12, color: palette.glassMuted },
  miniTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.glassDivider,
    alignSelf: 'stretch',
    marginTop: 2,
    overflow: 'hidden',
  },
  miniFill: { height: 5, borderRadius: 3, backgroundColor: palette.accent },
  cellNext: { fontFamily: font.medium, fontSize: 11, color: palette.glassMuted },
  backdrop: {
    flex: 1,
    backgroundColor: palette.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: palette.sheet,
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
    color: palette.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 20, color: palette.glassInk, textAlign: 'center' },
  sheetBlurb: {
    fontFamily: font.regular,
    fontSize: 13.5,
    color: palette.glassMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  ladder: { alignSelf: 'stretch', gap: 6, marginTop: spacing.md, marginBottom: spacing.sm },
  ladderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ladderDot: { width: 10, height: 10, borderRadius: 5 },
  ladderName: { flex: 1, fontFamily: font.medium, fontSize: 13.5, color: palette.glassMuted },
  ladderAt: { fontFamily: font.semibold, fontSize: 12.5, color: palette.glassMuted },
  shareBtn: {
    alignSelf: 'stretch',
    minHeight: spacing.touch,
    backgroundColor: palette.accent,
    borderRadius: radius.pill,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  shareText: { color: palette.actionInk, fontFamily: font.bold, fontSize: 15 },
  lockedHint: { fontFamily: font.medium, fontSize: 13, color: palette.glassMuted, textAlign: 'center', marginTop: 4 },
  doneBtn: { minHeight: spacing.touch, paddingVertical: 10, paddingHorizontal: 20, marginTop: 2, justifyContent: 'center' },
  doneText: { fontFamily: font.bold, fontSize: 14, color: palette.glassMuted },
  });
}
