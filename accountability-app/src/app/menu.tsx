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
import { getMyProfile } from '../profiles/api';
import { listGroups, type Group } from '../groups/api';
import { listPages, type Page } from '../pages/api';
import { inviteFriends } from '../social/invite';
import { getRank } from '../achievements/api';
import { RankBadge } from '../achievements/RankBadge';
import { colors, font, radius, shadow, spacing, contentMax } from '../ui/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const GRID: { icon: IoniconName; tint: string; title: string; route: string }[] = [
  { icon: 'podium-outline', tint: '#1d4ed8', title: 'Leaderboards & Wins', route: '/compete' },
  { icon: 'today-outline', tint: '#0284c7', title: 'Planner', route: '/today' },
  { icon: 'people-outline', tint: '#2563eb', title: 'Groups', route: '/groups' },
  { icon: 'storefront-outline', tint: '#0d9488', title: 'Pages', route: '/pages' },
  { icon: 'images-outline', tint: '#0ea5e9', title: 'Memories', route: '/memories' },
  { icon: 'person-add-outline', tint: '#db2777', title: 'Buddies', route: '/buddy' },
  { icon: 'color-palette-outline', tint: '#7c3aed', title: 'My buddy card', route: '/buddy-card-edit' },
  { icon: 'stats-chart-outline', tint: '#ea580c', title: 'Progress', route: '/insights' },
  { icon: 'book-outline', tint: '#0d9488', title: 'Daily Reads', route: '/books' },
  { icon: 'barbell-outline', tint: '#7c3aed', title: 'Exercises', route: '/gym' },
  { icon: 'nutrition-outline', tint: '#16a34a', title: 'Diet', route: '/diet' },
  { icon: 'wallet-outline', tint: '#dc2626', title: 'Finance', route: '/finance' },
  { icon: 'briefcase-outline', tint: '#b45309', title: 'Business', route: '/business' },
  { icon: 'walk-outline', tint: '#ea580c', title: 'Activity', route: '/run' },
  { icon: 'star-outline', tint: '#7c3aed', title: 'Go Pro', route: '/paywall' },
];

