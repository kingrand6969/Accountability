import { useEffect, useMemo, useState } from 'react';
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
import {
  font,
  radius,
  shadow,
  spacing,
  type AppThemeColors,
} from '../ui/theme';
import { useAppTheme } from '../ui/AppThemeProvider';

const CADENCES: { value: Cadence; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export default function Books() {
  const { colors: theme } = useAppTheme();
  const palette = useMemo(() => booksPalette(theme), [theme]);
  const styles = useMemo(() => createStyles(theme), [theme]);
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
        <ActivityIndicator size="large" color={palette.action} />
      </View>
    );
  }

  if (!isPro) {
    return (
      <View style={styles.gate}>
        <View style={styles.gateIcon}>
          <Ionicons name="book" size={40} color={palette.pro} />
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
              accessibilityRole="checkbox"
              accessibilityLabel={i.label}
              accessibilityState={{ checked: on }}
              style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{i.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>New pick every</Text>
      <View
        style={styles.toggle}
        accessibilityRole="radiogroup"
        accessibilityLabel="Book delivery cadence"
      >
        {CADENCES.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => updatePrefs({ ...prefs, cadence: c.value })}
            accessibilityRole="radio"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: prefs.cadence === c.value }}
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
          <ActivityIndicator size="large" color={palette.action} />
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
                <Ionicons name="book-outline" size={34} color={palette.placeholder} />
              </View>
            )}
            <View style={styles.pickBody}>
              <View style={styles.tag}>
                <Ionicons name="sparkles" size={11} color={palette.pro} />
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
                icon={<Ionicons name="book-outline" size={17} color={palette.buttonInk} />}
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
                  <Ionicons name="book-outline" size={18} color={palette.placeholder} />
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
              <Ionicons name="chevron-forward" size={18} color={palette.placeholder} />
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function booksPalette(theme: AppThemeColors) {
  return {
    background: theme.surface.canvas,
    card: theme.surface.card,
    field: theme.surface.raised,
    mutedSurface: theme.surface.muted,
    ink: theme.ink.primary,
    secondary: theme.ink.secondary,
    muted: theme.ink.muted,
    placeholder: theme.ink.muted,
    border: theme.border.subtle,
    action: theme.ink.action,
    onAction: theme.ink.inverse,
    pro: theme.ink.action,
    proSoft: theme.surface.muted,
    buttonInk: theme.ink.inverse,
  };
}

function createStyles(theme: AppThemeColors) {
  const palette = booksPalette(theme);
  return StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.sm, backgroundColor: palette.background, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, backgroundColor: palette.background },
  pressed: { opacity: 0.75 },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: spacing.md,
    backgroundColor: palette.background,
  },
  gateIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: palette.proSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: { fontSize: 22, fontFamily: font.extrabold, color: palette.ink },
  gateText: {
    color: palette.muted,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 21,
  },
  gateBtn: { minWidth: 220 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: palette.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: palette.action,
    borderRadius: radius.pill,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: spacing.touch,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: palette.action },
  chipText: { color: palette.action, fontFamily: font.semibold, fontSize: 13 },
  chipTextOn: { color: palette.onAction },
  toggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: palette.mutedSurface,
    borderRadius: radius.sm,
    padding: 3,
  },
  toggleBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 8, minHeight: spacing.touch },
  toggleActive: { backgroundColor: palette.card },
  toggleText: { color: palette.muted, fontFamily: font.semibold, fontSize: 13.5 },
  toggleTextActive: { color: palette.action },
  pickCard: {
    flexDirection: 'row',
    gap: spacing.lg,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  cover: {
    width: 108,
    height: 160,
    borderRadius: radius.sm,
    backgroundColor: palette.mutedSurface,
  },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  pickBody: { flex: 1, gap: 4 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: palette.proSoft,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  tagText: { color: palette.pro, fontFamily: font.bold, fontSize: 11 },
  pickTitle: { fontSize: 17, fontFamily: font.extrabold, color: palette.ink, lineHeight: 22 },
  pickAuthor: { fontSize: 13.5, fontFamily: font.medium, color: palette.secondary },
  freeNote: { fontSize: 12, fontFamily: font.regular, color: palette.placeholder },
  readBtn: { marginTop: spacing.sm, alignSelf: 'stretch' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 64,
  },
  rowCover: { width: 40, height: 58, borderRadius: 6, backgroundColor: palette.mutedSurface },
  rowTitle: { fontSize: 14.5, fontFamily: font.semibold, color: palette.ink },
  rowAuthor: { fontSize: 12.5, fontFamily: font.regular, color: palette.muted, marginTop: 1 },
  });
}
