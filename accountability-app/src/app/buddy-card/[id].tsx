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
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getBuddyCard,
  getBuddyStats,
  haveIStarred,
  setStar,
  cardText,
  CARD_BLUE,
  type BuddyCardView,
  type BuddyStats,
} from '../../buddy/card';
import { sendRequest } from '../../buddy/api';
import { authorLabel } from '../../feed/format';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, shadow, spacing } from '../../ui/theme';

export default function BuddyCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<BuddyCardView | null>(null);
  const [stats, setStats] = useState<BuddyStats | null>(null);
  const [starred, setStarred] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      Promise.all([getBuddyCard(id), getBuddyStats(id), haveIStarred(id)])
        .then(([v, s, st]) => {
          setView(v);
          setStats(s);
          setStarred(st);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [id]),
  );

  async function onToggleStar() {
    if (!id || !stats) return;
    const next = !starred;
    setStarred(next);
    setStats((s) => (s ? { ...s, stars: Math.max(0, s.stars + (next ? 1 : -1)) } : s));
    try {
      await setStar(id, next);
    } catch {
      setStarred(!next);
      setStats((s) => (s ? { ...s, stars: Math.max(0, s.stars + (next ? -1 : 1)) } : s));
    }
  }

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
      <View style={styles.card}>
        {/* cover: big avatar LEFT · member-since top right · message under it */}
        <View style={styles.coverFrame}>
          {view.card.bg_url ? (
            <Image source={{ uri: view.card.bg_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={CARD_BLUE}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <View style={styles.coverRow}>
            <View style={styles.avatarRing}>
              {view.avatar ? (
                <Image source={{ uri: view.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={48} color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.coverRight}>
              <View style={styles.sinceChip}>
                <Ionicons name="ribbon-outline" size={12} color="#fff" />
                <Text style={styles.sinceText}>Member since {memberSince}</Text>
              </View>
              {headline ? (
                <View style={styles.msgChip}>
                  <Text style={styles.msgLabel}>Focus: </Text>
                  <Text style={styles.msgText}>{headline}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {/* name across */}
        <Text style={styles.name}>{authorLabel(view.name)}</Text>
        <Text style={styles.subtitle}>
          {view.area ? `${view.area} · ` : ''}Accountability buddy
        </Text>

        {/* stats: stars · buddies · km ran · max lift */}
        <View style={styles.statsRow}>
          <Pressable
            onPress={onToggleStar}
            style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
            accessibilityLabel={starred ? 'Remove your star' : 'Give a star'}
          >
            <Ionicons name={starred ? 'star' : 'star-outline'} size={14} color="#f59e0b" />
            <Text style={styles.statText}>{stats?.stars ?? 0}</Text>
          </Pressable>
          <View style={styles.stat}>
            <Ionicons name="people-outline" size={14} color={colors.primary} />
            <Text style={styles.statText}>{stats?.buddies ?? 0} buddies</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="walk-outline" size={14} color="#ea580c" />
            <Text style={styles.statText}>{stats?.km ?? 0} km</Text>
          </View>
          {view.card.pr_weight?.trim() ? (
            <View style={styles.stat}>
              <Ionicons name="barbell-outline" size={14} color="#7c3aed" />
              <Text style={styles.statText}>{view.card.pr_weight}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* profile info below */}
      <View style={styles.aboutCard}>
        <Text style={styles.aboutTitle}>Profile</Text>
        <Text style={styles.aboutText}>
          {about || 'They haven’t written anything yet — say hi and find out!'}
        </Text>
      </View>

      <Button
        title={sent ? 'Request sent ✓' : 'Connect as buddies'}
        onPress={onConnect}
        loading={sending}
        disabled={sent}
        style={styles.connect}
      />
      <Text style={styles.hint}>You&apos;ll only be linked if they accept — then you can chat.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missing: { fontFamily: font.regular, color: colors.textMuted },
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    ...shadow.card,
  },
  coverFrame: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    minHeight: 200,
    justifyContent: 'center',
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  avatarRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  avatar: { width: 122, height: 122, borderRadius: 61 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  coverRight: { flex: 1, gap: spacing.sm, alignItems: 'flex-end' },
  sinceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.55)',
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  sinceText: { color: '#fff', fontFamily: font.semibold, fontSize: 11.5 },
  msgChip: {
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: radius.md,
    padding: 10,
    maxWidth: 170,
  },
  msgLabel: { color: '#fde68a', fontFamily: font.bold, fontSize: 12 },
  msgText: { color: '#fff', fontFamily: font.medium, fontSize: 12, lineHeight: 17 },
  name: {
    fontFamily: font.extrabold,
    fontSize: 21,
    color: colors.text,
    marginTop: spacing.md,
    marginHorizontal: spacing.xs,
  },
  subtitle: {
    fontFamily: font.medium,
    fontSize: 13.5,
    color: colors.textMuted,
    marginTop: 2,
    marginHorizontal: spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginHorizontal: spacing.xs,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 12,
    minHeight: 32,
  },
  statText: { fontFamily: font.bold, fontSize: 12.5, color: colors.text },
  pressed: { opacity: 0.7 },
  aboutCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...shadow.card,
  },
  aboutTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text, marginBottom: 6 },
  aboutText: { fontFamily: font.regular, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  connect: { marginTop: spacing.lg },
  hint: {
    color: colors.textMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
