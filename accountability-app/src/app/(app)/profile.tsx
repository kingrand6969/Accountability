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
import { useAuth } from '../../auth/AuthProvider';
import { getMyProfile } from '../../profiles/api';
import type { Profile as ProfileRecord } from '../../profiles/types';
import { getMetrics, getRank } from '../../achievements/api';
import type { Metrics } from '../../achievements/catalog';
import { CachedImage } from '../../ui/CachedImage';
import { useResolvedMediaUrl } from '../../media/useResolvedMediaUrl';
import { font, shadow } from '../../ui/theme';

const PAPER = '#F7F4EC';
const INK = '#081A3A';
const MUTED = '#647084';
const BLUE = '#155EEF';
const MOUNTAIN = require('../../../assets/images/auth-mountain-hero.png');

type RankSummary = Awaited<ReturnType<typeof getRank>>;

const tiles = [
  { label: 'Trophy Case', caption: 'Medals & prestige', icon: 'trophy-outline' as const, route: '/achievements' },
  { label: 'Journey', caption: 'See your path', icon: 'trail-sign-outline' as const, route: '/activity' },
  { label: 'Memories', caption: 'Proof you kept', icon: 'images-outline' as const, route: '/memories' },
  { label: 'Buddy Card', caption: 'Your public intro', icon: 'people-outline' as const, route: '/buddy-card-edit' },
];

