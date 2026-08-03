import { useCallback, useRef, useState, type ComponentProps } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyProfile } from '../../profiles/api';
import { getHomeStats, type HomeStats } from '../../home/api';
import { getInsights } from '../../insights/api';
import { toLocalDateString } from '../../timeline/datetime';
import { useActivitySync } from '../../activity/ActivitySyncProvider';
import {
  ActivityUploadsPanel,
  shouldShowUploadsPanel,
} from '../../activity/UploadStatus';
import { GlassBackdrop, GlassCard } from '../../ui/Glass';
import { ProgressRing } from '../../ui/ProgressRing';
import { contentMaxWidth } from '../../ui/responsive';
import { font, spacing } from '../../ui/theme';
import JourneyMomentum from '../../journey/MomentumScreen';

const INK = '#081A3A';
const INK_SOFT = 'rgba(8,26,58,0.70)';
const ACCENT = '#155EEF';
const PRIMARY = '#155EEF';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const PILLARS: {
  key: string;
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
  route: '/gym' | '/finance' | '/today' | '/messages' | '/run' | '/insights' | '/achievements';
}[] = [
  {
    key: 'body',
    icon: 'body-outline',
    tint: '#155EEF',
    title: 'Body',
    sub: 'Workout, movement and recovery',
    route: '/gym',
  },
  {
    key: 'money',
    icon: 'cash-outline',
    tint: '#168B55',
    title: 'Money',
    sub: 'Savings promises and financial proof',
    route: '/finance',
  },
  {
    key: 'focus',
    icon: 'locate-outline',
    tint: '#7C3AED',
    title: 'Focus',
    sub: 'Deep work, learning and priorities',
    route: '/today',
  },
  {
    key: 'people',
    icon: 'people-outline',
    tint: '#D45B2C',
    title: 'People',
    sub: 'Buddies, encouragement and connection',
    route: '/messages',
  },
];

type WeekDay = { label: string; active: boolean; isToday: boolean; date: string };

function weekDayDate(index: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - index));
  return toLocalDateString(d);
}