export default function Menu() {
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [myPages, setMyPages] = useState<Page[]>([]);
  const [rank, setRank] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMyProfile()
        .then((p) => {
          setName(p?.display_name ?? null);
          setAvatar(p?.avatar_url ?? null);
        })
        .catch(() => {});
      getRank()
        .then((r) => setRank(r.name))
        .catch(() => {});
      listGroups()
        .then((gs) => setMyGroups(gs.filter((g) => g.is_member).slice(0, 8)))
        .catch(() => {});
      listPages()
        .then((ps) => setMyPages(ps.filter((p) => p.is_owner || p.is_following).slice(0, 8)))
        .catch(() => {});
    }, []),
  );

  const shortcuts = [
    ...myPages.map((p) => ({
      key: `p-${p.id}`,
      title: p.name,
      image: p.avatar_url,
      icon: 'storefront-outline' as IoniconName,
      route: `/page/${p.id}`,
    })),
    ...myGroups.map((g) => ({
      key: `g-${g.id}`,
      title: g.name,
      image: null as string | null,
      icon: 'people' as IoniconName,
      route: `/group/${g.id}`,
    })),
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* profile hero */}
      <Pressable
        style={({ pressed }) => [styles.profileWrap, pressed && styles.pressed]}
        onPress={() => router.push('/profile')}
        accessibilityLabel="View your profile"
      >
        <LinearGradient
          colors={['#3b82f6', '#2563eb', '#1e40af']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileRow}
        >
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.profileAvatar} />
          ) : (
            <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
              <Ionicons name="person" size={22} color="#fff" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{name ?? 'Your profile'}</Text>
            <Text style={styles.profileSub}>View your profile</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#dbeafe" />
        </LinearGradient>
      </Pressable>

      {/* trophy case — carries the member's live rank badge */}
      <Pressable
        style={({ pressed }) => [styles.trophyRow, pressed && styles.pressed]}
        onPress={() => router.push('/achievements' as never)}
        accessibilityLabel="Open your Trophy Case"
      >
        <View style={styles.trophyIcon}>
          <Ionicons name="medal" size={19} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.trophyTitle}>Trophy Case</Text>
          <Text style={styles.trophySub}>Your rank, medals & Flex Points</Text>
        </View>
        {rank ? <RankBadge rank={rank} size={30} /> : <Ionicons name="chevron-forward" size={18} color="#f59e0b" />}
      </Pressable>

      {/* invite friends — the growth loop lives one tap from everywhere */}
      <Pressable
        style={({ pressed }) => [styles.inviteRow, pressed && styles.pressed]}
        onPress={inviteFriends}
        accessibilityLabel="Invite friends to AccountAbility"
      >
        <View style={styles.inviteIcon}>
          <Ionicons name="paper-plane" size={19} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.inviteTitle}>Invite friends</Text>
          <Text style={styles.inviteSub}>Share via Messenger, WhatsApp, TikTok…</Text>
        </View>
        <Ionicons name="share-social-outline" size={18} color={colors.primary} />
      </Pressable>

      {/* shortcuts */}
      {shortcuts.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Your shortcuts</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shortcuts}
          >
            {shortcuts.map((s) => (
              <Pressable
                key={s.key}
                style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
                onPress={() => router.push(s.route as never)}
                accessibilityLabel={s.title}
              >
                {s.image ? (
                  <Image source={{ uri: s.image }} style={styles.shortcutImage} />
                ) : (
                  <View style={[styles.shortcutImage, styles.shortcutFallback]}>
                    <Ionicons name={s.icon} size={22} color={colors.primary} />
                  </View>
                )}
                <Text style={styles.shortcutName} numberOfLines={2}>
                  {s.title}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* everything grid */}
      <Text style={styles.sectionTitle}>All of AccountAbility</Text>
      <View style={styles.grid}>
        {GRID.map((item) => (
          <Pressable
            key={item.title}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => router.push(item.route as never)}
            accessibilityLabel={item.title}
          >
            <View style={[styles.cardIcon, { backgroundColor: `${item.tint}15` }]}>
              <Ionicons name={item.icon} size={22} color={item.tint} />
            </View>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        style={({ pressed }) => [styles.helpRow, pressed && styles.pressed]}
        onPress={() => router.push('/help')}
        accessibilityLabel="Help and Support"
      >
        <View style={styles.helpIcon}>
          <Ionicons name="help-buoy-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.helpLabel}>Help &amp; Support</Text>
          <Text style={styles.helpSub}>Contact us, report a problem, Terms &amp; Privacy</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>

      <View style={styles.legalRow}>
        <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>
          Terms of Service
        </Text>
        <Text style={styles.legalDot}>·</Text>
        <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>
          Privacy Policy
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    ...contentMax,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
    paddingBottom: 40,
  },
  pressed: { opacity: 0.75 },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  helpIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpLabel: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  helpSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
  },
  legalLink: { fontFamily: font.medium, fontSize: 12.5, color: colors.textMuted },
  legalDot: { color: colors.textFaint },
  profileWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 68,
  },
  profileAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  profileAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileName: { fontFamily: font.bold, fontSize: 16, color: '#fff' },
  profileSub: { fontFamily: font.medium, fontSize: 12.5, color: '#dbeafe' },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
  },
  inviteIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  inviteSub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  trophyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#fff8ec',
    borderWidth: 1,
    borderColor: '#f4d9a6',
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 60,
  },
  trophyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  trophySub: { fontFamily: font.regular, fontSize: 12.5, color: colors.textMuted },
  sectionTitle: {
    fontSize: 13,
    fontFamily: font.bold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.md,
  },
  shortcuts: { gap: spacing.md, paddingVertical: 2 },
  shortcut: { alignItems: 'center', gap: 5, width: 72 },
  shortcutImage: { width: 60, height: 60, borderRadius: radius.md },
  shortcutFallback: {
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutName: {
    fontFamily: font.medium,
    fontSize: 11.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    width: '48.4%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 8,
    minHeight: 84,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: font.bold, fontSize: 14.5, color: colors.text },
});
