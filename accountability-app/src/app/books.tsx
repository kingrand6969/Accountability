import { useEffect, useState } from 'react';
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
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useIsPro } from '../pro/ProProvider';
import {
  INTERESTS,
  getBookPrefs,
  setBookPrefs,
  type BookPrefs,
  type Book,
} from '../books/api';
import { useBookFeed } from '../books/useBookFeed';
import type { Cadence } from '../books/rotate';
import { Button } from '../ui/Button';
import { colors, font, radius, shadow, spacing } from '../ui/theme';

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function Books() {
  const router = useRouter();
  const { isPro, loading: proLoading } = useIsPro();
  const [prefs, setPrefs] = useState<BookPrefs | null>(null);
  const { feed, error: feedError, loading } = useBookFeed(prefs, isPro);

  useEffect(() => {
    getBookPrefs().then(setPrefs).catch(() => setPrefs({ interests: ['motivation'], cadence: 'daily' }));
  }, []);

  useEffect(() => {
    if (feedError) Alert.alert('Could not load books', feedError.message);
  }, [feedError]);

  function updatePrefs(next: BookPrefs) {
    setPrefs(next);
    setBookPrefs(next).catch(() => {});
  }

  function toggleInterest(key: string) {
    if (!prefs) return;
    const has = prefs.interests.includes(key);
    const interests = has
      ? prefs.interests.filter((k) => k !== key)
      : [...prefs.interests, key];
    if (interests.length === 0) return; // keep at least one
    updatePrefs({ ...prefs, interests });
  }

  async function openBook(book: Book) {
    if (!book.readUrl) return;
    try {
      await WebBrowser.openBrowserAsync(book.readUrl);
    } catch {
      Alert.alert('Could not open', 'Try again in a moment.');
    }
  }

  if (proLoading || !prefs) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isPro) {
    return (
      <View style={styles.gate}>
        <View style={styles.gateIcon}>
          <Ionicons name="book" size={40} color={colors.pro} />
        </View>
        <Text style={styles.gateTitle}>Daily Reads</Text>
        <Text style={styles.gateText}>
          A free classic e-book picked for your interests — motivation, money,
          health, philosophy — delivered daily, weekly or monthly. A Pro perk.
        </Text>
        <Button title="Upgrade to Pro" onPress={() => router.push('/paywall')} style={styles.gateBtn} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Your interests</Text>
      <View style={styles.chips}>
        {INTERESTS.map((i) => {
          const on = prefs.interests.includes(i.key);
          return (
            <Pressable
              key={i.key}
              onPress={() => toggleInterest(i.key)}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{i.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>New pick every</Text>
      <View style={styles.toggle}>
        {CADENCES.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => updatePrefs({ ...prefs, cadence: c.value })}
            style={({ pressed }) => [
              styles.toggleBtn,
              prefs.cadence === c.value && styles.toggleActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[styles.toggleText, prefs.cadence === c.value && styles.toggleTextActive]}
            >
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading || !feed ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            {prefs.cadence === 'daily'
              ? 'Today’s read'
              : prefs.cadence === 'weekly'
                ? 'This week’s read'
                : 'This month’s read'}
          </Text>
          <View style={styles.pickCard}>
            {feed.pick.coverUrl ? (
              <Image source={{ uri: feed.pick.coverUrl }} style={styles.cover} resizeMode="cover" />
            ) : (
              <View style={[styles.cover, styles.coverFallback]}>
                <Ionicons name="book-outline" size={34} color={colors.textFaint} />
              </View>
            )}
            <View style={styles.pickBody}>
              <View style={styles.tag}>
                <Ionicons name="sparkles" size={11} color={colors.pro} />
                <Text style={styles.tagText}>{feed.interestLabel}</Text>
              </View>
              <Text style={styles.pickTitle} numberOfLines={3}>
                {feed.pick.title}
              </Text>
              <Text style={styles.pickAuthor} numberOfLines={1}>
                {feed.pick.author}
              </Text>
              <Text style={styles.freeNote}>Free classic · Project Gutenberg</Text>
              <Button
                title="Read now"
                onPress={() => openBook(feed.pick)}
                style={styles.readBtn}
                icon={<Ionicons name="book-outline" size={17} color="#fff" />}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Up next from your interests</Text>
          {feed.more.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => openBook(b)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityLabel={`Read ${b.title}`}
            >
              {b.coverUrl ? (
                <Image source={{ uri: b.coverUrl }} style={styles.rowCover} resizeMode="cover" />
              ) : (
                <View style={[styles.rowCover, styles.coverFallback]}>
                  <Ionicons name="book-outline" size={18} color={colors.textFaint} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {b.title}
                </Text>
                <Text style={styles.rowAuthor} numberOfLines={1}>
                  {b.author}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.background, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  pressed: { opacity: 0.75 },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  gateIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: { fontSize: 22, fontFamily: font.extrabold, color: colors.text },
  gateText: {
    color: colors.textMuted,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 21,
  },
  gateBtn: { minWidth: 220 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.primary, fontFamily: font.semibold, fontSize: 13 },
  chipTextOn: { color: '#fff' },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 3,
  },
  toggleBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8, minHeight: 38 },
  toggleActive: { backgroundColor: colors.card },
  toggleText: { color: colors.textMuted, fontFamily: font.semibold, fontSize: 13.5 },
  toggleTextActive: { color: colors.primary },
  pickCard: {
    flexDirection: 'row',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  cover: {
    width: 108,
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  pickBody: { flex: 1, gap: 4 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.proSoft,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  tagText: { color: colors.pro, fontFamily: font.bold, fontSize: 11 },
  pickTitle: { fontSize: 17, fontFamily: font.extrabold, color: colors.text, lineHeight: 22 },
  pickAuthor: { fontSize: 13.5, fontFamily: font.medium, color: colors.textSecondary },
  freeNote: { fontSize: 12, fontFamily: font.regular, color: colors.textFaint },
  readBtn: { marginTop: spacing.sm, alignSelf: 'stretch' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 64,
  },
  rowCover: { width: 40, height: 58, borderRadius: 6, backgroundColor: colors.surface },
  rowTitle: { fontSize: 14.5, fontFamily: font.semibold, color: colors.text },
  rowAuthor: { fontSize: 12.5, fontFamily: font.regular, color: colors.textMuted, marginTop: 1 },
});