export default function ProfileOverview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [rank, setRank] = useState<RankSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const resolvedAvatar = useResolvedMediaUrl(profile?.avatar_url ?? null);
  const resolvedCover = useResolvedMediaUrl(profile?.cover_url ?? null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      Promise.all([getMyProfile(), getMetrics(), getRank()])
        .then(([p, m, r]) => {
          if (!active) return;
          setProfile(p);
          setMetrics(m);
          setRank(r);
        })
        .catch(() => {})
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BLUE} size="large" />
        <Text style={styles.loadingText}>Opening your story...</Text>
      </View>
    );
  }

  const displayName = profile?.display_name?.trim() || session?.user.email?.split('@')[0] || 'AccountAbility member';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        {resolvedCover ? (
          <CachedImage uri={resolvedCover} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Image source={MOUNTAIN} style={StyleSheet.absoluteFill} resizeMode="cover" />
        )}
        <LinearGradient
          colors={['rgba(8,26,58,0.08)', 'rgba(8,26,58,0.52)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroTop}>
          <View style={styles.heroBrand}>
            <View style={styles.brandDot} />
            <Text style={styles.heroBrandText}>YOUR PROFILE</Text>
          </View>
          <Pressable
            onPress={() => router.push('/menu' as never)}
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open profile settings"
          >
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={styles.identity}>
        <View style={styles.avatarRing}>
          {resolvedAvatar ? (
            <CachedImage uri={resolvedAvatar} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{initial}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{displayName}</Text>
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : <Text style={styles.bio}>Discipline is my compass.</Text>}
        {profile?.area ? (
          <View style={styles.location}>
            <Ionicons name="location-outline" size={14} color={MUTED} />
            <Text style={styles.locationText}>{profile.area}</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => router.push('/edit-profile' as never)}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <Ionicons name="pencil-outline" size={16} color="#fff" />
          <Text style={styles.editButtonText}>Edit profile</Text>
        </Pressable>
      </View>

      <View style={styles.stats}>
        <Stat value={metrics?.streak ?? 0} label="Day streak" />
        <View style={styles.statDivider} />
        <Stat value={rank?.name ?? 'Rookie'} label="Momentum rank" />
        <View style={styles.statDivider} />
        <Stat value={metrics?.buddies ?? 0} label="Buddies" />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your story</Text>
        <Text style={styles.sectionNote}>The places your consistency lives.</Text>
      </View>
      <View style={styles.tileGrid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.label}
            onPress={() => router.push(tile.route as never)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${tile.label}, ${tile.caption}`}
          >
            <View style={styles.tileIcon}>
              <Ionicons name={tile.icon} size={22} color={BLUE} />
            </View>
            <View style={styles.tileCopy}>
              <Text style={styles.tileTitle}>{tile.label}</Text>
              <Text style={styles.tileCaption}>{tile.caption}</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#A4ACB9" />
          </Pressable>
        ))}
      </View>

      <View style={styles.settingsCard}>
        <SettingsRow icon="shield-checkmark-outline" label="Account & privacy" route="/menu" />
        <SettingsRow icon="notifications-outline" label="Notifications" route="/notifications" />
        <SettingsRow icon="help-circle-outline" label="Help & support" route="/menu" last />
      </View>
      <Text style={styles.footer}>Your private details stay in Edit profile and are never shown here.</Text>
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingsRow({
  icon,
  label,
  route,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
  last?: boolean;
}) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(route as never)}
      style={({ pressed }) => [styles.settingsRow, !last && styles.settingsBorder, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={INK} />
      <Text style={styles.settingsText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#A4ACB9" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAPER },
  content: { paddingBottom: 120 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: PAPER },
  loadingText: { color: MUTED, fontFamily: font.medium, fontSize: 14 },
  pressed: { opacity: 0.72 },
  hero: { height: 184, paddingHorizontal: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  heroBrandText: { color: '#fff', fontFamily: font.bold, fontSize: 11, letterSpacing: 1.5 },
  heroButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,26,58,0.28)' },
  identity: { alignItems: 'center', paddingHorizontal: 24, marginTop: -52 },
  avatarRing: { width: 108, height: 108, borderRadius: 54, padding: 4, backgroundColor: PAPER, ...shadow.card },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8E4DA' },
  avatarInitial: { color: INK, fontFamily: font.extrabold, fontSize: 36 },
  name: { marginTop: 10, color: INK, fontFamily: font.bold, fontSize: 27, letterSpacing: -0.5 },
  bio: { marginTop: 5, color: MUTED, fontFamily: font.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  location: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { color: MUTED, fontFamily: font.medium, fontSize: 12.5 },
  editButton: { marginTop: 16, minHeight: 48, minWidth: 174, borderRadius: 14, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: BLUE },
  editButtonText: { color: '#fff', fontFamily: font.bold, fontSize: 14 },
  stats: { marginHorizontal: 18, marginTop: 22, minHeight: 82, borderWidth: 1, borderColor: '#E1DDD2', borderRadius: 18, backgroundColor: '#FFFCF6', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, ...shadow.card },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  statValue: { color: INK, fontFamily: font.bold, fontSize: 18 },
  statLabel: { marginTop: 4, color: MUTED, fontFamily: font.medium, fontSize: 10.5, textAlign: 'center' },
  statDivider: { height: 38, width: 1, backgroundColor: '#E1DDD2' },
  sectionHeader: { paddingHorizontal: 20, marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: INK, fontFamily: font.bold, fontSize: 24, letterSpacing: -0.4 },
  sectionNote: { marginTop: 3, color: MUTED, fontFamily: font.regular, fontSize: 13 },
  tileGrid: { paddingHorizontal: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48.5%', minHeight: 94, borderWidth: 1, borderColor: '#E1DDD2', borderRadius: 16, backgroundColor: '#FFFCF6', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, ...shadow.card },
  tileIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
  tileCopy: { flex: 1 },
  tileTitle: { color: INK, fontFamily: font.bold, fontSize: 13.5 },
  tileCaption: { marginTop: 3, color: MUTED, fontFamily: font.regular, fontSize: 10.5, lineHeight: 14 },
  settingsCard: { marginHorizontal: 18, marginTop: 24, borderWidth: 1, borderColor: '#E1DDD2', borderRadius: 18, backgroundColor: '#FFFCF6', overflow: 'hidden' },
  settingsRow: { minHeight: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDD8CC' },
  settingsText: { flex: 1, color: INK, fontFamily: font.semibold, fontSize: 14 },
  footer: { marginHorizontal: 28, marginTop: 14, color: MUTED, fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
});