function TrackLegacy() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    queued,
    issueCount,
    otherAccountPendingCount,
    otherAccountPendingIsApproximate,
    status: uploadStatus,
    retryNow,
  } = useActivitySync();
  const { width } = useWindowDimensions();
  const colMax = contentMaxWidth(width);
  const bgRef = useRef<View>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [stats, setStats] = useState<HomeStats | null>(null);
  const [week, setWeek] = useState<WeekDay[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      getMyProfile()
        .then((p) => {
          if (!live) return;
          setFirstName(p?.display_name?.split(' ')[0] ?? null);
          setAvatar(p?.avatar_url ?? null);
        })
        .catch(() => {});
      getHomeStats()
        .then((s) => live && setStats(s))
        .catch(() => {});
      getInsights('week')
        .then((ins) => {
          if (!live) return;
          setWeek(
            ins.chart.map((c, i) => ({
              label: c.label,
              active: c.items > 0,
              isToday: i === ins.chart.length - 1,
              date: weekDayDate(i),
            })),
          );
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );

  const daysActive = week.filter((d) => d.active).length;
  const score = week.length > 0 ? Math.round((daysActive / 7) * 100) : null;
  const scoreLine =
    score === null
      ? '…'
      : score >= 80
        ? 'Crushing it — keep going'
        : score >= 40
          ? 'Building momentum'
          : 'Show up today';

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const showUploads = shouldShowUploadsPanel({
    queuedCount: queued.length,
    issueCount,
    otherAccountPendingCount,
    status: uploadStatus,
  });

  return (
    <View style={styles.screen}>
      <GlassBackdrop ref={bgRef} columnWidth={colMax} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { maxWidth: colMax, paddingTop: insets.top + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* greeting floats on the backdrop */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Your Journey</Text>
            <Text style={styles.helloSub}>
              {firstName ? `${firstName} · ` : ''}{today}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
            accessibilityLabel="Your profile"
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={16} color={INK_SOFT} />
            )}
          </Pressable>
        </View>

        <View style={styles.journeyNav} accessibilityRole="tablist">
          <View
            style={[styles.journeyTab, styles.journeyTabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
          >
            <Ionicons name="pulse-outline" size={16} color={INK} />
            <Text style={[styles.journeyTabText, styles.journeyTabTextActive]}>Momentum</Text>
            <View style={styles.journeyIndicator} />
          </View>
          <Pressable
            onPress={() => router.push('/achievements')}
            style={({ pressed }) => [styles.journeyTab, pressed && styles.pressed]}
            accessibilityRole="tab"
            accessibilityLabel="Open your Journey path"
          >
            <Ionicons name="trail-sign-outline" size={16} color={INK_SOFT} />
            <Text style={styles.journeyTabText}>Path</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/today')}
            style={({ pressed }) => [styles.journeyTab, pressed && styles.pressed]}
            accessibilityRole="tab"
            accessibilityLabel="Open your Journal"
          >
            <Ionicons name="book-outline" size={16} color={INK_SOFT} />
            <Text style={styles.journeyTabText}>Journal</Text>
          </Pressable>
        </View>

        {/* consistency — liquid glass hero */}
        <GlassCard blurTarget={bgRef}>
          <View style={styles.cardPad}>
            <View style={styles.cardHeadRow}>
              <Text style={styles.kicker}>CONSISTENCY</Text>
              <Text style={styles.kickerSoft}>LAST 7 DAYS</Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.dialWrap, pressed && styles.pressed]}
              onPress={() => router.push('/insights')}
              accessibilityLabel="Open your progress"
            >
              <View style={styles.dialRing} pointerEvents="none">
                {/* visible ink track so the meter reads even at level 0 */}
                <ProgressRing
                  size={172}
                  strokeWidth={9}
                  progress={(score ?? 0) / 100}
                  trackColor="rgba(30,27,75,0.12)"
                  startColor="#f59e0b"
                  endColor="#fbbf24"
                />
              </View>
              <Ionicons name="flame" size={20} color="#d97706" />
              <Text style={styles.dialScore}>{score ?? '–'}</Text>
              <Text style={styles.dialLabel}>consistency level</Text>
            </Pressable>
            <Text style={styles.scoreLine}>{scoreLine}</Text>

            {/* tap a day to open it on the timeline */}
            <View style={styles.weekRow}>
              {(week.length > 0
                ? week
                : ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => ({
                    label: l,
                    active: false,
                    isToday: false,
                    date: weekDayDate(i),
                  }))
              ).map((d, i) => (
                <Pressable
                  key={i}
                  onPress={() =>
                    router.push({ pathname: '/today', params: { date: d.date } } as never)
                  }
                  accessibilityLabel={`Open ${d.isToday ? 'today' : d.date} on your timeline`}
                  style={({ pressed }) => [
                    styles.day,
                    d.active && styles.dayActive,
                    d.isToday && styles.dayToday,
                    pressed && styles.dayPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      d.active && styles.dayTextActive,
                      d.isToday && styles.dayTextToday,
                    ]}
                  >
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassCard>

        {showUploads ? (
          <GlassCard blurTarget={bgRef}>
            <ActivityUploadsPanel
              queued={queued}
              issueCount={issueCount}
              otherAccountPendingCount={otherAccountPendingCount}
              otherAccountPendingIsApproximate={
                otherAccountPendingIsApproximate
              }
              status={uploadStatus}
              onRetryNow={retryNow}
            />
          </GlassCard>
        ) : null}

        {/* pillars — frosted ledger */}
        <GlassCard blurTarget={bgRef}>
          <View style={styles.cardPad}>
            <View style={styles.cardHeadRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>YOUR PILLARS</Text>
                <Text style={styles.pillarsMeta}>
                  {stats
                    ? `${stats.todayCount} logged today · ${stats.streak}-day streak`
                    : ' '}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/today')}
                style={({ pressed }) => [styles.calendarBtn, pressed && styles.pressed]}
                accessibilityLabel="Open your day"
              >
                <Ionicons name="calendar-outline" size={18} color={ACCENT} />
              </Pressable>
            </View>

            <View style={styles.pillarList}>
              {PILLARS.map((p) => (
                <Pressable
                  key={p.key}
                  style={({ pressed }) => [styles.pillarRow, pressed && styles.rowPressed]}
                  onPress={() => router.push(p.route)}
                  accessibilityLabel={p.title}
                >
                  <View style={[styles.iconBadge, { backgroundColor: `${p.tint}1A` }]}>
                    <Ionicons name={p.icon} size={20} color={p.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pillarTitle}>{p.title}</Text>
                    <Text style={styles.pillarSub}>{p.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={INK_SOFT} />
                </Pressable>
              ))}
            </View>
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F4EC' },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 110, // clear the floating tab bar
    gap: spacing.md,
    width: '100%',
    alignSelf: 'center',
  },
  pressed: { opacity: 0.8 },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  hello: { color: INK, fontFamily: font.extrabold, fontSize: 26 },
  helloSub: { color: INK_SOFT, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 37, height: 37, borderRadius: 18.5 },
  journeyNav: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderColor: 'rgba(8,26,58,0.12)',
    flexDirection: 'row',
  },
  journeyTab: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  journeyTabActive: { position: 'relative' },
  journeyTabText: { color: INK_SOFT, fontFamily: font.bold, fontSize: 12.5 },
  journeyTabTextActive: { color: INK },
  journeyIndicator: {
    position: 'absolute',
    bottom: -1,
    width: 44,
    height: 2,
    borderRadius: 1,
    backgroundColor: INK,
  },
  cardPad: { padding: spacing.lg },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: { color: INK, fontFamily: font.extrabold, fontSize: 13, letterSpacing: 1.2 },
  kickerSoft: { color: INK_SOFT, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8 },
  dialWrap: {
    alignSelf: 'center',
    width: 172,
    height: 172,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: 2,
  },
  dialRing: { position: 'absolute', top: 0, left: 0 },
  dialScore: {
    color: INK,
    fontFamily: font.display,
    fontSize: 56,
    lineHeight: 60,
    includeFontPadding: false,
  },
  dialLabel: { color: INK_SOFT, fontFamily: font.medium, fontSize: 11.5 },
  scoreLine: {
    color: INK,
    fontFamily: font.bold,
    fontSize: 14.5,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayActive: { backgroundColor: 'rgba(37,99,235,0.14)', borderColor: 'rgba(37,99,235,0.25)' },
  dayToday: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  dayPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  dayText: { color: INK_SOFT, fontFamily: font.bold, fontSize: 13 },
  dayTextActive: { color: ACCENT },
  dayTextToday: { color: '#fff' },
  pillarsMeta: { color: INK_SOFT, fontFamily: font.medium, fontSize: 12, marginTop: 2 },
  calendarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(37,99,235,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarList: { gap: spacing.sm, marginTop: spacing.md },
  // faux glass rows — real blur stays budgeted to the two cards
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 16,
    padding: spacing.md,
    minHeight: 64,
  },
  rowPressed: { opacity: 0.8, transform: [{ scale: 0.995 }] },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarTitle: { fontSize: 15, fontFamily: font.bold, color: INK },
  pillarSub: { color: INK_SOFT, fontFamily: font.regular, fontSize: 12.5, marginTop: 1 },
});

// Keep the prior implementation available during the visual migration so no
// behavior is deleted; the route now renders the approved Journey experience.
void TrackLegacy;
export default JourneyMomentum;
