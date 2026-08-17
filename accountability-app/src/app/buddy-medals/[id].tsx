import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Medal } from '../../achievements/Medal';
import { MEDALS, medalState, type MedalState } from '../../achievements/catalog';
import {
  listCompletedChallengesForMember,
  metricMeta,
  type CompletedChallenge,
} from '../../compete/api';
import { authorLabel } from '../../feed/format';
import { supabase } from '../../lib/supabase';
import { BuddyCardLoadGuard, type BuddyCardLoadToken } from '../../buddy/BuddyCardLoadGuard';
import { getAuthorizedBuddyCard, getBuddyCard, type BuddyCardView } from '../../buddy/card';
import { getBuddyCardAccessMode } from '../../buddy/buddyCardRelationship';
import { colors, contentMax, font, radius, spacing } from '../../ui/theme';

type ChallengeLoad =
  | { status: 'loading'; items: CompletedChallenge[] }
  | { status: 'ready'; items: CompletedChallenge[] }
  | { status: 'error'; items: CompletedChallenge[] };

type GalleryItem =
  | { kind: 'medal-row'; key: string; medals: MedalState[] }
  | { kind: 'challenge-header'; key: 'challenge-header' }
  | { kind: 'challenge-loading'; key: 'challenge-loading' }
  | { kind: 'challenge-empty'; key: 'challenge-empty' }
  | { kind: 'challenge-error'; key: 'challenge-error' }
  | { kind: 'challenge'; key: string; challenge: CompletedChallenge };

const LIGHT = {
  background: colors.background,
  card: colors.card,
  text: colors.text,
  textMuted: colors.textMuted,
  border: colors.border,
  soft: colors.surfaceAlt,
};

const DARK = {
  background: '#07111f',
  card: '#0f1b2d',
  text: '#f8fafc',
  textMuted: '#a8b5c7',
  border: '#26364d',
  soft: '#142238',
};

function medalStatesFor(view: BuddyCardView): MedalState[] {
  const earned = new Map((view.card.medals_list ?? []).map((medal) => [medal.id, medal.tier]));
  return MEDALS.map((definition) => {
    const tier = earned.get(definition.id);
    const tierDefinition =
      tier == null
        ? null
        : definition.tiers[Math.min(Math.max(Math.trunc(tier), 0), definition.tiers.length - 1)];
    return medalState(definition, tierDefinition?.at ?? 0);
  });
}

function chunkMedals(states: MedalState[]): GalleryItem[] {
  const rows: GalleryItem[] = [];
  for (let index = 0; index < states.length; index += 2) {
    const medals = states.slice(index, index + 2);
    rows.push({
      kind: 'medal-row',
      key: `medals-${medals.map((state) => state.def.id).join('-')}`,
      medals,
    });
  }
  return rows;
}

function galleryItems(states: MedalState[], challenges: ChallengeLoad): GalleryItem[] {
  const items = [...chunkMedals(states), { kind: 'challenge-header', key: 'challenge-header' } as const];
  if (challenges.status === 'loading') {
    return [...items, { kind: 'challenge-loading', key: 'challenge-loading' }];
  }
  if (challenges.status === 'error') {
    return [...items, { kind: 'challenge-error', key: 'challenge-error' }];
  }
  if (challenges.items.length === 0) {
    return [...items, { kind: 'challenge-empty', key: 'challenge-empty' }];
  }
  return [
    ...items,
    ...challenges.items.map(
      (challenge): GalleryItem => ({
        kind: 'challenge',
        key: `challenge-${challenge.id}`,
        challenge,
      }),
    ),
  ];
}

function challengeDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Completed' : date.toLocaleDateString();
}

