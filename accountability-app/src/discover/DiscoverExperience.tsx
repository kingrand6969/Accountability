import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/AuthProvider';
import { listDiscoveryCandidates, sendRequest, type Candidate } from '../buddy/api';
import { getBuddyCards, type BuddyCardView } from '../buddy/card';
import { joinGroup, listGroups, type Group } from '../groups/api';
import {
  joinChallenge,
  listChallenges,
  metricMeta,
  type ChallengeCard,
} from '../compete/api';
import { showToast } from '../ui/Toast';
import { useResolvedImageUrl } from '../media/useResolvedImageUrl';
import {
  font,
  radius,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';
import {
  createDiscoverActionLock,
  discoverActionKey,
  createDiscoverLoadGuard,
  createDiscoverOperationGuard,
  DISCOVER_GEOMETRY,
  keepPublicDiscoveryRows,
  isDiscoverActionBusy,
  mapDiscoverViewState,
  preparePublicCandidates,
  readDiscoverFixtureConfig,
  requestAllowedCardsIfCurrent,
  type DiscoverPermission,
} from './discoverViewState';

type Filter = 'for-you' | 'nearby' | 'challenges' | 'groups';
const VIEW_STARTED_AT = Date.now();
const DISCOVER_TOUCH_INSET = { small: 2, wide: 12 } as const;

export function deriveDiscoverLayout(fontScale: number) {
  const largeText = fontScale >= 1.25;
  return {
    largeText,
    controlMinHeight: largeText ? 48 : 44,
    useFixedGeometry: !largeText,
    stackCards: largeText,
    clampDynamicText: !largeText,
  };
}

export type DiscoverScope = 'all' | 'people';

type DiscoverScopeData = {
  people: Candidate[];
  cards: Map<string, BuddyCardView | null>;
  groups: Group[];
  challenges: ChallengeCard[];
};

export function discoverDataCount(
  scope: DiscoverScope,
  data: { people: readonly unknown[]; groups: readonly unknown[]; challenges: readonly unknown[] },
) {
  return data.people.length + (scope === 'all' ? data.groups.length + data.challenges.length : 0);
}

/** Loads only the sources that can affect the requested Discover surface. */
export async function loadDiscoverScopeData(input: {
  scope: DiscoverScope;
  listPeople: typeof listDiscoveryCandidates;
  listGroups: typeof listGroups;
  listChallenges: typeof listChallenges;
  getCards: typeof getBuddyCards;
  isCurrent: () => boolean;
}): Promise<DiscoverScopeData | null> {
  const [discovery, rawGroups, rawChallenges] = await Promise.all([
    input.listPeople(),
    input.scope === 'all' ? input.listGroups() : Promise.resolve([]),
    input.scope === 'all' ? input.listChallenges() : Promise.resolve([]),
  ]);
  const prepared = preparePublicCandidates(discovery.candidates, 'public_profiles');
  if (!input.isCurrent()) return null;
  const cards = await requestAllowedCardsIfCurrent(
    prepared.allowedIds,
    input.isCurrent,
    input.getCards,
  );
  if (!cards || !input.isCurrent()) return null;
  return {
    people: prepared.candidates,
    cards,
    groups: keepPublicDiscoveryRows(rawGroups),
    challenges: keepPublicDiscoveryRows(rawChallenges),
  };
}

export function DiscoverExperience({ scope = 'all' }: { scope?: DiscoverScope }) {
  const router = useRouter();
  const { colors: theme } = useAppTheme();
  const appearance = useMemo(() => createDiscoverAppearance(theme), [theme]);
  const { palette, styles } = appearance;
  const { fontScale } = useWindowDimensions();
  const layout = deriveDiscoverLayout(fontScale);
  const isLargeText = layout.largeText;
  const useAdaptiveGeometry = !layout.useFixedGeometry;
  const largeControlStyle = isLargeText ? { minHeight: layout.controlMinHeight } : null;
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const [filter, setFilter] = useState<Filter>('for-you');
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [people, setPeople] = useState<Candidate[]>([]);
  const [cards, setCards] = useState<Map<string, BuddyCardView | null>>(new Map());
  const [groups, setGroups] = useState<Group[]>([]);
  const [challenges, setChallenges] = useState<ChallengeCard[]>([]);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [network, setNetwork] = useState<'online' | 'offline'>('online');
  const nearbyPermission: DiscoverPermission = 'unasked';
  const mountedRef = useRef(true);
  const currentOwnerRef = useRef<string | null>(ownerId);
  const loadGuardRef = useRef(createDiscoverLoadGuard());
  const operationGuardRef = useRef(createDiscoverOperationGuard());
  const actionLockRef = useRef(createDiscoverActionLock());
  const fixture = readDiscoverFixtureConfig(process.env);

  if (currentOwnerRef.current !== ownerId) {
    currentOwnerRef.current = ownerId;
  }

  const load = useCallback(async () => {
    if (!ownerId) return;
    const ticket = loadGuardRef.current.begin(ownerId);
    setError(null);
    try {
      const isCurrentLoad = () =>
        mountedRef.current &&
        loadGuardRef.current.canCommit(ticket, currentOwnerRef.current);
      const next = await loadDiscoverScopeData({
        scope,
        listPeople: listDiscoveryCandidates,
        listGroups,
        listChallenges,
        getCards: getBuddyCards,
        isCurrent: isCurrentLoad,
      });
      if (!next || !isCurrentLoad()) return;
      setPeople(next.people);
      setCards(next.cards);
      setGroups(next.groups);
      setChallenges(next.challenges);
      setDataOwnerId(ownerId);
    } catch (cause) {
      if (
        !mountedRef.current ||
        !loadGuardRef.current.canCommit(ticket, currentOwnerRef.current)
      ) return;
      const message = String((cause as Error)?.message ?? cause);
      if (/network|offline|fetch failed|internet/i.test(message)) setNetwork('offline');
      setError('Discovery could not refresh. Your feed is still available.');
    } finally {
      if (
        mountedRef.current &&
        loadGuardRef.current.canCommit(ticket, currentOwnerRef.current)
      ) setLoading(false);
    }
  }, [ownerId, scope]);

  useLayoutEffect(() => {
    const loadGuard = loadGuardRef.current;
    const operationGuard = operationGuardRef.current;
    const actionLock = actionLockRef.current;
    mountedRef.current = true;
    loadGuard.mount();
    operationGuard.mount();
    loadGuard.invalidate();
    operationGuard.invalidate();
    actionLock.clear();
    /* Privacy boundary: synchronously clear previous-owner rows before paint. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeople([]);
    setCards(new Map());
    setGroups([]);
    setChallenges([]);
    setDataOwnerId(null);
    setError(null);
    setBusy(new Set());
    setLoading(!!ownerId);
    if (ownerId) void load();
    return () => {
      mountedRef.current = false;
      loadGuard.unmount();
      operationGuard.unmount();
      actionLock.clear();
    };
  }, [load, ownerId]);

  useEffect(
    () =>
      NetInfo.addEventListener((connection) => {
        setNetwork(connection.isConnected === false ? 'offline' : 'online');
      }),
    [],
  );

  async function act(kind: 'person' | 'group' | 'challenge', id: string, action: (expectedOwner: string) => Promise<void>, message: string) {
    const actionOwner = currentOwnerRef.current;
    if (!actionOwner) return;
    const key = discoverActionKey(actionOwner, kind, id);
    const lockToken = actionLockRef.current.acquire(key);
    if (!lockToken) return;
    const ticket = operationGuardRef.current.begin(key, actionOwner);
    setBusy((current) => new Set(current).add(key));
    try {
      await action(actionOwner);
      if (!operationGuardRef.current.canCommit(ticket, currentOwnerRef.current)) return;
      showToast(message);
      await load();
    } catch (cause) {
      if (!operationGuardRef.current.canCommit(ticket, currentOwnerRef.current)) return;
      showToast(String((cause as Error).message ?? cause));
    } finally {
      if (operationGuardRef.current.canCommit(ticket, currentOwnerRef.current)) {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
      actionLockRef.current.release(lockToken);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={palette.action} />
        <Text style={styles.loadingText}>Finding people who show up…</Text>
      </View>
    );
  }

  const sortedPeople = [...people]
    .sort(
      (a, b) =>
        (fixture
          ? Number(b.id === fixture.personId) -
            Number(a.id === fixture.personId)
          : 0) ||
        Number(!!b.avatar_url) - Number(!!a.avatar_url),
    );
  const visiblePeople = showAllPeople ? sortedPeople : sortedPeople.slice(0, 4);
  const recommendedGroups = [...groups].sort(
    (a, b) =>
      fixture
        ? Number(b.id === fixture.groupId) -
          Number(a.id === fixture.groupId)
        : 0,
  );
  const recommendedChallenges = [...challenges].sort(
    (a, b) =>
      fixture
        ? Number(b.id === fixture.challengeId) -
          Number(a.id === fixture.challengeId)
        : 0,
  );
  const state = mapDiscoverViewState({
    loading,
    error,
    network,
    permission: filter === 'nearby' ? nearbyPermission : 'granted',
    nearby: filter === 'nearby',
    privacySafeNearbyQuery: false,
    dataCount: discoverDataCount(scope, { people, groups, challenges }),
  });
  const showData =
    dataOwnerId === ownerId && (state.status === 'ready' ||
    ((state.status === 'offline' || state.status === 'error') &&
      discoverDataCount(scope, { people, groups, challenges }) > 0));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Discover"
    >
      <Pressable
        style={[styles.search, useAdaptiveGeometry && styles.searchLargeText, largeControlStyle]}
        onPress={() => router.push('/search' as never)}
        hitSlop={DISCOVER_TOUCH_INSET.small}
        accessibilityRole="button"
        accessibilityLabel="Search people, groups and challenges"
      >
        <Ionicons name="search" size={18} color={palette.textMuted} />
        <Text style={[styles.searchText, isLargeText && styles.largeTextCopy]}>
          Search people, groups, challenges
        </Text>
        <Ionicons name="options-outline" size={19} color={palette.action} />
      </Pressable>

      {scope === 'all' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {([
          ['for-you', 'For you'],
          ['nearby', 'Nearby'],
          ['challenges', 'Challenges'],
          ['groups', 'Groups'],
        ] as const).map(([value, label]) => (
          <Pressable
            key={value}
            style={[
              styles.filter,
              useAdaptiveGeometry && styles.filterLargeText,
              largeControlStyle,
              filter === value && styles.filterActive,
            ]}
            onPress={() => {
              if (value !== 'nearby') setFilter(value);
            }}
            disabled={value === 'nearby'}
            hitSlop={6}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === value, disabled: value === 'nearby' }}
            accessibilityHint={value === 'nearby' ? 'Nearby is not available yet because private location access is not used.' : undefined}
          >
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView> : null}
      {scope === 'all' ? <Text
        style={[
          styles.nearbyExplanation,
          isLargeText && styles.nearbyExplanationLargeText,
        ]}
        accessibilityLabel="Nearby unavailable"
      >
        Nearby is off until private location permission and a privacy-safe public query are proven.
      </Text> : null}

      {state.status === 'offline' ? <StateNotice appearance={appearance} status="offline" message={state.message} onRetry={load} largeText={isLargeText} /> : null}
      {state.status === 'error' ? <StateNotice appearance={appearance} status="error" message={state.message} onRetry={load} largeText={isLargeText} /> : null}
      {state.status === 'empty' ? <StateNotice appearance={appearance} status="empty" message={state.message} onRetry={load} largeText={isLargeText} /> : null}
      {state.status === 'permission-denied' ? (
        <StateNotice
          appearance={appearance}
          status="permission-denied"
          message="Nearby is not available yet. It stays off until permission and a privacy-safe public query are proven—no private coordinates or made-up proximity."
          largeText={isLargeText}
        />
      ) : null}

      {showData && (scope === 'people' || filter === 'for-you') ? (
        <>
          <SectionHeader
            appearance={appearance}
            title="People you may connect with"
            action={showAllPeople ? undefined : 'Browse all'}
            onPress={showAllPeople ? undefined : () => setShowAllPeople(true)}
            largeText={layout.stackCards}
          />
          {visiblePeople.map((person) => (
            <PersonCard
              appearance={appearance}
              key={person.id}
              person={person}
              card={cards.get(person.id) ?? null}
              comparisonFixture={fixture?.personId === person.id}
                busy={isDiscoverActionBusy(busy, ownerId, 'person', person.id)}
              largeText={useAdaptiveGeometry}
              onOpen={() =>
                router.push({ pathname: '/buddy-card/[id]', params: { id: person.id } } as never)
              }
              onConnect={() =>
                act('person', person.id, (expectedOwner) => sendRequest(person.id, expectedOwner), `Connection request sent to ${person.display_name ?? 'this member'}`)
              }
            />
          ))}
        </>
      ) : null}

      {scope === 'all' && showData && (filter === 'for-you' || filter === 'groups') ? (
        <>
          <SectionHeader appearance={appearance} title="Recommended group" action="See all" onPress={() => router.push('/groups' as never)} largeText={layout.stackCards} />
          {recommendedGroups.slice(0, filter === 'groups' ? 8 : 1).map((group) => (
            <GroupCard
              appearance={appearance}
              key={group.id}
              group={group}
              fixtureMediaUrl={fixture?.groupId === group.id ? fixture.groupMediaUrl : null}
              busy={isDiscoverActionBusy(busy, ownerId, 'group', group.id)}
              largeText={layout.stackCards}
              clampDynamicText={layout.clampDynamicText}
              onOpen={() => router.push(`/group/${group.id}` as never)}
              onJoin={() => act('group', group.id, (expectedOwner) => joinGroup(group.id, expectedOwner), `Joined ${group.name}`)}
            />
          ))}
          {groups.length === 0 ? <Empty appearance={appearance} icon="people-circle-outline" text="No public groups to recommend yet." /> : null}
        </>
      ) : null}

      {scope === 'all' && showData && (filter === 'for-you' || filter === 'challenges') ? (
        <>
          <SectionHeader appearance={appearance} title="Challenge spotlight" action="See all" onPress={() => router.push('/compete' as never)} largeText={layout.stackCards} />
          {recommendedChallenges.slice(0, filter === 'challenges' ? 8 : 1).map((challenge) => (
            <ChallengeRow
              appearance={appearance}
              key={challenge.id}
              challenge={challenge}
              busy={isDiscoverActionBusy(busy, ownerId, 'challenge', challenge.id)}
              largeText={layout.stackCards}
              onOpen={() =>
                router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } } as never)
              }
              onJoin={() => act('challenge', challenge.id, (expectedOwner) => joinChallenge(challenge.id, expectedOwner), `Joined ${challenge.title}`)}
            />
          ))}
          {challenges.length === 0 ? <Empty appearance={appearance} icon="trophy-outline" text="The next challenge is being prepared." /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function SectionHeader({ appearance, title, action, onPress, largeText }: { appearance: DiscoverAppearance; title: string; action?: string; onPress?: () => void; largeText: boolean }) {
  const { styles } = appearance;
  return (
    <View style={[styles.sectionHeader, largeText && styles.sectionHeaderLargeText]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onPress ? (
        <Pressable
          style={[styles.sectionAction, largeText && styles.sectionActionLargeText]}
          onPress={onPress}
          hitSlop={DISCOVER_TOUCH_INSET.wide}
          accessibilityRole="button"
          accessibilityLabel={`${action}: ${title}`}
        >
          <Text style={styles.sectionActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PersonCard({
  appearance,
  person,
  card,
  comparisonFixture,
  busy,
  largeText,
  onOpen,
  onConnect,
}: {
  appearance: DiscoverAppearance;
  person: Candidate;
  card: BuddyCardView | null;
  comparisonFixture: boolean;
  busy: boolean;
  largeText: boolean;
  onOpen: () => void;
  onConnect: () => void;
}) {
  const { palette, styles } = appearance;
  const resolvedHeroImage = useResolvedImageUrl(
    card?.card.bg_url || card?.avatar || person.avatar_url,
  );
  const traits = comparisonFixture
    ? ['Consistent', 'Supportive', 'Runner']
    : (card?.card.traits ?? []).slice(0, 3);
  return (
    <View style={styles.personCard}>
      <Pressable
        onPress={onOpen}
        style={[styles.personHero, largeText && styles.personHeroLargeText]}
        accessibilityRole="button"
        accessibilityLabel={`Open public profile for ${card?.name ?? person.display_name ?? 'AccountAbility member'}`}
        accessibilityHint="Shows their public accountability card"
      >
        {resolvedHeroImage ? (
          <ImageBackground
            source={{ uri: resolvedHeroImage }}
            style={[styles.personImage, largeText && styles.personImageLargeText]}
            imageStyle={styles.personImageRadius}
            accessibilityLabel={`Public profile image for ${card?.name ?? person.display_name ?? 'AccountAbility member'}`}
          >
            <View style={styles.personScrim} />
          </ImageBackground>
        ) : (
          <View style={[styles.personImage, styles.personFallback, largeText && styles.personImageLargeText]}>
            <Ionicons name="person" size={76} color="#E8F4D7" />
          </View>
        )}
        <View style={[styles.personCopy, largeText && styles.personCopyLargeText]}>
          <Text style={styles.personName}>{card?.name ?? person.display_name ?? 'AccountAbility member'}</Text>
          <Text style={styles.personMeta}>
            {comparisonFixture
              ? 'Runner. Coffee lover.\nAlways up for a challenge.'
              : card?.card.headline || card?.card.about || card?.bio || 'Open to an accountability connection'}
          </Text>
          {traits.length ? (
            <View style={styles.realTraits}>
              {traits.map((trait) => (
                <View key={trait} style={[styles.realTrait, largeText && styles.realTraitLargeText]}>
                  <Text style={styles.realTraitText}>{trait}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {comparisonFixture ? (
            <View style={styles.levelBand} accessibilityLabel="Level 18, Rising Star, 87 percent to Level 19">
              <View style={[styles.levelLabels, largeText && styles.levelLabelsLargeText]}>
                <Text style={styles.levelText}>Level 18{'\n'}Rising Star</Text>
                <Text style={styles.levelText}>87%{'\n'}to Level 19</Text>
              </View>
              <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
            </View>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.connect, largeText && styles.connectLargeText, pressed && styles.pressed, busy && styles.disabled]}
        onPress={onConnect}
        hitSlop={DISCOVER_TOUCH_INSET.small}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        accessibilityLabel={`Connect with ${person.display_name ?? 'member'}`}
      >
        {busy ? <ActivityIndicator color={palette.onAction} /> : <Text style={styles.connectText}>Connect</Text>}
      </Pressable>
    </View>
  );
}

function GroupCard({
  appearance,
  group,
  fixtureMediaUrl,
  busy,
  largeText,
  clampDynamicText,
  onOpen,
  onJoin,
}: {
  appearance: DiscoverAppearance;
  group: Group;
  fixtureMediaUrl: string | null;
  busy: boolean;
  largeText: boolean;
  clampDynamicText: boolean;
  onOpen: () => void;
  onJoin: () => void;
}) {
  const { palette, styles } = appearance;
  return (
    <View style={[styles.groupCard, largeText && styles.groupCardLargeText]} accessibilityLabel={`Recommended public group, ${group.name}`}>
      <Pressable
        style={[
          styles.groupArt,
          largeText && !fixtureMediaUrl && styles.groupArtLargeText,
        ]}
        onPress={onOpen}
        hitSlop={DISCOVER_TOUCH_INSET.small}
        accessibilityRole="button"
        accessibilityLabel={`Open ${group.name} public group`}
        accessibilityHint="Opens the group page"
      >
        {fixtureMediaUrl ? (
          <ImageBackground
            source={{ uri: fixtureMediaUrl }}
            style={styles.groupFixtureImage}
            imageStyle={styles.groupImageRadius}
            accessibilityLabel={`${group.name} group cover showing runners at sunrise`}
          />
        ) : (
          <>
            <Ionicons name="people" size={largeText ? 28 : 22} color={palette.text} />
            <Text
              style={[
                styles.groupFallbackLabel,
                largeText && styles.groupFallbackLabelLargeText,
              ]}
            >
              Public{'\n'}group
            </Text>
          </>
        )}
      </Pressable>
      <Pressable
        style={[styles.groupCopy, largeText && styles.groupCopyLargeText]}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`View ${group.name}`}
        accessibilityHint="Shows public group details"
      >
        <Text style={styles.groupName} numberOfLines={clampDynamicText ? 1 : undefined}>{group.name}</Text>
        <Text style={styles.groupMeta}>{group.member_count.toLocaleString()} members</Text>
        <Text style={styles.groupDescription} numberOfLines={clampDynamicText ? 2 : undefined}>
          {group.description || 'A place to show up, share proof and keep going together.'}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.join, largeText && styles.joinLargeText, group.is_member && styles.joined]}
        onPress={group.is_member ? onOpen : onJoin}
        hitSlop={DISCOVER_TOUCH_INSET.small}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        accessibilityLabel={group.is_member ? `Open ${group.name}` : `Join ${group.name}`}
      >
        <Text style={[styles.joinText, group.is_member && styles.joinedText]}>
          {group.is_member ? 'Open' : busy ? 'Joining…' : 'Join'}
        </Text>
      </Pressable>
    </View>
  );
}

function ChallengeRow({
  appearance,
  challenge,
  busy,
  largeText,
  onOpen,
  onJoin,
}: {
  appearance: DiscoverAppearance;
  challenge: ChallengeCard;
  busy: boolean;
  largeText: boolean;
  onOpen: () => void;
  onJoin: () => void;
}) {
  const { styles } = appearance;
  const days = Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - VIEW_STARTED_AT) / 86_400_000));
  return (
    <View style={[styles.challenge, largeText && styles.challengeLargeText]} accessibilityLabel={`Public challenge, ${challenge.title}`}>
      <Pressable
        style={[styles.challengeCopy, largeText && styles.challengeCopyLargeText]}
        onPress={onOpen}
        hitSlop={DISCOVER_TOUCH_INSET.small}
        accessibilityRole="button"
        accessibilityLabel={`Open ${challenge.title} challenge`}
        accessibilityHint="Shows challenge details"
      >
        <Text style={styles.challengeTitle}>{challenge.title}</Text>
        <Text style={styles.challengeMeta}>
          {metricMeta(challenge.metric).label} · {challenge.participants.toLocaleString()} joined · {days} days left
        </Text>
      </Pressable>
      <Pressable
        style={[styles.challengeBadge, largeText && styles.challengeBadgeLargeText]}
        onPress={challenge.joined ? onOpen : onJoin}
        hitSlop={DISCOVER_TOUCH_INSET.small}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        accessibilityLabel={challenge.joined ? `Open ${challenge.title}` : `Join ${challenge.title}`}
      >
        <Text style={styles.challengeNumber}>
          {challenge.joined ? '✓' : String(Math.min(99, Math.max(7, days)))}
        </Text>
        <Text style={styles.challengeBadgeLabel}>{challenge.joined ? 'Joined' : 'days'}</Text>
      </Pressable>
    </View>
  );
}

function StateNotice({
  appearance,
  status,
  message,
  onRetry,
  largeText = false,
}: {
  appearance: DiscoverAppearance;
  status: 'empty' | 'offline' | 'permission-denied' | 'error';
  message: string;
  onRetry?: () => void;
  largeText?: boolean;
}) {
  const { palette, styles } = appearance;
  const icon =
    status === 'offline'
      ? 'cloud-offline-outline'
      : status === 'permission-denied'
        ? 'location-outline'
        : status === 'error'
          ? 'alert-circle-outline'
          : 'compass-outline';
  return (
    <View
      style={[styles.stateNotice, largeText && styles.stateNoticeLargeText]}
      accessibilityRole={status === 'error' ? 'alert' : 'text'}
    >
      <Ionicons name={icon} size={24} color={palette.action} />
      <Text style={[styles.stateNoticeText, largeText && styles.stateNoticeTextLarge]}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          style={[styles.retry, largeText && styles.retryLargeText]}
          onPress={onRetry}
          hitSlop={DISCOVER_TOUCH_INSET.small}
          accessibilityRole="button"
          accessibilityLabel="Retry discovery"
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Empty({ appearance, icon, text }: { appearance: DiscoverAppearance; icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const { palette, styles } = appearance;
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={25} color={palette.action} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function discoverPalette(theme: AppThemeColors) {
  return {
    canvas: theme.surface.canvas,
    card: theme.surface.card,
    raisedSurface: theme.surface.raised,
    mutedSurface: theme.surface.muted,
    border: theme.border.subtle,
    primarySoft: theme.surface.raised,
    text: theme.ink.primary,
    textSecondary: theme.ink.secondary,
    textMuted: theme.ink.muted,
    textFaint: theme.ink.muted,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
    scrim: theme.interaction.scrim,
    warningSurface: theme.status.dangerSoft,
    warningText: theme.status.attention,
    disabledOpacity: theme.interaction.disabledOpacity,
  };
}

type DiscoverPalette = ReturnType<typeof discoverPalette>;

function createDiscoverAppearance(theme: AppThemeColors) {
  const palette = discoverPalette(theme);
  return { palette, styles: createStyles(palette) };
}

type DiscoverAppearance = ReturnType<typeof createDiscoverAppearance>;

const createStyles = (palette: DiscoverPalette) => StyleSheet.create({
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 120, gap: 3, backgroundColor: palette.canvas },
  loading: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  loadingText: { color: palette.textMuted, fontFamily: font.medium, fontSize: 13 },
  search: {
    height: DISCOVER_GEOMETRY.search,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.pill,
    backgroundColor: palette.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchText: { flex: 1, color: palette.textMuted, fontFamily: font.medium, fontSize: 13 },
  searchLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.sm },
  largeTextCopy: { flexShrink: 1 },
  filters: { gap: 6 },
  filter: { height: DISCOVER_GEOMETRY.filters, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  filterLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.sm },
  filterActive: { backgroundColor: palette.action, borderColor: palette.action },
  filterText: { color: palette.textSecondary, fontFamily: font.semibold, fontSize: 12 },
  filterTextActive: { color: palette.onAction },
  nearbyExplanation: { height: DISCOVER_GEOMETRY.nearbyExplanation, color: palette.textMuted, fontFamily: font.medium, fontSize: 9, lineHeight: 12 },
  nearbyExplanationLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.xs },
  notice: { minHeight: 44, padding: spacing.md, borderRadius: radius.md, backgroundColor: palette.warningSurface },
  noticeText: { color: palette.warningText, fontFamily: font.medium, fontSize: 12.5 },
  stateNotice: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.mutedSurface },
  stateNoticeLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  stateNoticeText: { flex: 1, color: palette.textSecondary, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  stateNoticeTextLarge: { flex: 0, width: '100%' },
  retry: { minHeight: 44, minWidth: 58, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: palette.action },
  retryLargeText: { minHeight: 48 },
  retryText: { color: palette.onAction, fontFamily: font.bold, fontSize: 12 },
  sectionHeader: { height: DISCOVER_GEOMETRY.personHeader, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderLargeText: { height: 'auto', minHeight: 48, flexDirection: 'column', alignItems: 'stretch' },
  sectionTitle: { flex: 1, color: palette.text, fontFamily: font.bold, fontSize: 13 },
  sectionAction: { height: 24, justifyContent: 'center', paddingLeft: spacing.md },
  sectionActionLargeText: { height: 'auto', minHeight: 48, alignSelf: 'flex-end' },
  sectionActionText: { color: palette.action, fontFamily: font.bold, fontSize: 12 },
  personCard: { borderRadius: radius.md, backgroundColor: palette.card, overflow: 'hidden', borderWidth: 1, borderColor: palette.border },
  personHero: { height: DISCOVER_GEOMETRY.personHero, backgroundColor: palette.raisedSurface },
  personHeroLargeText: { height: 'auto', minHeight: DISCOVER_GEOMETRY.personHero },
  personImage: { flex: 1, justifyContent: 'flex-end' },
  personImageLargeText: { flex: 0, minHeight: 160 },
  personImageRadius: { borderRadius: 0 },
  personFallback: { alignItems: 'center', justifyContent: 'center' },
  personScrim: { ...StyleSheet.absoluteFill, backgroundColor: palette.scrim },
  personCopy: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 5 },
  personCopyLargeText: { position: 'relative', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: palette.mutedSurface },
  personName: { color: palette.text, fontFamily: font.serif, fontSize: 20, lineHeight: 21 },
  personMeta: { color: palette.textSecondary, fontFamily: font.medium, fontSize: 8.5, lineHeight: 10 },
  areaBadge: { alignSelf: 'flex-start', minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 9, marginTop: spacing.sm },
  areaBadgeText: { color: palette.text, fontFamily: font.bold, fontSize: 10 },
  realTraits: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  realTrait: { height: 18, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: palette.mutedSurface, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 6 },
  realTraitLargeText: { height: 'auto', minHeight: 32, paddingVertical: spacing.xs },
  realTraitText: { color: palette.textSecondary, fontFamily: font.bold, fontSize: 8 },
  levelBand: { marginTop: 3, gap: 2 },
  levelLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  levelLabelsLargeText: { flexDirection: 'column', gap: spacing.xs },
  levelText: { color: palette.textSecondary, fontFamily: font.medium, fontSize: 8.5, lineHeight: 10 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.border, overflow: 'hidden' },
  progressFill: { width: '87%', height: 4, borderRadius: 2, backgroundColor: palette.action },
  connect: { height: DISCOVER_GEOMETRY.connect, margin: DISCOVER_GEOMETRY.personCardSpacing / 2, borderRadius: radius.sm, backgroundColor: palette.action, alignItems: 'center', justifyContent: 'center' },
  connectLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.sm },
  connectText: { color: palette.onAction, fontFamily: font.bold, fontSize: 13.5 },
  disabled: { opacity: palette.disabledOpacity },
  groupCard: { height: DISCOVER_GEOMETRY.group, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, padding: 3, backgroundColor: palette.card },
  groupCardLargeText: { height: 'auto', minHeight: DISCOVER_GEOMETRY.group, flexDirection: 'column', alignItems: 'stretch', padding: spacing.sm },
  groupArt: { width: 50, height: 50, borderRadius: radius.sm, backgroundColor: palette.mutedSurface, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
  groupArtLargeText: { width: '100%', height: 'auto', minHeight: 112, padding: spacing.sm, overflow: 'visible' },
  groupFixtureImage: { width: 50, height: 50 },
  groupImageRadius: { borderRadius: radius.sm },
  groupFallbackLabel: { color: palette.text, fontFamily: font.bold, fontSize: 9, lineHeight: 11, textAlign: 'center' },
  groupFallbackLabelLargeText: { fontSize: 11, lineHeight: 14 },
  groupCopy: { flex: 1, minHeight: 44, justifyContent: 'center' },
  groupCopyLargeText: { flex: 0, minHeight: 48 },
  groupName: { color: palette.text, fontFamily: font.bold, fontSize: 14 },
  groupMeta: { color: palette.textMuted, fontFamily: font.medium, fontSize: 10.5, marginTop: 1 },
  groupDescription: { color: palette.textSecondary, fontFamily: font.regular, fontSize: 9.5, lineHeight: 12, marginTop: 2 },
  join: { minWidth: 62, minHeight: 44, borderRadius: radius.sm, backgroundColor: palette.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  joinLargeText: { minHeight: 48, alignSelf: 'stretch' },
  joined: { backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border },
  joinText: { color: palette.action, fontFamily: font.bold, fontSize: 12 },
  joinedText: { color: palette.textSecondary },
  challenge: { height: DISCOVER_GEOMETRY.challenge, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: palette.card },
  challengeLargeText: { height: 'auto', minHeight: DISCOVER_GEOMETRY.challenge, flexDirection: 'column', alignItems: 'stretch', paddingVertical: spacing.sm },
  challengeCopy: { flex: 1, minHeight: 44, justifyContent: 'center' },
  challengeCopyLargeText: { flex: 0, minHeight: 48 },
  challengeTitle: { color: palette.text, fontFamily: font.serif, fontSize: 14, lineHeight: 17 },
  challengeMeta: { color: palette.textMuted, fontFamily: font.medium, fontSize: 11, marginTop: 4 },
  challengeBadge: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: palette.action, alignItems: 'center', justifyContent: 'center' },
  challengeBadgeLargeText: { width: 'auto', height: 'auto', minWidth: 48, minHeight: 48, borderRadius: 24, alignSelf: 'flex-end', paddingHorizontal: spacing.sm },
  challengeNumber: { color: palette.action, fontFamily: font.extrabold, fontSize: 20, lineHeight: 22 },
  challengeBadgeLabel: { color: palette.action, fontFamily: font.bold, fontSize: 8.5 },
  empty: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, borderRadius: radius.md },
  emptyText: { flex: 1, color: palette.textMuted, fontFamily: font.medium, fontSize: 12.5 },
  pressed: { opacity: .75 },
});
