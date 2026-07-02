import { useCallback, useState, type ComponentProps } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyProfile } from '../../profiles/api';
import { getHomeStats, type HomeStats } from '../../home/api';
import { getInsights } from '../../insights/api';
import { toLocalDateString } from '../../timeline/datetime';
import { colors, font, radius, shadow, spacing } from '../../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const PILLARS: {
  key: string;
  icon: IoniconName;
  tint: string;
  title: string;
  sub: string;
  route: '/gym' | '/diet' | '/money' | '/activity-track' | '/insights' | '/books';
}[] = [
  {
    key: 'insights',
    icon: 'stats-chart-outline',
    tint: '#2563eb',
    title: 'Progress & Insights',
    sub: 'Your day, week & month at a glance',
    route: '/insights',
  },
  {
    key: 'gym',
    icon: 'barbell-outline',
    tint: '#7c3aed',
    title: 'Exercise Library',
    sub: 'Browse 800+ exercises, filter & log',
    route: '/gym',
  },
  {
    key: 'diet',
    icon: 'nutrition-outline',
    tint: '#16a34a',
    title: 'Diet & Calories',
    sub: 'Track meals, calories & macros',
    route: '/diet',
  },
  {
    key: 'money',
    icon: 'wallet-outline',
    tint: '#dc2626',
    title: 'Money',
    sub: 'Income, expenses & budgets',
    route: '/money',
  },
  {
    key: 'activity',
    icon: 'walk-outline',
    tint: '#ea580c',
    title: 'Activity',
    sub: 'GPS runs, rides & walks',
    route: '/activity-track',
  },
  {
    key: 'books',
    icon: 'book-outline',
    tint: '#0d9488',
    title: 'Daily Reads',
    sub: 'A free e-book for your interests · Pro',
    route: '/books',
  },
];

type WeekDay = { label: string; active: boolean; isToday: boolean; date: string };

function weekDayDate(index: number): string {
  const d = new Date();
  d.setDate(d.getDate() - (6 - index));
  return toLocalDateString(d);
}

export default function Track() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  // consistency score: how many of the last 7 days you showed up
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

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#3b82f6', '#2563eb', '#1e40af']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.4, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        {/* greeting */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Hello{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={styles.helloSub}>You&apos;re on track to…</Text>
          </View>
          <Pressable
            onPress={() => router.push('/profile')}
            style={({ pressed }) => [styles.avatarBtn, pressed && styles.pressed]}
            accessibilityLabel="Your profile"
          >
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatarImg} />
            ) : (
              <Ionicons name="person" size={16} color="#fff" />
            )}
          </Pressable>
        </View>

        {/* glass consistency dial */}
        <Pressable
          style={({ pressed }) => [styles.dialWrap, pressed && styles.pressed]}
          onPress={() => router.push('/insights')}
          accessibilityLabel="Open your progress"
        >
          {/* faint halo ring extending past the dial */}
          <View style={styles.dialHalo} pointerEvents="none" />
          <View style={styles.dialOuter}>
            {/* real glass: blur what's behind + a diagonal light sheen */}
            <BlurView intensity={26} tint="light" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[
                'rgba(255,255,255,0.42)',
                'rgba(255,255,255,0.06)',
                'rgba(255,255,255,0.18)',
              ]}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.dialInnerRing}>
              <Ionicons name="flame" size={22} color="#fde68a" />
              <Text style={styles.dialTitle}>{scoreLine}</Text>
              <Text style={styles.dialScore}>{score ?? '–'}</Text>
              <Text style={styles.dialLabel}>Consistency level</Text>
            </View>
            <View style={styles.dialDot} />
          </View>
        </Pressable>

        {/* weekday strip — tap a day to open it on the timeline */}
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

        {/* white sheet */}
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>Today, {today}</Text>
              <Text style={styles.sheetMeta}>
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
              <Ionicons name="calendar-outline" size={19} color={colors.primary} />
            </Pressable>
          </View>

          {PILLARS.map((p) => (
            <Pressable
              key={p.key}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(p.route)}
              accessibilityLabel={p.title}
            >
              <View style={[styles.iconBadge, { backgroundColor: `${p.tint}15` }]}>
                <Ionicons name={p.icon} size={24} color={p.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{p.title}</Text>
                <Text style={styles.cardSub}>{p.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const DIAL = 218;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1e40af' },
  scroll: { paddingBottom: 24 },
  pressed: { opacity: 0.85 },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  hello: { color: '#fff', fontFamily: font.extrabold, fontSize: 26 },
  helloSub: {
    color: 'rgba(255,255,255,0.75)',
    fontFamily: font.medium,
    fontSize: 14,
    marginTop: 2,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 37, height: 37, borderRadius: 18.5 },
  dialWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
    height: DIAL + 28,
  },
  dialHalo: {
    position: 'absolute',
    width: DIAL + 28,
    height: DIAL + 28,
    borderRadius: (DIAL + 28) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  dialOuter: {
    width: DIAL,
    height: DIAL,
    borderRadius: DIAL / 2,
    overflow: 'hidden', // clips the blur + sheen into the circle
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialInnerRing: {
    width: DIAL - 26,
    height: DIAL - 26,
    borderRadius: (DIAL - 26) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 18,
  },
  dialDot: {
    position: 'absolute',
    left: 8,
    top: DIAL / 2 - 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    shadowColor: '#fff',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dialTitle: {
    color: '#fff',
    fontFamily: font.semibold,
    fontSize: 14.5,
    textAlign: 'center',
  },
  dialScore: {
    color: '#fff',
    fontFamily: font.display,
    fontSize: 64,
    lineHeight: 68,
    includeFontPadding: false,
  },
  dialLabel: { color: 'rgba(255,255,255,0.75)', fontFamily: font.medium, fontSize: 12.5 },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  day: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayActive: { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'transparent' },
  dayToday: { backgroundColor: '#fff', borderColor: '#fff' },
  dayPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  dayText: { color: 'rgba(255,255,255,0.7)', fontFamily: font.bold, fontSize: 13 },
  dayTextActive: { color: '#fff' },
  dayTextToday: { color: colors.primary },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    minHeight: 420,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 18, color: colors.text },
  sheetMeta: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  calendarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 76,
    marginBottom: spacing.sm,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontFamily: font.bold, color: colors.text },
  cardSub: { color: colors.textMuted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
});
