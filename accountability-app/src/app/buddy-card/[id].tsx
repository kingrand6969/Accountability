import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  getAuthorizedBuddyCard,
  getBuddyCard,
  getBuddyStats,
  getBoardRank,
  getCardMetrics,
  cardText,
  listCardPosts,
  type BoardRank,
  type BuddyCardView,
  type BuddyStats,
  type CardMetrics,
  type CardPost,
} from '../../buddy/card';
import { BuddyCardFace } from '../../buddy/BuddyCardFace';
import { PublicBuddyCardFace } from '../../buddy/PublicBuddyCardFace';
import {
  BuddyCardLoadGuard,
  type BuddyCardLoadToken,
} from '../../buddy/BuddyCardLoadGuard';
import {
  areBuddiesAsOwner,
  assertBuddyCardViewer,
  createBuddyCardConnectLock,
  sendBuddyRequestAsOwner,
  type BuddyCardConnectToken,
} from '../../buddy/buddyCardRelationship';
import { blockUser, reportUser } from '../../buddy/api';
import { supabase } from '../../lib/supabase';
import { authorLabel, timeAgo } from '../../feed/format';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, shadow, spacing, contentMax } from '../../ui/theme';

export default function BuddyCardScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string | string[] }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const router = useRouter();
  const [view, setView] = useState<BuddyCardView | null>(null);
  const [stats, setStats] = useState<BuddyStats | null>(null);
  const [boardRank, setBoardRank] = useState<BoardRank | null>(null);
  const [metrics, setMetrics] = useState<CardMetrics | null>(null);
  const [posts, setPosts] = useState<CardPost[] | null>(null);
  const [isBuddy, setIsBuddy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const loadGuardRef = useRef(new BuddyCardLoadGuard());
  const activeLoadTokenRef = useRef<BuddyCardLoadToken | null>(null);
  const connectLockRef = useRef(createBuddyCardConnectLock());
  const connectTokenRef = useRef<BuddyCardConnectToken | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      const targetId = id;
      const guard = loadGuardRef.current;
      const targetToken = guard.begin(targetId);
      let activeToken: BuddyCardLoadToken | null = null;
      let authSubscription: { unsubscribe: () => void } | null = null;
      activeLoadTokenRef.current = null;

      setView(null);
      setStats(null);
      setBoardRank(null);
      setMetrics(null);
      setPosts(null);
      setIsBuddy(false);
      setSent(false);
      setSending(false);
      setCurrentUserId(null);
      setLoadError(null);
      setLoading(true);

      void supabase.auth
        .getUser()
        .then(({ data }) => {
          if (!guard.isCurrentTarget(targetToken)) return;
          const viewerId = data.user?.id ?? null;
          const token = guard.bindViewer(targetToken, viewerId);
          if (!token) return;
          activeToken = token;
          activeLoadTokenRef.current = token;
          setCurrentUserId(viewerId);

          const commit = <T,>(setter: (value: T) => void, value: T) => {
            if (!guard.owns(token)) return;
            setter(value);
          };

          const authResult = supabase.auth.onAuthStateChange((_event, session) => {
            if (!guard.owns(token)) return;
            if ((session?.user.id ?? null) === token.viewerId) return;
            setView(null);
            setStats(null);
            setBoardRank(null);
            setMetrics(null);
            setPosts(null);
            setIsBuddy(false);
            setSent(false);
            setSending(false);
            setCurrentUserId(null);
            setLoadError(null);
            setLoading(true);
            guard.cancel(token);
            activeLoadTokenRef.current = null;
            const connectToken = connectTokenRef.current;
            if (connectToken) connectLockRef.current.cancel(connectToken);
            connectTokenRef.current = null;
            setAccountEpoch((value) => value + 1);
          });
          if (!guard.owns(token)) {
            authResult.data.subscription.unsubscribe();
            return;
          }
          authSubscription = authResult.data.subscription;

          const ownerView = viewerId === targetId;
          const relationship = viewerId && !ownerView
            ? areBuddiesAsOwner(viewerId, targetId)
            : Promise.resolve(false);

          void Promise.all([getBuddyCard(targetId), relationship])
            .then(async ([publicView, buddy]) => {
              const v = buddy && viewerId
                ? await getAuthorizedBuddyCard(targetId, viewerId)
                : publicView;
              if (viewerId) await assertBuddyCardViewer(viewerId);
              if (!guard.owns(token)) return;
              if (!v) throw new Error('This person is not available to this account.');
              commit(setView, v);
              commit(setIsBuddy, buddy);
              void getBuddyStats(targetId)
                .then((nextStats) => commit(setStats, nextStats))
                .catch(() => {});
              const fullView = ownerView || buddy;
              const publicMetricsAllowed = Boolean(
                v?.card.show_consistency ||
                  v?.card.show_points ||
                  v?.card.show_distance ||
                  v?.card.show_challenge_wins,
              );
              if (fullView || publicMetricsAllowed) {
                void getCardMetrics(targetId)
                  .then((nextMetrics) => commit(setMetrics, nextMetrics))
                  .catch(() => {});
              }
              if (fullView || v?.card.show_city_rank || v?.card.show_country_rank) {
                void getBoardRank(targetId)
                  .then((nextBoardRank) => commit(setBoardRank, nextBoardRank))
                  .catch(() => {});
              }
              if (fullView || v?.card.show_posts) {
                void listCardPosts(targetId, fullView)
                  .then((nextPosts) => commit(setPosts, nextPosts))
                  .catch(() => commit(setPosts, []));
              } else {
                commit(setPosts, []);
              }
            })
            .catch((error) => {
              if (!guard.owns(token)) return;
              if (/account changed/i.test(String((error as Error).message ?? error))) {
                guard.cancel(token);
                activeLoadTokenRef.current = null;
                setAccountEpoch((value) => value + 1);
                return;
              }
              commit(
                setLoadError,
                String((error as Error).message || 'Could not load Buddy Card.'),
              );
              commit(setView, null);
            })
            .finally(() => commit(setLoading, false));
        })
        .catch((error) => {
          const token = guard.bindViewer(targetToken, null);
          if (!token || !guard.owns(token)) return;
          activeToken = token;
          activeLoadTokenRef.current = token;
          setLoadError(String((error as Error).message || 'Could not load Buddy Card.'));
          setLoading(false);
        });

      return () => {
        authSubscription?.unsubscribe();
        guard.cancel(activeToken ?? targetToken);
        if (activeLoadTokenRef.current === activeToken) activeLoadTokenRef.current = null;
        const connectToken = connectTokenRef.current;
        if (connectToken) connectLockRef.current.cancel(connectToken);
        connectTokenRef.current = null;
      };
    }, [accountEpoch, id, reloadKey]),
  );

  async function onConnect() {
    const loadToken = activeLoadTokenRef.current;
    if (!id || !loadToken?.viewerId || loadToken.viewerId === id) return;
    if (!loadGuardRef.current.owns(loadToken)) return;
    const ownerId = loadToken.viewerId;
    const targetId = id;
    const connectToken = connectLockRef.current.tryAcquire(ownerId, targetId);
    if (!connectToken) return;
    connectTokenRef.current = connectToken;
    setSending(true);
    try {
      await sendBuddyRequestAsOwner(ownerId, targetId);
      if (!loadGuardRef.current.owns(loadToken)) return;
      if (!connectLockRef.current.owns(connectToken, ownerId, targetId)) return;
      setSent(true);
      showToast(`Request sent to ${authorLabel(view?.name ?? null)}`);
    } catch (e) {
      if (!loadGuardRef.current.owns(loadToken)) return;
      if (!connectLockRef.current.owns(connectToken, ownerId, targetId)) return;
      if (/account changed/i.test(String((e as Error).message ?? e))) return;
      Alert.alert('Could not send', String((e as Error).message ?? e));
    } finally {
      const ownsAction = connectLockRef.current.owns(connectToken, ownerId, targetId);
      connectLockRef.current.release(connectToken);
      if (connectTokenRef.current === connectToken) connectTokenRef.current = null;
      if (ownsAction && loadGuardRef.current.owns(loadToken)) setSending(false);
    }
  }

  function openOptions() {
    if (!id || !view) return;
    Alert.alert(authorLabel(view.name), undefined, [
      { text: 'Block', style: 'destructive', onPress: confirmBlock },
      { text: 'Report', onPress: confirmReport },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function confirmBlock() {
    if (!id || !view) return;
    Alert.alert(
      `Block ${authorLabel(view.name)}?`,
      "They won't be able to message you and you won't see each other. You can undo this later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await blockUser(id);
              showToast('Blocked');
              router.back();
            } catch (e) {
              Alert.alert('Could not block', String((e as Error).message ?? e));
            }
          },
        },
      ],
    );
  }

  function confirmReport() {
    if (!id || !view) return;
    Alert.alert(
      `Report ${authorLabel(view.name)}?`,
      "We'll review this profile. Reporting also blocks them so they can't reach you.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report & block',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportUser(id, 'Reported from profile');
              await blockUser(id).catch(() => {});
              showToast('Reported - thank you');
              router.back();
            } catch (e) {
              Alert.alert('Could not report', String((e as Error).message ?? e));
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Buddy Card...</Text>
      </View>
    );
  }
  if (!view) {
    return (
      <View style={styles.center}>
        <Ionicons
          name={loadError ? 'cloud-offline-outline' : 'person-circle-outline'}
          size={42}
          color={colors.textFaint}
        />
        <Text style={styles.missing}>
          {loadError ? 'Could not load Buddy Card' : "This person isn't available."}
        </Text>
        {loadError ? <Text style={styles.errorDetail}>{loadError}</Text> : null}
        {loadError ? (
          <Pressable
            onPress={() => setReloadKey((value) => value + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading Buddy Card"
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          >
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const ownerView = currentUserId === id;
  const fullBuddyView = isBuddy && !ownerView;
  const { headline, about } = cardText(view);
  const visibleAbout = ownerView || isBuddy ? view.bio : about;
  const memberSince = new Date(view.created_at).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <Stack.Screen
        options={{
          headerRight: ownerView
            ? () => null
            : () => (
                <Pressable
                  onPress={openOptions}
                  hitSlop={12}
                  accessibilityLabel="More options"
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 4 })}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
                </Pressable>
              ),
        }}
      />
      <View style={styles.card}>
        {fullBuddyView ? (
          <BuddyCardFace
          name={view.name}
          area={view.area}
          avatar={view.avatar}
          memberSince={memberSince}
          lastActive={view.last_active_at}
          headline={headline}
          card={view.card}
          stats={stats}
          boardRank={boardRank}
          metrics={metrics}
          onPressMedals={() =>
            router.push({ pathname: '/buddy-medals/[id]', params: { id: id! } } as never)
          }
          />
        ) : (
          <PublicBuddyCardFace
            ownerView={ownerView}
            name={view.name}
            area={view.area}
            avatar={view.avatar}
            memberSince={memberSince}
            lastActive={view.last_active_at}
            headline={headline}
            card={view.card}
            stats={stats}
            boardRank={boardRank}
            metrics={metrics}
            onPressMedals={() =>
              router.push({ pathname: '/buddy-medals/[id]', params: { id: id! } } as never)
            }
          />
        )}
      </View>

      {!ownerView && !isBuddy ? (
        <View style={styles.privacyRow}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={styles.privacyText}>
            {authorLabel(view.name)} chose everything shown on this card.
          </Text>
        </View>
      ) : null}

      {visibleAbout ? (
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>About</Text>
          <Text style={styles.aboutText}>{visibleAbout}</Text>
        </View>
      ) : null}

      {/* Buddies see recent posts; non-buddies only see owner-selected public posts. */}
      {ownerView || isBuddy || view.card.show_posts ? (
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>
            {ownerView || isBuddy ? 'Recent posts' : 'Shared publicly'}
          </Text>
          {posts === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : posts.length === 0 ? (
            <Text style={styles.aboutText}>
              {ownerView || isBuddy ? 'No posts yet.' : 'No public Buddy Card posts selected.'}
            </Text>
          ) : (
            <View style={{ gap: 4 }}>
              {posts.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}
                  style={({ pressed }) => [
                    ownerView || isBuddy ? styles.postRow : styles.publicPostCard,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open post"
                >
                  {p.image_url && p.post_type !== 'video' ? (
                    <Image
                      source={{ uri: p.image_url }}
                      style={ownerView || isBuddy ? styles.postThumb : styles.publicPostImage}
                    />
                  ) : (
                    <View
                      style={[
                        ownerView || isBuddy ? styles.postThumb : styles.publicPostImage,
                        styles.postThumbFallback,
                      ]}
                    >
                      <Ionicons
                        name={p.post_type === 'video' ? 'videocam-outline' : 'chatbox-ellipses-outline'}
                        size={20}
                        color={colors.textFaint}
                      />
                    </View>
                  )}
                  <View style={ownerView || isBuddy ? { flex: 1 } : styles.publicPostCopy}>
                    {!ownerView && !isBuddy ? (
                      <View style={styles.publicPostChip}>
                        <Ionicons name="globe-outline" size={12} color={colors.primary} />
                        <Text style={styles.publicPostChipText}>PUBLIC POST</Text>
                      </View>
                    ) : null}
                    <Text style={styles.postBody} numberOfLines={2}>
                      {p.body || 'Photo'}
                    </Text>
                    <Text style={styles.postTime}>{timeAgo(p.created_at)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          {!ownerView && !isBuddy && posts && posts.length > 0 ? (
            <Text style={styles.postNote}>These posts were selected for the public Buddy Card.</Text>
          ) : null}
        </View>
      ) : null}

      {ownerView ? (
        <Button
          title="Edit Buddy Card"
          onPress={() => router.push('/buddy-card-edit' as never)}
          icon={<Ionicons name="create-outline" size={18} color="#fff" />}
          style={styles.connect}
        />
      ) : isBuddy ? (
        <>
          <View style={styles.buddyRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.buddyLabel}>You&apos;re buddies</Text>
          </View>
          <Button
            title="Message"
            onPress={() => router.push({ pathname: '/buddy-chat/[id]', params: { id: id! } })}
            icon={<Ionicons name="chatbubble-ellipses-outline" size={17} color="#fff" />}
            style={styles.connect}
          />
        </>
      ) : !ownerView && !isBuddy ? (
        <>
          <Button
            title={sent ? 'Request sent' : `Connect with ${authorLabel(view.name)}`}
            onPress={onConnect}
            loading={sending}
            disabled={sent}
            icon={
              sent ? (
                <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />
              ) : (
                <Ionicons name="person-add-outline" size={19} color="#fff" />
              )
            }
            style={styles.connect}
          />
          <Text style={styles.hint}>
            {authorLabel(view.name)} must approve before you can message or see buddy-only posts.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  missing: { fontFamily: font.bold, fontSize: 17, color: colors.text },
  loadingText: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted },
  errorDetail: {
    maxWidth: 320,
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
  },
  retry: {
    minHeight: 48,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
  },
  retryPressed: { opacity: 0.75 },
  retryText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  scroll: { padding: spacing.lg, paddingBottom: 40, ...contentMax },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    ...shadow.card,
  },
  aboutCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  privacyRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  privacyText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 18,
  },
  aboutTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text, marginBottom: 6 },
  aboutText: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 8,
  },
  postThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface },
  postThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  publicPostCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    marginTop: spacing.sm,
  },
  publicPostImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.surface,
  },
  publicPostCopy: { padding: spacing.md },
  publicPostChip: {
    alignSelf: 'flex-start',
    minHeight: 26,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  publicPostChipText: {
    color: colors.primary,
    fontFamily: font.extrabold,
    fontSize: 9.5,
    letterSpacing: 0.6,
  },
  postBody: { fontFamily: font.medium, fontSize: 13.5, color: colors.text, lineHeight: 19 },
  postTime: { fontFamily: font.regular, fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
  postNote: {
    fontFamily: font.regular,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
  },
  connect: { marginTop: spacing.md },
  buddyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  buddyLabel: { fontFamily: font.semibold, fontSize: 13.5, color: colors.success },
  hint: {
    color: colors.textMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
