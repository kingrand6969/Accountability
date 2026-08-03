import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { colors, font, radius, spacing } from '../ui/theme';
import {
  createDiscoverActionLock,
  createDiscoverLoadGuard,
  createDiscoverOperationGuard,
  DISCOVER_GEOMETRY,
  keepPublicDiscoveryRows,
  mapDiscoverViewState,
  preparePublicCandidates,
  readDiscoverFixtureConfig,
  requestAllowedCardsIfCurrent,
  type DiscoverPermission,
} from './discoverViewState';

type Filter = 'for-you' | 'nearby' | 'challenges' | 'groups';
const VIEW_STARTED_AT = Date.now();

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

export function DiscoverExperience() {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const layout = deriveDiscoverLayout(fontScale);
  const isLargeText = layout.largeText;
  const useAdaptiveGeometry = !layout.useFixedGeometry;
  const largeControlStyle = isLargeText ? { minHeight: layout.controlMinHeight } : null;
  const { session } = useAuth();
  const ownerId = session?.user.id ?? null;
  const [filter, setFilter] = useState<Filter>('for-you');
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
      const [discovery, nextGroups, nextChallenges] = await Promise.all([
        listDiscoveryCandidates(),
        listGroups(),
        listChallenges(),
      ]);
      const prepared = preparePublicCandidates(discovery.candidates, 'public_profiles');
      const isCurrentLoad = () =>
        mountedRef.current &&
        loadGuardRef.current.canCommit(ticket, currentOwnerRef.current);
      if (!isCurrentLoad()) return;
      const nextCards = await requestAllowedCardsIfCurrent(
        prepared.allowedIds,
        isCurrentLoad,
        getBuddyCards,
      );
      if (!nextCards) return;
      if (
        !isCurrentLoad()
      ) return;
      setPeople(prepared.candidates);
      setCards(nextCards);
      setGroups(keepPublicDiscoveryRows(nextGroups));
      setChallenges(keepPublicDiscoveryRows(nextChallenges));
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
  }, [ownerId]);

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

  async function act(kind: 'person' | 'group' | 'challenge', id: string, action: () => Promise<void>, message: string) {
    const actionOwner = currentOwnerRef.current;
    if (!actionOwner) return;
    const key = `${actionOwner}:${kind}:${id}`;
    const lockToken = actionLockRef.current.acquire(key);
    if (!lockToken) return;
    const ticket = operationGuardRef.current.begin(key, actionOwner);
    setBusy((current) => new Set(current).add(key));
    try {
      await action();
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
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Finding people who show up…</Text>
      </View>
    );
  }

  const recommended = [...people]
    .sort(
      (a, b) =>
        (fixture
          ? Number(b.id === fixture.personId) -
            Number(a.id === fixture.personId)
          : 0) ||
        Number(!!b.avatar_url) - Number(!!a.avatar_url),
    )
    .slice(0, 4);
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
    dataCount: people.length + groups.length + challenges.length,
  });
  const showData =
    dataOwnerId === ownerId && (state.status === 'ready' ||
    ((state.status === 'offline' || state.status === 'error') &&
      people.length + groups.length + challenges.length > 0));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      accessibilityLabel="Discover"
    >
      <Pressable
        style={[styles.search, useAdaptiveGeometry && styles.searchLargeText, largeControlStyle]}
        onPress={() => router.push('/search' as never)}
        accessibilityRole="button"
        accessibilityLabel="Search people, groups and challenges"
      >
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <Text style={[styles.searchText, isLargeText && styles.largeTextCopy]}>
          Search people, groups, challenges
        </Text>
        <Ionicons name="options-outline" size={19} color={colors.primary} />
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
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
      </ScrollView>
      <Text
        style={[
          styles.nearbyExplanation,
          isLargeText && styles.nearbyExplanationLargeText,
        ]}
        accessibilityLabel="Nearby unavailable"
      >
        Nearby is off until private location permission and a privacy-safe public query are proven.
      </Text>

      {state.status === 'offline' ? <StateNotice status="offline" message={state.message} onRetry={load} largeText={isLargeText} /> : null}
      {state.status === 'error' ? <StateNotice status="error" message={state.message} onRetry={load} largeText={isLargeText} /> : null}
      {state.status === 'empty' ? <StateNotice status="empty" message={state.message} onRetry={load} largeText={isLargeText} /> : null}
      {state.status === 'permission-denied' ? (
        <StateNotice
          status="permission-denied"
          message="Nearby is not available yet. It stays off until permission and a privacy-safe public query are proven—no private coordinates or made-up proximity."
          largeText={isLargeText}
        />
      ) : null}

      {showData && filter === 'for-you' ? (
        <>
          <SectionHeader
            title="People you may connect with"
            action="Browse all"
            onPress={() => router.push('/buddy' as never)}
            largeText={layout.stackCards}
          />
          {recommended.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              card={cards.get(person.id) ?? null}
              comparisonFixture={fixture?.personId === person.id}
              busy={busy.has(`person:${person.id}`)}
              largeText={useAdaptiveGeometry}
              onOpen={() =>
                router.push({ pathname: '/buddy-card/[id]', params: { id: person.id } } as never)
              }
              onConnect={() =>
                act('person', person.id, () => sendRequest(person.id), `Connection request sent to ${person.display_name ?? 'this member'}`)
              }
            />
          ))}
        </>
      ) : null}

      {showData && (filter === 'for-you' || filter === 'groups') ? (
        <>
          <SectionHeader title="Recommended group" action="See all" onPress={() => router.push('/groups' as never)} largeText={layout.stackCards} />
          {recommendedGroups.slice(0, filter === 'groups' ? 8 : 1).map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              fixtureMediaUrl={fixture?.groupId === group.id ? fixture.groupMediaUrl : null}
              busy={busy.has(`group:${group.id}`)}
              largeText={layout.stackCards}
              clampDynamicText={layout.clampDynamicText}
              onOpen={() => router.push(`/group/${group.id}` as never)}
              onJoin={() => act('group', group.id, () => joinGroup(group.id), `Joined ${group.name}`)}
            />
          ))}
          {groups.length === 0 ? <Empty icon="people-circle-outline" text="No public groups to recommend yet." /> : null}
        </>
      ) : null}

      {showData && (filter === 'for-you' || filter === 'challenges') ? (
        <>
          <SectionHeader title="Challenge spotlight" action="See all" onPress={() => router.push('/compete' as never)} largeText={layout.stackCards} />
          {recommendedChallenges.slice(0, filter === 'challenges' ? 8 : 1).map((challenge) => (
            <ChallengeRow
              key={challenge.id}
              challenge={challenge}
              busy={busy.has(`challenge:${challenge.id}`)}
              largeText={layout.stackCards}
              onOpen={() =>
                router.push({ pathname: '/challenge/[id]', params: { id: challenge.id } } as never)
              }
              onJoin={() => act('challenge', challenge.id, () => joinChallenge(challenge.id), `Joined ${challenge.title}`)}
            />
          ))}
          {challenges.length === 0 ? <Empty icon="trophy-outline" text="The next challenge is being prepared." /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function SectionHeader({ title, action, onPress, largeText }: { title: string; action: string; onPress: () => void; largeText: boolean }) {
  return (
    <View style={[styles.sectionHeader, largeText && styles.sectionHeaderLargeText]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable
        style={[styles.sectionAction, largeText && styles.sectionActionLargeText]}
        onPress={onPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`${action}: ${title}`}
      >
        <Text style={styles.sectionActionText}>{action}</Text>
      </Pressable>
    </View>
  );
}

function PersonCard({
  person,
  card,
  comparisonFixture,
  busy,
  largeText,
  onOpen,
  onConnect,
}: {
  person: Candidate;
  card: BuddyCardView | null;
  comparisonFixture: boolean;
  busy: boolean;
  largeText: boolean;
  onOpen: () => void;
  onConnect: () => void;
}) {
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
        {card?.card.bg_url || card?.avatar || person.avatar_url ? (
          <ImageBackground
            source={{ uri: card?.card.bg_url || card?.avatar || person.avatar_url! }}
            style={[styles.personImage, largeText && styles.personImageLargeText]}
            imageStyle={styles.personImageRadius}
            accessibilityLabel={`Public profile image for ${card?.name ?? person.display_name ?? 'AccountAbility member'}`}
          >
            <View style={styles.personScrim} />
          </ImageBackground>
        ) : (
          <View style={[styles.personImage, styles.personFallback, largeText && styles.personImageLargeText]}>
            <Ionicons name="person" size={76} color="#bfdbfe" />
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
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Connect with ${person.display_name ?? 'member'}`}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.connectText}>Connect</Text>}
      </Pressable>
    </View>
  );
}

function GroupCard({
  group,
  fixtureMediaUrl,
  busy,
  largeText,
  clampDynamicText,
  onOpen,
  onJoin,
}: {
  group: Group;
  fixtureMediaUrl: string | null;
  busy: boolean;
  largeText: boolean;
  clampDynamicText: boolean;
  onOpen: () => void;
  onJoin: () => void;
}) {
  return (
    <View style={[styles.groupCard, largeText && styles.groupCardLargeText]} accessibilityLabel={`Recommended public group, ${group.name}`}>
      <Pressable
        style={[
          styles.groupArt,
          largeText && !fixtureMediaUrl && styles.groupArtLargeText,
        ]}
        onPress={onOpen}
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
            <Ionicons name="people" size={largeText ? 28 : 22} color="#fff" />
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
        disabled={busy}
        accessibilityRole="button"
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
  challenge,
  busy,
  largeText,
  onOpen,
  onJoin,
}: {
  challenge: ChallengeCard;
  busy: boolean;
  largeText: boolean;
  onOpen: () => void;
  onJoin: () => void;
}) {
  const days = Math.max(0, Math.ceil((new Date(challenge.ends_at).getTime() - VIEW_STARTED_AT) / 86_400_000));
  return (
    <View style={[styles.challenge, largeText && styles.challengeLargeText]} accessibilityLabel={`Public challenge, ${challenge.title}`}>
      <Pressable
        style={[styles.challengeCopy, largeText && styles.challengeCopyLargeText]}
        onPress={onOpen}
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
        disabled={busy}
        accessibilityRole="button"
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
  status,
  message,
  onRetry,
  largeText = false,
}: {
  status: 'empty' | 'offline' | 'permission-denied' | 'error';
  message: string;
  onRetry?: () => void;
  largeText?: boolean;
}) {
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
      <Ionicons name={icon} size={24} color={colors.primary} />
      <Text style={[styles.stateNoticeText, largeText && styles.stateNoticeTextLarge]}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          style={[styles.retry, largeText && styles.retryLargeText]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry discovery"
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Empty({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={25} color={colors.primary} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 120, gap: 3 },
  loading: { padding: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  loadingText: { color: colors.textMuted, fontFamily: font.medium, fontSize: 13 },
  search: {
    height: DISCOVER_GEOMETRY.search,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  searchText: { flex: 1, color: colors.textMuted, fontFamily: font.medium, fontSize: 13 },
  searchLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.sm },
  largeTextCopy: { flexShrink: 1 },
  filters: { gap: 6 },
  filter: { height: DISCOVER_GEOMETRY.filters, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  filterLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.sm },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontFamily: font.semibold, fontSize: 12 },
  filterTextActive: { color: '#fff' },
  nearbyExplanation: { height: DISCOVER_GEOMETRY.nearbyExplanation, color: colors.textMuted, fontFamily: font.medium, fontSize: 9, lineHeight: 12 },
  nearbyExplanationLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.xs },
  notice: { minHeight: 44, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#fff7ed' },
  noticeText: { color: '#9a3412', fontFamily: font.medium, fontSize: 12.5 },
  stateNotice: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt },
  stateNoticeLargeText: { flexDirection: 'column', alignItems: 'stretch' },
  stateNoticeText: { flex: 1, color: colors.textSecondary, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  stateNoticeTextLarge: { flex: 0, width: '100%' },
  retry: { minHeight: 44, minWidth: 58, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.primary },
  retryLargeText: { minHeight: 48 },
  retryText: { color: '#fff', fontFamily: font.bold, fontSize: 12 },
  sectionHeader: { height: DISCOVER_GEOMETRY.personHeader, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeaderLargeText: { height: 'auto', minHeight: 48, flexDirection: 'column', alignItems: 'stretch' },
  sectionTitle: { flex: 1, color: colors.text, fontFamily: font.bold, fontSize: 13 },
  sectionAction: { height: 24, justifyContent: 'center', paddingLeft: spacing.md },
  sectionActionLargeText: { height: 'auto', minHeight: 48, alignSelf: 'flex-end' },
  sectionActionText: { color: colors.primary, fontFamily: font.bold, fontSize: 12 },
  personCard: { borderRadius: radius.md, backgroundColor: colors.card, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  personHero: { height: DISCOVER_GEOMETRY.personHero, backgroundColor: '#0b2047' },
  personHeroLargeText: { height: 'auto', minHeight: DISCOVER_GEOMETRY.personHero },
  personImage: { flex: 1, justifyContent: 'flex-end' },
  personImageLargeText: { flex: 0, minHeight: 160 },
  personImageRadius: { borderRadius: 0 },
  personFallback: { alignItems: 'center', justifyContent: 'center' },
  personScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,18,45,.36)' },
  personCopy: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: 5 },
  personCopyLargeText: { position: 'relative', left: 0, right: 0, bottom: 0, padding: spacing.md, backgroundColor: colors.primaryDark },
  personName: { color: '#fff', fontFamily: font.serif, fontSize: 20, lineHeight: 21 },
  personMeta: { color: '#e2e8f0', fontFamily: font.medium, fontSize: 8.5, lineHeight: 10 },
  areaBadge: { alignSelf: 'flex-start', minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.92)', paddingHorizontal: 9, marginTop: spacing.sm },
  areaBadgeText: { color: '#123b79', fontFamily: font.bold, fontSize: 10 },
  realTraits: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  realTrait: { height: 18, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.92)', paddingHorizontal: 6 },
  realTraitLargeText: { height: 'auto', minHeight: 32, paddingVertical: spacing.xs },
  realTraitText: { color: '#123b79', fontFamily: font.bold, fontSize: 8 },
  levelBand: { marginTop: 3, gap: 2 },
  levelLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  levelLabelsLargeText: { flexDirection: 'column', gap: spacing.xs },
  levelText: { color: '#fff', fontFamily: font.medium, fontSize: 8.5, lineHeight: 10 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.35)', overflow: 'hidden' },
  progressFill: { width: '87%', height: 4, borderRadius: 2, backgroundColor: colors.primary },
  connect: { height: DISCOVER_GEOMETRY.connect, margin: DISCOVER_GEOMETRY.personCardSpacing / 2, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  connectLargeText: { height: 'auto', minHeight: 48, paddingVertical: spacing.sm },
  connectText: { color: '#fff', fontFamily: font.bold, fontSize: 13.5 },
  disabled: { opacity: .55 },
  groupCard: { height: DISCOVER_GEOMETRY.group, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 3, backgroundColor: colors.card },
  groupCardLargeText: { height: 'auto', minHeight: DISCOVER_GEOMETRY.group, flexDirection: 'column', alignItems: 'stretch', padding: spacing.sm },
  groupArt: { width: 50, height: 50, borderRadius: radius.sm, backgroundColor: colors.primaryDark, alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden' },
  groupArtLargeText: { width: '100%', height: 'auto', minHeight: 112, padding: spacing.sm, overflow: 'visible' },
  groupFixtureImage: { width: 50, height: 50 },
  groupImageRadius: { borderRadius: radius.sm },
  groupFallbackLabel: { color: '#fff', fontFamily: font.bold, fontSize: 9, lineHeight: 11, textAlign: 'center' },
  groupFallbackLabelLargeText: { fontSize: 11, lineHeight: 14 },
  groupCopy: { flex: 1, minHeight: 44, justifyContent: 'center' },
  groupCopyLargeText: { flex: 0, minHeight: 48 },
  groupName: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  groupMeta: { color: colors.textMuted, fontFamily: font.medium, fontSize: 10.5, marginTop: 1 },
  groupDescription: { color: colors.textSecondary, fontFamily: font.regular, fontSize: 9.5, lineHeight: 12, marginTop: 2 },
  join: { minWidth: 62, minHeight: 44, borderRadius: radius.sm, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  joinLargeText: { minHeight: 48, alignSelf: 'stretch' },
  joined: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  joinText: { color: colors.primary, fontFamily: font.bold, fontSize: 12 },
  joinedText: { color: colors.textSecondary },
  challenge: { height: DISCOVER_GEOMETRY.challenge, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.sm, backgroundColor: colors.card },
  challengeLargeText: { height: 'auto', minHeight: DISCOVER_GEOMETRY.challenge, flexDirection: 'column', alignItems: 'stretch', paddingVertical: spacing.sm },
  challengeCopy: { flex: 1, minHeight: 44, justifyContent: 'center' },
  challengeCopyLargeText: { flex: 0, minHeight: 48 },
  challengeTitle: { color: colors.text, fontFamily: font.serif, fontSize: 14, lineHeight: 17 },
  challengeMeta: { color: colors.textMuted, fontFamily: font.medium, fontSize: 11, marginTop: 4 },
  challengeBadge: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  challengeBadgeLargeText: { width: 'auto', height: 'auto', minWidth: 48, minHeight: 48, borderRadius: 24, alignSelf: 'flex-end', paddingHorizontal: spacing.sm },
  challengeNumber: { color: colors.primary, fontFamily: font.extrabold, fontSize: 20, lineHeight: 22 },
  challengeBadgeLabel: { color: colors.primary, fontFamily: font.bold, fontSize: 8.5 },
  empty: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: radius.md },
  emptyText: { flex: 1, color: colors.textMuted, fontFamily: font.medium, fontSize: 12.5 },
  pressed: { opacity: .75 },
});
