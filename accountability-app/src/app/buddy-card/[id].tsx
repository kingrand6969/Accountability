import { useCallback, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import {
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
import { sendRequest, listBuddies, blockUser, reportUser } from '../../buddy/api';
import { authorLabel, timeAgo } from '../../feed/format';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, shadow, spacing, contentMax } from '../../ui/theme';

export default function BuddyCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<BuddyCardView | null>(null);
  const [stats, setStats] = useState<BuddyStats | null>(null);
  const [boardRank, setBoardRank] = useState<BoardRank | null>(null);
  const [metrics, setMetrics] = useState<CardMetrics | null>(null);
  const [posts, setPosts] = useState<CardPost[] | null>(null);
  const [isBuddy, setIsBuddy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      Promise.all([getBuddyCard(id), getBuddyStats(id), listBuddies()])
        .then(([v, s, buddies]) => {
          setView(v);
          setStats(s);
          const buddy = buddies.some((b) => b.id === id);
          setIsBuddy(buddy);
          getCardMetrics(id).then(setMetrics).catch(() => {});
          // live board standing (shown automatically when they share location)
          getBoardRank(id).then(setBoardRank).catch(() => {});
          // Buddies get a fuller, Facebook-style view (their recent posts);
          // non-buddies always see the posts the owner marked "Show on Buddy Card".
          listCardPosts(id, buddy).then(setPosts).catch(() => setPosts([]));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [id]),
  );

  async function onConnect() {
    if (!id) return;
    setSending(true);
    try {
      await sendRequest(id);
      setSent(true);
      showToast(`Request sent to ${authorLabel(view?.name ?? null)}`);
    } catch (e) {
      Alert.alert('Could not send', String((e as Error).message ?? e));
    } finally {
      setSending(false);
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
      'They won’t be able to message you and you won’t see each other. You can undo this later.',
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
      'We’ll review this profile. Reporting also blocks them so they can’t reach you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report & block',
          style: 'destructive',
          onPress: async () => {
            try {
              await reportUser(id, 'Reported from profile');
              await blockUser(id).catch(() => {});
              showToast('Reported — thank you');
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
      </View>
    );
  }
  if (!view) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>This person isn&apos;t available.</Text>
      </View>
    );
  }

  const { headline, about } = cardText(view);
  const memberSince = new Date(view.created_at).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scroll}>
      <Stack.Screen
        options={{
          headerRight: () => (
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
        {isBuddy ? (
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
            name={view.name}
            area={view.area}
            avatar={view.avatar}
            lastActive={view.last_active_at}
            headline={headline}
            card={view.card}
            metrics={metrics}
            onPressMedals={() =>
              router.push({ pathname: '/buddy-medals/[id]', params: { id: id! } } as never)
            }
          />
        )}
      </View>

      {!isBuddy ? (
        <View style={styles.privacyRow}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text style={styles.privacyText}>
            {authorLabel(view.name)} chose everything shown on this card.
          </Text>
        </View>
      ) : null}

      {/* profile info below */}
      <View style={styles.aboutCard}>
        <Text style={styles.aboutTitle}>Profile</Text>
        <Text style={styles.aboutText}>
          {about || 'They haven’t written anything yet — say hi and find out!'}
        </Text>
      </View>

      {/* posts — buddies get a fuller feed, non-buddies only the public ones */}
      {
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>{isBuddy ? 'Recent posts' : 'Shared publicly'}</Text>
          {posts === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : posts.length === 0 ? (
            <Text style={styles.aboutText}>
              {isBuddy
                ? 'No posts yet.'
                : 'Nothing shared with non-buddies yet — connect to see more.'}
            </Text>
          ) : (
            <View style={{ gap: 4 }}>
              {posts.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}
                  style={({ pressed }) => [
                    isBuddy ? styles.postRow : styles.publicPostCard,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open post"
                >
                  {p.image_url ? (
                    <Image
                      source={{ uri: p.image_url }}
                      style={isBuddy ? styles.postThumb : styles.publicPostImage}
                    />
                  ) : (
                    <View
                      style={[
                        isBuddy ? styles.postThumb : styles.publicPostImage,
                        styles.postThumbFallback,
                      ]}
                    >
                      <Ionicons name="chatbox-ellipses-outline" size={20} color={colors.textFaint} />
                    </View>
                  )}
                  <View style={isBuddy ? { flex: 1 } : styles.publicPostCopy}>
                    {!isBuddy ? (
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
          {!isBuddy && posts && posts.length > 0 ? (
            <Text style={styles.postNote}>They chose to share these — connect to see it all.</Text>
          ) : null}
        </View>
      }

      {isBuddy ? (
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
      ) : (
        <>
          <Button
            title={sent ? 'Request sent ✓' : `Connect with ${authorLabel(view.name)}`}
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
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { fontFamily: font.regular, color: colors.textMuted },
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
