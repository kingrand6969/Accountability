import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { listExercises, type LibraryExercise } from '../gym/library';
import { getInsights, type Insights } from '../insights/api';
import { listItemsForDay } from '../timeline/api';
import type { TimelineItem } from '../timeline/types';
import { colors, font, spacing } from '../ui/theme';
import { EditorialBackdrop } from '../journey/EditorialBackdrop';
import { listRecentJourneyItems, pillarCompletion } from '../journey/data';

const ACTIONS = [
  { label: 'My plan', sub: 'Build or continue this week', icon: 'walk-outline' as const, route: '/gym-plan' },
  { label: 'Exercise library', sub: 'Browse 800+ movements', icon: 'book-outline' as const, route: '/gym' },
  { label: 'Body progress', sub: 'Track strength and stats in Journal', icon: 'bar-chart-outline' as const, route: '/today?filter=body' },
] as const;

export default function BodyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [workouts, setWorkouts] = useState<TimelineItem[]>([]);
  const [exercise, setExercise] = useState<LibraryExercise | null>(null);
  const [bodyCompletion, setBodyCompletion] = useState({ total: 0, complete: 0, score: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      setError(null);
      Promise.all([
        getInsights('week'),
        listItemsForDay(new Date()),
        listExercises({ muscle: null, equipment: null, search: '', offset: 0, onlyIds: null }),
        listRecentJourneyItems(7),
      ])
        .then(([nextInsights, items, exercises, recentItems]) => {
          if (!alive) return;
          setInsights(nextInsights);
          setWorkouts(items.filter((item) => item.type === 'workout' || item.type === 'activity'));
          setExercise(exercises[0] ?? null);
          setBodyCompletion(pillarCompletion(recentItems, 'body'));
        })
        .catch(() => {
          if (!alive) return;
          setInsights(null);
          setWorkouts([]);
          setExercise(null);
          setBodyCompletion({ total: 0, complete: 0, score: 0 });
          setError('Body data could not be loaded. Return to this screen to retry.');
        })
        .finally(() => alive && setLoading(false));
      return () => { alive = false; };
    }, []),
  );

  const workoutTitle = workouts[0]?.title ?? exercise?.name ?? 'Full Body';

  return (
    <View style={styles.screen}>
      <EditorialBackdrop />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.sm }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back to Journey">
            <Ionicons name="chevron-back" size={23} color={colors.navy} />
          </Pressable>
          <Text style={styles.breadcrumb}>Journey / Body</Text>
          <Pressable onPress={() => router.push('/menu' as never)} style={styles.iconButton} accessibilityLabel="Body options">
            <Ionicons name="notifications-outline" size={21} color={colors.navy} />
          </Pressable>
        </View>

        <Text style={styles.title}>Body</Text>
        <View style={styles.momentumRow}>
          <View style={styles.momentumDot} />
          <Text style={styles.momentumText}>
            {bodyCompletion.total > 0
              ? `Body completion ${bodyCompletion.score}% this week`
              : 'No Body data this week'}
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={21} color={colors.primary} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => router.push('/gym-plan' as never)}
              style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Start today's workout, ${workoutTitle}`}
            >
              <LinearGradient
                colors={['#071B37', '#092B4E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {exercise?.images?.[0] ? (
                <Image source={{ uri: exercise.images[0] }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <Ionicons name="barbell-outline" size={88} color="rgba(255,255,255,0.15)" style={styles.heroFallback} />
              )}
              <LinearGradient colors={['rgba(3,13,28,0.06)', 'rgba(3,13,28,0.93)']} style={StyleSheet.absoluteFill} />
              <View style={styles.heroCopy}>
                <Text style={styles.heroKicker}>TODAY’S WORKOUT</Text>
                <Text style={styles.heroTitle}>{workoutTitle}</Text>
                <Text style={styles.heroMeta}>{workouts[0] ? 'Ready when you are' : '45 min · balanced session'}</Text>
                <View style={styles.startButton}>
                  <Text style={styles.startText}>Start workout</Text>
                </View>
              </View>
            </Pressable>

            <View style={styles.actions}>
              {ACTIONS.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={() => router.push(action.route as never)}
                  style={({ pressed }) => [styles.action, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`${action.label}. ${action.sub}`}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name={action.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.actionTitle}>{action.label}</Text>
                    <Text style={styles.actionSub}>{action.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Recent activity</Text>
              <Pressable onPress={() => router.push('/today?filter=body' as never)} style={styles.sectionAction}>
                <Text style={styles.sectionActionText}>View in Journal</Text>
              </Pressable>
            </View>

            <View style={styles.recentCard}>
              <View style={styles.recentThumb}>
                <Ionicons name={workouts[0]?.type === 'activity' ? 'walk' : 'barbell'} size={24} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.recentTitle}>{workouts[0]?.title ?? 'Your next session starts here'}</Text>
                <Text style={styles.recentMeta}>
                  {workouts[0]
                    ? new Date(workouts[0].starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    : `${insights?.workouts ?? 0} workouts this week`}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            </View>

            <Pressable
              onPress={() => router.push('/win-card' as never)}
              style={({ pressed }) => [styles.shareCard, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <View style={styles.shareIcon}>
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.shareText}>Share proof after completion</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.navy} />
            </Pressable>

            <Text style={styles.journalNote}>
              Body progress lives in Journal, so your workouts, proof, strength and notes stay in one daily story.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingBottom: 80 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center' },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  breadcrumb: { flex: 1, color: colors.inkSoft, fontFamily: font.medium, fontSize: 12 },
  title: { color: colors.navy, fontFamily: 'Georgia', fontSize: 34, lineHeight: 39, marginTop: 4 },
  momentumRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 12 },
  momentumDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#78A92B' },
  momentumText: { color: colors.inkSoft, fontFamily: font.medium, fontSize: 12 },
  loader: { marginTop: 80 },
  errorCard: { minHeight: 82, marginTop: 24, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F3B4B4', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, color: colors.danger, fontFamily: font.medium, fontSize: 12.5, lineHeight: 18 },
  hero: { height: 226, borderRadius: 16, overflow: 'hidden', justifyContent: 'flex-end' },
  pressed: { opacity: 0.7 },
  heroImage: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '62%' },
  heroFallback: { position: 'absolute', right: 32, top: 62 },
  heroCopy: { padding: 16, width: '78%' },
  heroKicker: { color: '#BED3EB', fontFamily: font.bold, fontSize: 9.5, letterSpacing: 1.1 },
  heroTitle: { color: '#FFFFFF', fontFamily: 'Georgia', fontSize: 26, lineHeight: 30, marginTop: 3 },
  heroMeta: { color: '#D7E3F1', fontFamily: font.medium, fontSize: 11.5, marginTop: 2 },
  startButton: { alignSelf: 'flex-start', minHeight: 44, marginTop: 12, borderRadius: 9, backgroundColor: colors.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#FFFFFF', fontFamily: font.bold, fontSize: 12.5 },
  actions: { gap: 8, marginTop: 12 },
  action: { minHeight: 64, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.78)', borderWidth: 1, borderColor: 'rgba(8,26,58,0.10)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  actionIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  actionTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 13.5 },
  actionSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 10.5, marginTop: 2 },
  sectionRow: { minHeight: 52, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.navy, fontFamily: 'Georgia', fontSize: 18 },
  sectionAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  sectionActionText: { color: colors.primary, fontFamily: font.bold, fontSize: 11 },
  recentCard: { minHeight: 72, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: 'rgba(8,26,58,0.10)', padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#0C294A', alignItems: 'center', justifyContent: 'center' },
  recentTitle: { color: colors.navy, fontFamily: font.bold, fontSize: 12.5 },
  recentMeta: { color: colors.textMuted, fontFamily: font.regular, fontSize: 10.5, marginTop: 3 },
  shareCard: { minHeight: 62, marginTop: 10, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: colors.primary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  shareText: { flex: 1, color: colors.navy, fontFamily: font.bold, fontSize: 12.5 },
  journalNote: { color: colors.textMuted, fontFamily: font.regular, fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 12, paddingHorizontal: 14 },
});
