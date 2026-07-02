import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getBuddyCard, cardBackground, cardText, type BuddyCardView } from '../../buddy/card';
import { sendRequest } from '../../buddy/api';
import { authorLabel, timeAgo } from '../../feed/format';
import { Button } from '../../ui/Button';
import { showToast } from '../../ui/Toast';
import { colors, font, radius, spacing } from '../../ui/theme';

export default function BuddyCardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [view, setView] = useState<BuddyCardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getBuddyCard(id)
        .then(setView)
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

  const bg = cardBackground(view.card.bg);
  const { headline, about } = cardText(view);
  const joined = new Date(view.created_at).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* framed card like the reference */}
        <View style={styles.card}>
          <View style={styles.photoFrame}>
            <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {headline ? (
              <View style={styles.focusChip}>
                <Ionicons name="flame" size={12} color="#fde68a" />
                <Text style={styles.focusText} numberOfLines={4}>
                  {headline}
                </Text>
              </View>
            ) : null}
            <View style={styles.avatarRing}>
              {view.avatar ? (
                <Image source={{ uri: view.avatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={44} color="#fff" />
                </View>
              )}
            </View>
          </View>

          <Text style={styles.name}>{authorLabel(view.name)}</Text>
          <Text style={styles.subtitle}>Accountability buddy</Text>

          <View style={styles.chips}>
            {view.area ? (
              <View style={styles.chip}>
                <Ionicons name="location-outline" size={13} color={colors.primary} />
                <Text style={styles.chipText}>{view.area}</Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Ionicons name="calendar-outline" size={13} color={colors.primary} />
              <Text style={styles.chipText}>Joined {joined}</Text>
            </View>
            {view.last_active_at ? (
              <View style={styles.chip}>
                <Ionicons name="pulse-outline" size={13} color={colors.success} />
                <Text style={styles.chipText}>Active {timeAgo(view.last_active_at)}</Text>
              </View>
            ) : null}
          </View>
        </View>

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
        <Text style={styles.hint}>
          You&apos;ll only be linked if they accept — then you can chat.
        </Text>
      </ScrollView>
    </View>
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
    alignItems: 'center',
  },
  photoFrame: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: spacing.xl,
    minHeight: 210,
    justifyContent: 'center',
  },
  focusChip: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    maxWidth: 130,
    flexDirection: 'row',
    gap: 5,
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderRadius: radius.md,
    padding: 8,
  },
  focusText: { color: '#fff', fontFamily: font.semibold, fontSize: 11, flexShrink: 1, lineHeight: 15 },
  avatarRing: {
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  avatar: { width: 138, height: 138, borderRadius: 69 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.extrabold, fontSize: 20, color: colors.text, marginTop: spacing.md },
  subtitle: { fontFamily: font.medium, fontSize: 13.5, color: colors.textMuted, marginTop: 2 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontFamily: font.semibold, fontSize: 12.5, color: colors.text },
  aboutCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
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