export default function BuddyMedals() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const tone = scheme === 'dark' ? DARK : LIGHT;
  const [view, setView] = useState<BuddyCardView | null>(null);
  const [states, setStates] = useState<MedalState[] | null>(null);
  const [challenges, setChallenges] = useState<ChallengeLoad>({ status: 'loading', items: [] });
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const guardRef = useRef(new BuddyCardLoadGuard());
  const activeTokenRef = useRef<BuddyCardLoadToken | null>(null);
  const latestTargetIdRef = useRef(id);
  // A route replacement can render before the previous focus cleanup fires.
  // eslint-disable-next-line react-hooks/refs
  latestTargetIdRef.current = id;

  function loadIsCurrent(token: BuddyCardLoadToken): boolean {
    return latestTargetIdRef.current === token.targetId && guardRef.current.owns(token);
  }

  useFocusEffect(
    useCallback(() => {
      void accountEpoch;
      void reloadKey;
      if (!id) {
        setLoading(false);
        setUnavailable(true);
        return;
      }

      const targetId = id;
      const guard = guardRef.current;
      const targetToken = guard.begin(targetId);
      let activeToken: BuddyCardLoadToken | null = null;
      let authSubscription: { unsubscribe: () => void } | null = null;
      activeTokenRef.current = null;
      setView(null);
      setStates(null);
      setChallenges({ status: 'loading', items: [] });
      setLoading(true);
      setUnavailable(false);
      setLoadError(false);

      void supabase.auth
        .getUser()
        .then(async ({ data, error }) => {
          if (error) throw error;
          const viewerId = data.user?.id ?? null;
          const token = guard.bindViewer(targetToken, viewerId);
          if (!token || !loadIsCurrent(token)) return;
          activeToken = token;
          activeTokenRef.current = token;

          const authResult = supabase.auth.onAuthStateChange((_event, session) => {
            if (!loadIsCurrent(token)) return;
            if ((session?.user.id ?? null) === token.viewerId) return;
            guard.cancel(token);
            activeTokenRef.current = null;
            setView(null);
            setStates(null);
            setChallenges({ status: 'loading', items: [] });
            setLoading(true);
            setUnavailable(false);
            setLoadError(false);
            setAccountEpoch((value) => value + 1);
          });
          authSubscription = authResult.data.subscription;

          if (!viewerId) {
            setUnavailable(true);
            setLoading(false);
            return;
          }

          try {
            const mode = await getBuddyCardAccessMode(targetId);
            if (!loadIsCurrent(token)) return;
            if (mode === 'unavailable') {
              setUnavailable(true);
              setLoading(false);
              return;
            }
            const nextView =
              mode === 'self' || mode === 'buddy'
                ? await getAuthorizedBuddyCard(targetId)
                : await getBuddyCard(targetId);
            const confirmedMode =
              mode === 'public' ? await getBuddyCardAccessMode(targetId) : mode;
            if (!loadIsCurrent(token)) return;
            if (
              confirmedMode !== mode ||
              !nextView ||
              nextView.id !== targetId ||
              (mode === 'public' && !nextView.card.show_medals)
            ) {
              setUnavailable(true);
              setLoading(false);
              return;
            }

            setView(nextView);
            setStates(medalStatesFor(nextView));
            setLoading(false);
            setChallenges({ status: 'loading', items: [] });
            void listCompletedChallengesForMember(targetId, viewerId)
              .then((items) => {
                if (!loadIsCurrent(token)) return;
                setChallenges({ status: 'ready', items });
              })
              .catch((challengeError) => {
                if (!loadIsCurrent(token)) return;
                if (
                  /account changed/i.test(
                    String((challengeError as Error)?.message ?? challengeError),
                  )
                ) {
                  guard.cancel(token);
                  activeTokenRef.current = null;
                  setAccountEpoch((value) => value + 1);
                  return;
                }
                setChallenges({ status: 'error', items: [] });
              });
          } catch (primaryError) {
            if (!loadIsCurrent(token)) return;
            if (
              /account changed/i.test(String((primaryError as Error)?.message ?? primaryError))
            ) {
              guard.cancel(token);
              activeTokenRef.current = null;
              setAccountEpoch((value) => value + 1);
              return;
            }
            setLoadError(true);
            setLoading(false);
          }
        })
        .catch(() => {
          const token =
            activeToken && loadIsCurrent(activeToken)
              ? activeToken
              : activeToken ?? guard.bindViewer(targetToken, null);
          if (!token || !loadIsCurrent(token)) return;
          activeToken = token;
          activeTokenRef.current = token;
          setLoadError(true);
          setLoading(false);
        });

      return () => {
        authSubscription?.unsubscribe();
        guard.cancel(activeToken ?? targetToken);
        if (activeTokenRef.current === activeToken) activeTokenRef.current = null;
      };
    }, [accountEpoch, id, reloadKey]),
  );

  async function retryChallenges() {
    const token = activeTokenRef.current;
    if (!token?.viewerId || !loadIsCurrent(token)) return;
    setChallenges({ status: 'loading', items: [] });
    try {
      const items = await listCompletedChallengesForMember(token.targetId, token.viewerId);
      if (!loadIsCurrent(token)) return;
      setChallenges({ status: 'ready', items });
    } catch (error) {
      if (!loadIsCurrent(token)) return;
      if (/account changed/i.test(String((error as Error).message ?? error))) {
        guardRef.current.cancel(token);
        activeTokenRef.current = null;
        setAccountEpoch((value) => value + 1);
        return;
      }
      setChallenges({ status: 'error', items: [] });
    }
  }

  function openMedal(state: MedalState) {
    const token = activeTokenRef.current;
    if (!token || !loadIsCurrent(token)) return;
    const tier = state.tierName ?? 'Locked';
    const progress = state.unlocked
      ? `${state.value.toLocaleString()} ${state.def.unit}`
      : `Unlock at ${state.next?.at.toLocaleString() ?? state.def.tiers[0]?.at ?? 0} ${state.def.unit}`;
    Alert.alert(state.def.title, `${tier}\n\n${state.def.blurb}\n\n${progress}`);
  }

  function openChallenge(challenge: CompletedChallenge) {
    const token = activeTokenRef.current;
    if (!token || !loadIsCurrent(token)) return;
    router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } });
  }

  const retryScreen = (
    <Pressable
      onPress={() => setReloadKey((value) => value + 1)}
      accessibilityRole="button"
      accessibilityLabel="Retry Medals and Challenges"
      style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
    >
      <Ionicons name="refresh" size={18} color="#fff" />
      <Text style={styles.primaryActionText}>Try again</Text>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tone.background }]}>
        <Stack.Screen options={{ title: 'Medals and Challenges' }} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.stateCopy, { color: tone.textMuted }]}>Loading achievements...</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: tone.background }]}>
        <Stack.Screen options={{ title: 'Medals and Challenges' }} />
        <Ionicons name="cloud-offline-outline" size={40} color={tone.textMuted} />
        <Text style={[styles.stateTitle, { color: tone.text }]}>Could not load achievements.</Text>
        <Text style={[styles.stateCopy, { color: tone.textMuted }]}>Check your connection and try again.</Text>
        {retryScreen}
      </View>
    );
  }

  if (unavailable || !view || !states) {
    return (
      <View style={[styles.center, { backgroundColor: tone.background }]}>
        <Stack.Screen options={{ title: 'Medals and Challenges' }} />
        <Ionicons name="shield-outline" size={40} color={tone.textMuted} />
        <Text style={[styles.stateTitle, { color: tone.text }]}>This gallery is unavailable.</Text>
      </View>
    );
  }

  const earnedCount = states.filter((state) => state.unlocked).length;
  const data = galleryItems(states, challenges);

  return (
    <>
      <Stack.Screen options={{ title: 'Medals and Challenges' }} />
      <FlatList
        style={{ backgroundColor: tone.background }}
        contentContainerStyle={[styles.list, contentMax]}
        data={data}
        keyExtractor={(item) => item.key}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <View style={styles.intro}>
            <Text style={[styles.title, { color: tone.text }]}>
              {authorLabel(view.name)}&apos;s Medals and Challenges
            </Text>
            <Text style={[styles.subtitle, { color: tone.textMuted }]}>
              {earnedCount} of {MEDALS.length} medals earned
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'medal-row') {
            return (
              <View style={styles.medalRow}>
                {item.medals.map((state) => (
                  <Pressable
                    key={state.def.id}
                    onPress={() => openMedal(state)}
                    accessibilityRole="button"
                    accessibilityLabel={`${state.def.title}, ${state.tierName ?? 'Locked'}`}
                    accessibilityHint="Shows medal details"
                    style={({ pressed }) => [
                      styles.medalCell,
                      { backgroundColor: tone.card, borderColor: tone.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Medal state={state} size={78} animate={false} />
                    <Text style={[styles.medalTitle, { color: tone.text }]} numberOfLines={1}>
                      {state.def.title}
                    </Text>
                    <Text
                      style={[
                        styles.medalTier,
                        { color: state.unlocked ? colors.primary : tone.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {state.tierName ?? 'Locked'}
                    </Text>
                  </Pressable>
                ))}
                {item.medals.length === 1 ? <View style={styles.medalCellPlaceholder} /> : null}
              </View>
            );
          }
          if (item.kind === 'challenge-header') {
            return (
              <View style={[styles.challengeHeader, { borderTopColor: tone.border }]}>
                <Text style={[styles.sectionTitle, { color: tone.text }]}>Completed challenges</Text>
                <Text style={[styles.sectionSubtitle, { color: tone.textMuted }]}>Finished events, not wins</Text>
              </View>
            );
          }
          if (item.kind === 'challenge-loading') {
            return (
              <View style={styles.sectionState}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.sectionStateText, { color: tone.textMuted }]}>Loading completed challenges...</Text>
              </View>
            );
          }
          if (item.kind === 'challenge-error') {
            return (
              <View style={[styles.sectionState, { backgroundColor: tone.soft }]}>
                <Text style={[styles.sectionStateText, { color: tone.text }]}>Could not load completed challenges.</Text>
                <Pressable
                  onPress={() => void retryChallenges()}
                  accessibilityRole="button"
                  accessibilityLabel="Retry completed challenges"
                  style={({ pressed }) => [styles.retryAction, pressed && styles.pressed]}
                >
                  <Ionicons name="refresh" size={18} color={colors.primary} />
                  <Text style={styles.retryActionText}>Try again</Text>
                </Pressable>
              </View>
            );
          }
          if (item.kind === 'challenge-empty') {
            return (
              <View style={[styles.sectionState, { backgroundColor: tone.soft }]}>
                <Text style={[styles.sectionStateText, { color: tone.textMuted }]}>No completed challenges yet.</Text>
              </View>
            );
          }
          return (
            <Pressable
              onPress={() => openChallenge(item.challenge)}
              accessibilityRole="button"
              accessibilityLabel={`Open challenge ${item.challenge.title}`}
              accessibilityHint="Shows challenge details"
              style={({ pressed }) => [
                styles.challengeRow,
                { backgroundColor: tone.card, borderColor: tone.border },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.challengeIcon, { backgroundColor: tone.soft }]}>
                <Ionicons name="checkmark" size={20} color={colors.success} />
              </View>
              <View style={styles.challengeCopy}>
                <Text style={[styles.challengeTitle, { color: tone.text }]} numberOfLines={2}>
                  {item.challenge.title}
                </Text>
                <Text style={[styles.challengeMeta, { color: tone.textMuted }]}>
                  {metricMeta(item.challenge.metric).label} · {challengeDate(item.challenge.endsAt)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tone.textMuted} />
            </Pressable>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
  },
  stateTitle: { fontFamily: font.bold, fontSize: 17, textAlign: 'center', marginTop: spacing.xs },
  stateCopy: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  primaryAction: {
    minHeight: 48,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  primaryActionText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  list: { padding: spacing.lg, paddingBottom: 56 },
  intro: { alignItems: 'center', paddingBottom: spacing.lg },
  title: { fontFamily: font.extrabold, fontSize: 22, textAlign: 'center', lineHeight: 28 },
  subtitle: { fontFamily: font.medium, fontSize: 13, marginTop: spacing.xs },
  medalRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  medalCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 148,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalCellPlaceholder: { flex: 1, minWidth: 0 },
  medalTitle: { fontFamily: font.bold, fontSize: 14, marginTop: spacing.xs },
  medalTier: { fontFamily: font.semibold, fontSize: 12, marginTop: 2 },
  challengeHeader: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { fontFamily: font.extrabold, fontSize: 19 },
  sectionSubtitle: { fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
  sectionState: {
    minHeight: 76,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  sectionStateText: { fontFamily: font.medium, fontSize: 13.5, textAlign: 'center' },
  retryAction: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  retryActionText: { color: colors.primary, fontFamily: font.bold, fontSize: 14 },
  challengeRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  challengeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeCopy: { flex: 1, minWidth: 0 },
  challengeTitle: { fontFamily: font.bold, fontSize: 14.5, lineHeight: 19 },
  challengeMeta: { fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
  pressed: { opacity: 0.72 },
});
